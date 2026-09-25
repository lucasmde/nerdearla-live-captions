import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config, langLabel } from './config.js';
import { Hub } from './hub.js';
import { LiveSession } from './session.js';

const app = express();
const hub = new Hub();
const sessions = new Map();

for (const def of config.sessions) sessions.set(def.id, new LiveSession(def, config, hub));

app.use(express.static(path.join(config.root, 'public')));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true, engine: config.engine, sessions: sessions.size }));

app.get('/api/sessions', (_req, res) => {
  res.json({ engine: config.engine, sessions: [...sessions.values()].map((s) => s.info()), langLabels: Object.fromEntries(
    [...new Set([...sessions.values()].flatMap((s) => s.def.targetLangs))].map((l) => [l, langLabel(l)])) });
});

// Pretty URLs for the audience viewer and the operator console.
app.get('/s/:id', (req, res) => sessions.has(req.params.id) ? res.sendFile(path.join(config.root, 'public', 'viewer.html')) : res.status(404).send('unknown session'));
app.get('/admin', (_req, res) => res.sendFile(path.join(config.root, 'public', 'admin.html')));
app.get('/operator/:id', (req, res) => sessions.has(req.params.id) ? res.sendFile(path.join(config.root, 'public', 'operator.html')) : res.status(404).send('unknown session'));

// Transcript export (SRT) — original or a target language.
app.get('/api/sessions/:id/transcript.:fmt', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).end();
  const lang = req.query.lang;
  const file = path.join(config.transcriptsDir, `${s.id}.jsonl`);
  if (!fs.existsSync(file)) return res.status(404).send('no transcript yet');
  const segs = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.text) segs.set(o.id, { ...o, tr: {} });
    else if (o.tr && segs.has(o.id)) Object.assign(segs.get(o.id).tr, o.tr);
  }
  let list = [...segs.values()];
  // Optional time window: ?from=HH:MM&to=HH:MM (local server time), ISO date-times or epoch ms.
  const parseT = (v) => {
    if (!v) return null;
    if (/^\d{13}$/.test(v)) return Number(v);
    if (/^\d{1,2}:\d{2}$/.test(v)) { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
    const t = Date.parse(v); return Number.isNaN(t) ? null : t;
  };
  const from = parseT(req.query.from), to = parseT(req.query.to);
  if (from) list = list.filter((s) => s.t >= from);
  if (to) list = list.filter((s) => s.t <= to);
  if (req.params.fmt === 'json') return res.json(list);
  const vtt = req.params.fmt === 'vtt';
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = (ms) => `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${vtt ? '.' : ','}${pad(ms % 1000, 3)}`;
  const body = list.map((seg, i) => {
    const next = list[i + 1];
    const end = next ? next.rel - 100 : seg.rel + 4000;
    const text = lang && seg.tr?.[lang] ? seg.tr[lang] : seg.text;
    return `${vtt ? '' : (i + 1) + '\n'}${ts(seg.rel)} --> ${ts(Math.max(end, seg.rel + 800))}\n${text}\n`;
  }).join('\n');
  if (req.params.fmt === 'txt') {
    const hhmmss = (t) => new Date(t).toLocaleTimeString('es-AR', { hour12: false });
    return res.type('text/plain').send(list.map((seg) => `[${hhmmss(seg.t)}] ${(lang && seg.tr?.[lang]) || seg.text}`).join('\n'));
  }
  res.type(vtt ? 'text/vtt' : 'text/plain').send((vtt ? 'WEBVTT\n\n' : '') + body);
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/ws\/(audience|ingest)\/([\w-]+)$/);
  if (!m || !sessions.has(m[2])) { socket.destroy(); return; }
  const [, kind, id] = m;
  if (kind === 'ingest' && config.ingestToken && url.searchParams.get('token') !== config.ingestToken) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const session = sessions.get(id);
    if (kind === 'audience') {
      hub.subscribe(id, ws, { name: url.searchParams.get('name'), role: url.searchParams.get('role'), lang: url.searchParams.get('lang') });
      const wanted = url.searchParams.get('lang'); if (wanted) session.addTarget(wanted);
      ws.on('message', (data, isBinary) => { if (isBinary) return; try { const m = JSON.parse(data); if (m.type === 'setLang') { ws.who.lang = m.lang; session.addTarget(m.lang); } } catch {} });
      return;
    }
    const source = url.searchParams.get('source') || 'ingest';
    session.log('ingest', `connected (${source})`);
    ws.on('message', (data, isBinary) => {
      if (isBinary) session.audio(Buffer.from(data), source);
    });
    ws.on('close', () => { session.log('ingest', `disconnected (${source})`); session.sourceGone(source); });
    ws.send(JSON.stringify({ type: 'ready', session: session.info() }));
  });
});

server.listen(config.port, () => {
  console.log(`live-captions listening on :${config.port}  engine=${config.engine}  sessions=${[...sessions.keys()].join(',') || '(none)'}`);
  if (config.engine === 'gemini' && !config.geminiApiKey) console.warn('GEMINI_API_KEY missing');
});

process.on('SIGTERM', () => { for (const s of sessions.values()) s.close(); process.exit(0); });

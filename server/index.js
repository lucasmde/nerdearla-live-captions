import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';
import { config, sessionStore, langLabel } from './config.js';
import { Hub } from './hub.js';
import { LiveSession } from './session.js';
import { makeAuth } from './auth.js';
import { makeMailer } from './mail.js';
import QRCode from 'qrcode';

const app = express();
const hub = new Hub();
const auth = makeAuth(config);
const mailer = makeMailer(config, (t, m) => console.log(`[${t}]`, m));
const sessions = new Map();

// Per-room "speaker codes": lets an admin grant mic access to whoever is about to speak
// in one specific room, without knowing their e-mail address ahead of time (useful when
// speakers aren't known in advance, e.g. a multi-track event with last-minute lineups).
// Redeeming a code (after signing in with Google/GitHub) only grants canSpeak for that
// one room — not the whole event, unlike the static SPEAKER_EMAILS allowlist.
const roomCodes = new Map(); // roomId -> { code, expiresAt }
const roomSpeakers = new Map(); // roomId -> Map(sub -> expiresAt)
const CODE_TTL_MS = 4 * 60 * 60 * 1000; // 4h: one talk plus setup/buffer time
function genSpeakerCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function isRoomSpeaker(roomId, sub) {
  const m = roomSpeakers.get(roomId);
  if (!sub || !m) return false;
  const exp = m.get(sub);
  if (!exp) return false;
  if (Date.now() > exp) { m.delete(sub); return false; }
  return true;
}

for (const def of sessionStore.list()) sessions.set(def.id, new LiveSession(def, config, hub));

// Keep the live `sessions` map (one LiveSession per room) in sync with the on-disk store
// after an admin-panel change: new rooms get instantiated, edited rooms get their def
// refreshed in place (so an in-progress capture isn't disturbed), removed rooms drop out.
function syncSessionsFromStore() {
  const ids = new Set();
  for (const def of sessionStore.list()) {
    ids.add(def.id);
    const existing = sessions.get(def.id);
    if (existing) existing.def = def;
    else sessions.set(def.id, new LiveSession(def, config, hub));
  }
  for (const id of [...sessions.keys()]) if (!ids.has(id)) sessions.delete(id);
}

app.use(express.static(path.join(config.root, 'public')));
app.use(express.json());
app.set('trust proxy', true);

// Basic per-IP rate limit for expensive/abusable endpoints (AI summary, outbound mail).
// In-memory is fine here: single instance, and the point is to blunt a burst, not be exact.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Demasiadas solicitudes, esperá un momento.' });
    arr.push(now); hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
const summaryLimiter = rateLimit({ windowMs: 60_000, max: 6 });
const mailLimiter = rateLimit({ windowMs: 60_000, max: 3 });

// --- v2: identity -------------------------------------------------------------
// Guest names are validated (2-40 chars, letters/numbers, no links); invalid -> '' (anonymous, read-only).
const guestName = (raw) => { const n = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40); return n.length >= 2 && !/https?:|www\.|@/i.test(n) && /\p{L}/u.test(n) ? n : ''; };
const baseUrl = (req) => config.publicUrl || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers['x-forwarded-host'] || req.get('host')}`;
app.get('/api/config', (_req, res) => res.json({ googleClientId: auth.clientId || null, github: auth.githubEnabled, allowGuests: auth.allowGuests, guestAccess: auth.guestAccess, engine: config.engine }));
// Sign in with GitHub (OAuth App). Set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET; callback = <PUBLIC_URL>/api/auth/github/callback
const ghRedirect = (req) => `${baseUrl(req)}/api/auth/github/callback`;
app.get('/api/auth/github', (req, res) => {
  if (!auth.githubEnabled) return res.status(503).send('GitHub login not configured');
  const state = Buffer.from(JSON.stringify({ back: String(req.query.back || '/').slice(0, 200), n: Math.random().toString(36).slice(2) })).toString('base64url');
  res.setHeader('Set-Cookie', `lc_gh=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`);
  res.redirect(auth.githubAuthUrl(ghRedirect(req), state));
});
app.get('/api/auth/github/callback', async (req, res) => {
  try {
    const cookieState = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('lc_gh='))?.slice(6);
    if (!req.query.code || !req.query.state || req.query.state !== cookieState) return res.status(400).send('estado inválido, volvé a intentar');
    const back = JSON.parse(Buffer.from(String(req.query.state), 'base64url').toString()).back || '/';
    const session = await auth.loginWithGithub(String(req.query.code), ghRedirect(req));
    res.setHeader('Set-Cookie', [auth.cookieFor(session, req.secure || req.headers['x-forwarded-proto'] === 'https'), 'lc_gh=; Path=/; Max-Age=0']);
    res.redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
  } catch (e) { res.status(401).send('No se pudo iniciar sesión con GitHub: ' + String(e?.message || e).slice(0, 120)); }
});
app.get('/api/me', (req, res) => { const s = auth.fromRequest(req); res.json(s ? { name: s.name, email: s.email, picture: s.picture, canSpeak: s.canSpeak, isAdmin: auth.isAdmin(s) } : null); });
app.post('/api/auth/google', async (req, res) => {
  try {
    const session = await auth.loginWithGoogle(req.body?.credential);
    res.setHeader('Set-Cookie', auth.cookieFor(session, req.headers['x-forwarded-proto'] === 'https' || req.secure));
    res.json({ name: session.name, email: session.email, picture: session.picture, canSpeak: session.canSpeak });
  } catch (e) { res.status(401).json({ error: String(e?.message || e) }); }
});
app.post('/api/auth/logout', (_req, res) => { res.setHeader('Set-Cookie', auth.clearCookie()); res.json({ ok: true }); });

// Redeem a room's speaker code (see roomCodes above): any signed-in Google/GitHub account
// can claim it, but it only grants canSpeak for this one room, and only until it expires.
app.post('/api/sessions/:id/speaker-code', (req, res) => {
  const me = auth.fromRequest(req);
  if (!me) return res.status(401).json({ error: 'Iniciá sesión con Google o GitHub primero.' });
  if (!sessions.has(req.params.id)) return res.status(404).json({ error: 'esa sala no existe' });
  const entry = roomCodes.get(req.params.id);
  const code = String(req.body?.code || '').trim();
  if (!entry || Date.now() > entry.expiresAt) return res.status(400).json({ error: 'No hay un código activo para esta sala. Pedile uno nuevo al organizador.' });
  if (!/^\d{6}$/.test(code) || code !== entry.code) return res.status(400).json({ error: 'Código incorrecto.' });
  if (!roomSpeakers.has(req.params.id)) roomSpeakers.set(req.params.id, new Map());
  roomSpeakers.get(req.params.id).set(me.sub, entry.expiresAt);
  res.json({ ok: true, expiresAt: entry.expiresAt });
});

app.get('/api/health', (_req, res) => res.json({ ok: true, engine: config.engine, sessions: sessions.size }));

app.get('/api/sessions', (_req, res) => {
  res.json({ engine: config.engine, event: config.event, timezone: config.timezone, sessions: [...sessions.values()].map((s) => s.info()), langLabels: Object.fromEntries(
    [...new Set([...sessions.values()].flatMap((s) => s.def.targetLangs))].map((l) => [l, langLabel(l)])) });
});

// Pretty URLs for the audience viewer and the operator console.
app.get('/s/:id', (req, res) => sessions.has(req.params.id) ? res.sendFile(path.join(config.root, 'public', 'viewer.html')) : res.status(404).send('unknown session'));
// Printable / projectable access card of a room: big QR + room, talk now/next and the day's agenda.
app.get('/s/:id/qr', (req, res) => sessions.has(req.params.id) ? res.sendFile(path.join(config.root, 'public', 'qr.html')) : res.status(404).send('unknown session'));
app.get('/admin', (_req, res) => res.sendFile(path.join(config.root, 'public', 'admin.html')));
app.get('/admin/sessions', (_req, res) => res.sendFile(path.join(config.root, 'public', 'admin-sessions.html')));

// --- Admin panel: create/edit rooms and their agenda (title, orador, horario) ---------
// Requires being signed in (Google/GitHub) with an email listed in ADMIN_EMAILS.
function requireAdmin(req, res, next) {
  const me = auth.fromRequest(req);
  if (!auth.isAdmin(me)) return res.status(403).json({ error: 'tu cuenta no tiene permisos de administración' });
  next();
}
app.get('/api/admin/rooms', requireAdmin, (_req, res) => {
  res.json({ event: sessionStore.event, timezone: sessionStore.timezone, rooms: sessionStore.list() });
});
app.post('/api/admin/rooms', requireAdmin, (req, res) => {
  try { const room = sessionStore.create(req.body || {}); syncSessionsFromStore(); res.json(room); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
app.patch('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  try { const room = sessionStore.update(req.params.id, req.body || {}); syncSessionsFromStore(); res.json(room); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
app.delete('/api/admin/rooms/:id', requireAdmin, (req, res) => {
  const live = sessions.get(req.params.id);
  if (live?.source) return res.status(409).json({ error: 'esa sala está recibiendo audio ahora mismo — detené la captura desde el operador antes de borrarla' });
  try { sessionStore.remove(req.params.id); syncSessionsFromStore(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
app.post('/api/admin/rooms/:id/agenda', requireAdmin, (req, res) => {
  try { const entry = sessionStore.addAgenda(req.params.id, req.body || {}); syncSessionsFromStore(); res.json(entry); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
app.patch('/api/admin/rooms/:id/agenda/:idx', requireAdmin, (req, res) => {
  try { const agenda = sessionStore.updateAgenda(req.params.id, Number(req.params.idx), req.body || {}); syncSessionsFromStore(); res.json({ agenda }); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
app.delete('/api/admin/rooms/:id/agenda/:idx', requireAdmin, (req, res) => {
  try { sessionStore.removeAgenda(req.params.id, Number(req.params.idx)); syncSessionsFromStore(); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: String(e?.message || e) }); }
});
// Generate/consult a one-time speaker code for a room (see roomCodes above).
app.post('/api/admin/rooms/:id/speaker-code', requireAdmin, (req, res) => {
  if (!sessionStore.get(req.params.id)) return res.status(404).json({ error: 'esa sala no existe' });
  const entry = { code: genSpeakerCode(), expiresAt: Date.now() + CODE_TTL_MS };
  roomCodes.set(req.params.id, entry);
  res.json(entry);
});
app.get('/api/admin/rooms/:id/speaker-code', requireAdmin, (req, res) => {
  const entry = roomCodes.get(req.params.id);
  res.json(entry && Date.now() < entry.expiresAt ? entry : null);
});
app.get('/operator/:id', (req, res) => sessions.has(req.params.id) ? res.sendFile(path.join(config.root, 'public', 'operator.html')) : res.status(404).send('unknown session'));

// --- Transcript export (txt / srt / vtt / json), optional time window and language ---
const parseT = (v) => {
  if (!v) return null;
  if (/^\d{13}$/.test(v)) return Number(v);
  if (/^\d{1,2}:\d{2}$/.test(v)) { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.getTime(); }
  const t = Date.parse(v); return Number.isNaN(t) ? null : t;
};
function buildTranscript(sessionId, { fmt = 'txt', lang, from, to } = {}) {
  const file = path.join(config.transcriptsDir, `${sessionId}.jsonl`);
  if (!fs.existsSync(file)) return null;
  const segs = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.text) segs.set(o.id, { ...o, tr: {} });
    else if (o.tr && segs.has(o.id)) Object.assign(segs.get(o.id).tr, o.tr);
  }
  let list = [...segs.values()];
  const f = parseT(from), t = parseT(to);
  if (f) list = list.filter((s) => s.t >= f);
  if (t) list = list.filter((s) => s.t <= t);
  if (fmt === 'json') return { mime: 'application/json', body: JSON.stringify(list, null, 1), count: list.length };
  const pick = (seg) => (lang && seg.tr?.[lang]) || seg.text;
  if (fmt === 'txt') {
    const hhmmss = (x) => new Date(x).toLocaleTimeString('es-AR', { hour12: false });
    return { mime: 'text/plain', body: list.map((seg) => `[${hhmmss(seg.t)}] ${pick(seg)}`).join('\n'), count: list.length };
  }
  const vtt = fmt === 'vtt';
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = (ms) => `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${vtt ? '.' : ','}${pad(ms % 1000, 3)}`;
  const body = list.map((seg, i) => {
    const next = list[i + 1]; const end = next ? next.rel - 100 : seg.rel + 4000;
    return `${vtt ? '' : (i + 1) + '\n'}${ts(seg.rel)} --> ${ts(Math.max(end, seg.rel + 800))}\n${pick(seg)}\n`;
  }).join('\n');
  return { mime: vtt ? 'text/vtt' : 'text/plain', body: (vtt ? 'WEBVTT\n\n' : '') + body, count: list.length };
}

app.get('/api/sessions/:id/transcript.:fmt', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).end();
  const out = buildTranscript(s.id, { fmt: req.params.fmt, lang: req.query.lang, from: req.query.from, to: req.query.to });
  if (!out) return res.status(404).send('no transcript yet');
  res.type(out.mime).send(out.body);
});

// Full agenda of a room (the list endpoint only carries now/next) for the access card.
app.get('/api/sessions/:id/agenda', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  res.json({ event: config.event, timezone: config.timezone, url: `${baseUrl(req)}/s/${s.id}`, session: s.info(), agenda: s.def.agenda || [] });
});

// QR of the room URL (print it, put it on the stage screen). ?lang= is kept in the encoded link.
app.get('/api/sessions/:id/qr.svg', async (req, res) => {
  if (!sessions.has(req.params.id)) return res.status(404).end();
  const url = `${baseUrl(req)}/s/${req.params.id}${req.query.lang ? `?lang=${encodeURIComponent(req.query.lang)}` : ''}`;
  res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 1, width: 512, color: { dark: '#000000', light: '#ffffff' } }));
});

// "What did I miss?": AI recap of the talk so far for people who arrive late.
app.get('/api/sessions/:id/summary', summaryLimiter, async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  try {
    const text = await s.summary(String(req.query.lang || 'es'));
    if (!text) return res.status(404).json({ error: 'Todavía no hay nada que resumir.' });
    res.json({ lang: req.query.lang || 'es', text, segments: s.seq });
  } catch (e) { res.status(503).json({ error: String(e?.message || e).slice(0, 160) }); }
});

// Ticker / data source for vMix, OBS text sources and LED walls: the latest caption as plain text or JSON.
app.get('/api/sessions/:id/now.:fmt', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!['txt', 'json'].includes(req.params.fmt)) return res.status(404).end();
  if (!s) return res.status(404).end();
  const hist = hub.history.get(s.id) || [];
  const last = hist[hist.length - 1];
  const lang = req.query.lang;
  const text = last ? (lang && last.tr?.[lang]) || last.text : '';
  res.set('Cache-Control', 'no-store');
  if (req.params.fmt === 'txt') return res.type('text/plain').send(text);
  res.json({ session: s.id, name: s.def.name, live: !!s.source, deadAir: !!s.metrics.deadAir, text, lang: last ? (lang && last.tr?.[lang] ? lang : last.lang) : null, at: last?.t || null });
});

// Prometheus metrics (scrape /metrics; Grafana-ready).
app.get('/metrics', (_req, res) => {
  const L = [];
  const g = (name, help, type = 'gauge') => L.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
  const now = Date.now();
  g('livecaptions_sessions', 'Configured sessions'); L.push(`livecaptions_sessions ${sessions.size}`);
  g('livecaptions_viewers', 'Connected audience websockets'); for (const s of sessions.values()) L.push(`livecaptions_viewers{session="${s.id}"} ${hub.viewers(s.id)}`);
  g('livecaptions_audio_live', '1 when audio arrived in the last 5 s'); for (const s of sessions.values()) L.push(`livecaptions_audio_live{session="${s.id}"} ${s.metrics.lastAudioAt && now - s.metrics.lastAudioAt < 5000 ? 1 : 0}`);
  g('livecaptions_audio_dbfs', 'Input level of the last audio chunk (dBFS)'); for (const s of sessions.values()) L.push(`livecaptions_audio_dbfs{session="${s.id}"} ${s.metrics.audioDb}`);
  g('livecaptions_dead_air', '1 when no signal above -50 dBFS for 20 s'); for (const s of sessions.values()) L.push(`livecaptions_dead_air{session="${s.id}"} ${s.metrics.deadAir ? 1 : 0}`);
  g('livecaptions_audio_seconds_total', 'Audio seconds ingested', 'counter'); for (const s of sessions.values()) L.push(`livecaptions_audio_seconds_total{session="${s.id}"} ${Math.round(s.bytes / 32000)}`);
  g('livecaptions_segments_total', 'Final caption segments', 'counter'); for (const s of sessions.values()) L.push(`livecaptions_segments_total{session="${s.id}"} ${s.seq}`);
  g('livecaptions_translations_total', 'Translation calls', 'counter'); for (const s of sessions.values()) L.push(`livecaptions_translations_total{session="${s.id}"} ${s.metrics.trCount}`);
  g('livecaptions_translation_errors_total', 'Translation calls that failed on every model', 'counter'); for (const s of sessions.values()) L.push(`livecaptions_translation_errors_total{session="${s.id}"} ${s.metrics.trErrors}`);
  g('livecaptions_translation_ms_avg', 'Average translation call latency (ms)'); for (const s of sessions.values()) L.push(`livecaptions_translation_ms_avg{session="${s.id}"} ${s.metrics.trCount ? Math.round(s.metrics.trMsTotal / s.metrics.trCount) : 0}`);
  g('livecaptions_engine_errors_total', 'Transcription engine errors', 'counter'); for (const s of sessions.values()) L.push(`livecaptions_engine_errors_total{session="${s.id}"} ${s.metrics.engineErrors}`);
  g('livecaptions_last_caption_age_seconds', 'Seconds since the last final caption'); for (const s of sessions.values()) L.push(`livecaptions_last_caption_age_seconds{session="${s.id}"} ${s.metrics.lastFinalAt ? Math.round((now - s.metrics.lastFinalAt) / 1000) : -1}`);
  g('process_resident_memory_bytes', 'Resident memory'); L.push(`process_resident_memory_bytes ${process.memoryUsage().rss}`);
  res.type('text/plain; version=0.0.4').send(L.join('\n') + '\n');
});

// v2: e-mail the transcript of a time window. Body: { to, lang, from, to, fmt }
app.get('/api/mail/status', (_req, res) => res.json({ enabled: mailer.enabled, provider: mailer.provider }));
app.post('/api/sessions/:id/transcript/mail', mailLimiter, async (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'unknown session' });
  if (!mailer.enabled) return res.status(503).json({ error: 'El envío por mail no está configurado en este servidor (SMTP_URL o RESEND_API_KEY).' });
  const me = auth.fromRequest(req);
  const to = String(req.body?.to || me?.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'Dirección de mail inválida.' });
  if (!auth.canParticipate(me)) return res.status(401).json({ error: 'Iniciá sesión con Google o GitHub para enviar por mail.' });
  const fmt = ['txt', 'srt', 'vtt', 'json'].includes(req.body?.fmt) ? req.body.fmt : 'txt';
  const out = buildTranscript(s.id, { fmt, lang: req.body?.lang, from: req.body?.from, to: req.body?.until });
  if (!out || !out.count) return res.status(404).json({ error: 'No hay transcripción en ese período.' });
  const range = [req.body?.from, req.body?.until].filter(Boolean).join(' – ') || 'toda la sesión';
  try {
    await mailer.send({
      to, subject: `Transcripción · ${s.def.name} (${range})`,
      text: `Hola,\n\nAdjuntamos la transcripción de "${s.def.name}" (${range}, idioma: ${req.body?.lang || 'original'}, ${out.count} frases).\n\n${config.publicUrl ? config.publicUrl + '/s/' + s.id + '\n\n' : ''}Generado con Live Captions.`,
      attachments: [{ filename: `${s.id}-${req.body?.lang || 'orig'}.${fmt}`, content: out.body }],
    });
    s.log('mail', `transcript (${out.count} segs) sent to ${to.replace(/(.{2}).+(@.*)/, '$1***$2')}`);
    res.json({ ok: true, count: out.count });
  } catch (e) { res.status(502).json({ error: 'No se pudo enviar: ' + String(e?.message || e).slice(0, 160) }); }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/ws\/(audience|ingest)\/([\w-]+)$/);
  if (!m || !sessions.has(m[2])) { socket.destroy(); return; }
  const [, kind, id] = m;
  if (kind === 'ingest') {
    const tokenOk = config.ingestToken && url.searchParams.get('token') === config.ingestToken;
    const me = auth.fromRequest(req);
    const sessionOk = me && (me.canSpeak || isRoomSpeaker(id, me.sub));
    const open = !config.ingestToken && auth.canParticipate(null);
    if (!tokenOk && !sessionOk && !open) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const session = sessions.get(id);
    if (kind === 'audience') {
      const me = auth.fromRequest(req);
      const wantsSpeaker = url.searchParams.get('role') === 'speaker';
      const who = me
        ? { name: me.name, picture: me.picture, email: me.email, role: wantsSpeaker && (me.canSpeak || isRoomSpeaker(id, me.sub)) ? 'speaker' : 'listener', lang: url.searchParams.get('lang') }
        : { name: guestName(url.searchParams.get('name')), role: auth.canParticipate(null) ? url.searchParams.get('role') : 'listener', lang: url.searchParams.get('lang') };
      const denied = (what) => ws.send(JSON.stringify({ type: 'toast', text: `Iniciá sesión con Google o GitHub para ${what}.` }));
      hub.subscribe(id, ws, who);
      const wanted = url.searchParams.get('lang'); if (wanted) session.addTarget(wanted);
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        try {
          const m = JSON.parse(data);
          if (m.type === 'setLang') { ws.who.lang = m.lang; session.addTarget(m.lang); }
          else if (m.type === 'chat') { if (!auth.canParticipate(me)) denied('chatear'); else { const msg = hub.chatMessage(id, ws, m.text, m.audio); if (msg) session.append({ chat: { ...msg, audio: msg.audio ? '[audio]' : undefined } }); } }
          else if (m.type === 'hand') { if (!auth.canParticipate(me)) denied('pedir la palabra'); else hub.raiseHand(id, ws, !!m.up); }
          else if (m.type === 'floor') hub.giveFloor(id, ws, m.to || null);
          else if (m.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t: m.t, now: Date.now(), captionAge: session.metrics.lastPartialAt ? Date.now() - Math.max(session.metrics.lastPartialAt, session.metrics.lastFinalAt) : null, audioDb: session.metrics.audioDb, live: !!session.source }));
        } catch {}
      });
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

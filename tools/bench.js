#!/usr/bin/env node
// Load / latency benchmark. Boots the server (mock or real engine), streams audio into N sessions,
// connects M audience viewers per session and reports: caption fan-out latency, translation latency,
// server CPU and RSS. Usage:
//   node tools/bench.js --sessions 10 --viewers 50 --seconds 60            (mock engine, no API key)
//   ENGINE=gemini node tools/bench.js --sessions 2 --viewers 20 --seconds 90 --audio demo/talk_en.mp3
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('sessions', 5), M = +arg('viewers', 20), SECS = +arg('seconds', 60), AUDIO = arg('audio', '');
const ENGINE = process.env.ENGINE || 'mock';
const PORT = 19000 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`, WSB = `ws://127.0.0.1:${PORT}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-bench-'));
const sessions = { sessions: Array.from({ length: N }, (_, i) => ({ id: `s${i + 1}`, name: `Stage ${i + 1}`, room: `Room ${i + 1}`, sourceLang: 'auto', targetLangs: ['es', 'en'] })) };
fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(sessions));
const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, ENGINE, PORT: String(PORT), TRANSCRIPTS_DIR: dir, SESSIONS_FILE: path.join(dir, 'sessions.json'), INGEST_TOKEN: '', GOOGLE_CLIENT_ID: '' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
for (let i = 0; i < 100; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

// server resource sampling (Linux: /proc)
const samples = [];
let lastCpu = null, lastT = Date.now();
const sample = () => {
  try {
    const stat = fs.readFileSync(`/proc/${srv.pid}/stat`, 'utf8').split(' ');
    const cpu = (+stat[13] + +stat[14]) / 100; // seconds (CLK_TCK=100)
    const rss = +fs.readFileSync(`/proc/${srv.pid}/statm`, 'utf8').split(' ')[1] * 4096;
    const now = Date.now();
    if (lastCpu !== null) samples.push({ cpuPct: ((cpu - lastCpu) / ((now - lastT) / 1000)) * 100, rssMb: rss / 1048576 });
    lastCpu = cpu; lastT = now;
  } catch {}
};
const sampler = setInterval(sample, 1000);

// viewers: measure time from server "final" emission (seg.t) to receipt
const lat = { partial: [], final: [], translation: [], firstTrAfterFinal: [] };
const finalsAt = new Map();
let msgs = 0;
const viewers = [];
for (const s of sessions.sessions) for (let v = 0; v < M; v++) {
  const ws = new WebSocket(`${WSB}/ws/audience/${s.id}?name=v${v}&lang=${v % 2 ? 'es' : 'en'}`);
  ws.on('message', (d) => {
    msgs++;
    const m = JSON.parse(d);
    const now = Date.now();
    if (m.type === 'final' && m.segment?.t) { lat.final.push(now - m.segment.t); finalsAt.set(`${s.id}:${m.segment.id}`, m.segment.t); }
    if (m.type === 'translation') { const t = finalsAt.get(`${s.id}:${m.segId}`); if (t) lat.firstTrAfterFinal.push(now - t); }
    if (m.type === 'partial' && m.t) lat.partial.push(now - m.t);
  });
  ws.on('error', () => {});
  viewers.push(ws);
}
await new Promise((r) => setTimeout(r, 1500));

// audio in: real file through ffmpeg (real time) or silence (mock engine scripts a talk on any audio)
const feeders = sessions.sessions.map((s) => {
  const ws = new WebSocket(`${WSB}/ws/ingest/${s.id}?source=bench`);
  let ff, pump;
  ws.on('open', () => {
    if (AUDIO) {
      ff = spawn('ffmpeg', ['-re', '-stream_loop', '-1', '-i', AUDIO, '-f', 's16le', '-ac', '1', '-ar', '16000', '-loglevel', 'error', 'pipe:1']);
      ff.stdout.on('data', (b) => ws.readyState === 1 && ws.send(b));
    } else {
      const buf = Buffer.alloc(3200);
      pump = setInterval(() => ws.readyState === 1 && ws.send(buf), 100);
    }
  });
  return { ws, stop() { ff?.kill(); clearInterval(pump); ws.close(); } };
});

await new Promise((r) => setTimeout(r, SECS * 1000));
clearInterval(sampler);
feeders.forEach((f) => f.stop());
const info = await (await fetch(`${BASE}/api/sessions`)).json();
viewers.forEach((w) => w.close());
srv.kill();

const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const stats = (a) => a.length ? { n: a.length, p50: pct(a, 0.5), p95: pct(a, 0.95), max: Math.max(...a) } : { n: 0 };
const cpu = samples.map((s) => s.cpuPct), rss = samples.map((s) => s.rssMb);
const trAvg = info.sessions.map((s) => s.metrics?.trAvgMs).filter(Boolean);
const report = {
  engine: ENGINE, sessions: N, viewersPerSession: M, totalViewers: N * M, seconds: SECS, audio: AUDIO || 'silence (scripted mock talk)',
  server: { cpuPctAvg: +(cpu.reduce((a, b) => a + b, 0) / (cpu.length || 1)).toFixed(1), cpuPctMax: +Math.max(0, ...cpu).toFixed(1), rssMbMax: +Math.max(0, ...rss).toFixed(0), node: process.version, cores: os.cpus().length, cpu: os.cpus()[0]?.model },
  messagesDelivered: msgs, messagesPerSecond: +(msgs / SECS).toFixed(0),
  fanoutLatencyMs: { partial: stats(lat.partial), final: stats(lat.final) },
  translationAfterFinalMs: stats(lat.firstTrAfterFinal),
  translateCallAvgMs: trAvg.length ? Math.round(trAvg.reduce((a, b) => a + b, 0) / trAvg.length) : null,
  segmentsPerSession: info.sessions.map((s) => s.segments),
  translateErrors: info.sessions.reduce((a, s) => a + (s.metrics?.trErrors || 0), 0),
};
console.log(JSON.stringify(report, null, 2));

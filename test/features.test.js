// New room features: QR, "what did I miss" summary, vMix/OBS ticker, Prometheus metrics, dead-air detection.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 20080 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let srv;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-feat-'));
  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, ENGINE: 'mock', PORT: String(PORT), TRANSCRIPTS_DIR: dir, GEMINI_API_KEY: '', GOOGLE_CLIENT_ID: '', INGEST_TOKEN: '', PUBLIC_URL: 'https://captions.example.org' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => srv?.kill());
const waitFor = async (fn, ms = 15000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } throw new Error('timeout ' + what); };

test('QR encodes the public room URL', async () => {
  const r = await fetch(`${BASE}/api/sessions/main/qr.svg?lang=es`);
  assert.equal(r.headers.get('content-type').split(';')[0], 'image/svg+xml');
  assert.match(await r.text(), /^<svg/);
  assert.equal((await fetch(`${BASE}/api/sessions/nope/qr.svg`)).status, 404);
});

test('metrics, ticker and summary follow the captions; silence is flagged as dead air', async () => {
  let m = await (await fetch(`${BASE}/metrics`)).text();
  assert.match(m, /livecaptions_sessions 5/);
  assert.match(m, /livecaptions_viewers\{session="main"\} 0/);
  assert.equal((await fetch(`${BASE}/api/sessions/main/summary?lang=es`)).status, 404, 'nothing to summarize yet');

  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/ingest/main?source=test`);
  await new Promise((r) => ws.once('open', r));
  const silence = Buffer.alloc(3200);
  const pump = setInterval(() => ws.send(silence), 100);
  try {
    const now = await waitFor(async () => { const j = await (await fetch(`${BASE}/api/sessions/main/now.json?lang=es`)).json(); return j.text ? j : null; }, 15000, 'ticker');
    assert.equal(now.live, true);
    assert.ok(now.text.length > 5);
    const txt = await (await fetch(`${BASE}/api/sessions/main/now.txt?lang=es`)).text();
    assert.ok(txt.length > 5);
    const sum = await (await fetch(`${BASE}/api/sessions/main/summary?lang=es`)).json();
    assert.match(sum.text, /^• \[es\]/);
    m = await (await fetch(`${BASE}/metrics`)).text();
    assert.match(m, /livecaptions_audio_live\{session="main"\} 1/);
    assert.match(m, /livecaptions_audio_dbfs\{session="main"\} -90/);
    assert.match(m, /livecaptions_segments_total\{session="main"\} [1-9]/);
  } finally { clearInterval(pump); ws.close(); }
});

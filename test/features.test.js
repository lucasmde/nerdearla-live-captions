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
  const r = await fetch(`${BASE}/api/sessions/gran-sala/qr.svg?lang=es`);
  assert.equal(r.headers.get('content-type').split(';')[0], 'image/svg+xml');
  assert.match(await r.text(), /^<svg/);
  assert.equal((await fetch(`${BASE}/api/sessions/nope/qr.svg`)).status, 404);
});

test('metrics, ticker and summary follow the captions; silence is flagged as dead air', async () => {
  let m = await (await fetch(`${BASE}/metrics`)).text();
  assert.match(m, /livecaptions_sessions 4/);
  assert.match(m, /livecaptions_viewers\{session="gran-sala"\} 0/);
  assert.equal((await fetch(`${BASE}/api/sessions/gran-sala/summary?lang=es`)).status, 404, 'nothing to summarize yet');

  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/ingest/gran-sala?source=test`);
  await new Promise((r) => ws.once('open', r));
  const silence = Buffer.alloc(3200);
  const pump = setInterval(() => ws.send(silence), 100);
  try {
    const now = await waitFor(async () => { const j = await (await fetch(`${BASE}/api/sessions/gran-sala/now.json?lang=es`)).json(); return j.text ? j : null; }, 15000, 'ticker');
    assert.equal(now.live, true);
    assert.ok(now.text.length > 5);
    const txt = await (await fetch(`${BASE}/api/sessions/gran-sala/now.txt?lang=es`)).text();
    assert.ok(txt.length > 5);
    const sum = await (await fetch(`${BASE}/api/sessions/gran-sala/summary?lang=es`)).json();
    assert.match(sum.text, /^• \[es\]/);
    m = await (await fetch(`${BASE}/metrics`)).text();
    assert.match(m, /livecaptions_audio_live\{session="gran-sala"\} 1/);
    assert.match(m, /livecaptions_audio_dbfs\{session="gran-sala"\} -90/);
    assert.match(m, /livecaptions_segments_total\{session="gran-sala"\} [1-9]/);
  } finally { clearInterval(pump); ws.close(); }
});

test('floor control: a listener raises a hand, the speaker gives the floor, others are muted until it is closed', async () => {
  const WSB = BASE.replace('http', 'ws');
  const open = (url, msgs) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.on('message', (d) => msgs.push(JSON.parse(d))); ws.once('open', () => res(ws)); ws.once('error', rej); });
  const sm = [], am = [], bm = [];
  const spk = await open(`${WSB}/ws/audience/auditorio?name=Expo&role=speaker`, sm);
  const ana = await open(`${WSB}/ws/audience/auditorio?name=Ana&role=listener`, am);
  const bob = await open(`${WSB}/ws/audience/auditorio?name=Bob&role=listener`, bm);
  try {
    const hist = await waitFor(() => am.find((m) => m.type === 'history'), 3000, 'history');
    ana.send(JSON.stringify({ type: 'hand', up: true }));
    const fl = await waitFor(() => sm.find((m) => m.type === 'floor' && m.floor.hands.length === 1), 3000, 'hand seen by speaker');
    assert.equal(fl.floor.hands[0].name, 'Ana');
    spk.send(JSON.stringify({ type: 'floor', to: fl.floor.hands[0].id }));
    await waitFor(() => bm.find((m) => m.type === 'floor' && m.floor.holder?.name === 'Ana'), 3000, 'floor given');
    bob.send(JSON.stringify({ type: 'chat', text: 'me cuelo' }));
    await waitFor(() => bm.find((m) => m.type === 'toast'), 3000, 'bob blocked');
    assert.ok(!am.find((m) => m.type === 'chat' && m.msg.text === 'me cuelo'), 'blocked message not delivered');
    ana.send(JSON.stringify({ type: 'chat', text: 'mi pregunta' }));
    await waitFor(() => bm.find((m) => m.type === 'chat' && m.msg.text === 'mi pregunta'), 3000, 'holder can write');
    spk.send(JSON.stringify({ type: 'floor', to: null }));
    await waitFor(() => bm.find((m) => m.type === 'floor' && !m.floor.holder), 3000, 'floor closed');
    await new Promise((r) => setTimeout(r, 800));
    bob.send(JSON.stringify({ type: 'chat', text: 'ahora si' }));
    await waitFor(() => am.find((m) => m.type === 'chat' && m.msg.text === 'ahora si'), 3000, 'open again');
    ana.send(JSON.stringify({ type: 'ping', t: Date.now() }));
    const pong = await waitFor(() => am.find((m) => m.type === 'pong'), 3000, 'pong');
    assert.ok(typeof pong.now === 'number');
    assert.ok(hist.you);
  } finally { spk.close(); ana.close(); bob.close(); }
});

// End-to-end: boots the real server in mock mode, streams audio over the ingest socket,
// and checks captions, translations, presence, chat, and time-ranged export over HTTP/WS.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 18080 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const WSB = `ws://127.0.0.1:${PORT}`;
let srv;

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-e2e-'));
  srv = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, ENGINE: 'mock', PORT: String(PORT), TRANSCRIPTS_DIR: dir, GEMINI_API_KEY: '', GOOGLE_CLIENT_ID: '', INGEST_TOKEN: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
after(() => srv?.kill());

// Attach the message listener BEFORE 'open': the first frame can arrive in the same TCP chunk as the handshake.
const open = (url, msgs = []) => new Promise((res, rej) => { const ws = new WebSocket(url); ws.on('message', (d) => msgs.push(JSON.parse(d))); ws.once('open', () => res(ws)); ws.once('error', rej); });
const waitFor = async (fn, ms = 10000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout ' + what); };

test('health and sessions list', async () => {
  const h = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(h.ok, true);
  const s = await (await fetch(`${BASE}/api/sessions`)).json();
  assert.ok(s.sessions.length >= 1);
  assert.ok(s.sessions[0].targetLangs.includes('es'));
});

test('audio in -> partial + final + translation out, presence and chat, ranged export', async () => {
  const got = [];
  const listener = await open(`${WSB}/ws/audience/gran-sala?name=Ana&role=listener&lang=es`, got);
  const ingest = await open(`${WSB}/ws/ingest/gran-sala?source=ingest`);
  const silence = Buffer.alloc(3200);
  const pump = setInterval(() => ingest.send(silence), 100);
  try {
    const hist = await waitFor(() => got.find((m) => m.type === 'history'), 5000, 'history');
    assert.equal(hist.presence.total, 1);
    await waitFor(() => got.find((m) => m.type === 'partial'), 8000, 'partial');
    const fin = await waitFor(() => got.find((m) => m.type === 'final'), 15000, 'final');
    await waitFor(() => got.find((m) => m.type === 'translation' && m.lang === 'es' && m.segId === fin.segment.id));

    listener.send(JSON.stringify({ type: 'chat', text: 'hola sala' }));
    const chat = await waitFor(() => got.find((m) => m.type === 'chat'), 3000, 'chat');
    assert.equal(chat.msg.name, 'Ana');
    assert.equal(chat.msg.text, 'hola sala');

    const all = await (await fetch(`${BASE}/api/sessions/gran-sala/transcript.txt?lang=es`)).text();
    assert.match(all, /\[\d{2}:\d{2}:\d{2}\] \[es\]/);
    const none = await (await fetch(`${BASE}/api/sessions/gran-sala/transcript.txt?lang=es&from=${Date.now() + 3600_000}`)).text();
    assert.equal(none.trim(), '');
    const vtt = await (await fetch(`${BASE}/api/sessions/gran-sala/transcript.vtt`)).text();
    assert.match(vtt, /^WEBVTT/);
  } finally { clearInterval(pump); ingest.close(); listener.close(); }
});

test('a viewer can request a language the room does not translate yet', async () => {
  const ws = await open(`${WSB}/ws/audience/gran-sala?lang=fr`);
  await new Promise((r) => setTimeout(r, 300));
  const list = await (await fetch(`${BASE}/api/sessions`)).json();
  assert.ok(list.sessions.find((x) => x.id === 'gran-sala').targetLangs.includes('fr'));
  ws.close();
});

test('mail endpoint reports when no provider is configured', async () => {
  const st = await (await fetch(`${BASE}/api/mail/status`)).json();
  assert.equal(st.enabled, false);
  const r = await fetch(`${BASE}/api/sessions/gran-sala/transcript/mail`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to: 'a@b.co' }) });
  assert.equal(r.status, 503);
});

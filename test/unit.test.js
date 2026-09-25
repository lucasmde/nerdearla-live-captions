// Unit tests: language detection, session pipeline (partials/finals/translations), auth cookies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectLang, normLang, LiveSession } from '../server/session.js';
import { makeAuth } from '../server/auth.js';

test('detectLang distinguishes es / en / pt on short sentences', () => {
  assert.equal(detectLang('Hola a todos, bienvenidos al escenario principal de la conferencia'), 'es');
  assert.equal(detectLang('Today we are going to talk about the future of open source'), 'en');
  assert.equal(detectLang('Hoje vamos falar sobre o futuro do código aberto com vocês'), 'pt');
  assert.equal(detectLang('ok'), null);
});

test('normLang keeps the primary subtag', () => {
  assert.equal(normLang('es-AR'), 'es');
  assert.equal(normLang('EN'), 'en');
  assert.equal(normLang(null), null);
});

function fakeHub() {
  const ev = [];
  return {
    ev,
    history: new Map(),
    status: new Map(),
    final(id, seg) { if (!this.history.has(id)) this.history.set(id, []); this.history.get(id).push(seg); ev.push({ type: 'final', seg }); },
    translation(id, segId, lang, text) { ev.push({ type: 'translation', segId, lang, text }); },
    partial(id, text, lang, tr) { ev.push({ type: 'partial', text, lang, tr }); },
    setStatus() {},
    viewerLangs() { return ['es']; },
    viewers() { return 0; },
  };
}

function makeSession(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
  const cfg = { engine: 'mock', transcriptsDir: dir, translatePartials: false, partialTranslateEveryMs: 0, globalVocabulary: [], ...overrides };
  const hub = fakeHub();
  const s = new LiveSession({ id: 't', name: 'T', sourceLang: 'auto', targetLangs: ['es', 'en'], vocabulary: [] }, cfg, hub);
  return { s, hub, dir };
}

test('final segments are emitted once, in the detected language, and translated to the other targets', async () => {
  const { s, hub } = makeSession();
  s.onTranscript({ type: 'final', text: 'Today we are going to talk about open source captions.', lang: 'en' });
  await new Promise((r) => setTimeout(r, 400)); // mock translator latency
  const finals = hub.ev.filter((e) => e.type === 'final');
  assert.equal(finals.length, 1);
  assert.equal(finals[0].seg.lang, 'en');
  const tr = hub.ev.filter((e) => e.type === 'translation');
  assert.ok(tr.some((t) => t.lang === 'en' && t.text.startsWith('Today')), 'same-language target echoes the original');
  assert.ok(tr.some((t) => t.lang === 'es'), 'translated into the other target');
});

test('long finals are split at sentence boundaries into readable subtitles', () => {
  const { s, hub } = makeSession();
  s.onTranscript({ type: 'final', text: 'Hello everyone, welcome to the main stage of the conference today. Today we are going to talk about open source live captions for events. The system takes the audio from every stage.', lang: 'en' });
  assert.equal(hub.ev.filter((e) => e.type === 'final').length, 3);
});

test('partials do not repeat text that was already finalized in the same turn', () => {
  const { s, hub } = makeSession();
  s.onTranscript({ type: 'final', text: 'Hello everyone.', lang: 'en', finished: false });
  s.onTranscript({ type: 'partial', text: 'Hello everyone. Welcome to the stage', lang: 'en' });
  const p = hub.ev.filter((e) => e.type === 'partial').pop();
  assert.ok(!/Hello everyone\. Hello everyone/.test(p.text), `duplicated: ${p.text}`);
});

test('transcript is persisted as JSON lines', () => {
  const { s, dir } = makeSession();
  s.onTranscript({ type: 'final', text: 'Persist me please, this is a test.', lang: 'en' });
  return new Promise((r) => setTimeout(r, 100)).then(() => {
    const lines = fs.readFileSync(path.join(dir, 't.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.ok(lines.some((l) => l.text === 'Persist me please, this is a test.'));
  });
});

test('auth: session cookie round-trips and rejects tampering', () => {
  const auth = makeAuth({ sessionSecret: 's3cret', googleClientId: '', allowGuests: true, speakerEmails: [], allowedDomains: [] });
  const cookie = auth.cookieFor({ name: 'Ana', email: 'ana@example.org', canSpeak: true, exp: Date.now() + 60_000 }, true);
  const value = cookie.split(';')[0];
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/);
  const me = auth.fromRequest({ headers: { cookie: value } });
  assert.equal(me.email, 'ana@example.org');
  const tampered = value.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal(auth.fromRequest({ headers: { cookie: tampered } }), null);
  const expired = auth.cookieFor({ name: 'Old', exp: Date.now() - 1 }).split(';')[0];
  assert.equal(auth.fromRequest({ headers: { cookie: expired } }), null);
});

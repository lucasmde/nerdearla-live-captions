// One live session = one stage. Audio in -> transcriber -> segments -> translator -> hub.
import fs from 'node:fs';
import path from 'node:path';
import { GeminiTranscriber } from './engines/gemini-transcribe.js';
import { MockTranscriber, mockTranslator } from './engines/mock.js';
import { makeTranslator } from './engines/translate.js';

let translatorSingleton = null;

export class LiveSession {
  constructor(def, cfg, hub) {
    this.def = def; this.cfg = cfg; this.hub = hub;
    this.id = def.id;
    this.seq = 0;
    this.finals = []; // recent original lines (context for translation)
    this.pending = ''; // accumulating final pieces
    this.pendingTimer = null;
    this.partialTr = { text: '', at: 0, busy: false, lastTranslated: '' };
    this.startedAt = Date.now();
    this.source = null; // 'browser' | 'ingest' | null
    this.bytes = 0;
    this.transcriber = null;
    this.metrics = { lastAudioAt: 0, lastPartialAt: 0, lastFinalAt: 0, trCount: 0, trMsTotal: 0, trErrors: 0, engineErrors: 0, segLatencyMs: 0 };
    fs.mkdirSync(cfg.transcriptsDir, { recursive: true });
    this.logFile = path.join(cfg.transcriptsDir, `${this.id}.jsonl`);
    if (!translatorSingleton) {
      translatorSingleton = cfg.engine === 'mock' ? mockTranslator : makeTranslator(cfg, this.log.bind(this));
    }
    this.translator = translatorSingleton;
  }

  log(tag, ...a) { console.log(`[${this.id}] [${tag}]`, ...a); }

  ensureTranscriber() {
    if (this.transcriber) return;
    const common = {
      onTranscript: (e) => this.onTranscript(e),
      onStatus: (s) => { if (s.error) this.metrics.engineErrors++; this.hub.setStatus(this.id, s); },
      log: this.log.bind(this),
    };
    if (this.cfg.engine === 'mock') {
      this.transcriber = new MockTranscriber({ ...common, autoplay: process.env.MOCK_AUTOPLAY === '1' });
    } else {
      this.transcriber = new GeminiTranscriber({
        ...common,
        apiKey: this.cfg.geminiApiKey,
        model: this.cfg.transcribeModel,
        sourceLang: this.def.sourceLang,
        vocabulary: [...this.cfg.globalVocabulary, ...this.def.vocabulary],
        rotateMs: this.cfg.sessionRotateMs,
      });
    }
    this.transcriber.start().catch((e) => this.log('engine', 'start failed', e?.message || e));
  }

  /** Called by ingest endpoints with raw PCM16 mono 16 kHz. */
  audio(buf, source) {
    if (this.source !== source) { this.source = source; this.hub.setStatus(this.id, { source }); }
    this.bytes += buf.length;
    this.metrics.lastAudioAt = Date.now();
    this.ensureTranscriber();
    this.transcriber.sendAudio(buf);
  }

  sourceGone(source) {
    if (this.source === source) { this.source = null; this.hub.setStatus(this.id, { source: null }); this.transcriber?.endOfAudio?.(); }
  }

  onTranscript(e) {
    const lang = normLang(e.lang) || (this.def.sourceLang !== 'auto' ? this.def.sourceLang : null);
    if (e.type === 'partial') {
      this.metrics.lastPartialAt = Date.now();
      // The engine's interim hypothesis is cumulative for the current turn and may
      // repeat text that was already finalized: show only what is not final yet.
      const rest = this.stripFinalized(e.text);
      const full = (this.pending ? this.pending + ' ' : '') + rest;
      if (!full.trim()) return;
      this.hub.partial(this.id, full, lang, this.partialTr.lastTranslated || null);
      this.maybeTranslatePartial(full, lang);
      return;
    }
    // final piece
    this.turnFinal = (this.turnFinal || '') + norm(e.text);
    this.pending = (this.pending ? this.pending + ' ' : '') + e.text.trim();
    clearTimeout(this.pendingTimer);
    if (e.finished === false) {
      this.pendingTimer = setTimeout(() => this.flushFinal(lang), 1200);
    } else {
      this.flushFinal(lang);
    }
  }

  stripFinalized(text) {
    const f = this.turnFinal || '';
    if (!f) return text;
    const n = norm(text);
    let k = 0; while (k < f.length && k < n.length && f[k] === n[k]) k++;
    if (k < f.length * 0.6) { this.turnFinal = ''; return text; } // new turn (e.g. session rotated)
    // walk words until the normalized prefix is consumed
    const words = text.split(/\s+/); let acc = 0, i = 0;
    for (; i < words.length; i++) {
      const w = norm(words[i]); const next = acc + w.length;
      if (next > k) { if (k - acc > w.length / 2) i++; break; }
      acc = next;
    }
    return words.slice(i).join(' ');
  }

  flushFinal(lang) {
    const whole = this.pending.trim();
    this.pending = '';
    if (!whole) return;
    if (this.def.sourceLang !== 'auto') lang = this.def.sourceLang;
    else {
      // Engine language ids can flicker on short segments (e.g. "Hola a todos" -> pt):
      // combine the engine's code with a cheap stopword detector and a majority vote
      // over the last few segments, since speakers rarely switch language mid-talk.
      const guess = detectLang(whole);
      this.langVotes = [...(this.langVotes || []), lang, guess].filter(Boolean).slice(-6);
      const counts = {}; for (const l of this.langVotes) counts[l] = (counts[l] || 0) + 1;
      lang = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || this.lastLang || 'en';
    }
    this.lastLang = lang;
    // keep subtitle segments readable: split long finals at sentence boundaries
    const parts = whole.length > 110 ? whole.split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¿¡"(])/).filter(Boolean) : [whole];
    for (const text of parts) this.emitFinal(text, lang);
  }

  emitFinal(text, lang) {
    const seg = { id: `${this.id}-${++this.seq}`, t: Date.now(), rel: Date.now() - this.startedAt, text, lang, tr: {} };
    this.finals.push(text);
    if (this.finals.length > 8) this.finals.shift();
    this.metrics.lastFinalAt = Date.now();
    this.hub.final(this.id, seg);
    this.partialTr.lastTranslated = '';
    this.append({ ...seg });
    const targets = this.def.targetLangs.filter((l) => l !== lang);
    // same-language target: original doubles as caption
    for (const l of this.def.targetLangs) if (l === lang) this.hub.translation(this.id, seg.id, l, text);
    if (!targets.length) return;
    const t0 = Date.now();
    this.translator.translateMany(text, targets, this.finals.slice(0, -1))
      .then((tr) => {
        this.metrics.trCount++; this.metrics.trMsTotal += Date.now() - t0;
        for (const [l, t] of Object.entries(tr)) this.hub.translation(this.id, seg.id, l, t);
        this.append({ id: seg.id, tr });
      })
      .catch((err) => { this.metrics.trErrors++; this.log('translate', String(err?.message || err).slice(0, 160)); });
  }

  // Translate long-running partials at most every ~1.5 s so the translated view
  // moves while the speaker is still talking, not only at the end of the sentence.
  maybeTranslatePartial(text, lang) {
    if (!this.cfg.translatePartials) return;
    const p = this.partialTr;
    const target = this.def.targetLangs.find((l) => l !== lang);
    if (!target || p.busy || text.length < 30 || Date.now() - p.at < this.cfg.partialTranslateEveryMs || text === p.text) return;
    p.busy = true; p.at = Date.now(); p.text = text;
    this.translator.translateMany(text, [target], this.finals)
      .then((r) => { const tr = r[target]; p.lastTranslated = tr; this.hub.partial(this.id, text, lang, tr); })
      .catch(() => {})
      .finally(() => { p.busy = false; });
  }

  /** A viewer asked for a language this session does not translate yet: add it and back-fill recent history. */
  async addTarget(lang) {
    lang = normLang(lang);
    if (!lang || !/^[a-z]{2,3}$/.test(lang) || this.def.targetLangs.includes(lang)) return;
    if (this.def.targetLangs.length >= 12) return; // sanity cap
    this.def.targetLangs.push(lang);
    this.log('lang', `added target ${lang} on request`);
    const hist = (this.hub.history.get(this.id) || []).filter((seg) => !seg.tr?.[lang]).slice(-15);
    if (!hist.length) return;
    const same = hist.filter((seg) => seg.lang === lang); for (const seg of same) this.hub.translation(this.id, seg.id, lang, seg.text);
    const todo = hist.filter((seg) => seg.lang !== lang);
    if (!todo.length) return;
    try {
      const out = await this.translator.translateBatch(todo.map((seg) => seg.text), lang);
      todo.forEach((seg, i) => { this.hub.translation(this.id, seg.id, lang, out[i]); this.append({ id: seg.id, tr: { [lang]: out[i] } }); });
    } catch (e) { this.log('translate', `backfill ${lang}: ${e?.message || e}`); }
  }

  append(obj) {
    fs.appendFile(this.logFile, JSON.stringify(obj) + '\n', () => {});
  }

  info() {
    return {
      id: this.id, name: this.def.name, room: this.def.room, sourceLang: this.def.sourceLang,
      targetLangs: this.def.targetLangs, viewers: this.hub.viewers(this.id),
      status: this.hub.status.get(this.id) || null, source: this.source, segments: this.seq,
      metrics: { ...this.metrics, trAvgMs: this.metrics.trCount ? Math.round(this.metrics.trMsTotal / this.metrics.trCount) : null, audioSeconds: Math.round(this.bytes / 32000) },
    };
  }

  close() { this.transcriber?.close(); this.transcriber = null; }
}

// Tiny stopword-based detector for the languages we care about, used when the
// engine does not report a language code. Cheap, no network, good enough per segment.
const STOP = {
  en: ['the', 'and', 'to', 'of', 'is', 'we', 'you', 'that', 'this', 'with', 'are', 'for', 'it', 'on', 'in', 'our'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'es', 'en', 'un', 'una', 'para', 'con', 'por', 'se', 'del', 'al', 'vamos', 'hoy', 'todos', 'muchas', 'gracias', 'bienvenidos', 'hola', 'esto', 'como', 'muy'],
  pt: ['o', 'os', 'as', 'que', 'e', 'é', 'em', 'um', 'uma', 'para', 'com', 'não', 'do', 'da', 'vamos', 'hoje', 'todos', 'muito', 'obrigado', 'bem-vindos', 'olá', 'isso', 'como', 'você'],
};
function detectLang(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  let best = null, bestScore = 0;
  for (const [lang, list] of Object.entries(STOP)) {
    const set = new Set(list);
    const score = words.filter((w) => set.has(w)).length;
    if (score > bestScore) { best = lang; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

function norm(t) { return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }

function normLang(code) {
  if (!code) return null;
  return String(code).toLowerCase().split('-')[0];
}

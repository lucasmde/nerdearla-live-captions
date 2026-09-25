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
    if (this.source === source) { this.source = null; this.hub.setStatus(this.id, { source: null }); }
  }

  onTranscript(e) {
    const lang = normLang(e.lang) || (this.def.sourceLang !== 'auto' ? this.def.sourceLang : null);
    if (e.type === 'partial') {
      this.metrics.lastPartialAt = Date.now();
      const full = (this.pending ? this.pending + ' ' : '') + e.text;
      this.hub.partial(this.id, full, lang, this.partialTr.lastTranslated || null);
      this.maybeTranslatePartial(full, lang);
      return;
    }
    // final piece
    this.pending = (this.pending ? this.pending + ' ' : '') + e.text.trim();
    clearTimeout(this.pendingTimer);
    if (e.finished === false) {
      this.pendingTimer = setTimeout(() => this.flushFinal(lang), 1200);
    } else {
      this.flushFinal(lang);
    }
  }

  flushFinal(lang) {
    const text = this.pending.trim();
    this.pending = '';
    if (!text) return;
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
    for (const target of targets) {
      const t0 = Date.now();
      this.translator.translate(text, target, this.finals.slice(0, -1))
        .then((tr) => {
          this.metrics.trCount++; this.metrics.trMsTotal += Date.now() - t0;
          this.hub.translation(this.id, seg.id, target, tr); this.append({ id: seg.id, tr: { [target]: tr } });
        })
        .catch((err) => { this.metrics.trErrors++; this.log('translate', target, err?.message || err); });
    }
  }

  // Translate long-running partials at most every ~1.5 s so the translated view
  // moves while the speaker is still talking, not only at the end of the sentence.
  maybeTranslatePartial(text, lang) {
    if (!this.cfg.translatePartials) return;
    const p = this.partialTr;
    const target = this.def.targetLangs.find((l) => l !== lang);
    if (!target || p.busy || text.length < 30 || Date.now() - p.at < 1500 || text === p.text) return;
    p.busy = true; p.at = Date.now(); p.text = text;
    this.translator.translate(text, target, this.finals)
      .then((tr) => { p.lastTranslated = tr; this.hub.partial(this.id, text, lang, tr); })
      .catch(() => {})
      .finally(() => { p.busy = false; });
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

function normLang(code) {
  if (!code) return null;
  return String(code).toLowerCase().split('-')[0];
}

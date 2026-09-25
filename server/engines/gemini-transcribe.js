// Streaming speech-to-text on top of the Gemini Live API (gemini-*-transcribe-live).
// Handles: partial/final transcripts, GoAway, proactive session rotation
// (the provider caps a live session at ~10 min) and buffering audio while reconnecting.
import { GoogleGenAI, Modality } from '@google/genai';

export class GeminiTranscriber {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {string} opts.model
   * @param {string} opts.sourceLang  'auto' or BCP-47
   * @param {string[]} opts.vocabulary
   * @param {number} opts.rotateMs
   * @param {(e:{type:'partial'|'final', text:string, lang?:string})=>void} opts.onTranscript
   * @param {(s:object)=>void} opts.onStatus
   * @param {(tag:string, ...a:any[])=>void} opts.log
   */
  constructor(opts) {
    this.opts = opts;
    this.ai = new GoogleGenAI({ apiKey: opts.apiKey });
    this.session = null;
    this.connecting = null;
    this.closed = false;
    this.queue = []; // base64 chunks buffered while (re)connecting
    this.rotateTimer = null;
    this.gen = 0;
  }

  async start() {
    await this.connect();
  }

  async connect() {
    if (this.closed) return;
    if (this.connecting) return this.connecting;
    const gen = ++this.gen;
    const { model, sourceLang, vocabulary, log } = this.opts;
    const config = {
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {
        ...(sourceLang && sourceLang !== 'auto' ? { languageCodes: [sourceLang] } : {}),
        ...(vocabulary?.length ? { customVocabulary: vocabulary.slice(0, 1000) } : {}),
      },
    };
    this.connecting = (async () => {
      try {
        const session = await this.ai.live.connect({
          model,
          config,
          callbacks: {
            onopen: () => log('live', `connected gen=${gen}`),
            onmessage: (m) => this.onMessage(gen, m),
            onerror: (e) => log('live', `error gen=${gen}: ${e?.message || e}`),
            onclose: (e) => {
              log('live', `closed gen=${gen}: ${e?.reason || ''}`);
              if (this.gen === gen && !this.closed) {
                this.session = null;
                setTimeout(() => this.connect().catch(() => {}), 1000);
              }
            },
          },
        });
        if (gen !== this.gen) { try { session.close(); } catch {} return; }
        this.session = session;
        this.opts.onStatus?.({ live: true, engine: model });
        // flush buffered audio
        for (const b64 of this.queue.splice(0)) this.sendB64(b64);
        this.scheduleRotate();
      } catch (err) {
        log('live', `connect failed gen=${gen}: ${err?.message || err}`);
        this.opts.onStatus?.({ live: false, error: String(err?.message || err) });
        if (!this.closed) setTimeout(() => this.connect().catch(() => {}), 3000);
      } finally {
        this.connecting = null;
      }
    })();
    return this.connecting;
  }

  scheduleRotate() {
    clearTimeout(this.rotateTimer);
    this.rotateTimer = setTimeout(() => this.rotate('scheduled'), this.opts.rotateMs);
  }

  /** Open a fresh session, then close the old one, so no audio is lost. */
  async rotate(reason) {
    if (this.closed) return;
    this.opts.log('live', `rotating session (${reason})`);
    const old = this.session;
    this.session = null; // new audio goes to queue until the new session is up
    try { old?.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
    await this.connect();
    // give the old session a moment to flush its final transcript, then close
    setTimeout(() => { try { old?.close(); } catch {} }, 4000);
  }

  onMessage(gen, m) {
    const { onTranscript, log } = this.opts;
    if (m.goAway) {
      log('live', `goAway timeLeft=${m.goAway.timeLeft}`);
      if (gen === this.gen) this.rotate('goAway');
      return;
    }
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interimInputTranscription?.text) {
      onTranscript({ type: 'partial', text: sc.interimInputTranscription.text, lang: sc.interimInputTranscription.languageCode });
    }
    if (sc.inputTranscription?.text) {
      onTranscript({ type: 'final', text: sc.inputTranscription.text, lang: sc.inputTranscription.languageCode, finished: sc.inputTranscription.finished });
    }
  }

  /** @param {Buffer} pcm16 raw 16-bit little-endian mono @16kHz */
  sendAudio(pcm16) {
    const b64 = pcm16.toString('base64');
    if (this.session) this.sendB64(b64);
    else {
      this.queue.push(b64);
      if (this.queue.length > 300) this.queue.shift(); // ~30 s max buffer at 100 ms chunks
      if (!this.connecting && !this.closed) this.connect().catch(() => {});
    }
  }

  sendB64(b64) {
    try {
      this.session.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
    } catch (e) {
      this.opts.log('live', `send failed: ${e?.message || e}`);
    }
  }

  /** Tell the engine the stream paused so it finalizes the pending hypothesis. */
  endOfAudio() {
    try { this.session?.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
  }

  close() {
    this.closed = true;
    clearTimeout(this.rotateTimer);
    try { this.session?.close(); } catch {}
    this.session = null;
  }
}

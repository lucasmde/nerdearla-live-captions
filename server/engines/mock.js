// Mock engine: no API key needed. Emits a scripted talk word by word while audio arrives
// (or on a timer if MOCK_AUTOPLAY=1), so the UI and fan-out can be tested end to end.
const SCRIPT = [
  'Welcome everyone to the main stage, thanks for being here.',
  'Today we are going to talk about open source live captions.',
  'The system takes the audio from the stage and streams it to the cloud.',
  'Every stage runs in parallel, so ten rooms are not a problem.',
  'Attendees just open a web page and pick their session and language.',
];

export class MockTranscriber {
  constructor({ onTranscript, onStatus, log, autoplay }) {
    this.onTranscript = onTranscript; this.onStatus = onStatus; this.log = log;
    this.i = 0; this.w = 0; this.timer = null; this.autoplay = autoplay; this.lastAudio = 0;
  }
  async start() {
    this.onStatus?.({ live: true, engine: 'mock' });
    this.timer = setInterval(() => this.tick(), 350);
  }
  tick() {
    if (!this.autoplay && Date.now() - this.lastAudio > 1500) return;
    const line = SCRIPT[this.i % SCRIPT.length].split(' ');
    this.w++;
    if (this.w >= line.length) {
      this.onTranscript({ type: 'final', text: line.join(' '), lang: 'en' });
      this.i++; this.w = 0;
    } else {
      this.onTranscript({ type: 'partial', text: line.slice(0, this.w).join(' '), lang: 'en' });
    }
  }
  sendAudio() { this.lastAudio = Date.now(); }
  close() { clearInterval(this.timer); }
}

export const mockTranslator = {
  async translateBatch(texts, target) { return texts.map((t) => `[${target}] ${t}`); },
  async translateMany(text, targets) {
    await new Promise((r) => setTimeout(r, 250));
    return Object.fromEntries(targets.map((t) => [t, `[${t}] ${text}`]));
  },
};

// AudioWorklet: downsample float32 @ context rate -> Int16 mono @ 16 kHz, emit ~100 ms chunks.
class PCM16Downsampler extends AudioWorkletProcessor {
  constructor() {
    super();
    this.target = 16000;
    this.ratio = sampleRate / this.target;
    this.acc = [];
    this.pos = 0;
    this.chunk = 1600; // 100 ms @ 16 kHz
    this.out = new Int16Array(this.chunk);
    this.outLen = 0;
    this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0];
    if (!ch || !ch[0]) return true;
    // mix to mono
    const n = ch[0].length;
    const mono = new Float32Array(n);
    for (const c of ch) for (let i = 0; i < n; i++) mono[i] += c[i] / ch.length;
    // simple linear-interpolation resampler (good enough for speech)
    let p = this.pos;
    while (p < n - 1) {
      const i0 = Math.floor(p), f = p - i0;
      const v = mono[i0] * (1 - f) + mono[i0 + 1] * f;
      const a = Math.abs(v); if (a > this.peak) this.peak = a;
      this.out[this.outLen++] = Math.max(-1, Math.min(1, v)) * 32767;
      if (this.outLen === this.chunk) {
        this.port.postMessage({ pcm: this.out.buffer, peak: this.peak }, [this.out.buffer]);
        this.out = new Int16Array(this.chunk); this.outLen = 0; this.peak = 0;
      }
      p += this.ratio;
    }
    this.pos = p - n;
    return true;
  }
}
registerProcessor('pcm16-downsampler', PCM16Downsampler);

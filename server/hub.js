// Fan-out of caption events to audience clients, with a short replay buffer.
const HISTORY = 60;

export class Hub {
  constructor() {
    this.clients = new Map(); // sessionId -> Set<ws>
    this.history = new Map(); // sessionId -> Array<segment>
    this.status = new Map(); // sessionId -> { live, source, detectedLang, updatedAt }
  }

  subscribe(sessionId, ws) {
    if (!this.clients.has(sessionId)) this.clients.set(sessionId, new Set());
    this.clients.get(sessionId).add(ws);
    // Replay finalized history so late joiners see context.
    const hist = this.history.get(sessionId) || [];
    ws.send(JSON.stringify({ type: 'history', sessionId, segments: hist, status: this.status.get(sessionId) || null }));
    ws.on('close', () => this.clients.get(sessionId)?.delete(ws));
  }

  broadcast(sessionId, msg) {
    const payload = JSON.stringify({ ...msg, sessionId });
    for (const ws of this.clients.get(sessionId) || []) {
      if (ws.readyState === 1) ws.send(payload);
    }
  }

  /** Publish a final segment (original text), remember it for late joiners. */
  final(sessionId, segment) {
    if (!this.history.has(sessionId)) this.history.set(sessionId, []);
    const hist = this.history.get(sessionId);
    hist.push(segment);
    if (hist.length > HISTORY) hist.splice(0, hist.length - HISTORY);
    this.broadcast(sessionId, { type: 'final', segment });
  }

  /** Attach a translation to an existing segment. */
  translation(sessionId, segId, lang, text) {
    const hist = this.history.get(sessionId) || [];
    const seg = hist.find((s) => s.id === segId);
    if (seg) seg.tr = { ...(seg.tr || {}), [lang]: text };
    this.broadcast(sessionId, { type: 'translation', segId, lang, text });
  }

  partial(sessionId, text, lang, tr) {
    this.broadcast(sessionId, { type: 'partial', text, lang, tr: tr || null });
  }

  setStatus(sessionId, patch) {
    const cur = this.status.get(sessionId) || {};
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.status.set(sessionId, next);
    this.broadcast(sessionId, { type: 'status', status: next });
  }

  viewers(sessionId) {
    return this.clients.get(sessionId)?.size || 0;
  }
}

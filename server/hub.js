// Fan-out of caption events to audience clients, with a short replay buffer.
const HISTORY = 60;

export class Hub {
  constructor() {
    this.clients = new Map(); // sessionId -> Set<ws>
    this.history = new Map(); // sessionId -> Array<segment>
    this.status = new Map(); // sessionId -> { live, source, detectedLang, updatedAt }
    this.chat = new Map(); // sessionId -> Array<msg>
    this.floor = new Map(); // sessionId -> { hands: ws[], holder: ws|null }
  }

  /** Room chat: store (last 200) and broadcast. */
  // ---- floor control: listeners raise a hand, a speaker gives the floor; while someone has the
  // floor only that person and the speakers can write, until a speaker closes it.
  floorState(sessionId) { if (!this.floor.has(sessionId)) this.floor.set(sessionId, { hands: [], holder: null }); return this.floor.get(sessionId); }
  floorInfo(sessionId) { const f = this.floorState(sessionId); return { hands: f.hands.map((w) => ({ id: w._cid, name: w.who?.name || 'Anónimo' })), holder: f.holder ? { id: f.holder._cid, name: f.holder.who?.name || 'Anónimo' } : null }; }
  raiseHand(sessionId, ws, up) {
    const f = this.floorState(sessionId);
    f.hands = f.hands.filter((w) => w !== ws && w.readyState === 1);
    if (up && f.holder !== ws) f.hands.push(ws);
    this.broadcast(sessionId, { type: 'floor', floor: this.floorInfo(sessionId) });
  }
  giveFloor(sessionId, ws, targetId) {
    if (ws.who?.role !== 'speaker') return;
    const f = this.floorState(sessionId);
    const target = targetId ? [...(this.clients.get(sessionId) || [])].find((w) => w._cid === targetId) : null;
    f.holder = target || null; f.hands = f.hands.filter((w) => w !== target);
    this.broadcast(sessionId, { type: 'floor', floor: this.floorInfo(sessionId) });
    const msg = { id: `${Date.now().toString(36)}f`, t: Date.now(), name: ws.who?.name || 'Expositor', role: 'speaker', system: true, text: target ? `✋ ${target.who?.name || 'Alguien'} tiene la palabra` : '✅ Palabra cerrada, el chat vuelve a estar abierto' };
    if (!this.chat.has(sessionId)) this.chat.set(sessionId, []); this.chat.get(sessionId).push(msg);
    this.broadcast(sessionId, { type: 'chat', msg });
  }
  canWrite(sessionId, ws) { const f = this.floorState(sessionId); return !f.holder || f.holder === ws || ws.who?.role === 'speaker'; }

  chatMessage(sessionId, ws, text, audio) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (audio && (typeof audio !== 'string' || audio.length > 400000 || !audio.startsWith('data:audio/'))) audio = null;
    if (!text && !audio) return null;
    if (!this.canWrite(sessionId, ws)) { ws.send(JSON.stringify({ type: 'toast', text: 'Alguien tiene la palabra; esperá a que el expositor la cierre.' })); return null; }
    const now = Date.now();
    if (ws._lastChat && now - ws._lastChat < 700) return null; // simple flood control
    ws._lastChat = now;
    const msg = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, t: now, name: ws.who?.name || 'Anónimo', picture: ws.who?.picture || '', role: ws.who?.role || 'listener', text, ...(audio ? { audio } : {}) };
    if (!this.chat.has(sessionId)) this.chat.set(sessionId, []);
    const list = this.chat.get(sessionId); list.push(msg); if (list.length > 200) list.splice(0, list.length - 200);
    this.broadcast(sessionId, { type: 'chat', msg });
    return msg;
  }

  subscribe(sessionId, ws, who = {}) {
    if (!this.clients.has(sessionId)) this.clients.set(sessionId, new Set());
    ws._cid = Math.random().toString(36).slice(2, 10);
    ws.who = { name: String(who.name || '').slice(0, 40), role: who.role === 'speaker' ? 'speaker' : 'listener', lang: who.lang || null, picture: who.picture || '', email: who.email || '' };
    this.clients.get(sessionId).add(ws);
    // Replay finalized history so late joiners see context.
    const hist = this.history.get(sessionId) || [];
    ws.send(JSON.stringify({ type: 'history', sessionId, segments: hist, status: this.status.get(sessionId) || null, presence: this.presence(sessionId), chat: (this.chat.get(sessionId) || []).slice(-50), floor: this.floorInfo(sessionId), you: ws._cid }));
    this.broadcast(sessionId, { type: 'presence', presence: this.presence(sessionId) });
    ws.on('close', () => { this.clients.get(sessionId)?.delete(ws); const f = this.floorState(sessionId); if (f.holder === ws) f.holder = null; f.hands = f.hands.filter((w) => w !== ws); this.broadcast(sessionId, { type: 'presence', presence: this.presence(sessionId) }); this.broadcast(sessionId, { type: 'floor', floor: this.floorInfo(sessionId) }); });
  }

  /** Languages viewers of this session are currently watching. */
  viewerLangs(sessionId) {
    return [...new Set([...(this.clients.get(sessionId) || [])].map((c) => c.who?.lang).filter(Boolean))];
  }

  presence(sessionId) {
    const all = [...(this.clients.get(sessionId) || [])];
    const speakers = all.filter((c) => c.who?.role === 'speaker');
    return {
      total: all.length, listeners: all.length - speakers.length, speakers: speakers.length,
      speakerNames: speakers.map((c) => c.who.name).filter(Boolean).slice(0, 5),
      people: all.slice(0, 40).map((c) => ({ name: c.who.name, role: c.who.role, picture: c.who.picture })),
    };
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
    this.broadcast(sessionId, { type: 'partial', text, lang, tr: tr || null, t: Date.now() });
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

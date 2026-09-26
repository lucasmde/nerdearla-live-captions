// Live-editable room/session directory, backed by a plain JSON file on disk.
// This is what the admin panel (public/admin-sessions.html) reads and writes through
// the /api/admin/rooms* routes in index.js — no external database needed, same spirit
// as the rest of the project. The file lives under DATA_DIR so it survives redeploys
// on hosts with a persistent disk (Render Disk, a Docker volume, etc.); when DATA_DIR
// isn't set it defaults to the project root, matching the original sessions.json.
import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-z0-9-]{2,40}$/;

function normalizeAgendaEntry(t = {}) {
  return {
    day: String(t.day || '').slice(0, 20),
    start: String(t.start || '').slice(0, 5),
    end: String(t.end || '').slice(0, 5),
    title: String(t.title || '').trim().slice(0, 200),
    speaker: String(t.speaker || '').trim().slice(0, 200),
    lang: String(t.lang || '').trim().slice(0, 10),
  };
}

const MAX_ROOMS = 60; // cap so anyone-can-create sandbox rooms can't grow sessions.json without bound

function normalizeRoom(s = {}) {
  const agenda = (s.agenda || []).map(normalizeAgendaEntry);
  const speakerNames = agenda.flatMap((t) => t.speaker.split(',').map((x) => x.trim()).filter(Boolean));
  const targetLangs = Array.isArray(s.targetLangs) && s.targetLangs.length ? s.targetLangs : ['es', 'en'];
  return {
    id: s.id,
    name: String(s.name || s.id || '').trim().slice(0, 80) || s.id,
    room: String(s.room || '').trim().slice(0, 120),
    color: /^#[0-9a-fA-F]{3,8}$/.test(s.color || '') ? s.color : '',
    // Free-text reminder of where the operator should get this room's audio from
    // (a Zoom/Meet link, an RTMP URL for `tools/ingest.js`, "pestaña del canal de streaming", etc).
    // It's informational only — the actual capture is still started live from /operator/:id.
    audioNote: String(s.audioNote || '').trim().slice(0, 300),
    sourceLang: String(s.sourceLang || 'auto').trim().slice(0, 10) || 'auto',
    targetLangs: [...new Set(targetLangs.map((l) => String(l).trim()).filter(Boolean))],
    vocabulary: [...new Set([...(s.vocabulary || []), ...speakerNames])],
    agenda: agenda.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start)),
    // Rooms created by ADMIN_EMAILS accounts (or seeded from sessions.json) leave these empty,
    // which keeps them manageable only by admins. A room created by any other signed-in
    // account carries its creator here, so that one account can fully manage (edit/delete/
    // generate speaker codes for) only the sandbox room(s) it made — never anyone else's,
    // and never the admin-managed event rooms. See /api/admin/rooms in server/index.js.
    ownerSub: String(s.ownerSub || '').slice(0, 200),
    ownerEmail: String(s.ownerEmail || '').slice(0, 200),
    ownerName: String(s.ownerName || '').trim().slice(0, 80),
    // When this room was created (set once, kept across edits) and, optionally, when its
    // event is meant to start — an ISO datetime a room's creator can set well ahead of time
    // (the portal shows it as an upcoming "próximamente" pill with a countdown, separate
    // from rooms that are actually live right now). Both stay empty for old rooms.
    createdAt: /^\d{4}-\d{2}-\d{2}T/.test(s.createdAt || '') ? s.createdAt : new Date().toISOString(),
    scheduledAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.scheduledAt || '') ? s.scheduledAt : '',
  };
}

export function makeStore({ dataDir, root, sessionsFileOverride } = {}) {
  const file = sessionsFileOverride || path.join(dataDir || root, 'sessions.json');

  function seedIfMissing() {
    if (fs.existsSync(file)) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const seed = [path.join(root, 'sessions.json'), path.join(root, 'sessions.example.json')].find((f) => f !== file && fs.existsSync(f));
    const seedData = seed ? JSON.parse(fs.readFileSync(seed, 'utf8')) : { event: '', timezone: '', vocabulary: [], sessions: [] };
    fs.writeFileSync(file, JSON.stringify(seedData, null, 1));
  }
  seedIfMissing();

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = { event: raw.event || '', timezone: raw.timezone || '', vocabulary: raw.vocabulary || [], sessions: (raw.sessions || []).map(normalizeRoom) };

  function persist() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
    fs.renameSync(tmp, file);
  }
  function find(id) {
    const s = data.sessions.find((x) => x.id === id);
    if (!s) throw new Error('esa sala no existe');
    return s;
  }

  return {
    file,
    get event() { return data.event; },
    get timezone() { return data.timezone; },
    get globalVocabulary() { return data.vocabulary; },
    list() { return data.sessions; },
    get(id) { return data.sessions.find((x) => x.id === id) || null; },

    create(room = {}) {
      const id = String(room.id || '').trim().toLowerCase();
      if (!ID_RE.test(id)) throw new Error('el id de la sala debe tener 2-40 caracteres: minúsculas, números y guiones (ej: sala-abasto)');
      if (data.sessions.some((s) => s.id === id)) throw new Error('ya existe una sala con ese id');
      if (!String(room.name || '').trim()) throw new Error('falta el nombre de la sala');
      if (data.sessions.length >= MAX_ROOMS) throw new Error(`ya hay ${MAX_ROOMS} salas creadas, el límite de esta instancia — borrá alguna antes de crear otra`);
      const norm = normalizeRoom({ ...room, id, agenda: [] });
      data.sessions.push(norm);
      persist();
      return norm;
    },
    update(id, patch = {}) {
      const s = find(id);
      const norm = normalizeRoom({ ...s, ...patch, id: s.id, agenda: s.agenda });
      Object.assign(s, norm);
      persist();
      return s;
    },
    remove(id) {
      const i = data.sessions.findIndex((x) => x.id === id);
      if (i === -1) throw new Error('esa sala no existe');
      data.sessions.splice(i, 1);
      persist();
    },

    addAgenda(id, entry = {}) {
      const s = find(id);
      const norm = normalizeAgendaEntry(entry);
      if (!norm.title) throw new Error('falta el título de la charla');
      if (!norm.start || !norm.end) throw new Error('falta el horario de inicio/fin');
      s.agenda.push(norm);
      s.agenda.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
      s.vocabulary = normalizeRoom(s).vocabulary;
      persist();
      return norm;
    },
    updateAgenda(id, index, patch = {}) {
      const s = find(id);
      if (!s.agenda[index]) throw new Error('esa charla no existe');
      s.agenda[index] = normalizeAgendaEntry({ ...s.agenda[index], ...patch });
      s.agenda.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
      s.vocabulary = normalizeRoom(s).vocabulary;
      persist();
      return s.agenda;
    },
    removeAgenda(id, index) {
      const s = find(id);
      if (!s.agenda[index]) throw new Error('esa charla no existe');
      s.agenda.splice(index, 1);
      s.vocabulary = normalizeRoom(s).vocabulary;
      persist();
    },
  };
}

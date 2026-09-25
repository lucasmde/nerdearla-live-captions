// Unit tests for the room/agenda store behind the admin panel (/admin/sessions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeStore } from '../server/store.js';

function tmpStore(seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-store-'));
  if (seed) fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify(seed));
  return makeStore({ dataDir: dir, root: dir });
}

test('starts empty and creates a room with defaults', () => {
  const store = tmpStore();
  assert.deepEqual(store.list(), []);
  const room = store.create({ id: 'sala-abasto', name: 'Sala Abasto' });
  assert.equal(room.id, 'sala-abasto');
  assert.equal(room.sourceLang, 'auto');
  assert.deepEqual(room.targetLangs, ['es', 'en']);
  assert.deepEqual(room.agenda, []);
});

test('rejects a bad id and a duplicate id', () => {
  const store = tmpStore();
  assert.throws(() => store.create({ id: 'Sala Con Espacios', name: 'x' }));
  store.create({ id: 'auditorio', name: 'Auditorio' });
  assert.throws(() => store.create({ id: 'auditorio', name: 'otra' }));
});

test('persists across a fresh load of the same file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-store-'));
  const a = makeStore({ dataDir: dir, root: dir });
  a.create({ id: 'gran-sala', name: 'Gran Sala', color: '#FF323C' });
  const b = makeStore({ dataDir: dir, root: dir });
  assert.equal(b.list().length, 1);
  assert.equal(b.get('gran-sala').color, '#FF323C');
});

test('agenda entries are added, sorted by day+start, edited and removed', () => {
  const store = tmpStore();
  store.create({ id: 'auditorio', name: 'Auditorio' });
  store.addAgenda('auditorio', { day: '2026-09-25', start: '15:00', end: '15:40', title: 'Segunda charla', speaker: 'B' });
  store.addAgenda('auditorio', { day: '2026-09-25', start: '10:00', end: '10:40', title: 'Primera charla', speaker: 'A' });
  const room = store.get('auditorio');
  assert.equal(room.agenda.length, 2);
  assert.equal(room.agenda[0].title, 'Primera charla');
  assert.equal(room.agenda[1].title, 'Segunda charla');
  // speaker names feed the room's vocabulary (helps recognition of proper nouns)
  assert.ok(room.vocabulary.includes('A') && room.vocabulary.includes('B'));

  store.updateAgenda('auditorio', 0, { title: 'Primera charla (editada)' });
  assert.equal(store.get('auditorio').agenda[0].title, 'Primera charla (editada)');

  store.removeAgenda('auditorio', 1);
  assert.equal(store.get('auditorio').agenda.length, 1);
});

test('addAgenda requires a title and a start/end time', () => {
  const store = tmpStore();
  store.create({ id: 'auditorio', name: 'Auditorio' });
  assert.throws(() => store.addAgenda('auditorio', { start: '10:00', end: '10:40' }));
  assert.throws(() => store.addAgenda('auditorio', { title: 'Sin horario' }));
});

test('seeds from an existing root sessions.json the first time DATA_DIR is used', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-root-'));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-data-'));
  fs.writeFileSync(path.join(root, 'sessions.json'), JSON.stringify({ event: 'Nerdearla', sessions: [{ id: 'gran-sala', name: 'Gran Sala' }] }));
  const store = makeStore({ dataDir, root });
  assert.equal(store.event, 'Nerdearla');
  assert.equal(store.list().length, 1);
  assert.ok(fs.existsSync(path.join(dataDir, 'sessions.json')));
});

test('remove deletes a room; removing an unknown room throws', () => {
  const store = tmpStore();
  store.create({ id: 'xx', name: 'X' });
  store.remove('xx');
  assert.equal(store.list().length, 0);
  assert.throws(() => store.remove('xx'));
});

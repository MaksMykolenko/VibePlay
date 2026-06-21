/**
 * Standalone tests for the Fat Dima Simulator VibePlay cloud-save adapter.
 * Zero dependencies — run with:  node --test
 *
 * Covers the Phase 7 "Fat Dima" checklist:
 *   - works without the VibePlay SDK
 *   - guest uses localStorage
 *   - logged-in cloud save loads
 *   - cloud error falls back to localStorage
 *   - local save sync prompt (announce) appears after login
 *   - no stray console errors on happy paths
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVibePlaySaveAdapter, FAT_DIMA_LS_KEY } from './vibeplay-save-adapter.js';

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

function makeVibe({ loggedIn = false, available = true, getResult, getThrows = false } = {}) {
  const calls = {
    reportLocalSave: [],
    set: [],
    onLocalSaveRequested: 0,
    progress: [],
    provider: null,
  };
  return {
    reportProgress: (k) => calls.progress.push(k),
    save: {
      isAvailable: () => available,
      getStatus: async () => ({
        code: 'ok',
        status: { available: true, loggedIn, hasSave: false },
      }),
      get: async () => {
        if (getThrows) throw new Error('cloud boom');
        return getResult ?? { code: 'not_found' };
      },
      set: async (data, opts) => {
        calls.set.push({ data, opts });
        return loggedIn ? { code: 'ok' } : { code: 'auth_required' };
      },
      delete: async () => ({ code: 'ok' }),
      reportLocalSave: (m) => calls.reportLocalSave.push(m),
      onLocalSaveRequested: (cb) => {
        calls.onLocalSaveRequested += 1;
        calls.provider = cb;
      },
    },
    _calls: calls,
  };
}

function silentLogger() {
  const warns = [];
  return { warn: (...a) => warns.push(a), info() {}, _warns: warns };
}

test('works without the VibePlay SDK (localStorage only)', async () => {
  const storage = makeStorage({
    [FAT_DIMA_LS_KEY]: JSON.stringify({ settingsVersion: 2, level: 3 }),
  });
  const logger = silentLogger();
  const cloud = createVibePlaySaveAdapter({ storage, vibe: null, logger });

  const loaded = await cloud.load();
  assert.deepEqual(loaded, { settingsVersion: 2, level: 3 });

  cloud.save({ settingsVersion: 2, level: 4 });
  assert.deepEqual(JSON.parse(storage.getItem(FAT_DIMA_LS_KEY)), { settingsVersion: 2, level: 4 });
  assert.equal(logger._warns.length, 0, 'no warnings on happy path');
});

test('guest uses localStorage (cloud present but not logged in)', async () => {
  const storage = makeStorage({ [FAT_DIMA_LS_KEY]: JSON.stringify({ level: 1 }) });
  const vibe = makeVibe({ loggedIn: false });
  const logger = silentLogger();
  const cloud = createVibePlaySaveAdapter({ storage, vibe, logger });

  const loaded = await cloud.load();
  assert.deepEqual(loaded, { level: 1 }, 'guest loads local, not cloud');

  await cloud.save({ level: 2 });
  assert.deepEqual(
    JSON.parse(storage.getItem(FAT_DIMA_LS_KEY)),
    { level: 2 },
    'local still written',
  );
  assert.equal(logger._warns.length, 0);
});

test('logged-in cloud save loads', async () => {
  const storage = makeStorage({ [FAT_DIMA_LS_KEY]: JSON.stringify({ level: 1 }) });
  const vibe = makeVibe({
    loggedIn: true,
    getResult: { code: 'ok', data: { settingsVersion: 2, level: 9 } },
  });
  const logger = silentLogger();
  let cloudLoaded = null;
  const cloud = createVibePlaySaveAdapter({
    storage,
    vibe,
    logger,
    onCloudLoaded: (d) => (cloudLoaded = d),
  });

  const loaded = await cloud.load();
  assert.deepEqual(loaded, { settingsVersion: 2, level: 9 }, 'cloud is authoritative when present');
  assert.deepEqual(cloudLoaded, { settingsVersion: 2, level: 9 }, 'onCloudLoaded fired');
  assert.equal(logger._warns.length, 0);
});

test('cloud error falls back to localStorage', async () => {
  const storage = makeStorage({ [FAT_DIMA_LS_KEY]: JSON.stringify({ level: 5 }) });
  const vibe = makeVibe({ loggedIn: true, getThrows: true });
  const cloud = createVibePlaySaveAdapter({ storage, vibe });

  const loaded = await cloud.load();
  assert.deepEqual(loaded, { level: 5 }, 'falls back to local on cloud error');
});

test('logged-in + no cloud + local exists → announces local save for sync', async () => {
  const storage = makeStorage({ [FAT_DIMA_LS_KEY]: JSON.stringify({ level: 7 }) });
  const vibe = makeVibe({ loggedIn: true, getResult: { code: 'not_found' } });
  const cloud = createVibePlaySaveAdapter({ storage, vibe });

  const loaded = await cloud.load();
  assert.deepEqual(loaded, { level: 7 }, 'keeps local when no cloud yet');
  assert.equal(vibe._calls.reportLocalSave.length, 1, 'announced local save');
  assert.deepEqual(vibe._calls.reportLocalSave[0], { has: true, schemaVersion: 2 });
});

test('init() registers a local-save provider and announces existing local save', async () => {
  const storage = makeStorage({ [FAT_DIMA_LS_KEY]: JSON.stringify({ level: 2 }) });
  const vibe = makeVibe({ loggedIn: true });
  const cloud = createVibePlaySaveAdapter({ storage, vibe });

  await cloud.init();
  assert.equal(vibe._calls.onLocalSaveRequested, 1, 'provider registered');
  assert.equal(vibe._calls.reportLocalSave.length, 1, 'announced on init');
  // The provider hands back the local save for the platform to sync.
  const provided = vibe._calls.provider();
  assert.deepEqual(provided, { data: { level: 2 }, schemaVersion: 2 });
});

test('markImportantEvent flushes cloud (important) and signals progress', async () => {
  const storage = makeStorage();
  const vibe = makeVibe({ loggedIn: true });
  const cloud = createVibePlaySaveAdapter({ storage, vibe });

  await cloud.markImportantEvent({ level: 10 }, 'level_up');
  assert.deepEqual(vibe._calls.progress, ['level_up'], 'progress signalled');
  assert.equal(vibe._calls.set.length, 1, 'cloud write attempted');
  assert.equal(vibe._calls.set[0].opts.important, true, 'flagged important');
  assert.deepEqual(
    JSON.parse(storage.getItem(FAT_DIMA_LS_KEY)),
    { level: 10 },
    'local written too',
  );
});

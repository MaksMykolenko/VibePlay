# Fat Dima Simulator — VibePlay cloud-save adapter

A standalone, dependency-free drop-in that adds **VibePlay cloud saves** to Fat
Dima Simulator while keeping the existing `localStorage` save working exactly as
before.

> Core product rule: **No account needed to play. Create a free account to save
> progress and continue anywhere.** Guest play must keep working with zero
> changes — the cloud is purely additive.

This folder is meant to be copied into the Fat Dima Simulator project (it is a
*separate* repo from the VibePlay platform):

```
vibeplay-save-adapter.js        # the adapter (vanilla ES module, no deps)
vibeplay-save-adapter.test.mjs  # tests: run `node --test`
README.md                       # this guide
```

## How it fits together

Fat Dima runs inside a sandboxed VibePlay game iframe. The iframe **never** has
direct access to auth cookies, sessions, or the API. Instead the VibePlay SDK
(`window.VibePlay`, loaded by the platform) talks to the parent Play Page over
`postMessage`, and the Play Page performs the authenticated save calls.

```
Fat Dima  ──VibePlay.save.*──►  VibePlay SDK  ──postMessage──►  Play Page  ──HTTPS (cookie)──►  /api/me/game-saves/:gameId
(this adapter)                  (window.VibePlay)               (authenticated bridge)            (Postgres)
```

The adapter only ever calls the SDK's typed `VibePlay.save.*` API. It receives
typed result codes (`ok`, `auth_required`, `too_large`, `invalid`,
`rate_limited`, `not_found`, `unavailable`, `error`) — never tokens or cookies.

## Existing save (unchanged)

| | |
|---|---|
| `localStorage` key | `dima_fat_simulator_settings` |
| `settingsVersion` | `2` |

The adapter reads/writes this exact key, so a guest's save is byte-for-byte the
same as today.

## Load logic

| Situation | Result |
|---|---|
| Guest (not logged in) | `localStorage` only |
| Logged in **and** a cloud save exists | load the **cloud** save |
| Logged in, **no** cloud save, local save exists | keep local **and** announce it so VibePlay can offer to sync after login |
| Cloud error / unavailable | fall back to `localStorage` |
| Not running on VibePlay | `localStorage` only |

## Save logic

- **Always** writes `localStorage` first (fallback — local progress is never lost).
- If VibePlay is available **and** the player is logged in → **debounced** cloud
  sync. The SDK throttles writes to at most once every ~10 seconds; pass
  `{ important: true }` (or use `markImportantEvent`) to flush immediately.
- Guest → `localStorage` only (a cloud write while a guest simply resolves
  `auth_required` and is ignored).

### Important events (flush + signal)

Call `markImportantEvent(settings, kind)` on:

- level up
- quest complete
- achievement unlock
- settings / save-menu action
- pause / exit (if available)

This flushes the cloud save immediately and signals progress to VibePlay so it
can time its soft "create a free account" CTA.

## Integration

### 1. Load the adapter

ES module (recommended):

```js
import { createVibePlaySaveAdapter } from './vibeplay-save-adapter.js';
```

or a plain script tag (exposes `window.VibePlaySaveAdapter`):

```html
<script type="module" src="./vibeplay-save-adapter.js"></script>
<script>
  const cloud = window.VibePlaySaveAdapter.create();
</script>
```

### 2. Initialise after load

```js
const cloud = createVibePlaySaveAdapter({
  // all optional — these are the defaults:
  // lsKey: 'dima_fat_simulator_settings',
  // schemaVersion: 2,
  lang: 'uk', // or 'en' — for any adapter-surfaced strings
  onCloudLoaded: (data) => console.info('Loaded cloud save', data),
});

await cloud.init(); // registers the sync provider + announces local progress
```

### 3. Replace your load

```js
// BEFORE:
// const settings = JSON.parse(localStorage.getItem('dima_fat_simulator_settings') || 'null') ?? defaults();

// AFTER:
const settings = (await cloud.load()) ?? defaults();
applySettings(settings);
```

### 4. Replace your save

```js
// BEFORE:
// localStorage.setItem('dima_fat_simulator_settings', JSON.stringify(settings));

// AFTER (debounced cloud + local fallback):
cloud.save(settings);

// On important moments:
cloud.markImportantEvent(settings, 'level_up');
```

That's it. Guests behave exactly as before; logged-in VibePlay players get cloud
saves and cross-device continuation.

## Guest → account sync (after login)

When a guest later creates an account (via the VibePlay CTA) and returns to the
game, VibePlay detects the announced local save and shows a prompt:

- **No cloud save yet** → "Sync your progress?" → Sync / Keep local only.
- **A cloud save already exists** → safe three-way choice: Keep cloud / Replace
  cloud with this device / Keep local only.

The adapter participates by (a) announcing the local save via
`reportLocalSave` and (b) handing it over through the provider registered in
`init()`. The adapter **never deletes the local save automatically.**

## Bilingual UI strings (EN / UK)

The adapter ships `STRINGS` for any text it surfaces itself; the platform's own
prompts are already localized by VibePlay.

| key | EN | UK |
|---|---|---|
| `syncedToCloud` | Progress synced to your VibePlay account. | Прогрес синхронізовано з вашим акаунтом VibePlay. |
| `cloudUnavailable` | Cloud saves are unavailable right now — your progress is saved on this device. | Хмарні збереження зараз недоступні — ваш прогрес збережено на цьому пристрої. |
| `loadedFromCloud` | Loaded your saved progress from the cloud. | Завантажено ваш збережений прогрес із хмари. |

```js
import { STRINGS } from './vibeplay-save-adapter.js';
toast(STRINGS[lang].syncedToCloud);
```

## Constraints (enforced by the platform)

- **JSON only.** Save data must be a JSON object/array. No code is ever executed.
- **Size cap.** ~200 KB per game (serialized). Keep saves lean — store progress,
  not assets.
- **Per user + per game.** One save row per (player, game); writes upsert.
- **Rate limited.** Don't save every frame — the adapter + SDK debounce for you.

## Tests

```bash
node --test
```

Covers: works without the SDK, guest uses localStorage, logged-in cloud load,
cloud-error fallback, post-login sync announcement, and important-event flush.

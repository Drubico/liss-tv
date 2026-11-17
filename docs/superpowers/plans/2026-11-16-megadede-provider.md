# Megadede Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `https://megadede.mobi/` as a high-performance content provider for LissTV, supporting movies, series with seasons/episodes, AES-256-CBC stream decryption, and clean direct HLS extraction for ad-free Vidstack playback.

**Architecture:** Strategy pattern adhering to `AGENTS.md` with three independent operations (`GetAll`, `GetDetail`, `GetUrl`) encapsulated in `strategies/megadede/`. Catalog and details are cached automatically by `CachedDriverDecorator` in SQLite; streams are decrypted from `/vidurl/...` inline, extracted via hoster extractors (Vidhide/Streamwish/VOE), and formatted for `/api/video/m3u8` proxying.

**Tech Stack:** TypeScript (strict), Node.js `crypto`, `cheerio`, `node:test`, `node:assert`.

**Spec:** `docs/superpowers/specs/2026-11-16-megadede-provider-design.md`

## Global Constraints

- Follow `AGENTS.md`: all provider code lives exclusively in `strategies/megadede/`, `builder/megadede.build.ts`, and registrations in `builder/factory.ts` and `drivers/registry.ts`.
- Zero modifications to other providers or UI components.
- TypeScript `strict` mode: no `any` (use `unknown` and type guards).
- Return domain types (`Movies`, `StoredMovie`, `Url`) and domain errors (`MegadedeError` extending `ProviderError`).
- Test runner: `node --import ./tests/register.mjs --test tests/**/*.test.ts tests/**/**/*.test.ts`.

## Review Focus

1. **Anti-bot challenge in `/vidurl/...`:** If `navigator.webdriver` or missing browser globals block HTML rendering, client must send genuine desktop headers.
2. **Missing or changed AES keys:** If `LINK_CHALLENGE` or `LINK_SALT` are missing in `/vidurl/...`, `GetUrl` must throw typed `MegadedeError` without crashing unhandled.
3. **Invalid or malformed packed code in Vidhide:** Dean Edwards unpacker must gracefully return null if unpacking fails and cascade to fallback extractors.
4. **Series episode on demand resolution:** When `GetUrl` receives a series episode with `#s{season}-e{episode}`, it must fetch `/api/episodio/serie/<slug>/<season>/<episode>` and handle 404/empty responses cleanly.
5. **Direct CDN CORS protection:** Direct upstream `.m3u8` playlist must be routed through `/api/video/m3u8?url=...` so browser Vidstack player plays without CORS/403 errors.

---

### Task 1: Core Schemas, Types & HTTP Client

**Files:**
- Create: `strategies/megadede/types.ts`
- Create: `strategies/megadede/client.ts`
- Test: `tests/strategies/megadede/client.test.ts`

- [ ] **Step 1: Write failing test for client and domain errors**
  Create `tests/strategies/megadede/client.test.ts` testing `megadedeFetch`, default headers, custom User-Agent, base URL resolution, and `MegadedeError` handling on non-200 responses.
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/client.test.ts`.
- [ ] **Step 3: Implement types and client**
  - Create `strategies/megadede/types.ts` defining `MegadedeItem`, `MegadedeEpisodeResponse`, `MegadedeEmbedEntry`, and `MegadedeLanguageGroup`.
  - Create `strategies/megadede/client.ts` implementing `MEGADEDE_BASE_URL = "https://megadede.mobi"`, `MegadedeError`, and `megadedeFetch()`.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/client.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 1 files with message `feat(megadede): add core types and http client`.

---

### Task 2: GetAll Strategy (Catalog, Search & Pagination Parser)

**Files:**
- Create: `strategies/megadede/get-all.operation.ts`
- Test: `tests/strategies/megadede/get-all.test.ts`

- [ ] **Step 1: Write failing test with catalog HTML fixtures**
  Create `tests/strategies/megadede/get-all.test.ts` with HTML fixtures testing:
  - Parsing movies catalog (`/peliculas?page=1`).
  - Parsing series catalog (`/series?page=1`).
  - Parsing search results (`/search?s=batman`).
  - Correct pagination flags (`hasMore`, `lastPageNumber`).
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-all.test.ts`.
- [ ] **Step 3: Implement GetAll operation**
  Implement `GetAll` in `strategies/megadede/get-all.operation.ts` satisfying `StrategyGetAllMovies`:
  - Route mapping for search, series, movies, and genre slugs.
  - Cheerio scraping of `<article class="mv v por">`, extracting title, TMDB image, year, rating, and media type.
  - Pagination extractor detecting maximum page number from `.page-numbers` or `?page=N`.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-all.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 2 files with message `feat(megadede): implement get-all catalog and search strategy`.

---

### Task 3: GetDetail Strategy (Metadata & Seasons/Episodes Parser)

**Files:**
- Create: `strategies/megadede/get-detail.operation.ts`
- Test: `tests/strategies/megadede/get-detail.test.ts`

- [ ] **Step 1: Write failing test with movie and serie HTML fixtures**
  Create `tests/strategies/megadede/get-detail.test.ts` testing:
  - Scrapes movie details: title, poster, backdrop, synopsis, year, rating, duration, tags, and `/vidurl/...` server button.
  - Scrapes serie details: seasons and episodes without extra network calls, assigning virtual link `/serie/<slug>#s{season}-e{episode}` and context `{ season, episode, slug, provider: 'megadede' }`.
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-detail.test.ts`.
- [ ] **Step 3: Implement GetDetail operation**
  Implement `GetDetail` in `strategies/megadede/get-detail.operation.ts` satisfying `StrategyGetMovieDetails`:
  - Cheerio parser for detail pages.
  - Maps to `StoredMovie` domain model.
  - Handles 404 or missing title gracefully returning `undefined`.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-detail.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 3 files with message `feat(megadede): implement get-detail strategy for movies and series`.

---

### Task 4: Vidhide & Secondary Stream Extractors

**Files:**
- Create: `strategies/megadede/extractors/vidhide.extractor.ts`
- Create: `strategies/megadede/extractors/streamwish.extractor.ts`
- Create: `strategies/megadede/extractors/voe.extractor.ts`
- Test: `tests/strategies/megadede/vidhide.extractor.test.ts`

- [ ] **Step 1: Write failing test for Dean Edwards unpacking and Vidhide extraction**
  Create `tests/strategies/megadede/vidhide.extractor.test.ts` testing unpacking of packed javascript and extraction of direct `.m3u8` from `links.hls2` / `sources`.
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/vidhide.extractor.test.ts`.
- [ ] **Step 3: Implement extractors**
  - Implement `unpackDeanEdwards()` and `extractVidhideM3u8()` in `strategies/megadede/extractors/vidhide.extractor.ts`.
  - Implement `extractStreamwishM3u8()` in `strategies/megadede/extractors/streamwish.extractor.ts`.
  - Implement `extractVoeM3u8()` in `strategies/megadede/extractors/voe.extractor.ts`.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/vidhide.extractor.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 4 files with message `feat(megadede): implement vidhide, streamwish and voe extractors`.

---

### Task 5: GetUrl Strategy (AES Decryption, Lazy Episode Fetch & Stream Orchestration)

**Files:**
- Create: `strategies/megadede/get-url.operation.ts`
- Test: `tests/strategies/megadede/get-url.test.ts`

- [ ] **Step 1: Write failing test for AES decryption, episode resolution, and URL output**
  Create `tests/strategies/megadede/get-url.test.ts` testing:
  - Derives AES key via `SHA-256(LINK_CHALLENGE + LINK_SALT)` and decrypts `dataLink` correctly.
  - Resolves episode `/vidurl/...` via `/api/episodio/serie/<slug>/<season>/<episode>`.
  - Dispatches to extractors and returns formatted `/api/video/m3u8?url=...` stream URL.
  - Respects language priority (`LAT` -> `ESP` -> `SUB`).
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`.
- [ ] **Step 3: Implement GetUrl operation**
  Implement `GetUrl` in `strategies/megadede/get-url.operation.ts` satisfying `StrategyGetUrl`:
  - Path parsing (movie vs serie episode coordinate vs direct vidurl).
  - AES-256-CBC decryptor using Node.js `crypto`.
  - Extractor cascading (Vidhide -> Streamwish -> VOE).
  - Formatting for `/api/video/m3u8` proxy and optional MinIO manifest persistence.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 5 files with message `feat(megadede): implement get-url strategy with aes decryption and stream extraction`.

---

### Task 6: Builder, Factory & Registry Integration

**Files:**
- Create: `builder/megadede.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Test: `tests/drivers/megadede-registry.test.ts`

- [ ] **Step 1: Write failing test for Megadede registration**
  Create `tests/drivers/megadede-registry.test.ts` checking `DriverRegistry.getDriver("megadede")` returns an instance wrapped in `CachedDriverDecorator` with `id: "megadede"`.
- [ ] **Step 2: Run test to confirm it fails**
  Run `node --import ./tests/register.mjs --test tests/drivers/megadede-registry.test.ts`.
- [ ] **Step 3: Implement MegadedeMovieBuilder and register in factory/registry**
  - Create `builder/megadede.build.ts` implementing `MovieBuilder<MovieContext>`.
  - Update `builder/factory.ts` adding `createMegadedeContext()` and registering in `MovieContextFactory.providers`.
  - Update `drivers/registry.ts` to register `new CachedDriverDecorator(megadedeContext)`.
- [ ] **Step 4: Run test to verify it passes**
  Run `node --import ./tests/register.mjs --test tests/drivers/megadede-registry.test.ts`.
- [ ] **Step 5: Commit changes**
  Commit Task 6 files with message `feat(megadede): register megadede builder and driver in registry`.

---

### Task 7: End-to-End Verification & Full Test Suite

**Files:**
- None (verification phase)

- [ ] **Step 1: Run complete test suite**
  Run `npm test` and verify that all existing tests and new megadede tests pass without error.
- [ ] **Step 2: Run type check and linter**
  Run `npx tsc --noEmit` to verify strict TypeScript adherence with zero errors.
- [ ] **Step 3: Verify clean git status**
  Run `git status` to ensure all changes are committed and no untracked files remain.

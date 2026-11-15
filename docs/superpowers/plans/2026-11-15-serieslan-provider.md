# SeriesLan Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and register the `serieslan` provider driver in LissTV supporting full series catalog listing, search, multi-season detail retrieval, and direct dual-audio `.m3u8` video stream resolution via the Strategy pattern.

**Architecture:** A self-contained provider package in `strategies/serieslan/` implementing the 3 canonical operations (`GetAll`, `GetDetail`, `GetUrl`). `GetAll` and `GetDetail` consume the upstream SeriesLan JSON REST API under `/api/rest/v1/`, gracefully handling the disabled movie feature. `GetUrl` resolves the episode player embed and parses direct master `.m3u8` streams from `vimeos.net`.

**Tech Stack:** TypeScript (strict), Node.js, Next.js App Router, Cheerio, Node native `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-15-serieslan-provider-design.md`

## Global Constraints
- Comply strictly with `AGENTS.md`:
  - Strategy contracts in `strategies/context.ts` and `types/movie.ts` are strictly respected.
  - Zero `any` types; all payloads and functions are strongly typed.
  - No coupling between UI components and provider internals.
  - No raw upstream network errors thrown to consumers; use typed domain errors (`ProviderError`, `NotFoundError`).
  - Movies are not configured upstream; `GetAll` with `filter="movies"` returns empty `{ movies: [], pagination: ... }`, and `GetDetail` with `/pelicula/` returns `undefined`.

## Review Focus
- SeriesLan API returns HTTP errors (404/500/504): `client.ts` wraps in descriptive `ProviderError`.
- `filter="movies"` queried: returns clean empty `MovieResponse` without network requests to disabled movie endpoint.
- Series with >10 seasons: `GetDetail` uses bounded concurrency (`Promise.allSettled`) avoiding network exhaustion.
- Player embed changes/missing iframe: `GetUrl` throws explicit `ProviderError("No playable stream found for SeriesLan episode")`.
- Episode link navigation: sets `link` to `/serie/${slug}/player?season=${s}&episode=${e}` compatible with LissTV player route.

---

### Task 1: SeriesLan Types and Client

**Files:**
- Create: `strategies/serieslan/types.ts`
- Create: `strategies/serieslan/client.ts`
- Test: `tests/strategies/serieslan/client.test.ts`

- [ ] **Step 1: Define TypeScript schemas and interfaces in `strategies/serieslan/types.ts`**
  - Define `SeriesLanItem`, `SeriesLanListingResponse`, `SeriesLanContentDetail`, `SeriesLanEpisodeSeason`, `SeriesLanEpisode`, `SeriesLanEpisodesResponse`, `SeriesLanSearchResponse`.
- [ ] **Step 2: Write failing unit test in `tests/strategies/serieslan/client.test.ts`**
  - Test `serieslanFetch` constructs correct URLs, injects headers, and throws `ProviderError` on non-200 responses.
- [ ] **Step 3: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/client.test.ts`
- [ ] **Step 4: Implement `serieslanFetch` and helper endpoints in `strategies/serieslan/client.ts`**
  - Set base URL `https://serieslan.live` with 8000ms timeout and User-Agent.
- [ ] **Step 5: Run tests and ensure pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/client.test.ts`
- [ ] **Step 6: Commit**
  - Command: `git add strategies/serieslan/ tests/strategies/serieslan/client.test.ts; git commit -m "feat(serieslan): add API client and types"`

---

### Task 2: GetAll Strategy and Mappers

**Files:**
- Create: `strategies/serieslan/get-all.operation.ts`
- Test: `tests/strategies/serieslan/get-all.test.ts`

- [ ] **Step 1: Write failing unit tests in `tests/strategies/serieslan/get-all.test.ts`**
  - Test mapping `SeriesLanItem` -> `MovieItem`.
  - Test `filter="movies"` returns empty `{ movies: [], pagination: ... }`.
  - Test search mode calls `/api/rest/v1/search?q={query}`.
  - Test catalog mode calls `/api/rest/v1/listing?kind=series&order=recent&page={page}`.
- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-all.test.ts`
- [ ] **Step 3: Implement `GetAll` and `mapSeriesLanItemToMovie` in `strategies/serieslan/get-all.operation.ts`**
  - Implement `StrategyGetAllMovies`.
  - Handle search vs listing.
  - Early return empty for `filter === "movies"`.
- [ ] **Step 4: Run tests and ensure pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-all.test.ts`
- [ ] **Step 5: Commit**
  - Command: `git add strategies/serieslan/get-all.operation.ts tests/strategies/serieslan/get-all.test.ts; git commit -m "feat(serieslan): implement GetAll strategy"`

---

### Task 3: GetDetail Strategy and Season Batching

**Files:**
- Create: `strategies/serieslan/get-detail.operation.ts`
- Test: `tests/strategies/serieslan/get-detail.test.ts`

- [ ] **Step 1: Write failing unit tests in `tests/strategies/serieslan/get-detail.test.ts`**
  - Test returning `undefined` for `/pelicula/` routes.
  - Test mapping series details and parallel episode loading.
  - Test mapping of `Episode` fields and player context.
- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-detail.test.ts`
- [ ] **Step 3: Implement `GetDetail` in `strategies/serieslan/get-detail.operation.ts`**
  - Implement `StrategyGetMovieDetails`.
  - Parse clean slug.
  - Fetch content detail `/api/rest/v1/content/serie/{slug}`.
  - Fetch episodes in bounded batches (4 seasons at a time) using `Promise.allSettled`.
  - Map episodes with `link: /serie/${slug}/player?season=${season}&episode=${ep.episode}`.
- [ ] **Step 4: Run tests and ensure pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-detail.test.ts`
- [ ] **Step 5: Commit**
  - Command: `git add strategies/serieslan/get-detail.operation.ts tests/strategies/serieslan/get-detail.test.ts; git commit -m "feat(serieslan): implement GetDetail strategy"`

---

### Task 4: GetUrl Strategy and Vimeos.net Stream Resolver

**Files:**
- Create: `strategies/serieslan/get-url.operation.ts`
- Test: `tests/strategies/serieslan/get-url.test.ts`

- [ ] **Step 1: Write failing unit tests in `tests/strategies/serieslan/get-url.test.ts`**
  - Test extracting `iframe src` from player HTML.
  - Test extracting master `.m3u8` from vimeos embed HTML.
  - Test deterministic construction of player URL `https://player.serieslan.live/e/tv/${tmdb}/${season}/${episode}` when context is absent.
- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-url.test.ts`
- [ ] **Step 3: Implement `GetUrl` and stream resolver in `strategies/serieslan/get-url.operation.ts`**
  - Implement `StrategyGetMovieUrl`.
  - Resolve player URL from context or by querying series TMDB ID.
  - Fetch player page with Referer header.
  - Extract vimeos iframe and fetch vimeos embed.
  - Parse master `.m3u8` playlist.
- [ ] **Step 4: Run tests and ensure pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/serieslan/get-url.test.ts`
- [ ] **Step 5: Commit**
  - Command: `git add strategies/serieslan/get-url.operation.ts tests/strategies/serieslan/get-url.test.ts; git commit -m "feat(serieslan): implement GetUrl stream resolution"`

---

### Task 5: Builder, Registry, and UI Integration

**Files:**
- Create: `builder/serieslan.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Modify: `components/ui/ProviderSelector.tsx`
- Test: `tests/drivers/serieslan-registry.test.ts`

- [ ] **Step 1: Write failing integration test in `tests/drivers/serieslan-registry.test.ts`**
  - Test `MovieContextFactory.driver("serieslan")` produces a valid `MovieContext`.
  - Test `DriverRegistry.getDriver("serieslan")` returns the registered driver wrapped in cache decorator.
- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/drivers/serieslan-registry.test.ts`
- [ ] **Step 3: Implement `SerieslanMovieBuilder` and update registry and selector**
  - Create `builder/serieslan.build.ts`.
  - Update `builder/factory.ts` to register `serieslan`.
  - Update `drivers/registry.ts` to initialize and cache `serieslan`.
  - Update `components/ui/ProviderSelector.tsx` to add `{ id: "serieslan", name: "SeriesLan" }`.
- [ ] **Step 4: Run tests and ensure pass**
  - Command: `node --import ./tests/register.mjs --test tests/drivers/serieslan-registry.test.ts`
- [ ] **Step 5: Run full test suite and linter**
  - Command: `node --import ./tests/register.mjs --test tests/*.test.ts`
  - Command: `npm run lint`
- [ ] **Step 6: Commit**
  - Command: `git add builder/ drivers/ components/ tests/drivers/serieslan-registry.test.ts; git commit -m "feat(serieslan): integrate driver builder, registry, and provider selector"`

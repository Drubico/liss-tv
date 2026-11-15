# PoseidonHD 2 Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the PoseidonHD 2 provider (`poseidon`) with its 3 clean strategies (`GetAll`, `GetDetail`, `GetUrl`), adhering to SOLID principles, extracting Next.js TMDB metadata, and resolving native HLS streams (`master.m3u8`) via Vidara for Latino audio.

**Architecture:** Provider driver following the Strategy and Builder patterns. It extracts structured data from `<script id="__NEXT_DATA__">`, filters exclusively for Latino audio tracks, extracts Vidara stream tokens, and stores HLS manifests in MinIO/SQLite via `persistUpstreamManifest` and `resolveCachedStream`.

**Tech Stack:** TypeScript (strict mode), Next.js App Router, Cheerio, Node native test runner (`node:test`, `node:assert`).

**Spec:** `docs/superpowers/specs/2026-11-15-poseidonhd-provider-design.md`

## Global Constraints

- Must strictly follow `AGENTS.md` and `ARCHITECTURE.md` (no `any`, no hardcoded provider checks in UI, clean mappers).
- Audio track priority is strictly **Latino** (no castellano or english unless explicitly reconfigured).
- Zero external browser dependencies (no Puppeteer/Playwright needed for PoseidonHD2 metadata scraping).
- All strategies must return domain-mapped objects (`Movies`, `StoredMovie`, `Url`) without provider-specific shapes leaking to consumers.
- Persist streams via `persistUpstreamManifest` and check `resolveCachedStream` before resolving.

## Review Focus

1. **Missing Latino Audio:** When a movie or episode only has `spanish` or `english` servers and no `latino` server, `GetUrl` must return `{ url: null, fallbackUrl: null }` cleanly without throwing unhandled exceptions.
2. **Episode Video Lazy Resolution:** `GetDetail` on a TV series must never trigger N HTTP requests for all episodes; `GetUrl` must fetch the specific episode's page on demand.
3. **Empty Seasons Filtering:** PoseidonHD2 includes season 0 with 0 episodes; `GetDetail` must filter out empty seasons so UI does not show blank tabs.
4. **Resilient NEXT_DATA Extraction:** If PoseidonHD2 changes script attributes or minification, `extractNextData` must fail gracefully with descriptive error logging instead of unhandled JSON parse crashes.
5. **Canonical Slug Mapping:** `item.url.slug` with `movies/123/name` must map to `/pelicula/123/name` and `series/456/name` must map to `/serie/456/name`.

---

### Task 1: Payload Interfaces & HTTP Client

**Files:**
- Create: `strategies/poseidon/types.ts`
- Create: `strategies/poseidon/client.ts`
- Test: `tests/strategies/poseidon/client.test.ts`

**Interfaces:**
- Consumes: Native `fetch`
- Produces:
  - `poseidonFetch(endpoint: string, init?: RequestInit): Promise<Response>`
  - `extractNextData<T>(html: string): T`
  - Types: `PoseidonNextData<P>`, `PoseidonMovieItem`, `PoseidonDetailProps`, `PoseidonEpisodeProps`, `PoseidonVideosMap`

- [ ] **Step 1: Write the failing test for client & NEXT_DATA extraction**

```typescript
// tests/strategies/poseidon/client.test.ts
import test from "node:test";
import assert from "node:assert";
import { extractNextData } from "../../../strategies/poseidon/client";

test("extractNextData successfully extracts JSON payload", () => {
  const html = `<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"test":123}}}</script></head><body></body></html>`;
  const data = extractNextData<{ props: { pageProps: { test: number } } }>(html);
  assert.strictEqual(data.props.pageProps.test, 123);
});

test("extractNextData throws descriptive error when script is missing", () => {
  const html = `<html><body><div>No data</div></body></html>`;
  assert.throws(() => extractNextData(html), /__NEXT_DATA__ script not found/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/strategies/poseidon/client.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `types.ts` and `client.ts` in `strategies/poseidon/`**

Define typed interfaces for the Next.js payload (`PoseidonMovieItem`, `PoseidonThisMovie`, `PoseidonThisSerie`, `PoseidonVideoSource`, `PoseidonVideosMap`).
Implement `poseidonFetch` using `https://www.poseidonhd2.co` base URL with standard browser `User-Agent`.
Implement `extractNextData<T>(html: string): T`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/strategies/poseidon/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/poseidon/types.ts strategies/poseidon/client.ts tests/strategies/poseidon/client.test.ts
git commit -m "feat(poseidon): add types and client with next data extractor"
```

---

### Task 2: Strategy `GetAll` (Search & Catalog)

**Files:**
- Create: `strategies/poseidon/get-all.operation.ts`
- Test: `tests/strategies/poseidon/get-all.test.ts`

**Interfaces:**
- Consumes: `poseidonFetch`, `extractNextData` from Task 1, `StrategyGetAllMovies`, `Movies` from `@/types/movie`
- Produces: `GetAll` class implementing `StrategyGetAllMovies` (`operation(search?, slug?, pageNumber?): Promise<Movies | undefined>`)

- [ ] **Step 1: Write the failing test for `GetAll`**

```typescript
// tests/strategies/poseidon/get-all.test.ts
import test from "node:test";
import assert from "node:assert";
import { mapPoseidonItemToMovie } from "../../../strategies/poseidon/get-all.operation";
import { PoseidonMovieItem } from "../../../strategies/poseidon/types";

test("mapPoseidonItemToMovie maps movie item correctly", () => {
  const item: PoseidonMovieItem = {
    TMDbId: "12345",
    titles: { name: "Batman Inicia" },
    images: { poster: "https://image.tmdb.org/t/p/original/poster.jpg" },
    releaseDate: "2005-06-15T00:00:00.000Z",
    rate: { average: 8.2 },
    url: { slug: "movies/12345/batman-inicia" },
  };
  const movie = mapPoseidonItemToMovie(item);
  assert.strictEqual(movie?.title, "Batman Inicia");
  assert.strictEqual(movie?.link, "/pelicula/12345/batman-inicia");
  assert.strictEqual(movie?.year, "2005");
  assert.strictEqual(movie?.rating, "8.2");
});

test("mapPoseidonItemToMovie maps series item correctly", () => {
  const item: PoseidonMovieItem = {
    TMDbId: "999",
    titles: { name: "Dark" },
    images: { poster: "https://image.tmdb.org/t/p/original/dark.jpg" },
    releaseDate: "2017-12-01T00:00:00.000Z",
    url: { slug: "series/999/dark" },
  };
  const serie = mapPoseidonItemToMovie(item);
  assert.strictEqual(serie?.link, "/serie/999/dark");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/strategies/poseidon/get-all.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `GetAll` in `strategies/poseidon/get-all.operation.ts`**

Export `mapPoseidonItemToMovie(item: PoseidonMovieItem): Movie | null`.
Implement class `GetAll implements StrategyGetAllMovies`:
- If `search` query is passed: fetch `/search?q=${encodeURIComponent(search)}&page=${pageNumber}`.
- If `slug === "series"`: fetch `/series?page=${pageNumber}`.
- Default: fetch `/peliculas?page=${pageNumber}`.
Extract `pageProps.movies`, map with `mapPoseidonItemToMovie`, compute `hasMore = pageNumber < (pageProps.pages || 1)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/strategies/poseidon/get-all.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/poseidon/get-all.operation.ts tests/strategies/poseidon/get-all.test.ts
git commit -m "feat(poseidon): implement get-all strategy with canonical routing"
```

---

### Task 3: Strategy `GetDetail` (Metadata & Episodes)

**Files:**
- Create: `strategies/poseidon/get-detail.operation.ts`
- Test: `tests/strategies/poseidon/get-detail.test.ts`

**Interfaces:**
- Consumes: `poseidonFetch`, `extractNextData` from Task 1, `StrategyGetMovieDetails`, `StoredMovie` from `@/types/movie`
- Produces: `GetDetail` class implementing `StrategyGetMovieDetails` (`operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined>`)

- [ ] **Step 1: Write the failing test for `GetDetail` mappers**

```typescript
// tests/strategies/poseidon/get-detail.test.ts
import test from "node:test";
import assert from "node:assert";
import { mapPoseidonMovieDetail, mapPoseidonSerieDetail } from "../../../strategies/poseidon/get-detail.operation";
import { PoseidonThisMovie, PoseidonThisSerie } from "../../../strategies/poseidon/types";

test("mapPoseidonMovieDetail extracts movie detail and preserves videos in context", () => {
  const movie: PoseidonThisMovie = {
    TMDbId: "100",
    titles: { name: "Inception" },
    images: {
      poster: "https://image.tmdb.org/t/p/original/p.jpg",
      backdrop: "https://image.tmdb.org/t/p/original/b.jpg"
    },
    overview: "A thief who steals corporate secrets...",
    releaseDate: "2010-07-16T00:00:00.000Z",
    runtime: 148,
    genres: [{ name: "Sci-Fi" }, { name: "Action" }],
    rate: { average: 8.8 },
    videos: { latino: [{ cyberlocker: "vidara", result: "https://player.poseidonhd2.co/player.php?h=abc" }] }
  };

  const detail = mapPoseidonMovieDetail(movie);
  assert.strictEqual(detail.title, "Inception");
  assert.strictEqual(detail.duration, "148 min");
  assert.deepStrictEqual(detail.tags, ["Sci-Fi", "Action"]);
  assert.ok(detail.context?.videos);
});

test("mapPoseidonSerieDetail filters out empty season 0 and maps episodes", () => {
  const serie: PoseidonThisSerie = {
    TMDbId: "200",
    titles: { name: "Breaking Bad" },
    images: { poster: "https://image.tmdb.org/t/p/original/bb.jpg" },
    overview: "A chemistry teacher...",
    seasons: [
      { number: 0, episodes: [] },
      {
        number: 1,
        episodes: [
          {
            number: 1,
            title: "Pilot",
            image: "https://image.tmdb.org/t/p/original/ep1.jpg",
            url: { slug: "series/200/breaking-bad/seasons/1/episodes/1" }
          }
        ]
      }
    ]
  };

  const detail = mapPoseidonSerieDetail(serie, "breaking-bad");
  assert.strictEqual(detail.episodes?.length, 1);
  assert.strictEqual(detail.episodes?.[0].season, "1");
  assert.strictEqual(detail.episodes?.[0].episodes[0].numberEpisode, "1");
  assert.strictEqual(detail.episodes?.[0].episodes[0].link, "/serie/200/breaking-bad/temporada/1/episodio/1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/strategies/poseidon/get-detail.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `GetDetail` in `strategies/poseidon/get-detail.operation.ts`**

Implement `mapPoseidonMovieDetail` and `mapPoseidonSerieDetail`.
Implement class `GetDetail implements StrategyGetMovieDetails`:
- Parse `link` to identify if it is `/pelicula/` or `/serie/`.
- Fetch the detail page from PoseidonHD2.
- Extract `pageProps.thisMovie` or `pageProps.thisSerie`.
- Map backdrop, poster, genres, runtime, release date, and episodes.
- Do not make episode fetch requests inside `GetDetail` (lazy resolution).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/strategies/poseidon/get-detail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/poseidon/get-detail.operation.ts tests/strategies/poseidon/get-detail.test.ts
git commit -m "feat(poseidon): implement get-detail strategy with season and context mapping"
```

---

### Task 4: Strategy `GetUrl` (Vidara HLS Resolver & StreamCache)

**Files:**
- Create: `strategies/poseidon/get-url.operation.ts`
- Test: `tests/strategies/poseidon/get-url.test.ts`

**Interfaces:**
- Consumes:
  - `poseidonFetch`, `extractNextData` from Task 1
  - `resolveCachedStream`, `persistUpstreamManifest` from `@/services/stream-cache.service`
  - `StrategyGetUrl`, `GetUrlOptions`, `Url` from `@/types/movie`
- Produces: `GetUrl` class implementing `StrategyGetUrl` (`operation(path: string, options?: GetUrlOptions): Promise<Url>`)

- [ ] **Step 1: Write the failing test for Vidara extraction & Latino filter**

```typescript
// tests/strategies/poseidon/get-url.test.ts
import test from "node:test";
import assert from "node:assert";
import { extractVidaraFilecode, selectLatinoVideoSource } from "../../../strategies/poseidon/get-url.operation";
import { PoseidonVideosMap } from "../../../strategies/poseidon/types";

test("selectLatinoVideoSource picks vidara first in latino audio", () => {
  const videos: PoseidonVideosMap = {
    latino: [
      { cyberlocker: "doodstream", result: "https://player.poseidonhd2.co/player.php?h=dood" },
      { cyberlocker: "vidara", result: "https://player.poseidonhd2.co/player.php?h=vidara123" }
    ],
    spanish: [{ cyberlocker: "vidara", result: "https://player.poseidonhd2.co/player.php?h=castellano" }]
  };

  const selected = selectLatinoVideoSource(videos);
  assert.strictEqual(selected?.cyberlocker, "vidara");
  assert.strictEqual(selected?.result, "https://player.poseidonhd2.co/player.php?h=vidara123");
});

test("selectLatinoVideoSource returns null if no latino audio available", () => {
  const videos: PoseidonVideosMap = {
    latino: [],
    spanish: [{ cyberlocker: "vidara", result: "https://player.poseidonhd2.co/player.php?h=castellano" }]
  };
  const selected = selectLatinoVideoSource(videos);
  assert.strictEqual(selected, null);
});

test("extractVidaraFilecode extracts filecode from player html", () => {
  const html = `<script>var url = 'https://vidara.to/e/AjM6l3aLFAamo';</script>`;
  const filecode = extractVidaraFilecode(html);
  assert.strictEqual(filecode, "AjM6l3aLFAamo");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/strategies/poseidon/get-url.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `GetUrl` in `strategies/poseidon/get-url.operation.ts`**

Export helper functions `selectLatinoVideoSource` and `extractVidaraFilecode`.
Implement class `GetUrl implements StrategyGetUrl`:
1. Check `resolveCachedStream(path)`. If found, return it immediately.
2. If `options?.detailContext?.videos` exists, use it. Otherwise, fetch `path` (movie or episode page) and extract `videos` from `pageProps.thisMovie` or `pageProps.episode`.
3. Call `selectLatinoVideoSource(videos)`. If null, return `{ url: null, fallbackUrl: null }`.
4. If `selected.cyberlocker === "vidara"`:
   - Fetch `selected.result` with `Referer: https://www.poseidonhd2.co/`.
   - Extract Vidara filecode via `extractVidaraFilecode`.
   - Call `POST https://vidara.to/api/stream` with `{ filecode, device: "web", codecs: [] }`.
   - Extract `streaming_url` (master.m3u8).
   - Call `persistUpstreamManifest(path, streaming_url, { referer: 'https://vidara.to/' })`.
   - Return `{ url: streamUrl, fallbackUrl: streamUrl }`.
5. If resolution fails or non-Vidara, return `{ url: null, fallbackUrl: null }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/strategies/poseidon/get-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/poseidon/get-url.operation.ts tests/strategies/poseidon/get-url.test.ts
git commit -m "feat(poseidon): implement get-url strategy with vidara hls resolution and stream cache"
```

---

### Task 5: Builder, Factory, and Registry Registration

**Files:**
- Create: `builder/poseidon.build.ts`
- Modify: `builder/factory.ts:6-25`
- Modify: `drivers/registry.ts:13-25`
- Test: `tests/drivers/poseidon-registry.test.ts`

**Interfaces:**
- Consumes:
  - `GetAll` from Task 2, `GetDetail` from Task 3, `GetUrl` from Task 4
  - `MovieContext` from `@/strategies/context`
  - `MovieBuilder` from `@/types/movie`
  - `DriverRegistry` from `@/drivers/registry`
- Produces: Registered `MovieDriver` with `id: "poseidon"` and `name: "Poseidon HD"`.

- [ ] **Step 1: Write integration test for Poseidon driver registration**

```typescript
// tests/drivers/poseidon-registry.test.ts
import test from "node:test";
import assert from "node:assert";
import { DriverRegistry } from "../../drivers/registry";
import { MovieContextFactory } from "../../builder/factory";

test("MovieContextFactory creates poseidon context", () => {
  const driver = MovieContextFactory.driver("poseidon");
  assert.strictEqual(driver.id, "poseidon");
  assert.strictEqual(driver.name, "Poseidon HD");
});

test("DriverRegistry exposes poseidon in available providers", () => {
  const providers = DriverRegistry.getAvailableProviders();
  const poseidon = providers.find((p) => p.id === "poseidon");
  assert.ok(poseidon, "poseidon should be registered in DriverRegistry");
  assert.strictEqual(poseidon?.name, "Poseidon HD");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/drivers/poseidon-registry.test.ts`
Expected: FAIL ("No builder found for provider: poseidon")

- [ ] **Step 3: Implement `builder/poseidon.build.ts` and register in `factory.ts` & `registry.ts`**

1. Create `builder/poseidon.build.ts`:
   Instantiate `MovieContext(new GetAll(), new GetDetail(), new GetUrl(), "poseidon", "Poseidon HD")`.
2. In `builder/factory.ts`:
   Add `"poseidon": new PoseidonMovieBuilder()` to `providers` map, add type `"solo-latino" | "gnula" | "poseidon"`, add `createPoseidonContext()`.
3. In `drivers/registry.ts`:
   In `initialize()`, add:
   ```typescript
   const poseidonContext = MovieContextFactory.driver("poseidon");
   this.register(new CachedDriverDecorator(poseidonContext));
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/drivers/poseidon-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Run full TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors introduced in `strategies/poseidon`, `builder/`, or `drivers/`.

- [ ] **Step 6: Commit**

```bash
git add builder/poseidon.build.ts builder/factory.ts drivers/registry.ts tests/drivers/poseidon-registry.test.ts
git commit -m "feat(poseidon): register poseidon driver in factory and driver registry"
```

---

### Task 6: End-to-End Live Verification

**Files:**
- Test: `tests/strategies/poseidon/e2e-live.test.ts`

**Interfaces:**
- Consumes: `DriverRegistry.getDriver("poseidon")`

- [ ] **Step 1: Write live verification test for Poseidon HD driver**

```typescript
// tests/strategies/poseidon/e2e-live.test.ts
import test from "node:test";
import assert from "node:assert";
import { DriverRegistry } from "../../../drivers/registry";

test("Live: Poseidon driver fetches catalog successfully", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  const catalog = await driver.getAll({ pageNumber: 1 });
  assert.ok(catalog);
  assert.ok(catalog.movies.length > 0);
  assert.ok(catalog.movies[0].title);
  assert.ok(catalog.movies[0].link.startsWith("/pelicula/") || catalog.movies[0].link.startsWith("/serie/"));
});

test("Live: Poseidon driver searches movies successfully", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  const searchResults = await driver.getAll({ search: "Batman" });
  assert.ok(searchResults);
  assert.ok(searchResults.movies.length > 0);
});

test("Live: Poseidon driver gets movie detail and resolves Latino Vidara stream", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  // Dragon Ball Z Bardock (known to have Latino Vidara stream)
  const detail = await driver.getDetail("/pelicula/120475/dragon-ball-z-bardock-el-legendario-super-saiyajin");
  assert.ok(detail);
  assert.strictEqual(detail.title, "Dragon Ball Z: Bardock El legendario Super Saiyajin");

  const stream = await driver.getUrl("/pelicula/120475/dragon-ball-z-bardock-el-legendario-super-saiyajin", {
    detailContext: detail.context,
  });
  assert.ok(stream.url || stream.fallbackUrl);
  const finalUrl = stream.url || stream.fallbackUrl;
  assert.ok(finalUrl?.includes(".m3u8") || finalUrl?.includes("/api/video/m3u8"));
});
```

- [ ] **Step 2: Run live verification test**

Run: `node --test tests/strategies/poseidon/e2e-live.test.ts`
Expected: PASS

- [ ] **Step 3: Commit and clean up scratch files**

```bash
git add tests/strategies/poseidon/e2e-live.test.ts
git commit -m "test(poseidon): add live verification for catalog, search, detail and hls stream resolution"
```

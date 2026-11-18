# SeriesMetro Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and register the `seriesmetro` provider driver in LissTV supporting movie and series catalogs, category filtering, search, multi-season detail extraction, and Fastream HLS video stream resolution with `directSegments=true` via the Strategy pattern.

**Architecture:** A completely isolated provider package in `strategies/seriesmetro/` implementing the 3 canonical operations (`GetAll`, `GetDetail`, `GetUrl`). `GetAll` and `GetDetail` parse WordPress Torofilm HTML via Cheerio with strict media type disambiguation and season/episode parsing. `GetUrl` resolves multi-language embed options (`?trembed={idx}`), extracts Fastream streams using a Dean Edwards P.A.C.K.E.R. unpacker, and formats the stream with `directSegments=true` to save server bandwidth.

**Tech Stack:** TypeScript (strict), Node.js native test runner (`node:test`), Next.js App Router, Cheerio, Node native `fetch`.

**Spec:** `docs/superpowers/specs/2026-11-18-seriesmetro-provider-design.md`

## Global Constraints
- Comply strictly with `AGENTS.md` and `ARCHITECTURE.md`:
  - Strategy contracts in `strategies/context.ts` and `types/movie.ts` are strictly respected.
  - Zero `any` types; all payloads and functions are strongly typed.
  - No coupling between UI components and provider internals.
  - No raw upstream network errors thrown to consumers; wrap in `SeriesmetroError`.
  - Caching is managed exclusively by `CachedDriverDecorator`; no database calls in strategy code.
  - Fastream manifests use `/api/video/m3u8` proxy with `Referer: https://fastream.to/`, while segments stream directly via `directSegments=true`.

## Review Focus
- Upstream HTTP errors (4xx/5xx): `client.ts` wraps failures in typed `SeriesmetroError`.
- Media type classification: `GetAll` classifies items as `"serie"` vs `"movie"` by inspecting URL href (`/serie/` vs `/pelicula/`), avoiding Torofilm CSS class ambiguities.
- Torofilm catalog endpoints: `filter === "movies"` uses `/cartelera-peliculas/` and `filter === "series"` uses `/cartelera-series/`.
- Fastream packed JS updates or missing embeds: `extractFastreamM3u8` safely handles malformed payloads and returns `null` without throwing unhandled exceptions.
- Direct navigation / refresh on series episodes: `GetUrl` resolves `/serie/{slug}` with season/episode coordinates if deep linked without a `/capitulo/...` path.

---

### Task 1: SeriesMetro Types and Client

**Files:**
- Create: `strategies/seriesmetro/types.ts`
- Create: `strategies/seriesmetro/client.ts`
- Test: `tests/strategies/seriesmetro/client.test.ts`

**Interfaces:**
- Consumes: Standard Node `fetch`
- Produces: `seriesmetroFetch(endpointOrUrl: string, options?: RequestInit): Promise<Response>`, `SeriesmetroError`, `SERIESMETRO_BASE_URL`

- [ ] **Step 1: Write failing unit test in `tests/strategies/seriesmetro/client.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { seriesmetroFetch, SERIESMETRO_BASE_URL, SeriesmetroError } from "../../../strategies/seriesmetro/client.ts";

  test("seriesmetroFetch prepends base URL and attaches desktop headers", async (t) => {
    const originalFetch = global.fetch;
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};
    t.after(() => { global.fetch = originalFetch; });

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response("<html>OK</html>", { status: 200 });
    }) as typeof fetch;

    const res = await seriesmetroFetch("/cartelera-peliculas/");
    assert.strictEqual(capturedUrl, `${SERIESMETRO_BASE_URL}/cartelera-peliculas/`);
    assert(capturedHeaders["User-Agent"].includes("Mozilla/5.0"));
    assert.strictEqual(res.status, 200);
  });

  test("seriesmetroFetch throws SeriesmetroError on HTTP error status", async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });

    global.fetch = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;

    await assert.rejects(
      async () => { await seriesmetroFetch("/error-endpoint"); },
      (err: unknown) => {
        assert(err instanceof SeriesmetroError);
        assert.strictEqual(err.status, 404);
        return true;
      }
    );
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/client.test.ts`
  - Expected: FAIL with module not found.

- [ ] **Step 3: Define types and implement client**
  - In `strategies/seriesmetro/types.ts`: Define `SeriesmetroServerOption`, `SeriesmetroEpisodeItem`, `SeriesmetroParsedMedia`.
  - In `strategies/seriesmetro/client.ts`: Implement `SERIESMETRO_BASE_URL = "https://www3.seriesmetro.net"`, `SeriesmetroError`, and `seriesmetroFetch` with desktop User-Agent, referer, and status validation.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/client.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add strategies/seriesmetro/ types.ts client.ts tests/strategies/seriesmetro/client.test.ts; git commit -m "feat(seriesmetro): implement HTTP client and types"`

---

### Task 2: Fastream Video Extractor

**Files:**
- Create: `strategies/seriesmetro/extractors/fastream.extractor.ts`
- Test: `tests/strategies/seriesmetro/fastream.extractor.test.ts`

**Interfaces:**
- Consumes: Node `fetch`
- Produces: `extractFastreamM3u8(embedUrl: string): Promise<string | null>`, `unpackDeanEdwards(packedCode: string): string | null`

- [ ] **Step 1: Write failing unit test in `tests/strategies/seriesmetro/fastream.extractor.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { extractFastreamM3u8, unpackDeanEdwards } from "../../../strategies/seriesmetro/extractors/fastream.extractor.ts";

  test("unpackDeanEdwards unpacks standard P.A.C.K.E.R. string", () => {
    const packed = "eval(function(p,a,c,k,e,d){return p}('0 1=2;',3,3,'var|foo|bar'.split('|')))";
    const unpacked = unpackDeanEdwards(packed);
    assert.strictEqual(unpacked, "var foo=bar;");
  });

  test("extractFastreamM3u8 extracts master.m3u8 from packed embed HTML", async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });

    const mockHtml = `
      <html>
      <script type='text/javascript'>
      eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('var source = "https://s40.fastream.to/hls2/21/00085/t81r7i1v7blb_,l,n,.urlset/master.m3u8?t=test1234&s=123";',0,0,''.split('|')))
      </script>
      </html>
    `;

    global.fetch = (async () => new Response(mockHtml, { status: 200 })) as typeof fetch;

    const streamUrl = await extractFastreamM3u8("https://fastream.to/embed-test.html");
    assert(streamUrl !== null);
    assert(streamUrl?.includes("https://s40.fastream.to/hls2/"));
    assert(streamUrl?.endsWith(".m3u8?t=test1234&s=123"));
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/fastream.extractor.test.ts`
  - Expected: FAIL with module not found.

- [ ] **Step 3: Implement `unpackDeanEdwards` and `extractFastreamM3u8` in `strategies/seriesmetro/extractors/fastream.extractor.ts`**
  - Parse `eval(function(p,a,c,k,e,d)...)`.
  - Unpack token dictionary.
  - Regex search for `https?:\/\/[^"'\s]+\.m3u8[^"'\s]*`.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/fastream.extractor.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add strategies/seriesmetro/extractors/ tests/strategies/seriesmetro/fastream.extractor.test.ts; git commit -m "feat(seriesmetro): implement Fastream HLS extractor"`

---

### Task 3: GetAll Strategy and Mappers

**Files:**
- Create: `strategies/seriesmetro/get-all.operation.ts`
- Test: `tests/strategies/seriesmetro/get-all.test.ts`

**Interfaces:**
- Consumes: `seriesmetroFetch` from Task 1, `StrategyGetAllMovies`, `DriverQuery` from `@/types/movie`
- Produces: `GetAll implements StrategyGetAllMovies`

- [ ] **Step 1: Write failing unit test in `tests/strategies/seriesmetro/get-all.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { GetAll } from "../../../strategies/seriesmetro/get-all.operation.ts";

  test("GetAll parses movie and series items with correct type disambiguation", async () => {
    const mockHtml = `
      <div class="animation-2 items">
        <article class="post dfx fcl movies">
          <header class="entry-header">
            <h2 class="entry-title">Scream 3 (2000)</h2>
            <div class="entry-meta"><span class="vote"><span>TMDB</span> 5.7</span></div>
          </header>
          <div class="post-thumbnail">
            <figure><img src="https://image.tmdb.org/t/p/w500/scream3.jpg" /></figure>
            <a href="https://www3.seriesmetro.net/pelicula/scream-3-la-mascara-de-la-muerte/"></a>
          </div>
        </article>
        <article class="post dfx fcl movies">
          <header class="entry-header">
            <h2 class="entry-title">Age of the Living Dead</h2>
            <div class="entry-meta"><span class="vote"><span>TMDB</span> 7.1</span></div>
          </header>
          <div class="post-thumbnail">
            <figure><img src="https://image.tmdb.org/t/p/w500/livingdead.jpg" /></figure>
            <a href="https://www3.seriesmetro.net/serie/age-of-the-living-dead/"></a>
          </div>
        </article>
      </div>
      <div class="pagination">
        <span class="current">1</span><a class="page-link" href="https://www3.seriesmetro.net/cartelera-peliculas/page/2/">2</a>
      </div>
    `;

    const mockFetch = async () => new Response(mockHtml, { status: 200 });
    const getAll = new GetAll(mockFetch as unknown as typeof fetch);

    const result = await getAll.operation({ page: 1, filter: "movies" });
    assert(result !== undefined);
    assert.strictEqual(result.movies.length, 2);

    const movie = result.movies[0];
    assert.strictEqual(movie.id, "scream-3-la-mascara-de-la-muerte");
    assert.strictEqual(movie.type, "movie");
    assert.strictEqual(movie.url, "/pelicula/scream-3-la-mascara-de-la-muerte/");

    const serie = result.movies[1];
    assert.strictEqual(serie.id, "age-of-the-living-dead");
    assert.strictEqual(serie.type, "serie");
    assert.strictEqual(serie.url, "/serie/age-of-the-living-dead/");
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-all.test.ts`
  - Expected: FAIL with module not found.

- [ ] **Step 3: Implement `GetAll` in `strategies/seriesmetro/get-all.operation.ts`**
  - Implement Cheerio parsing of `<article class="post">`.
  - Disambiguate `type` strictly by inspecting `href`: `href.includes("/serie/") ? "serie" : "movie"`.
  - Route:
    - Search: `/?s=${encodeURIComponent(query)}`
    - Movies: `/cartelera-peliculas/page/${page}/` (or `/cartelera-peliculas/` if page === 1)
    - Series: `/cartelera-series/page/${page}/` (or `/cartelera-series/` if page === 1)
  - Map to standard domain `Movies` object with pagination metadata.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-all.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add strategies/seriesmetro/get-all.operation.ts tests/strategies/seriesmetro/get-all.test.ts; git commit -m "feat(seriesmetro): implement GetAll strategy"`

---

### Task 4: GetDetail Strategy and Episode Parsing

**Files:**
- Create: `strategies/seriesmetro/get-detail.operation.ts`
- Test: `tests/strategies/seriesmetro/get-detail.test.ts`

**Interfaces:**
- Consumes: `seriesmetroFetch` from Task 1, `StrategyGetMovieDetails`, `StoredMovie` from `@/types/movie`
- Produces: `GetDetail implements StrategyGetMovieDetails`

- [ ] **Step 1: Write failing unit test in `tests/strategies/seriesmetro/get-detail.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { GetDetail } from "../../../strategies/seriesmetro/get-detail.operation.ts";

  test("GetDetail parses movie synopsis and embed context", async () => {
    const movieHtml = `
      <h1 class="entry-title">Scream 3</h1>
      <div class="description"><p>Sidney Prescott returns...</p></div>
      <div class="post-thumbnail"><img src="https://image.tmdb.org/t/p/w500/poster.jpg" /></div>
      <div class="genres"><a href="#">Terror</a><a href="#">Misterio</a></div>
      <aside class="video-options">
        <ul class="aa-tbs aa-tbs-video">
          <li><a href="#options-0"><span class="server">-Latino</span></a></li>
          <li><a href="#options-1"><span class="server">-Castellano</span></a></li>
        </ul>
      </aside>
      <div id="options-0"><iframe data-src="https://www3.seriesmetro.net/?trembed=0&trid=39783&trtype=1"></iframe></div>
    `;

    const mockFetch = async () => new Response(movieHtml, { status: 200 });
    const getDetail = new GetDetail(mockFetch as unknown as typeof fetch);

    const detail = await getDetail.operation("/pelicula/scream-3-la-mascara-de-la-muerte/");
    assert(detail !== undefined);
    assert.strictEqual(detail.title, "Scream 3");
    assert.strictEqual(detail.type, "movie");
    assert(detail.synopsis?.includes("Sidney Prescott"));
    assert.strictEqual(detail.provider, "seriesmetro");
  });

  test("GetDetail parses series seasons and episodes", async () => {
    const seriesHtml = `
      <h1 class="entry-title">Age of the Living Dead</h1>
      <div class="description"><p>In an alternate quarantine world...</p></div>
      <div class="post-thumbnail"><img src="https://image.tmdb.org/t/p/w500/series.jpg" /></div>
      <div class="seasons">
        <div class="season-item">
          <a href="/capitulo/age-of-the-living-dead-temporada-1-capitulo-1/">Temporada 1 Episodio 1</a>
          <a href="/capitulo/age-of-the-living-dead-temporada-1-capitulo-2/">Temporada 1 Episodio 2</a>
        </div>
      </div>
    `;

    const mockFetch = async () => new Response(seriesHtml, { status: 200 });
    const getDetail = new GetDetail(mockFetch as unknown as typeof fetch);

    const detail = await getDetail.operation("/serie/age-of-the-living-dead/");
    assert(detail !== undefined);
    assert.strictEqual(detail.type, "serie");
    assert(detail.episodes && detail.episodes.length > 0);
    assert.strictEqual(detail.episodes[0].episodes.length, 2);
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-detail.test.ts`
  - Expected: FAIL with module not found.

- [ ] **Step 3: Implement `GetDetail` in `strategies/seriesmetro/get-detail.operation.ts`**
  - Differentiate `/serie/` vs `/pelicula/`.
  - For movies: extract synopsis, genres, poster, TMDB score, and trembed options into `context`.
  - For series: extract synopsis, genres, poster, and parse season/episode links (`/capitulo/...`). Map into `Season[]` and `Episode[]`.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-detail.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add strategies/seriesmetro/get-detail.operation.ts tests/strategies/seriesmetro/get-detail.test.ts; git commit -m "feat(seriesmetro): implement GetDetail strategy"`

---

### Task 5: GetUrl Strategy and Direct-Segments Stream Formatting

**Files:**
- Create: `strategies/seriesmetro/get-url.operation.ts`
- Test: `tests/strategies/seriesmetro/get-url.test.ts`

**Interfaces:**
- Consumes: `extractFastreamM3u8` from Task 2, `seriesmetroFetch` from Task 1, `StrategyGetUrl`, `GetUrlOptions`, `Url` from `@/types/movie`
- Produces: `GetUrl implements StrategyGetUrl`

- [ ] **Step 1: Write failing unit test in `tests/strategies/seriesmetro/get-url.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { GetUrl } from "../../../strategies/seriesmetro/get-url.operation.ts";

  test("GetUrl resolves trembed iframe and formats directSegments proxy URL", async () => {
    const moviePageHtml = `
      <aside class="video-options">
        <ul class="aa-tbs aa-tbs-video">
          <li><a href="#options-0"><span class="server">-Latino</span></a></li>
        </ul>
      </aside>
      <div id="options-0">
        <iframe src="https://www3.seriesmetro.net/?trembed=0&trid=39783&trtype=1"></iframe>
      </div>
    `;

    const trembedHtml = `
      <div class="Video"><IFRAME SRC="https://fastream.to/embed-test.html"></IFRAME></div>
    `;

    const mockExtractor = async (url: string) => {
      if (url.includes("fastream.to")) {
        return "https://s40.fastream.to/hls2/21/master.m3u8?t=tok123";
      }
      return null;
    };

    const mockFetch = (async (url: string) => {
      if (url.includes("trembed")) {
        return new Response(trembedHtml, { status: 200 });
      }
      return new Response(moviePageHtml, { status: 200 });
    }) as typeof fetch;

    const getUrl = new GetUrl(mockFetch, mockExtractor);
    const result = await getUrl.operation("/pelicula/scream-3-la-mascara-de-la-muerte/");

    assert(result.url.startsWith("/api/video/m3u8?url="));
    assert(result.url.includes("directSegments=true"));
    assert(result.url.includes("referer=https%3A%2F%2Ffastream.to%2F"));
    assert.strictEqual(result.headers?.Referer, "https://fastream.to/");
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-url.test.ts`
  - Expected: FAIL with module not found.

- [ ] **Step 3: Implement `GetUrl` in `strategies/seriesmetro/get-url.operation.ts`**
  - Handle episode paths (`/capitulo/...`), movie paths (`/pelicula/...`), or series path with `options.season` & `options.episode`.
  - Resolve trembed URL matching language preference (defaulting to `"LAT"` / `Latino`).
  - Fetch trembed endpoint to extract hoster iframe URL (`https://fastream.to/embed-...`).
  - Extract master `.m3u8` via `extractFastreamM3u8`.
  - Format LissTV proxy URL:
    `/api/video/m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent("https://fastream.to/")}&directSegments=true`.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/strategies/seriesmetro/get-url.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add strategies/seriesmetro/get-url.operation.ts tests/strategies/seriesmetro/get-url.test.ts; git commit -m "feat(seriesmetro): implement GetUrl strategy"`

---

### Task 6: Builder, Factory and DriverRegistry Integration

**Files:**
- Create: `builder/seriesmetro.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Create: `tests/drivers/seriesmetro-registry.test.ts`

**Interfaces:**
- Consumes: `GetAll`, `GetDetail`, `GetUrl` from Tasks 3–5
- Produces: `SeriesmetroMovieBuilder`, `MovieContextFactory.driver("seriesmetro")`, `DriverRegistry.getDriver("seriesmetro")`

- [ ] **Step 1: Write failing unit test in `tests/drivers/seriesmetro-registry.test.ts`**
  ```typescript
  import test from "node:test";
  import assert from "node:assert";
  import { MovieContextFactory } from "../../builder/factory.ts";
  import { DriverRegistry } from "../../drivers/registry.ts";

  test("MovieContextFactory creates valid seriesmetro MovieContext", () => {
    const context = MovieContextFactory.driver("seriesmetro");
    assert.strictEqual(context.id, "seriesmetro");
    assert.strictEqual(context.name, "SeriesMetro");
    assert(typeof context.getAll === "function");
    assert(typeof context.getDetail === "function");
    assert(typeof context.getUrl === "function");
  });

  test("DriverRegistry registers seriesmetro driver wrapped in cache decorator", () => {
    const driver = DriverRegistry.getDriver("seriesmetro");
    assert.strictEqual(driver.id, "seriesmetro");
    assert.strictEqual(driver.name, "SeriesMetro");

    const available = DriverRegistry.getAvailableProviders();
    const found = available.find((p) => p.id === "seriesmetro");
    assert(found !== undefined);
    assert.strictEqual(found?.name, "SeriesMetro");
  });
  ```

- [ ] **Step 2: Run test to verify failure**
  - Command: `node --import ./tests/register.mjs --test tests/drivers/seriesmetro-registry.test.ts`
  - Expected: FAIL with "No builder found for provider: seriesmetro".

- [ ] **Step 3: Implement `SeriesmetroMovieBuilder` and update `MovieContextFactory` & `DriverRegistry`**
  - Create `builder/seriesmetro.build.ts` returning `MovieContext` with `seriesmetro` id and name.
  - In `builder/factory.ts`: register `"seriesmetro": new SeriesmetroMovieBuilder()`.
  - In `drivers/registry.ts`: register `new CachedDriverDecorator(MovieContextFactory.driver("seriesmetro"))`.

- [ ] **Step 4: Run test to verify pass**
  - Command: `node --import ./tests/register.mjs --test tests/drivers/seriesmetro-registry.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - Command: `git add builder/seriesmetro.build.ts builder/factory.ts drivers/registry.ts tests/drivers/seriesmetro-registry.test.ts; git commit -m "feat(seriesmetro): register provider in factory and registry"`

---

### Task 7: Full System Verification

**Files:**
- Existing project files

- [ ] **Step 1: Run complete test suite**
  - Command: `npm test`
  - Expected: All unit tests (all providers + drivers) pass.
- [ ] **Step 2: Run TypeScript typecheck**
  - Command: `npx tsc --noEmit`
  - Expected: Clean compilation with 0 errors.
- [ ] **Step 3: Commit final verification baseline if needed**
  - Command: `git status`

# RepelisPlus Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a new `repelisplus` content provider in Liss-TV adhering strictly to the Strategy pattern, enabling fast catalog browsing via direct HTTP and resilient Cloudflare-cleared detail and video streaming extraction.

**Architecture:** A hybrid Strategy implementation in `strategies/repelisplus/` where `GetAll` consumes public HTML listings via direct `fetch`, while `GetDetail` and `GetUrl` route through `fetchFlare` to bypass Cloudflare Managed Challenges and extract direct HLS `.m3u8` video streams via specialized cyberlocker unpackers. The provider is registered via `RepelisPlusMovieBuilder` into `MovieContextFactory` and `DriverRegistry`.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Cheerio, FlareSolverr, Node.js native test runner.

**Spec:** [docs/superpowers/specs/2026-11-15-repelisplus-provider-design.md](file:///C:/Users/casti/Desktop/web/liss-tv/docs/superpowers/specs/2026-11-15-repelisplus-provider-design.md)

## Global Constraints

- Strict adherence to `AGENTS.md`: code isolated in `strategies/repelisplus/`; UI components must not import directly from `strategies/repelisplus/`.
- No `any` types; all external inputs validated and typed.
- Error handling: typed domain errors extending `ProviderError` (`RepelisPlusError`).
- Vidstack player compatibility: extract direct playable `.m3u8` or MP4 streams; no third-party ad iframes in Vidstack.
- Unit tests must mock external HTTP/FlareSolverr responses; never call live external services during tests.

## Review Focus

1. **Empty / No Results in Search or Filter:** Returns empty `movies: []` with default pagination rather than throwing or breaking UI.
2. **Missing Backdrop or Poster:** Fallbacks gracefully to placeholder image (`/logo-with-background.png`) without undefined image attributes.
3. **Obfuscated Javascript in Cyberlocker Hosts:** Handles malformed or modified `eval(p,a,c,k,e,d)` payloads by falling through to the next server.
4. **Cloudflare Challenge Interception on Watch Page:** Detects challenge responses and fails with typed `RepelisPlusError` rather than unhandled JSON parse crashes.
5. **Provider Propagation in Episode Context:** Every episode parsed in `GetDetail` has `context.provider = "repelisplus"` so continue-watching routes to the correct driver.

---

### Task 1: Provider Types & HTTP Client

**Files:**
- Create: `strategies/repelisplus/types.ts`
- Create: `strategies/repelisplus/client.ts`
- Test: `tests/strategies/repelisplus/client.test.ts`

**Interfaces:**
- Produces:
  - `class RepelisPlusError extends ProviderError` in `types.ts`
  - `repelisFetch(path: string, options?: RequestInit): Promise<Response>` in `client.ts`
  - `repelisFlareFetch(urlOrPath: string): Promise<Response>` in `client.ts`

- [ ] **Step 1: Write the failing test for `repelisFetch` and `RepelisPlusError`**

```ts
// tests/strategies/repelisplus/client.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RepelisPlusError } from "@/strategies/repelisplus/types";
import { repelisFetch, buildRepelisUrl } from "@/strategies/repelisplus/client";

describe("RepelisPlus Client", () => {
  it("should build correct absolute URLs for relative paths", () => {
    assert.equal(buildRepelisUrl("/peliculas"), "https://repelisplus.buzz/peliculas");
    assert.equal(buildRepelisUrl("serie/dexter/"), "https://repelisplus.buzz/serie/dexter/");
  });

  it("should create RepelisPlusError with message and statusCode", () => {
    const err = new RepelisPlusError("Failed to fetch", 403);
    assert.equal(err.name, "RepelisPlusError");
    assert.equal(err.message, "Failed to fetch");
    assert.equal(err.statusCode, 403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/client.test.ts`
Expected: FAIL (Cannot find module `@/strategies/repelisplus/types`)

- [ ] **Step 3: Implement `types.ts` and `client.ts`**

In `strategies/repelisplus/types.ts`:
- Define `RepelisPlusError` extending `ProviderError`.
- Define raw cheerio extraction types for `.movie-item`.

In `strategies/repelisplus/client.ts`:
- `BASE_URL = "https://repelisplus.buzz"`.
- `buildRepelisUrl(pathOrUrl: string): string`.
- `repelisFetch(path: string, init?: RequestInit)` using global `fetch` with browser headers and 8000ms timeout.
- `repelisFlareFetch(urlOrPath: string)` invoking `fetchFlare(url)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/repelisplus/types.ts strategies/repelisplus/client.ts tests/strategies/repelisplus/client.test.ts
git commit -m "feat(repelisplus): add types, error class and client helpers"
```

---

### Task 2: Mappers & GetAll Strategy

**Files:**
- Create: `strategies/repelisplus/mappers.ts`
- Create: `strategies/repelisplus/get-all.operation.ts`
- Test: `tests/strategies/repelisplus/get-all.test.ts`

**Interfaces:**
- Consumes: `repelisFetch` from Task 1
- Produces:
  - `parseMovieItem(html: string | cheerio.CheerioAPI): MediaItem[]`
  - `class GetAll implements StrategyGetAllMovies` with `operation(options?: GetAllOptions): Promise<Movies | undefined>`

- [ ] **Step 1: Write failing test for `GetAll` and HTML parsing**

```ts
// tests/strategies/repelisplus/get-all.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetAll, parseMovieItems } from "@/strategies/repelisplus/get-all.operation";

const SAMPLE_GRID_HTML = `
<div class="movie-item">
  <a href="https://repelisplus.buzz/pelicula/silent-night-venganza-silenciosa-zsbl/">
    <div class="item-picture">
      <figure>
        <img src="//repelisplus.buzz/cdn/p/v2/w1/sample.webp" class="poster" alt="Poster Silent Night" />
        <span class="year text-center">2023</span>
      </figure>
      <div class="card-hover">
        <div class="card-hover-backdrop" data-backdrop="//repelisplus.buzz/cdn/b/v2/w0/backdrop.webp"></div>
        <div class="card-hover-info">
          <div class="card-hover-info-meta"><div>1h 44min</div><div class="card-hover-meta-quality">HD</div></div>
          <ul class="card-hover-info-genre"><li>Acción</li><li>Crimen</li></ul>
          <div class="card-hover-info-overview"><p>Un padre afligido busca venganza.</p></div>
        </div>
      </div>
    </div>
    <div class="item-detail"><p>Silent Night</p></div>
  </a>
</div>
`;

describe("RepelisPlus GetAll Operation", () => {
  it("should parse .movie-item cards into MediaItem array with clean protocol-relative URLs", () => {
    const items = parseMovieItems(SAMPLE_GRID_HTML);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Silent Night");
    assert.equal(items[0].link, "/pelicula/silent-night-venganza-silenciosa-zsbl/");
    assert.equal(items[0].image, "https://repelisplus.buzz/cdn/p/v2/w1/sample.webp");
    assert.equal(items[0].backgroundImage, "https://repelisplus.buzz/cdn/b/v2/w0/backdrop.webp");
    assert.equal(items[0].year, "2023");
    assert.deepEqual(items[0].tags, ["Acción", "Crimen"]);
  });

  it("should route search queries to /busqueda?s={query}", async () => {
    let requestedUrl = "";
    const mockFetch = async (url: string) => {
      requestedUrl = url;
      return new Response(SAMPLE_GRID_HTML, { status: 200 });
    };
    const getAll = new GetAll(mockFetch as unknown as typeof fetch);
    const result = await getAll.operation({ search: "avatar" });
    assert.ok(requestedUrl.includes("s=avatar"));
    assert.equal(result?.movies.length, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/get-all.test.ts`
Expected: FAIL (Cannot find module `@/strategies/repelisplus/get-all.operation`)

- [ ] **Step 3: Implement `mappers.ts` and `get-all.operation.ts`**

In `strategies/repelisplus/mappers.ts`:
- Sanitize links to relative slugs (`/pelicula/...` or `/serie/...`).
- Normalize protocol-relative image URLs (`//...` -> `https://...`).
- Fallback missing backdrops to poster or empty string.

In `strategies/repelisplus/get-all.operation.ts`:
- Injectable `fetchFn = repelisFetch`.
- Resolves target URL based on `options.search`, `options.slug` (`"peliculas" | "series" | "estrenos"`), and `options.pageNumber`.
- Parses `.movie-item` elements and returns `{ movies, pagination }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/get-all.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/repelisplus/mappers.ts strategies/repelisplus/get-all.operation.ts tests/strategies/repelisplus/get-all.test.ts
git commit -m "feat(repelisplus): implement GetAll strategy and HTML card parser"
```

---

### Task 3: GetDetail Strategy

**Files:**
- Create: `strategies/repelisplus/get-detail.operation.ts`
- Test: `tests/strategies/repelisplus/get-detail.test.ts`

**Interfaces:**
- Consumes: `repelisFlareFetch`, `RepelisPlusError`
- Produces:
  - `class GetDetail implements StrategyGetMovieDetails` with `operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined>`

- [ ] **Step 1: Write failing test for `GetDetail`**

```ts
// tests/strategies/repelisplus/get-detail.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetDetail, parseDetailHtml } from "@/strategies/repelisplus/get-detail.operation";

const SAMPLE_MOVIE_DETAIL_HTML = `
<div class="content-detail">
  <h1 class="title">Silent Night</h1>
  <img class="poster" src="//repelisplus.buzz/cdn/p/v2/poster.webp" />
  <div class="backdrop" data-backdrop="//repelisplus.buzz/cdn/b/v2/backdrop.webp"></div>
  <p class="overview">Sinopsis de la película.</p>
  <span class="year">2023</span>
  <span class="rating">8.5</span>
  <ul class="genres"><li>Acción</li></ul>
  <div class="servers">
    <a href="#" data-server="https://streamwish.to/e/abc123xyz">Streamwish</a>
  </div>
</div>
`;

describe("RepelisPlus GetDetail Operation", () => {
  it("should parse movie detail with stamped provider and servers context", () => {
    const detail = parseDetailHtml(SAMPLE_MOVIE_DETAIL_HTML, "/pelicula/silent-night/");
    assert.equal(detail.title, "Silent Night");
    assert.equal(detail.provider, "repelisplus");
    assert.equal(detail.context?.provider, "repelisplus");
    assert.ok(Array.isArray(detail.context?.servers));
    assert.equal((detail.context?.servers as string[])[0], "https://streamwish.to/e/abc123xyz");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/get-detail.test.ts`
Expected: FAIL (Cannot find module `@/strategies/repelisplus/get-detail.operation`)

- [ ] **Step 3: Implement `get-detail.operation.ts`**

In `strategies/repelisplus/get-detail.operation.ts`:
- Check SQLite cache via `get(link)` (valid 7 days).
- Fetch detail page via `repelisFlareFetch`.
- Parse metadata and season/episode hierarchy for series.
- Stamp `provider: "repelisplus"` on root detail and on every episode's `context.provider`.
- Upsert to cache and return `movieData`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/get-detail.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/repelisplus/get-detail.operation.ts tests/strategies/repelisplus/get-detail.test.ts
git commit -m "feat(repelisplus): implement GetDetail strategy with season/episode parser"
```

---

### Task 4: Stream Resolvers & GetUrl Strategy

**Files:**
- Create: `strategies/repelisplus/resolvers/streamwish.ts`
- Create: `strategies/repelisplus/resolvers/voe.ts`
- Create: `strategies/repelisplus/resolvers/filelions.ts`
- Create: `strategies/repelisplus/resolvers/index.ts`
- Create: `strategies/repelisplus/get-url.operation.ts`
- Test: `tests/strategies/repelisplus/resolvers.test.ts`
- Test: `tests/strategies/repelisplus/get-url.test.ts`

**Interfaces:**
- Produces:
  - `resolveStreamwish(embedUrl: string): Promise<string | null>`
  - `resolveVoe(embedUrl: string): Promise<string | null>`
  - `resolveFilelions(embedUrl: string): Promise<string | null>`
  - `resolveCyberlockerStream(url: string): Promise<string | null>`
  - `class GetUrl implements StrategyGetUrl` with `operation(path: string, options?: GetUrlOptions): Promise<Url>`

- [ ] **Step 1: Write failing test for cyberlocker resolvers and `GetUrl`**

```ts
// tests/strategies/repelisplus/resolvers.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unpackPackedJs } from "@/strategies/repelisplus/resolvers/streamwish";

describe("Streamwish Packed JS Unpacker", () => {
  it("should decode p,a,c,k,e,d payload and locate direct .m3u8 playlist", () => {
    // Standard packed pattern: eval(function(p,a,c,k,e,d)...)
    const packed = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('0://1/2.3',4,4,'https|example.com|stream|m3u8'.split('|')))`;
    const unpacked = unpackPackedJs(packed);
    assert.equal(unpacked, "https://example.com/stream.m3u8");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/resolvers.test.ts`
Expected: FAIL (Cannot find module `@/strategies/repelisplus/resolvers/streamwish`)

- [ ] **Step 3: Implement stream resolvers and `GetUrl` operation**

1. `resolvers/streamwish.ts`: Unpack `p,a,c,k,e,d` regex and extract `source|file|m3u8` URL.
2. `resolvers/voe.ts`: Extract JSON/Base64 payload (`'hls': '...'`).
3. `resolvers/filelions.ts`: Extract master `.m3u8` playlist.
4. `resolvers/index.ts`: Cascade through server embed links.
5. `get-url.operation.ts`:
   - Check `resolveCachedStream(path)`.
   - Resolve servers from `options?.detailContext?.servers` or by fetching page via `repelisFlareFetch`.
   - Extract `.m3u8` stream into `url` and `fallbackUrl`.
   - Throw `RepelisPlusError` if no playable stream resolved.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/repelisplus/resolvers.test.ts tests/strategies/repelisplus/get-url.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/repelisplus/resolvers/ strategies/repelisplus/get-url.operation.ts tests/strategies/repelisplus/
git commit -m "feat(repelisplus): implement cyberlocker unpackers and GetUrl strategy"
```

---

### Task 5: Builder, Navigation Inference & Registry Integration

**Files:**
- Create: `builder/repelisplus.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Modify: `utils/navigation.ts`
- Test: `tests/drivers/repelisplus-registry.test.ts`

**Interfaces:**
- Produces:
  - `class RepelisPlusMovieBuilder implements MovieBuilder<MovieContext>`
  - Updated `inferProviderFromLink` recognizing `repelisplus`

- [ ] **Step 1: Write failing test for DriverRegistry and MovieContextFactory**

```ts
// tests/drivers/repelisplus-registry.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DriverRegistry } from "@/drivers/registry";
import { MovieContextFactory } from "@/builder/factory";
import { inferProviderFromLink } from "@/utils/navigation";

describe("RepelisPlus Driver Registration", () => {
  it("should create RepelisPlus driver via MovieContextFactory", () => {
    const driver = MovieContextFactory.driver("repelisplus");
    assert.equal(driver.id, "repelisplus");
    assert.equal(driver.name, "RepelisPlus");
  });

  it("should resolve driver through DriverRegistry.resolveDriverForContent", () => {
    const driver = DriverRegistry.resolveDriverForContent("repelisplus");
    assert.equal(driver.id, "repelisplus");
  });

  it("should infer 'repelisplus' from context or repelisplus links", () => {
    assert.equal(inferProviderFromLink("/pelicula/avatar/", { provider: "repelisplus" }), "repelisplus");
    assert.equal(inferProviderFromLink("https://repelisplus.buzz/pelicula/batman/"), "repelisplus");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/drivers/repelisplus-registry.test.ts`
Expected: FAIL (`Unknown driver id: repelisplus`)

- [ ] **Step 3: Implement builder and register driver**

1. Create `builder/repelisplus.build.ts`:
   - Configures `GetAll`, `GetDetail`, `GetUrl` on `MovieContext` with `id: "repelisplus"`, `name: "RepelisPlus"`.
2. In `builder/factory.ts`:
   - Add case `"repelisplus"` to `MovieContextFactory.driver`.
3. In `drivers/registry.ts`:
   - Initialize `new CachedDriverDecorator(MovieContextFactory.driver("repelisplus"))`.
4. In `utils/navigation.ts`:
   - Add `repelisplus` detection rule in `inferProviderFromLink`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/drivers/repelisplus-registry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add builder/repelisplus.build.ts builder/factory.ts drivers/registry.ts utils/navigation.ts tests/drivers/repelisplus-registry.test.ts
git commit -m "feat(repelisplus): register driver into factory and registry"
```

---

### Task 6: Full Verification & System Sanity Check

**Files:**
- All created and modified files across repository.

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All tests pass (previous 54 + new RepelisPlus tests).

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: 0 type errors.

- [ ] **Step 3: Run ESLint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Commit any final test cleanups if needed**

```bash
git commit -am "chore(repelisplus): finalize test suite and pass all checks"
```

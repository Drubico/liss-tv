# SeriesMetro Provider Integration Design

## Intent & The Why
Integrate `www3.seriesmetro.net` as a new isolated streaming provider in LissTV. Adding SeriesMetro expands the catalog for both movies and series with alternative hosting streams (primarily Fastream and multi-embed mirrors), increasing overall playback availability while keeping zero coupling with existing providers and the UI.

## Goals
1. Implement a complete driver for `seriesmetro` adhering strictly to Clean Architecture, SOLID principles, and the Strategy pattern from `AGENTS.md` and `ARCHITECTURE.md`:
   - `GetAll`: Retrieve movies and series catalogs with pagination, category filtering (`/cartelera-peliculas/`, `/cartelera-series/`), and keyword search (`/?s={query}`).
   - `GetDetail`: Retrieve comprehensive metadata (synopsis, TMDB poster, backdrop, genres, release year, cast), plus seasons and episodes list for series (`/capitulo/...`).
   - `GetUrl`: Resolve player embed URLs (`/?trembed={idx}&trid={id}&trtype={type}`), extract the target video host (Fastream), unpack HLS streams (`.m3u8`), and format the proxy URL with `directSegments=true`.
2. Encapsulate Fastream stream extraction into an isolated extractor module (`strategies/seriesmetro/extractors/fastream.extractor.ts`).
3. Integrate `seriesmetro` into `MovieContextFactory`, register it in `DriverRegistry` wrapped inside `CachedDriverDecorator` (SQLite caching), allowing `ProviderSelector` to automatically offer it to users.
4. Provide comprehensive unit tests covering client, operations, Fastream extraction, and builder registration.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Modifying the UI or Next.js App Router routes (`/pelicula`, `/serie`, `/player`).
  - Relying on FlareSolverr, Puppeteer, or Tor proxying since `seriesmetro.net` and its Fastream CDN respond with `200 OK` directly without Cloudflare anti-bot gates.
- **Anti-Goals:**
  - Coupling any other provider (Megadede, Gnula, SoloLatino, SeriesLan) to SeriesMetro logic or sharing non-domain code.
  - Proxying video segments (`.ts`) through the Next.js server when Fastream CDN allows direct client streaming (`directSegments=true`).
  - Storing or accessing SQLite cache directly within strategy operations (caching is exclusively the responsibility of `CachedDriverDecorator`).

## Constraints
- Strict adherence to `AGENTS.md` and `ARCHITECTURE.md`:
  - `strict` TypeScript mode with zero `any` types.
  - Provider isolation: all SeriesMetro scraping and parsing logic lives solely inside `strategies/seriesmetro/`.
  - Errors must be mapped to typed domain errors (`SeriesmetroError`).
  - Domain mapping: all outputs map cleanly to `MovieItem`, `StoredMovie` / `MovieDetail`, and `Url`.

## Approaches Considered

### Approach 1: Fastream Extraction with `directSegments=true` (Selected)
- **Architecture**:
  - `strategies/seriesmetro/client.ts`: Custom fetch client with desktop User-Agent, referer headers, and error handling.
  - `strategies/seriesmetro/extractors/fastream.extractor.ts`: Dean Edwards P.A.C.K.E.R. unpacker extracting direct `.m3u8` master playlists.
  - `GetAll`: HTML scraping with Cheerio. Routes to `/cartelera-peliculas/page/{n}/` and `/cartelera-series/page/{n}/`. Disambiguates `type` by inspecting URL prefix (`/serie/` vs `/pelicula/`).
  - `GetDetail`: Parses metadata, synopsis, TMDB images, and either movie player `trembed` links or series season/episode structure (`/capitulo/...`).
  - `GetUrl`: Resolves language preference from `ul.aa-tbs-video li a` (`-Latino`, `-Castellano`, etc.) and maps to `?trembed={idx}&trid={id}&trtype={type}`. Fetches the hoster embed URL (`https://fastream.to/embed-{id}.html`), extracts the master `.m3u8`, and constructs:
    `/api/video/m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${encodeURIComponent("https://fastream.to/")}&directSegments=true`
- **Trade-offs**:
  - Manifests (`.m3u8`) pass through the Next.js proxy to attach `Referer: https://fastream.to/` (preventing 403 Forbidden).
  - Video chunks (`.ts`) are fetched directly by the client browser from Fastream's CDN (`access-control-allow-origin: *`), saving 100% of video bandwidth on the LissTV VPS.
- **Why chosen**: Maximizes server scalability, prevents bandwidth exhaustion, and maintains strict architectural separation.

### Approach 2: Full Video Proxying (`directSegments=false`) (Rejected)
- Route every `.m3u8` playlist and `.ts` chunk through the backend `/api/video/m3u8` proxy.
- **Why rejected**: Fastream CDN permits direct segment access without requiring a Referer. Tunneling segments would consume excessive bandwidth, saturate Node.js undici connection pools, and degrade VPS performance without any functional benefit.

## Architecture & File Structure

```
strategies/seriesmetro/
├── types.ts                        # Raw Torofilm / SeriesMetro types and interfaces
├── client.ts                       # seriesmetroFetch with error handling
├── extractors/
│   └── fastream.extractor.ts       # Fastream Dean Edwards unpacker & m3u8 resolver
├── get-all.operation.ts            # GetAll strategy (catalog, filters, search)
├── get-detail.operation.ts         # GetDetail strategy (movies & series with seasons/episodes)
└── get-url.operation.ts            # GetUrl strategy resolving trembed & Fastream streams

builder/
└── seriesmetro.build.ts            # SeriesmetroMovieBuilder implementing MovieBuilder<MovieContext>

tests/strategies/seriesmetro/
├── client.test.ts                  # HTTP client & error tests
├── fastream.extractor.test.ts      # Fastream extraction & unpacking tests
├── get-all.test.ts                 # Catalog and search parsing tests
├── get-detail.test.ts              # Detail and episode parsing tests
└── get-url.test.ts                 # Video URL resolution tests

tests/drivers/
└── seriesmetro-registry.test.ts    # Driver registration & CachedDriverDecorator verification
```

## Detailed Technical Specifications

### 1. Client (`strategies/seriesmetro/client.ts`)
- Base URL: `https://www3.seriesmetro.net`
- Default Headers:
  - `User-Agent`: Desktop Chrome UA (`Mozilla/5.0...`)
  - `Referer`: `https://www3.seriesmetro.net/`
  - `Accept`: `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`
- Error class: `SeriesmetroError extends Error` with optional HTTP status.

### 2. Fastream Extractor (`strategies/seriesmetro/extractors/fastream.extractor.ts`)
- Input: `embedUrl` (e.g. `https://fastream.to/embed-xxxx.html`).
- Fetches HTML with `Referer: https://www3.seriesmetro.net/`.
- Detects Dean Edwards packed JavaScript (`eval(function(p,a,c,k,e,d)...)`).
- Unpacks using base-N token replacement.
- Extracts master `.m3u8` URL (`https://...fastream.to/hls2/.../master.m3u8?t=...`).
- Fallback regex for direct `.m3u8` or MP4 links.

### 3. GetAll (`strategies/seriesmetro/get-all.operation.ts`)
- Input: `DriverQuery` (`page`, `filter`, `search`).
- Routing:
  - If `search` is provided: `/?s=${encodeURIComponent(search)}` (or `/?s=${q}&page=${page}`).
  - If `filter === "movies"` or `filter === "movie"`: `/cartelera-peliculas/page/${page}/` (page 1: `/cartelera-peliculas/`).
  - If `filter === "series"`: `/cartelera-series/page/${page}/` (page 1: `/cartelera-series/`).
  - Default: `/cartelera-peliculas/page/${page}/`.
- Cheerio Selector: `article.post` (or `li.post-item`).
  - Title: `.entry-title`, `h2`, or `figure img[alt]`.
  - Link: `a[href]` (normalizes path to `/pelicula/{slug}/` or `/serie/{slug}/`).
  - Poster: `img[data-src]` or `img[src]` (supports TMDB image URLs).
  - Year: parsed from title `(YYYY)` or `.entry-meta .year`.
  - Rating: parsed from `.vote`, TMDB score.
  - MediaType Disambiguation: determined strictly by link href (`href.includes("/serie/") ? "serie" : "movie"`).
- Pagination: detects `.pagination .current`, `.next` or total pages.

### 4. GetDetail (`strategies/seriesmetro/get-detail.operation.ts`)
- Input: `link` (e.g. `/pelicula/la-invitacion-2026/` or `/serie/age-of-the-living-dead/`).
- Distinguishes movie vs series from path prefix (`/serie/` vs `/pelicula/`).
- **Movie Detail**:
  - Parses synopsis (`.entry-content p`, `.description`, or `.overview`).
  - Parses genres (`.genres a`, `.entry-meta a`).
  - Parses poster and backdrop image.
  - Extracts server tabs from `ul.aa-tbs-video li a`: `#options-{idx}` and language label `.server`.
  - Context payload: `{ trid: string, embeds: Array<{ index: number, language: string, url: string }> }`.
- **Series Detail**:
  - Parses seasons and episodes list.
  - Torofilm stores season lists: `.season-list` or links matching `/capitulo/{series-slug}-temporada-{s}-capitulo-{e}/`.
  - Groups episodes by season number.
  - Each `Episode`:
    - `link`: `/capitulo/{slug}`
    - `numberEpisode`: string (e.g. `"1"`)
    - `title`: episode title or `"Episodio {e}"`
    - `season`: number

### 5. GetUrl (`strategies/seriesmetro/get-url.operation.ts`)
- Input: `path` (`/pelicula/...`, `/serie/...`, or `/capitulo/...`), options (`season`, `episode`, `detailContext`, `language`).
- Step 1: Resolve target page.
  - If `path.startsWith("/serie/")` and `options.season` / `options.episode` are provided:
    - Checks `detailContext.episodes` for matching season/episode link.
    - If not in context, fetches `/serie/{slug}` to resolve `/capitulo/{slug}-temporada-{s}-capitulo-{e}/`.
  - If `path.startsWith("/capitulo/")` or `path.startsWith("/pelicula/")`: uses path directly.
- Step 2: Language & Embed Index Selection.
  - Parses `ul.aa-tbs-video` to identify option indices matching `options.language` (defaulting to `"LAT"` / `Latino` -> index 0).
  - Fetches the corresponding `/?trembed={idx}&trid={trid}&trtype={type}`.
- Step 3: Fetch trembed endpoint to retrieve hoster iframe `src` (`https://fastream.to/embed-...`).
- Step 4: Pass hoster URL to `extractFastreamM3u8`.
- Step 5: Format LissTV proxy URL:
  ```typescript
  const referer = encodeURIComponent("https://fastream.to/");
  const proxyUrl = `/api/video/m3u8?url=${encodeURIComponent(m3u8Url)}&referer=${referer}&directSegments=true`;
  return {
    url: proxyUrl,
    fallbackUrl: secondaryProxyUrl,
    headers: {
      Referer: "https://fastream.to/",
    },
  };
  ```

### 6. Builder & Registry Integration
- Create `builder/seriesmetro.build.ts`:
  ```typescript
  export class SeriesmetroMovieBuilder implements MovieBuilder<MovieContext> {
    name = "SeriesMetro";
    id = "seriesmetro";

    build(): MovieContext {
      return new MovieContext(
        new GetAll(),
        new GetDetail(),
        new GetUrl(),
        "seriesmetro",
        "SeriesMetro"
      );
    }
  }
  ```
- Register in `builder/factory.ts`: add `"seriesmetro": new SeriesmetroMovieBuilder()`.
- Register in `drivers/registry.ts`:
  ```typescript
  const seriesmetroContext = MovieContextFactory.driver("seriesmetro");
  this.register(new CachedDriverDecorator(seriesmetroContext));
  ```

## Verification & Testing Plan
- **Unit Tests**:
  - `tests/strategies/seriesmetro/client.test.ts`: test URL resolution, custom headers, and error handling on 4xx/5xx.
  - `tests/strategies/seriesmetro/fastream.extractor.test.ts`: test Dean Edwards P.A.C.K.E.R. decoding against real Fastream HTML samples.
  - `tests/strategies/seriesmetro/get-all.test.ts`: mock HTML catalog responses for `/cartelera-peliculas/`, `/cartelera-series/`, and search queries. Validate domain mapping.
  - `tests/strategies/seriesmetro/get-detail.test.ts`: mock movie and series detail HTML. Validate synopsis, TMDB images, seasons, and episodes.
  - `tests/strategies/seriesmetro/get-url.test.ts`: mock trembed iframe, language matching, and Fastream extraction. Verify `directSegments=true` and `Referer` inclusion.
  - `tests/drivers/seriesmetro-registry.test.ts`: verify `DriverRegistry.getDriver("seriesmetro")` returns a cached decorated instance.
- **Automated Verification**:
  - Run `npm run type-check` or `npx tsc --noEmit`.
  - Run test suite with Jest / Vitest.

# RepelisPlus Provider Integration Design

## Intent & The Why
Add `https://repelisplus.buzz/` as a content provider in Liss-TV to expand catalog diversity with movies and series that may not be available on existing providers (`solo-latino`, `gnula`, `serieslan`).

## Goals
1. Implement a complete driver for `repelisplus` complying with the Strategy pattern defined in `AGENTS.md`:
   - `GetAll`: List movies and series from the homepage, categories (`/peliculas`, `/series`, `/peliculas/estrenos`), and search (`/?s={query}`).
   - `GetDetail`: Retrieve movie/series metadata (title, poster, backdrop, synopsis, year, rating, tags, and season/episode hierarchy).
   - `GetUrl`: Resolve video embeds and player streams to direct playable HLS `.m3u8` or MP4 streams for native playback in Vidstack.
2. Follow the hybrid request approach:
   - Use direct, lightweight HTTP `fetch` for public catalog listings (`GetAll`) for instant response times without taxing FlareSolverr.
   - Use `fetchFlare` (from `utils/flaresolverr`) for protected detail pages and stream resolution (`GetDetail`, `GetUrl`), bypassing Cloudflare Managed Challenges transparently.
3. Integrate `repelisplus` cleanly into `MovieContextFactory`, `DriverRegistry` (wrapped in `CachedDriverDecorator`), and UI provider selectors.
4. Provide comprehensive unit tests with mocked HTML payloads for all operations, mappers, cyberlocker stream extractors, and builder registration.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Routing unchallengeable catalog listings through FlareSolverr, which would add unnecessary latency.
  - Modifying other existing provider implementations (`gnula`, `sololatino`, `serieslan`).
  - Rendering ad-heavy third-party cyberlocker iframes inside the app (the user opted for direct `.m3u8` streams only).
- **Anti-Goals:**
  - Coupling client UI components directly to RepelisPlus-specific URLs or data formats.
  - Breaking on unexpected HTML changes: all Cheerio extractions must have defensive fallbacks.
  - Using `any` types or bypassing TypeScript strict checks.

## Constraints
- Strict adherence to `AGENTS.md`:
  - Code isolated in `strategies/repelisplus/`.
  - Strategy contracts: `GetAll`, `GetDetail`, `GetUrl` implementing `StrategyGetAllMovies`, `StrategyGetMovieDetails`, and `StrategyGetUrl`.
  - Mappers convert provider HTML/JSON directly to shared domain types (`Movies`, `StoredMovie`, `Url`).
  - Typed domain error `RepelisPlusError` extending `ProviderError`.
- Cloudflare Managed Challenge on internal detail pages:
  - Add `BASE_URL.RepelisPlus = "https://repelisplus.buzz"` to `utils/browser.ts`.
  - Re-use `fetchFlare()` with session caching in `GetDetail` and `GetUrl`.
- Video Playback:
  - Vidstack player requires clean HLS `.m3u8` or direct video URLs.
  - When third-party CDNs require specific headers (`Referer`, `Origin`), streams route through `/api/video/m3u8`.

## Approaches Considered

### Approach 1: Hybrid Request Architecture with Clean Stream Resolvers (Selected)
- **Catalog (`GetAll`):** Direct standard `fetch` with browser User-Agent. Fast (<300ms), zero dependency on FlareSolverr for general browsing.
- **Detail & Video (`GetDetail`, `GetUrl`):** Delegated to `fetchFlare` when encountering Cloudflare Managed Challenge pages, caching valid cookies and headers.
- **Streaming Extraction:** Multi-server resolver pipeline extracting direct `.m3u8` streams from supported hosters (Streamwish, Filelions, Voe, Dood, etc.), skipping unresolvable or dead servers and populating `fallbackUrl` with the next valid stream.
- **Why chosen:** Delivers the fastest, smoothest catalog browsing experience in the Liss-TV interface, bypasses Cloudflare on content playback, and maintains Vidstack's ad-free experience.

### Approach 2: 100% FlareSolverr-Mediated (Rejected)
- Routes all catalog listings and pagination through FlareSolverr sessions.
- **Why rejected:** Introduces 1.5s–3s latency on every catalog navigation and search keystroke, degrading user experience.

### Approach 3: Full Local Headless Browser (Rejected)
- Uses local Playwright / Puppeteer instances for all requests.
- **Why rejected:** Excessively high memory and CPU consumption on the server, slow initialization, and poor scalability compared to FlareSolverr.

## Architecture & File Structure

```
strategies/repelisplus/
├── types.ts                   # Raw schemas, context definitions & RepelisPlusError
├── client.ts                  # Direct fetch & FlareSolverr client helpers
├── mappers.ts                 # HTML to domain model (MediaItem, StoredMovie, Season, Episode)
├── resolvers/                 # Stream extractors for cyberlocker hosts
│   ├── index.ts               # Aggregator & priority cascade
│   ├── streamwish.ts          # Unpacker / extractor for Streamwish & clones
│   ├── voe.ts                 # Base64 / JSON payload extractor for Voe
│   └── filelions.ts           # M3U8 extractor for Filelions / Vidhide
├── get-all.operation.ts       # GetAll implementation with pagination and search
├── get-detail.operation.ts    # GetDetail implementation with season/episode breakdown
└── get-url.operation.ts       # GetUrl implementation resolving player embeds to direct stream

builder/
└── repelisplus.build.ts       # RepelisPlusMovieBuilder implementing MovieBuilder<MovieContext>

tests/strategies/repelisplus/
├── client.test.ts
├── get-all.test.ts
├── get-detail.test.ts
├── get-url.test.ts
└── resolvers.test.ts

tests/drivers/
└── repelisplus-registry.test.ts
```

## Detailed Specifications

### 1. Client (`strategies/repelisplus/client.ts`)
- Base URL: `https://repelisplus.buzz`
- User-Agent: Modern Chrome User-Agent matching `BROWSER_UA`.
- Functions:
  - `repelisFetch(path, options)`: Standard `fetch` with 8000ms timeout for direct endpoints.
  - `repelisFlareFetch(path, options)`: Invokes `fetchFlare(url)` for Cloudflare-protected detail/embed pages.
- Error handling: Wraps HTTP/network failures into `RepelisPlusError`.

### 2. GetAll (`strategies/repelisplus/get-all.operation.ts`)
- Target URLs:
  - Movies: `/peliculas` or `/peliculas/page/{page}`
  - Series: `/series` or `/series/page/{page}`
  - Featured/Estrenos: `/peliculas/estrenos`
  - Search: `/?s={search}` or `/busqueda?s={search}`
- HTML Parser (`.movie-item` selector):
  - Link: `<a href="...">` -> sanitized to relative slug path.
  - Title: `.item-detail p` or `.poster[alt]` (clearing prefix like `"Poster "`).
  - Image / Poster: `.item-picture figure img.poster[src]` (prepends `https:` if protocol-relative).
  - Backdrop: `.card-hover-backdrop[data-backdrop]` or `style` background image attribute.
  - Year: `.year.text-center` text.
  - Rating: `.card-hover-rating` text (cleans star symbols).
  - Duration: `.card-hover-info-meta div` text matching `(\d+h)?\s*(\d+min)?`.
  - Tags: `.card-hover-info-genre li` text collection.
  - Caption: `.card-hover-info-overview p` text.
- Pagination:
  - Extracts pagination links from `.pagination`, `.nav-links`, or calculates `hasNext` based on items received vs expected batch count (typically 24 items).

### 3. GetDetail (`strategies/repelisplus/get-detail.operation.ts`)
- Uses `repelisFlareFetch` with 7-day SQLite cache fallback via `services/movie.store.ts`.
- Extracts:
  - Title, full HD poster, backdrop banner.
  - Synopsis from `.overview` / description paragraphs.
  - If Movie: sets up detail context with provider `"repelisplus"`, movie slug, and embeds found in static HTML into `context.servers`.
  - If Series: parses season tabs / episode lists (`.episodes-list`, `.season-list` or season dropdowns) mapping each episode to:
    - `numberEpisode`, `title`, `image`, `link`, `caption`
    - `context`: `{ season, episode, slug, provider: "repelisplus", serverLinks?: string[] }`

### 4. GetUrl (`strategies/repelisplus/get-url.operation.ts`)
- Resolves direct streams using clean extractors (`resolvers/`):
  1. Checks if stream is already cached in MinIO / stream cache (`resolveCachedStream`).
  2. If player links were pre-extracted in `detailContext.servers`, uses them directly; otherwise fetches watch page / embed endpoints via `repelisFlareFetch`.
  3. Iterates over discovered server embed URLs in order of reliability:
     - Streamwish resolver: Unpacks obfuscated JS (`eval(p,a,c,k,e,d)`) to locate `.m3u8` master file.
     - Voe resolver: Extracts embedded JSON / base64 payload containing HLS source.
     - Filelions / Vidhide resolver: Extracts direct HLS stream.
  4. If a resolver succeeds, adds to `resolvedStreams`. Populates primary `url` with first stream and `fallbackUrl` with second stream.
  5. If all resolvers fail or no valid stream is returned, throws typed `RepelisPlusError("No playable stream found")`.

### 5. Builder & Registry Integration
- `RepelisPlusMovieBuilder`:
  - Registers strategies into a new `MovieContext` configured with:
    - `id: "repelisplus"`
    - `name: "RepelisPlus"`
- Register in `MovieContextFactory`:
  - Add case `"repelisplus"` returning `RepelisPlusMovieBuilder`.
- Register in `DriverRegistry.initialize()`:
  - `this.register(new CachedDriverDecorator(MovieContextFactory.driver("repelisplus")))`.

### 6. Testing Strategy
- Unit tests with mock responses:
  - `get-all.test.ts`: Verify parsing of `.movie-item` elements, correct fallback when no backdrop is present, pagination handling, and search mapping.
  - `get-detail.test.ts`: Verify movie detail mapping, series season/episode parsing, and cache retrieval.
  - `get-url.test.ts` & `resolvers.test.ts`: Verify unpacking of Streamwish, Voe, and Filelions payloads into `.m3u8` streams, server fallthrough, and fallback URL population.
  - `repelisplus-registry.test.ts`: Verify registration in `DriverRegistry` and `MovieContextFactory`.

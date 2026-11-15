# SeriesLan Provider Integration Design

## Intent & The Why
Add `serieslan.live` as a high-performance streaming provider to LissTV. SeriesLan exposes a modern REST API (`/api/rest/v1/`) with fast responses (<150ms) and rich TMDB metadata, and embeds dual-audio HLS (`.m3u8`) video streams without Cloudflare challenges or third-party ads.

## Goals
1. Implement a complete driver for `serieslan` complying with the Strategy pattern defined in `AGENTS.md`:
   - `GetAll`: List series with pagination and keyword search.
   - `GetDetail`: Retrieve series synopsis, TMDB metadata, seasons, and episodes.
   - `GetUrl`: Extract direct `.m3u8` master playlists from episode player embeds (`vimeos.net`).
2. Integrate `serieslan` into `MovieContextFactory`, `DriverRegistry` (with `CachedDriverDecorator`), and `ProviderSelector`.
3. Provide unit test suites for client, operations, URL resolution, and builder registration.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Scraping HTML pages for catalog data when the REST API is available.
  - Adding FlareSolverr or Tor proxies since `serieslan.live` does not use Cloudflare anti-bot challenges.
- **Anti-Goals:**
  - Coupling UI components to SeriesLan-specific logic (e.g. redirecting UI when `serieslan` is active).
  - Failing with uncaught exceptions when consumers query for movies.
  - Exposing vendor-specific data structures or error codes to the application layer.

## Constraints
- Strict adherence to `AGENTS.md`:
  - Strategy pattern with independent operations (`GetAll`, `GetDetail`, `GetUrl`).
  - No `any` types; all API responses validated and typed.
  - All errors mapped to domain error types (`ProviderError`, `NotFoundError`).
  - Upstream movies are disabled in SeriesLan backend (`feature: "movie", reason: "not_configured"`). Queries with `filter="movies"` must gracefully return empty arrays `{ movies: [], pagination: { ... } }`.
  - For `GetDetail`, querying a movie URL returns `undefined` (satisfying `Promise<Omit<StoredMovie, ...> | undefined>`), allowing standard 404 UI without uncaught exceptions.

## Approaches Considered

### Approach 1: Tolerant Strategy with Domain Fallbacks (Selected)
- `GetAll`: Maps `series` from `/api/rest/v1/listing?kind=series` when filter is `undefined` or `series`. When filter is `movies`, returns `{ movies: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0, hasNext: false, hasPrev: false } }` without throwing. Search queries use `/api/rest/v1/search?q={query}`.
- `GetDetail`: Fetches `/api/rest/v1/content/serie/{slug}` and loads seasons in parallel batches using `Promise.allSettled`. If slug starts with `/pelicula/`, returns `undefined`.
- `GetUrl`: Resolves `player_url` using episode context (`context.player_url`), or falls back to resolving `tmdb_id` from `/api/rest/v1/content/serie/{slug}` and deterministically constructing `https://player.serieslan.live/e/tv/{tmdb}/{season}/{episode}`. Extracts the `iframe src` pointing to `https://vimeos.net/...`, and parses the direct master `.m3u8` playlist URL.
- **Why chosen:** Zero UI changes needed; clean domain mapping; fully resilient; fast resolution (<200ms).

### Approach 2: Enforced UI redirection to Series filter (Rejected)
- Hardcode UI redirection to `/series` when `serieslan` is selected.
- **Why rejected:** Violates `AGENTS.md` rules 3 & 8 (coupling UI to a specific provider).

## Architecture & File Structure

```
strategies/serieslan/
├── types.ts                  # Raw SeriesLan API schema & interfaces
├── client.ts                 # HTTP client with timeout, headers & error handling
├── get-all.operation.ts      # GetAll strategy & mappers
├── get-detail.operation.ts   # GetDetail strategy & season/episode mappers
└── get-url.operation.ts      # GetUrl strategy resolving vimeos.net m3u8

builder/
└── serieslan.build.ts        # SerieslanMovieBuilder implementing MovieBuilder<MovieContext>

tests/strategies/serieslan/
├── client.test.ts
├── get-all.test.ts
├── get-detail.test.ts
└── get-url.test.ts

tests/drivers/
└── serieslan-registry.test.ts
```

## Strategy Details

### 1. Client (`strategies/serieslan/client.ts`)
- Base URL: `https://serieslan.live`
- Endpoints:
  - Catalog: `/api/rest/v1/listing?kind=series&order=recent&page={page}`
  - Search: `/api/rest/v1/search?q={query}&page={page}`
  - Detail: `/api/rest/v1/content/serie/{slug}`
  - Episodes: `/api/rest/v1/episodes?item_id={catalog_item_id}&season={season}&limit=100`
- Headers: Standard browser User-Agent and JSON accept header.
- Timeout: 8000ms.

### 2. GetAll (`strategies/serieslan/get-all.operation.ts`)
- Maps `SeriesLanItem` -> `MovieItem`:
  - `id`: `item.slug`
  - `title`: `item.title`
  - `year`: `item.year ? String(item.year) : ""`
  - `poster`: `item.poster_path ? https://image.tmdb.org/t/p/w500${item.poster_path} : ""`
  - `banner`: `item.backdrop_path ? https://image.tmdb.org/t/p/original${item.backdrop_path} : ""`
  - `type`: `"serie"`
  - `provider`: `"serieslan"`
  - `rating`: `item.vote_average ? String(item.vote_average) : ""`
  - `url`: `/serie/${item.slug}`

### 3. GetDetail (`strategies/serieslan/get-detail.operation.ts`)
- Input: `/serie/{slug}` or `{slug}`.
- If path starts with `/pelicula/`, returns `undefined`.
- Clean slug: remove leading `/serie/` if present.
- Fetches metadata from `/api/rest/v1/content/serie/{slug}`.
- Concurrency for seasons: executes `/api/rest/v1/episodes` in batches of 4 with `Promise.allSettled`.
- Maps to domain `MovieDetail`:
  - `episodes`: Array of Season objects `{ season: number, episodes: Episode[] }`.
  - `Episode`:
    - `link`: `/serie/${slug}/player?season=${season}&episode=${epNum}`
    - `numberEpisode`: `String(ep.episode)`
    - `title`: `ep.title || Episodio ${ep.episode}`
    - `image`: `ep.still_path ? https://image.tmdb.org/t/p/w300${ep.still_path} : poster`
    - `context`: `{ tmdb_id, season, episode: ep.episode, player_url: ep.player_url, slug }`

### 4. GetUrl (`strategies/serieslan/get-url.operation.ts`)
- Input: `link` (e.g. `/serie/{slug}/player?season={s}&episode={e}`) and `options?: { context?: Record<string, unknown>; season?: number; episode?: number }`.
- Target Player URL:
  - If `options?.context?.player_url` is present, uses it directly.
  - If not, extracts `{slug}`, `{season}`, and `{episode}` from link/options, fetches `/api/rest/v1/content/serie/{slug}` to retrieve `item.tmdb_id`, and builds `https://player.serieslan.live/e/tv/${tmdb_id}/${season}/${episode}`.
- Stream Extraction:
  - Fetches the player page with `Referer: https://serieslan.live/`.
  - Extracts the `vimeos.net` iframe `src`.
  - Fetches the vimeos embed HTML with `Referer: https://player.serieslan.live/`.
  - Extracts master playlist `.m3u8` from script or HTML.
  - Returns `{ url: masterM3u8Url, quality: "auto", provider: "serieslan" }`.

### 5. Registry & UI Integration
- Update `builder/factory.ts`: add `serieslan` to provider map and `driver()` union.
- Update `drivers/registry.ts`: register `serieslan` wrapped in `CachedDriverDecorator`.
- Update `components/ui/ProviderSelector.tsx`: add `{ id: "serieslan", name: "SeriesLan" }` to provider list.

## What is Left to the Builder
- Detailed HTTP retry policies in `client.ts`.
- Exact regex patterns for HTML parsing of `vimeos.net` player embeds.
- Comprehensive unit tests with mocked payloads in `tests/strategies/serieslan/`.

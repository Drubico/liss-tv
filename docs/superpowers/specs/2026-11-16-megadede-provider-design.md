# Megadede Provider Integration Design

## Intent & The Why
Integrate `https://megadede.mobi/` as a high-performance content provider for LissTV. Megadede hosts an extensive catalog of movies and TV series with TMDB-backed artwork and ratings. The player embeds multi-language streams (Latino, Castellano, Subtitulado) protected by an inline AES-256-CBC cipher. By integrating Megadede natively, LissTV can decrypt these links and extract clean, ad-free HLS (`.m3u8`) master playlists to play directly in Vidstack.

## Goals
1. Implement a complete driver for `megadede` adhering to the Strategy pattern and SOLID principles defined in `AGENTS.md`:
   - `GetAll`: Retrieve paginated catalogs (`/peliculas`, `/series`, `/estrenos`) and handle search queries (`/search?s=...`).
   - `GetDetail`: Scrape full media details (TMDB artwork, synopsis, genres, year, rating) and parse all seasons and episodes with lightweight virtual coordinates (`#s{season}-e{episode}`).
   - `GetUrl`: Retrieve `/vidurl/<id>/` (using lazy episode resolution for series via `/api/episodio/serie/<slug>/<season>/<episode>`), compute SHA-256 key from `LINK_CHALLENGE + LINK_SALT`, decrypt `dataLink` AES-256-CBC payload, and extract clean direct `.m3u8` streams using hoster extractors (Vidhide, Streamwish, VOE) filtered by preferred language (defaulting to Latino).
2. Wire `megadede` into `MovieContextFactory`, wrap with `CachedDriverDecorator`, and register in `DriverRegistry`.
3. Leverage existing caching mechanisms:
   - Catalog & Search queries cached in SQLite via `CachedDriverDecorator` (8h catalog, 1h search).
   - Media details cached for 7 days via `CachedDriverDecorator`.
   - Extracted direct stream URLs cached via `stream-cache.service` / MinIO.
4. Comprehensive unit tests with mocked upstream HTTP and HTML/JSON fixtures.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Eagerly resolving video URLs for every episode in a series during `GetDetail` (must resolve lazily on demand in `GetUrl`).
  - Embedding third-party ad-ridden iframes directly into the UI player.
  - Adding Puppeteer/Playwright or external headless browser services (pure Node.js native crypto and Cheerio are sufficient).
- **Anti-Goals:**
  - Modifying `CachedDriverDecorator` or other providers (strict adherence to `AGENTS.md` open/closed principle).
  - Coupling UI components to `megadede` provider specifics.
  - Exposing raw provider errors, ciphertexts, or vendor-specific data structures outside the provider folder.

## Constraints
- **AGENTS.md Compliance:**
  - Strategies live exclusively inside `strategies/megadede/`.
  - Zero modifications to other providers or UI components.
  - TypeScript `strict` mode: no `any`, strictly typed schemas and error models (`ProviderError`, `NotFoundError`).
  - Common domain model: operations must map to `Movies`, `StoredMovie`, and `Url`.
- **Playback Compatibility with Vidstack:**
  - Upstream CDNs (such as Vidhide's `acek-cdn.com`) require valid `Referer` headers and block unauthorized browser origins with HTTP 403 or CORS errors. Extracted `.m3u8` streams must be proxied through `/api/video/m3u8?url=...` (or cached in MinIO) to guarantee seamless Vidstack playback in the client.

## Approaches Considered

### Approach 1: Native Strategy with Server-Side Cryptographic Decryption & Cascading HLS Extractors (Selected)
- Scrapes catalog and details with `cheerio`.
- Uses lightweight episode link modeling (`#s{season}-e{episode}`) in `GetDetail` and lazy episode resolution via `/api/episodio/serie/<slug>/<season>/<episode>` in `GetUrl`.
- Decrypts `/vidurl/<id>/` inline using Node.js `crypto` with `aes-256-cbc` and `sha256(LINK_CHALLENGE + LINK_SALT)`.
- Cascades extraction to direct `.m3u8`:
  1. **Vidhide / Morencius**: Unpacks Dean Edwards P.A.C.K.E.R. format to extract direct `master.m3u8`.
  2. **Streamwish / VOE**: Secondary fallbacks.
- Returns stream URL routed through `/api/video/m3u8` with appropriate headers for Vidstack.
- **Why chosen:** Instant execution (<200ms), zero ad popups, pure Node.js native code, fully compatible with Vidstack and existing `/api/video/m3u8` proxy.

### Approach 2: Dynamic Interception via Headless Browser (Puppeteer/FlareSolverr) (Rejected)
- Launches Chromium to navigate embed frames and intercept network requests.
- **Why rejected:** Heavy memory footprint, 4-10 second resolution latency, and completely unnecessary since the crypto and packers are easily solved in native code.

### Approach 3: Iframe Embed Passthrough (Rejected)
- Returns decrypted third-party player iframe URLs instead of extracting HLS.
- **Why rejected:** Violates user requirement to play in Vidstack without ads.

---

## Architecture & File Structure

```
strategies/megadede/
├── types.ts                    # Internal Megadede DOM models & decrypted data schemas
├── client.ts                   # Centralized HTTP client (User-Agent, headers, timeouts)
├── extractors/
│   ├── vidhide.extractor.ts    # Unpacks P.A.C.K.E.R. and extracts direct .m3u8
│   ├── streamwish.extractor.ts # Fallback extractor for Streamwish/HGLINK
│   └── voe.extractor.ts        # Fallback extractor for VOE
├── get-all.operation.ts        # GetAll strategy implementation & Cheerio parser
├── get-detail.operation.ts     # GetDetail strategy & season/episode parser
└── get-url.operation.ts        # GetUrl strategy, AES decrypter & extractor orchestrator

builder/
└── megadede.build.ts           # MegadedeMovieBuilder implementing MovieBuilder<MovieContext>

drivers/
└── registry.ts                 # Register "megadede" in MovieContextFactory & DriverRegistry

tests/strategies/megadede/
├── client.test.ts
├── get-all.test.ts
├── get-detail.test.ts
├── get-url.test.ts
└── vidhide.extractor.test.ts
```

---

## Component Details

### 1. HTTP Client (`strategies/megadede/client.ts`)
- `MEGADEDE_BASE_URL`: `https://megadede.mobi`
- Standard headers: Desktop `User-Agent`, `Accept-Language: es-ES,es;q=0.9`, `Referer: https://megadede.mobi/`.
- Domain errors: Custom `MegadedeError` inheriting from `ProviderError`.

### 2. Strategy `GetAll` (`strategies/megadede/get-all.operation.ts`)
- URL Mapping:
  - Search: `/search?s=${encodeURIComponent(query)}&page=${page}` (falls back to `/?s=...`).
  - Series catalog: `/series?page=${page}`.
  - Movies catalog: `/peliculas?page=${page}` (default).
  - Estrenos / Genres if slug provided: `/${slug}?page=${page}`.
- Parser:
  - Extracts `<article class="mv v por">` items.
  - Parses TMDB poster URL from `img[src]` / `img[srcset]`.
  - Parses title from `.title a` or `h2.entry-title`.
  - Parses year from `.year` / metadata badge.
  - Parses rating from `.rating` / `.imdb`.
  - Determines `type: "movie" | "serie"` based on URL containing `/serie/` or `/pelicula/`.
  - Parses pagination: detects last page from `.page-numbers` or `?page=N` links.

### 3. Strategy `GetDetail` (`strategies/megadede/get-detail.operation.ts`)
- Fetches `/pelicula/<slug>` or `/serie/<slug>`.
- Extracts:
  - Title, description/caption, duration, tags/genres, year, rating.
  - Poster image and background image (backdrop).
  - If Movie: extracts the initial `/vidurl/<id>/` URL from server buttons:
    `<button class="server-btn" onclick="changeServer('/vidurl/...', this)">`.
  - If Serie: parses seasons and episodes without extra outbound calls:
    - Scrapes `.season-container[data-season]` and `.episode-card` anchors.
    - Sets `Episode.link = /serie/<slug>#s{season}-e{episode}`.
    - Sets `Episode.context = { season, episode, slug, provider: 'megadede' }`.

### 4. Strategy `GetUrl` (`strategies/megadede/get-url.operation.ts`)
- Flow:
  1. Accepts `path` and `options?: GetUrlOptions`.
  2. Resolves target `/vidurl/<id>/`:
     - If path or options specify a series episode (e.g. contains `#sX-eY` or `options.season`/`options.episode`), calls:
       `GET https://megadede.mobi/api/episodio/serie/<slug>/<season>/<episode>` with `Referer: https://megadede.mobi/serie/<slug>`.
       Parses JSON response and extracts `data-url` (`/vidurl/...`) from `html`.
     - If path is a movie, loads the movie page (or uses cached detail) to extract `/vidurl/<id>/`.
     - If path already is a `/vidurl/...` path, uses it directly.
  3. Fetches `https://megadede.mobi/vidurl/<id>/` with `Referer: https://megadede.mobi/`.
  4. Parses `LINK_CHALLENGE` and `LINK_SALT` via regex.
  5. Computes key: `crypto.createHash('sha256').update(challenge + salt).digest()`.
  6. Parses `dataLink = [...]` JSON array.
  7. Loops through language groups (`video_language`):
     - Prioritizes requested `options?.language` or defaults to `LAT` -> `ESP` -> `SUB`.
  8. For each server in `sortedEmbeds`:
     - Decrypts embed link:
       ```typescript
       const raw = Buffer.from(encryptedBase64, 'base64');
       const iv = raw.subarray(0, 16);
       const ciphertext = raw.subarray(16);
       const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
       const embedUrl = decipher.update(ciphertext, undefined, 'utf8') + decipher.final('utf8');
       ```
     - Dispatches to corresponding extractor:
       - If `servername === 'vidhide'`, calls `extractVidhideM3u8(embedUrl)`.
       - If `servername === 'streamwish'`, calls `extractStreamwishM3u8(embedUrl)`.
       - If `servername === 'voe'`, calls `extractVoeM3u8(embedUrl)`.
  9. Validates extracted HLS playlist and formats for Vidstack:
     - Formats proxy URL: `/api/video/m3u8?url=${encodeURIComponent(resolvedM3u8)}`.
     - Attempts saving manifest to MinIO / local store via `saveManifestFromUpstream()` or `upsert()`.
     - Returns:
       ```typescript
       return {
         url: `/api/video/m3u8?url=${encodeURIComponent(resolvedM3u8)}`,
         fallbackUrl: secondaryM3u8 ? `/api/video/m3u8?url=${encodeURIComponent(secondaryM3u8)}` : undefined,
         headers: { Referer: extractorReferer }
       };
       ```

### 5. Vidhide Extractor (`strategies/megadede/extractors/vidhide.extractor.ts`)
- Fetches embed page with `Referer: https://megadede.mobi/`.
- Extracts `eval(function(p,a,c,k,e,d)...)` Dean Edwards packed string.
- Decodes packing into raw source string.
- Regex matches `master.m3u8` from `links.hls2` / `links.hls3` / `sources`.
- Returns direct playable `.m3u8` URL.

### 6. Caching Layer Integration
- **Catalog & Detail:** Handled automatically by `CachedDriverDecorator`:
  - `getAll` uses cache key `megadede:${slug || 'home'}:page:${pageNumber}` (TTL 8h; 1h for search).
  - `getDetail` keyed by content link (TTL 7 days).
- **Stream URLs:**
  - `CachedDriverDecorator.getUrl()` delegates through `resolveCachedStream()`.
  - `strategies/megadede/get-url.operation.ts` persists newly resolved streams via `stream-cache.service` / MinIO on cache misses without modifying `CachedDriverDecorator`.

---

## Testing Strategy
- Unit tests with offline fixtures for:
  - `client.ts`: Header formation, error status wrapping into `MegadedeError`.
  - `get-all.operation.ts`: Parsing movies, series, search results, and pagination flags from sample HTML fixtures.
  - `get-detail.operation.ts`: Parsing movie metadata and series season/episode lists without extra network calls.
  - `get-url.operation.ts`:
    - Episode resolution flow via `/api/episodio/...`.
    - AES decryption correctness against known test vectors.
    - Server priority, language fallback, and `/api/video/m3u8` proxy formatting.
  - `vidhide.extractor.ts`: Dean Edwards unpacker and m3u8 URL extraction.
  - `registry.ts`: Verification that `DriverRegistry.getDriver('megadede')` returns the cached decorator instance.

---

## What is Left to the Builder
- Implementing specific regex patterns for secondary extractors (`streamwish`, `voe`) as fallbacks.
- Handling edge cases where an episode uses a numeric embed ID vs IMDB `tt` ID in `/vidurl/...`.

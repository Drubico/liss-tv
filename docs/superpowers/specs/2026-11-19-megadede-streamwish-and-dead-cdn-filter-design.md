# Megadede StreamWish Host Detection, Dead CDN Filtering & Proxy Timeout Optimization Design

## 1. Intent & Context
In Megadede, series episodes (e.g. `serie/you#s5-e3`) often provide StreamWish mirrors labeled as "Wish", "Swish", or hosted on domains such as `strwish.com`, `wishfast.top`, `wishembed.com`, etc.
Previously, `strategies/megadede/get-url.operation.ts` matched only `server.includes("streamwish") || decryptedUrl.includes("hglink")`. Because of this rigid check:
1. StreamWish was ignored or ranked lower than Vidhide (priority 4 vs 3).
2. Only Vidhide was resolved, leaving `fallbackUrl: undefined`.
3. Vidhide returned URLs pointing to subdomains of `radiantgroveproduction.cfd` (a dead/parked domain on Namecheap).
4. In `/api/video/m3u8`, the manifest fetch hung for 8 seconds before returning a `504 Gateway Timeout`. Without a `fallbackUrl`, the player had nothing to switch to.

## 2. Goals & Non-Goals
- **Goals:**
  - Broaden StreamWish recognition in `strategies/megadede/get-url.operation.ts` to detect `wish`, `swish`, and known Wish domains (`wishfast`, `wishembed`, `strwish`, `swishsrv`, `embedwish`, `hglink`, etc.), ensuring it is correctly prioritized (priority 2, ahead of Vidhide).
  - Enhance `strategies/megadede/extractors/streamwish.extractor.ts` using `extractM3u8FromUnpacked(html, embedUrl)` to parse both packed and unpacked JWPlayer `sources: [{ file: "..." }]` or `.txt` / `.m3u8` playlists.
  - In `strategies/megadede/extractors/vidhide.extractor.ts`, filter out known dead/parked domains (such as `radiantgroveproduction.cfd`), picking alternative active mirrors from `links` (`links.hls`, `links.hls2`, etc.).
  - Optimize the connection timeout in `app/api/video/m3u8/route.ts` from 8s to 5s so dead upstream servers trigger client fallback much faster without stalling playback.
  - Ensure unit tests cover StreamWish detection, dead domain filtering, and proxy timeout.
- **Non-Goals:**
  - Changing the `StrategyGetUrl` contract interface (`{ url, fallbackUrl, ... }`).
  - Rewriting Vidstack player internals.

## 3. Approaches Considered
- **Approach 1 (Comprehensive Host Detection, Dead CDN Filtering & Fast Timeout - Selected):**
  - Fix StreamWish matching, enhance StreamWish extraction, discard dead `radiantgroveproduction.cfd` mirrors in Vidhide, and reduce proxy timeout to 5s.
  - *Tradeoff:* Touches `get-url.operation.ts`, `streamwish.extractor.ts`, `vidhide.extractor.ts`, and `route.ts`. Guarantees working StreamWish as primary stream, clean Vidhide fallback, and faster failure recovery.
- **Approach 2 (String match only):**
  - Only update `s.includes("wish")` in `get-url.operation.ts`.
  - *Tradeoff:* Leaves `streamwish.extractor.ts` vulnerable to unpacked HTML and continues serving dead `radiantgroveproduction.cfd` URLs whenever Vidhide is selected. Rejected.

## 4. Detailed Design

### 4.1 StreamWish Host Detection (`strategies/megadede/get-url.operation.ts`)
Update server detection and priority:
```ts
const isWish = (server: string, url: string): boolean => {
  const combined = (server + " " + url).toLowerCase();
  return (
    combined.includes("wish") ||
    combined.includes("swish") ||
    combined.includes("hglink")
  );
};

const isVidhide = (server: string, url: string): boolean => {
  const combined = (server + " " + url).toLowerCase();
  return (
    combined.includes("vidhide") ||
    combined.includes("morencius") ||
    combined.includes("filelions") ||
    combined.includes("lion")
  );
};
```
In `getServerPriority`:
- VOE: 1
- Wish: 2
- Vidhide/Morencius: 3
- Other: 4

### 4.2 Dead CDN Filtering (`strategies/megadede/extractors/vidhide.extractor.ts`)
In `extractM3u8FromUnpacked`:
Filter out known dead/parked domains:
```ts
const isDeadCdn = (url: string): boolean => {
  return url.includes("radiantgroveproduction.cfd");
};
```
When iterating candidate links (`links.hls`, `links.hls4`, `links.hls2`, `links.hls1`), skip candidates where `isDeadCdn(candidate)` is true.

### 4.3 Robust StreamWish Extraction (`strategies/megadede/extractors/streamwish.extractor.ts`)
Run `extractM3u8FromUnpacked(unpacked, embedUrl)` for packed code, and fallback to `extractM3u8FromUnpacked(html, embedUrl)` for raw HTML. Attach `Referer: embedUrl` if `https://megadede.mobi/` fails or try with embed hoster referer.

### 4.4 Proxy Manifest Timeout Optimization (`app/api/video/m3u8/route.ts`)
Reduce timeout from 8000ms to 5000ms:
```ts
signal: AbortSignal.timeout(5000),
...
timeout: { request: 5000 },
```

## 5. Verification Plan
- Unit tests:
  - `tests/strategies/megadede/get-url.test.ts`: test servername "Wish", "StreamWish", and URLs like `https://strwish.com/e/123`.
  - `tests/strategies/megadede/vidhide.extractor.test.ts`: verify dead CDN `radiantgroveproduction.cfd` is skipped in favor of clean mirrors.
  - `tests/strategies/megadede/streamwish.extractor.test.ts`: test extraction from both packed and unpacked HTML.
- Full test suite: `npm test`.
- Full project build: `npm run build`.

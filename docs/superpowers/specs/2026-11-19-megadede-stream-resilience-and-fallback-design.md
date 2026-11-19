# Megadede Stream Resilience, .txt Manifest Handling & Player Fallback Design

## 1. Intent & Context
Streaming URLs resolved from Megadede (specifically Vidhide/Morencius embeds) occasionally point to `.txt` master playlists (e.g. `master.txt`) on rotating CDNs that can be parked or suspended (such as `radiantgroveproduction.cfd`).
When this happens:
1. `/api/video/m3u8` failed to recognize `.txt` as a playlist, treating it as a binary segment and bypassing proxy fallback and playlist rewriting, returning a 502 Bad Gateway JSON error.
2. Megadede's URL builder did not include `&manifest=true` for non-`.m3u8` playlist paths.
3. `<MediaPlayer>` in `components/player/MobileAndDesk/index.tsx` only had `onErrorCapture`, but Vidstack 1.x dispatches fatal HLS network errors through its player prop `onError`. Without `onError`, the player never triggered the `fallbackUrl`.

## 2. Goals & Non-Goals
- **Goals:**
  - Accurately identify `.txt` playlists and honor `&manifest=true` query parameters in `/api/video/m3u8/route.ts`.
  - Append `&manifest=true` in `strategies/megadede/get-url.operation.ts` whenever the resolved stream URL does not end in `.m3u8`.
  - Support multiple link candidates in `vidhide.extractor.ts` (`links.hls`, `links.hls2`, `links.hls3`, etc.).
  - Wire `onError={onErrorCapture}` on `<MediaPlayer>` in both `MobileAndDesk` and `SmartTv` players so media/HLS load failures switch automatically to `fallbackUrl`.
  - Provide unit tests for manifest detection and player error handling.
- **Non-Goals:**
  - Modifying provider strategy contracts (`StrategyGetUrl` continues returning `{ url, fallbackUrl, ... }`).
  - Rewriting Vidstack internals or adding third-party player plugins.

## 3. Approaches Considered
- **Approach 1 (Full Resilience Pipeline - Selected):**
  - Treat `.txt` manifests properly in the backend proxy, pass `&manifest=true` from provider strategies, enhance Vidhide extractor mirror parsing, and wire `onError` to fallback switching in the player.
  - *Tradeoff:* Touches proxy route, provider extractor, and player error handling, but guarantees end-to-end recovery if any upstream CDN fails.
- **Approach 2 (Proxy-only patch):**
  - Only update `/api/video/m3u8` to check `.txt`.
  - *Tradeoff:* Leaves the frontend player broken on dead CDNs (stuck with 502) and ignores alternative Vidhide mirrors. Rejected.

## 4. Detailed Design

### 4.1 Manifest Recognition (`app/api/video/m3u8/route.ts`)
Update `isManifestUrl` logic:
```ts
const isManifestUrl =
  url.includes(".m3u8") ||
  url.includes(".txt") ||
  req.nextUrl.searchParams.get("manifest") === "true";
```
In `utils/m3u8.ts`:
Ensure `resolveUrl` and line rewriting in `rewriteManifest` recognize `.txt` sub-manifests when deciding if a line is a sub-manifest or segment:
```ts
const isSubManifest = absolute.includes(".m3u8") || absolute.includes(".txt");
```

### 4.2 Provider Manifest Parameter (`strategies/megadede/get-url.operation.ts`)
Ensure the proxy URL includes `&manifest=true` when not ending in `.m3u8`:
```ts
const isM3u8 = streamUrl.includes(".m3u8");
const manifestParam = isM3u8 ? "" : "&manifest=true";
```

### 4.3 Vidhide Extractor Mirror Extraction (`strategies/megadede/extractors/vidhide.extractor.ts`)
In `extractM3u8FromUnpacked`, examine the `links` object. Extract the primary candidate, but if multiple candidates exist (`hls`, `hls2`, `hls3`, `hls4`), provide the list or prioritize `links.hls` / `links.hls2` (active CDN mirrors) rather than defaulting only to `hls4` / `hls3`.

### 4.4 Player Error Event Binding (`components/player/MobileAndDesk/index.tsx` & `SmartTv/index.tsx`)
Bind `onError={onErrorCapture}` on `<MediaPlayer>`:
```tsx
<MediaPlayer
  ...
  onError={onErrorCapture}
  onErrorCapture={onErrorCapture}
  ...
>
```
When HLS.js or native media encounters a 502 or network error, `onError` fires and `errorHandler` in `VideoPlayer.tsx` switches `currentSrc` to `fallbackUrl`.

## 5. Verification Plan
- Unit tests:
  - `tests/m3u8-rewrite.test.ts`: verify `.txt` playlists are treated as sub-manifests.
  - `tests/strategies/megadede/get-url.test.ts`: verify `manifest=true` is appended when URL does not end in `.m3u8`.
  - `tests/player/fallback-switch.test.ts`: test player error dispatch triggers fallback URL.
- Full test suite: `npm test`.
- Full project build: `npm run build`.

# Design Doc: M3U8 Streaming Optimization & Direct Segments Support

**Date:** 2026-11-17  
**Status:** Draft / Proposed  
**Author:** Antigravity  

---

## 1. Intent & The Why

Users experience significant buffering, playback stutter, and slow loading when streaming M3U8 video from content providers (e.g., Megadede, Gnula, SeriesLan, SoloLatino) in LissTV, whereas the official provider websites stream the same content smoothly with near-instant start times.

The root causes identified are:
1. **Mandatory Segment Proxying:** `rewriteManifest` forces every `.ts` / `.m4s` segment through `/api/video/m3u8`, causing the single-threaded Next.js Node process to act as an unnecessary reverse proxy for gigabytes of binary video traffic.
2. **`Cache-Control: no-store` on Segments:** In `app/api/video/m3u8/route.ts`, segment responses prohibit caching, forcing the browser player to re-fetch fragments upon buffer fluctuations or seek operations.
3. **Missing Upstream CDN Headers:** Upstream streaming CDNs throttle requests lacking legitimate `Referer` or `Origin` headers, or rate-limit the server's single IP.
4. **Unconfigured Player Buffer:** The `@vidstack` player uses default low-buffer settings without prefetching initial fragments.

---

## 2. Goals, Non-Goals, & Anti-Goals

### Goals
- Eliminate the server proxy bottleneck for providers that allow direct client-to-CDN segment fetching via CORS.
- Optimize the fallback proxy path for providers that require IP-bound or Referer-restricted access.
- Enable aggressive browser/client caching on immutable video segments (`Cache-Control: public, max-age=86400, immutable`).
- Forward required upstream context (`Referer`, `Origin`) through the proxy to prevent CDN bandwidth throttling.
- Maintain 100% backward compatibility with all existing providers and strategy implementations.

### Non-Goals
- Re-architecting providers or scraping mechanisms.
- Changing the storage layer (MinIO / SQLite / MovieStore).
- Modifying UI layouts or video controls outside of player engine options.

### Anti-Goals
- Breaking playback for IP-restricted providers.
- Forcing a global all-or-nothing switch that requires prior knowledge of every provider's CORS policy.

---

## 3. Constraints
- Strict adherence to the Strategy pattern defined in `AGENTS.md` (no provider coupling in the UI).
- Must work across Web, Mobile, and SmartTV players.
- TypeScript `strict` mode: no `any` types; all options must be typed.

---

## 4. Approaches Considered

### Approach 1: Strategy-driven Selective Proxying (Direct-by-default)
- Each strategy explicitly declares if its segments must be proxied or can be fetched directly by the browser.
- *Pros:* Zero server bandwidth for open CDNs, native CDN speeds.
- *Cons:* Requires knowing or configuring every provider's CORS/IP requirements upfront.

### Approach 2: Universal Proxy Optimization
- Keep all traffic routed through `/api/video/m3u8`, but fix caching, upstream headers, and player buffers.
- *Pros:* No provider knowledge needed.
- *Cons:* Persistent server bandwidth consumption and double-hop network latency.

### Selected Hybrid Approach
Combine **Approach 2** as the resilient baseline with **Approach 1** as an opt-in capability:
1. **Optimized Baseline Proxy:** Update `/api/video/m3u8` with immutable caching, upstream header forwarding (`Referer`), and tuned player buffers. All streams improve immediately.
2. **Optional Direct Segments Flag:** Add an optional `directSegments?: boolean` property to `Url`. When `true`, `rewriteManifest` resolves relative segment URLs to absolute CDN URLs without prepending `/api/video/m3u8`. If omitted or `false`, it safely defaults to the optimized proxy.

---

## 5. Architectural Specification

### 5.1 Type Definitions (`types/movie.ts`)
```typescript
export interface Url {
  url: string;
  fallbackUrl?: string;
  directSegments?: boolean;
  referer?: string;
}
```

### 5.2 Manifest Rewriter (`utils/m3u8.ts`)
Update `rewriteManifest` signature and logic:
```typescript
export interface RewriteManifestOptions {
  baseOrigin?: string;
  directSegments?: boolean;
  referer?: string;
}

export function rewriteManifest(
  body: string,
  manifestUrl: string,
  options?: RewriteManifestOptions | string,
): string
```
- If `options.directSegments === true`:
  - Sub-playlists / variant manifests (`.m3u8`) are still rewritten through the proxy (preserving session and header context).
  - Segment URIs (`.ts`, `.m4s`, etc.) are resolved to absolute URLs against `manifestUrl` and left directly pointing to the upstream CDN.
- If `options.directSegments !== true`:
  - Segments are rewritten to `${prefix}?url=${encodeURIComponent(absolute)}${referer ? `&referer=${encodeURIComponent(referer)}` : ""}`.

### 5.3 Video Proxy Route (`app/api/video/m3u8/route.ts`)
1. **Segment Caching:**
   - Change `Cache-Control: no-store` to:
     ```typescript
     headers.set("Cache-Control", "public, max-age=86400, immutable");
     ```
2. **Header Forwarding:**
   - Read `referer` from query params or request headers and pass it in `got.stream`:
     ```typescript
     headers: {
       "user-agent": BROWSER_UA,
       ...(upstreamReferer ? { referer: upstreamReferer } : {}),
       ...(req.headers.get("range") ? { range: req.headers.get("range")! } : {}),
     }
     ```
3. **Query Parameter Propagation:**
   - Extract `directSegments` and `referer` from query parameters and forward them into `rewriteManifest`.

### 5.4 Video Player Optimization (`components/player/`)
Configure HLS.js / `@vidstack` provider options:
- Enable fragment prefetching (`startFragPrefetch: true`).
- Increase forward buffer size (`maxBufferLength: 30`, `maxMaxBufferLength: 60`).
- Start with optimal initial quality / automatic bitrate adaptation.

---

## 6. Verification Plan
1. **Unit Tests:**
   - Test `rewriteManifest` with `directSegments: false` (all URLs proxied).
   - Test `rewriteManifest` with `directSegments: true` (only variant manifests proxied, segments direct).
   - Test referer forwarding propagation in `rewriteManifest`.
2. **Integration / Manual Verification:**
   - Verify M3U8 playback with optimized proxy headers and verify `Cache-Control` header on segment requests.
   - Verify direct segment playback on providers that allow direct CDN access.

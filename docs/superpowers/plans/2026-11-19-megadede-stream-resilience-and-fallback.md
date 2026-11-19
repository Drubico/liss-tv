# Megadede Stream Resilience, .txt Manifest Handling & Player Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Megadede 502 Bad Gateway failures caused by `.txt` playlists on rotating CDNs by ensuring `.txt` playlists are recognized as manifests, adding `manifest=true` in Megadede URL generation, enhancing Vidhide mirror parsing, and binding `onError` to `fallbackUrl` in the player.

**Architecture:** Strategy pattern adherence (`AGENTS.md`) where `app/api/video/m3u8/route.ts` and `utils/m3u8.ts` recognize `.txt` playlists and query flag `manifest=true` for HLS rewriting. In `strategies/megadede/`, `get-url.operation.ts` adds `manifest=true` for non-`.m3u8` URLs and `vidhide.extractor.ts` extracts alternative mirrors from `links`. In `components/player/`, `onError={onErrorCapture}` triggers `VideoPlayer`'s fallback mechanism upon HLS network errors.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vidstack Player 1.15 (`@vidstack/react`), Node.js test runner (`node:test`).

**Spec:** [docs/superpowers/specs/2026-11-19-megadede-stream-resilience-and-fallback-design.md](file:///C:/Users/Usuario/Desktop/Work/liss-tv/docs/superpowers/specs/2026-11-19-megadede-stream-resilience-and-fallback-design.md)

## Global Constraints
- Conventional commits only (no "Co-Authored-By" or AI attribution).
- Strict TypeScript (`strict: true`, no `any`).
- No provider coupling in UI components.
- Preserve backward compatibility for existing providers (`gnula`, `seriesmetro`, `sololatino`).

## Review Focus
1. Upstream `.txt` URL without `.m3u8` extension in query param: must route to manifest handler instead of segment handler.
2. Multilevel `.txt` playlists inside master manifests: sub-manifests must be rewritten with prefix proxy rather than treated as raw ts segments.
3. Vidhide packed code with multiple mirrors: extractor should select first working mirror candidate (`hls`, `hls2`, etc.) and not fail silently if only `hls` is defined.
4. HLS network failure (HTTP 502/504 or dropped TLS socket): `MediaPlayer` dispatches `onError`, which invokes `errorHandler` and switches to `fallbackUrl`.
5. Existing `.m3u8` streams and `directSegments` behavior: must not regress.

---

### Task 1: Recognize `.txt` Playlists and `manifest=true` in `/api/video/m3u8` and `utils/m3u8.ts`

**Files:**
- Modify: `utils/m3u8.ts:40-66`
- Modify: `app/api/video/m3u8/route.ts:68-80`
- Test: `tests/m3u8-rewrite.test.ts`
- Test: `tests/m3u8-route-headers.test.ts`

**Interfaces:**
- Consumes: `rewriteManifest(body, manifestUrl, options)`
- Produces: `isManifestUrl` supporting `.txt` and `isSubManifest` supporting `.txt` in manifest rewriting.

- [ ] **Step 1: Write the failing test for `.txt` manifest rewriting in `tests/m3u8-rewrite.test.ts`**

```ts
test("rewriteManifest correctly recognizes and proxies .txt sub-manifests", () => {
  const masterManifest = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
index.txt
#EXT-X-STREAM-INF:BANDWIDTH=2560000,RESOLUTION=1920x1080
sub/video.m3u8`;

  const result = rewriteManifest(
    masterManifest,
    "https://cdn.example.com/hls/master.txt",
    { baseOrigin: "https://app.example.com" }
  );

  assert.ok(
    result.includes(
      "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Findex.txt"
    )
  );
  assert.ok(
    result.includes(
      "https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fhls%2Fsub%2Fvideo.m3u8"
    )
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/m3u8-rewrite.test.ts`
Expected: FAIL or verify behavior for `.txt` in directSegments mode.

- [ ] **Step 3: Update `utils/m3u8.ts` and `app/api/video/m3u8/route.ts`**

In `utils/m3u8.ts`:
```ts
const isSubManifest =
  absolute.includes(".m3u8") ||
  absolute.includes(".txt") ||
  absolute.includes("master.") ||
  absolute.includes("index.");
```

In `app/api/video/m3u8/route.ts`:
```ts
const isManifestUrl =
  url.includes(".m3u8") ||
  url.includes(".txt") ||
  url.includes("master.") ||
  url.includes("index.") ||
  req.nextUrl.searchParams.get("manifest") === "true";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/m3u8-rewrite.test.ts tests/m3u8-route-headers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/m3u8.ts app/api/video/m3u8/route.ts tests/m3u8-rewrite.test.ts
git commit -m "fix(m3u8): treat .txt playlists and manifest parameter as playlists in proxy"
```

---

### Task 2: Pass `manifest=true` and Enhance Mirror Extraction in Megadede

**Files:**
- Modify: `strategies/megadede/get-url.operation.ts:130-145`
- Modify: `strategies/megadede/extractors/vidhide.extractor.ts:32-52`
- Test: `tests/strategies/megadede/get-url.test.ts`
- Test: `tests/strategies/megadede/vidhide.extractor.test.ts`

**Interfaces:**
- Consumes: `extractVidhideM3u8(embedUrl)`
- Produces: Megadede `Url` whose `url` and `fallbackUrl` include `&manifest=true` when not ending in `.m3u8`.

- [ ] **Step 1: Write unit tests verifying `manifest=true` is attached for `.txt` URLs in `tests/strategies/megadede/get-url.test.ts`**

```ts
test("GetUrl appends &manifest=true when resolved stream URL is not .m3u8", async () => {
  // Mock vidhide returning a master.txt URL
  // Assert result.url contains &manifest=true
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `buildMegadedeProxyUrl` in `strategies/megadede/get-url.operation.ts` and update `vidhide.extractor.ts`**

In `strategies/megadede/get-url.operation.ts`:
```ts
function formatProxyUrl(rawUrl: string, hosterReferer: string): string {
  const isM3u8 = rawUrl.includes(".m3u8");
  const manifestParam = isM3u8 ? "" : "&manifest=true";
  return `/api/video/m3u8?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(hosterReferer)}${manifestParam}`;
}
```

In `strategies/megadede/extractors/vidhide.extractor.ts`:
Check `links.hls || links.hls2 || links.hls3 || links.hls4 || Object.values(links)[0]` and handle candidate resolution cleanly.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts tests/strategies/megadede/vidhide.extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/megadede/get-url.operation.ts strategies/megadede/extractors/vidhide.extractor.ts tests/strategies/megadede/get-url.test.ts tests/strategies/megadede/vidhide.extractor.test.ts
git commit -m "fix(megadede): attach manifest flag for non-m3u8 streams and improve mirror extraction"
```

---

### Task 3: Bind `onError` to `onErrorCapture` on `<MediaPlayer>` for Automatic Fallback

**Files:**
- Modify: `components/player/MobileAndDesk/index.tsx:130-136`
- Modify: `components/player/SmartTv/index.tsx:120-130`
- Test: `tests/player/fallback-switch.test.ts`

**Interfaces:**
- Consumes: `onErrorCapture` prop in `MobileAndDeskPlayer` & `SmartTvPlayer`
- Produces: `<MediaPlayer onError={onErrorCapture} onErrorCapture={onErrorCapture}>`

- [ ] **Step 1: Write test for fallback switching on error in `tests/player/fallback-switch.test.ts`**

```ts
test("fallback switcher updates src to fallbackUrl when primary encounters an error", () => {
  // Test helper verifying fallbackUrl selection on error event
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/player/fallback-switch.test.ts`

- [ ] **Step 3: Update `components/player/MobileAndDesk/index.tsx` and `components/player/SmartTv/index.tsx`**

Bind `onError={onErrorCapture}` on `<MediaPlayer>`.

- [ ] **Step 4: Run all tests and build**

Run: `npm test && npm run build`
Expected: PASS (all 130+ tests passing, 0 TypeScript errors).

- [ ] **Step 5: Commit**

```bash
git add components/player/MobileAndDesk/index.tsx components/player/SmartTv/index.tsx tests/player/fallback-switch.test.ts
git commit -m "fix(player): wire onError on MediaPlayer to trigger fallbackUrl on fatal stream errors"
```

---

### Task 4: Integration Verification and Main Merge
- [ ] **Step 1: Run full test suite and build**
Run: `npm test` and `npm run build`
- [ ] **Step 2: Push changes to `origin/main`**
Run: `git push origin main`

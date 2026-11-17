# M3U8 Streaming Optimization & Direct Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate playback buffering and stutter in LissTV by enabling direct CDN segment downloads for compatible providers and optimizing the server proxy path with immutable caching and referer forwarding.

**Architecture:** A hybrid streaming model where `types/domain.ts` and `utils/m3u8.ts` support an opt-in `directSegments?: boolean` mode that resolves `.ts` segments to direct upstream CDN URLs, while `app/api/video/m3u8/route.ts` provides an optimized fallback proxy with `Cache-Control: public, max-age=86400, immutable` and upstream `Referer` forwarding for IP/Referer-restricted streams.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `@vidstack/react`, Node.js Test Runner (`node:test`, `node:assert/strict`), Got v16.

**Spec:** `docs/superpowers/specs/2026-11-17-m3u8-streaming-optimization-design.md`

## Global Constraints

- Strict adherence to the Strategy pattern defined in `AGENTS.md` (no provider coupling in the UI).
- 100% backward compatibility: existing strategies returning `Url` without `directSegments` default safely to the optimized proxy.
- TypeScript `strict` mode: no `any` types; all options must be explicitly typed.
- Conventional commits only; no "Co-Authored-By" or AI attribution in commits.

## Review Focus

1. **Relative URI Resolution:** Segment lines with relative paths (e.g., `seg-1.ts` or `../../video/01.ts`) must resolve correctly against `manifestUrl` in both direct and proxied modes.
2. **Sub-manifest Preservation in Direct Mode:** In a master/variant playlist (`#EXT-X-STREAM-INF`), child playlist URLs must still be rewritten through the proxy so session/origin tokens are preserved when switching qualities.
3. **CORS Headers:** All segment proxy responses must include `Access-Control-Allow-Origin: *` and expose Range headers.
4. **Referer Propagation:** If a referer query parameter contains URL-encoded characters, it must decode cleanly and forward to the upstream CDN without malforming upstream headers.
5. **No Regressions on MinIO Cached Manifests:** Manifests stored in or fetched from MinIO continue to be served cleanly with compatible MIME types.

---

### Task 1: Extend Domain Types and Upgrade `rewriteManifest`

**Files:**
- Modify: `types/domain.ts:45-53`
- Modify: `utils/m3u8.ts:1-43`
- Test: `tests/m3u8-rewrite.test.ts`

**Interfaces:**
- Consumes: `StreamSource` / `Url` from `types/domain.ts`
- Produces:
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
  ): string;
  ```

- [ ] **Step 1: Write failing unit test in `tests/m3u8-rewrite.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteManifest } from "../utils/m3u8.ts";

test("rewriteManifest proxies all URLs by default (backward compatible)", () => {
  const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant.m3u8\n#EXTINF:10.0,\nsegment1.ts`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/master.m3u8", "https://app.example.com");

  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fvariant.m3u8"));
  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts"));
});

test("rewriteManifest leaves segments direct when directSegments is true", () => {
  const manifest = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nvariant.m3u8\n#EXTINF:10.0,\nsegment1.ts\n#EXT-X-KEY:METHOD=AES-128,URI="enc.key"`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/master.m3u8", {
    baseOrigin: "https://app.example.com",
    directSegments: true,
  });

  // Variant sub-manifest should still be proxied
  assert.ok(result.includes("https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fvariant.m3u8&directSegments=true"));
  // Segment should point directly to upstream CDN
  assert.ok(result.includes("https://cdn.example.com/stream/segment1.ts"));
  assert.ok(!result.includes("/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts"));
  // Key URI should still be proxied for CORS security
  assert.ok(result.includes('URI="https://app.example.com/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fenc.key"'));
});

test("rewriteManifest appends referer to proxied URLs when provided", () => {
  const manifest = `#EXTM3U\n#EXTINF:10.0,\nsegment1.ts`;
  const result = rewriteManifest(manifest, "https://cdn.example.com/stream/index.m3u8", {
    baseOrigin: "",
    referer: "https://provider.example.com/embed/123",
  });

  assert.ok(result.includes("/api/video/m3u8?url=https%3A%2F%2Fcdn.example.com%2Fstream%2Fsegment1.ts&referer=https%3A%2F%2Fprovider.example.com%2Fembed%2F123"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/m3u8-rewrite.test.ts`  
Expected: FAIL due to missing signature and options support.

- [ ] **Step 3: Update `types/domain.ts` and `utils/m3u8.ts`**

In `types/domain.ts`:
Add `directSegments?: boolean;` and `referer?: string;` to `StreamSource`.

In `utils/m3u8.ts`:
Define `RewriteManifestOptions` interface. Overload/normalize `options` when a string `baseOrigin` is passed for full backward compatibility. Implement conditional proxying:
- If `trimmed.endsWith(".m3u8")` or line is a sub-manifest, proxy with propagated `directSegments` and `referer` parameters.
- If `directSegments === true` and line is a segment URI (e.g., `.ts`, `.m4s`, or non-manifest/non-key line), resolve to absolute URL and keep direct.
- Otherwise, proxy through `${prefix}?url=${encodeURIComponent(absolute)}${refererParam}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/m3u8-rewrite.test.ts`  
Expected: PASS (all 3 tests pass).

- [ ] **Step 5: Commit**

```bash
git add types/domain.ts utils/m3u8.ts tests/m3u8-rewrite.test.ts
git commit -m "feat(m3u8): add directSegments and referer support to rewriteManifest"
```

---

### Task 2: Optimize Route Handler `/api/video/m3u8` with Caching and Header Forwarding

**Files:**
- Modify: `app/api/video/m3u8/route.ts:50-170`
- Test: `tests/m3u8-route-headers.test.ts`

**Interfaces:**
- Consumes: `rewriteManifest` from `utils/m3u8.ts`
- Produces: HTTP responses for `/api/video/m3u8` with `Cache-Control: public, max-age=86400, immutable` for segments and upstream `Referer` forwarding.

- [ ] **Step 1: Write unit test in `tests/m3u8-route-headers.test.ts`**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

test("segment responses set immutable public cache headers", () => {
  // Test helper extracting headers logic
  const headers = new Headers();
  headers.set("Content-Type", "video/mp2t");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Range");
  headers.set("Cache-Control", "public, max-age=86400, immutable");

  assert.equal(headers.get("Cache-Control"), "public, max-age=86400, immutable");
  assert.equal(headers.get("Access-Control-Allow-Origin"), "*");
});
```

- [ ] **Step 2: Update `app/api/video/m3u8/route.ts`**

1. Parse `referer` and `directSegments` query params:
   ```typescript
   const refererParam = req.nextUrl.searchParams.get("referer");
   const directSegmentsParam = req.nextUrl.searchParams.get("directSegments") === "true";
   ```
2. Pass options into `rewriteManifest`:
   ```typescript
   const rewrittenBody = rewriteManifest(body, url, {
     baseOrigin: appOrigin,
     directSegments: directSegmentsParam,
     referer: refererParam || undefined,
   });
   ```
3. In the segment fetch block:
   Forward `refererParam` in `got.stream` headers if present:
   ```typescript
   headers: {
     "user-agent": BROWSER_UA,
     ...(refererParam ? { referer: refererParam } : {}),
     ...(req.headers.get("range") ? { range: req.headers.get("range")! } : {}),
   }
   ```
4. Replace `headers.set("Cache-Control", "no-store");` with:
   ```typescript
   headers.set("Cache-Control", "public, max-age=86400, immutable");
   ```

- [ ] **Step 3: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/m3u8-route-headers.test.ts`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/video/m3u8/route.ts tests/m3u8-route-headers.test.ts
git commit -m "perf(m3u8): enable immutable segment caching and upstream referer forwarding"
```

---

### Task 3: Optimize Video Player Buffering and HLS Engine Settings

**Files:**
- Modify: `components/player/MobileAndDesk/index.tsx`
- Modify: `components/player/SmartTv/index.tsx`

**Interfaces:**
- Consumes: `<MediaPlayer>` from `@vidstack/react`
- Produces: Tuned video player instances with optimized stream playback parameters.

- [ ] **Step 1: Check `@vidstack/react` player properties and types**

Verify available HLS provider props on `<MediaPlayer>`. Ensure stream type and buffer parameters are supported (e.g., `playsInline`, `load="eager"`, and proper cross-origin configurations).

- [ ] **Step 2: Update `components/player/MobileAndDesk/index.tsx` and `SmartTv/index.tsx`**

Ensure `load="eager"` is added so player initializes playback buffers immediately without waiting for scroll or deferred interactions.
Ensure `crossOrigin="anonymous"` is explicitly specified if `crossOrigin` was boolean.

- [ ] **Step 3: Commit**

```bash
git add components/player/MobileAndDesk/index.tsx components/player/SmartTv/index.tsx
git commit -m "perf(player): configure eager loading and optimized stream playback"
```

---

### Task 4: Full System Verification and Regression Testing

**Files:**
- Existing test suite

- [ ] **Step 1: Run complete test suite**

Run: `npm test`  
Expected: All tests pass (0 failures).

- [ ] **Step 2: Run linter**

Run: `npm run lint`  
Expected: 0 errors.

- [ ] **Step 3: Commit any lingering fixes if necessary**

```bash
git status
```

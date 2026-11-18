# Megadede Stream Hoster Referer and Proxy Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix intermittent stream loading failures and connection hangs when playing Megadede streams (especially upon resuming from continue watching) by dynamically forwarding the embed hoster domain as `referer`, keeping segment proxying active (`directSegments: false`), and adding an 8-second safety timeout to upstream manifest requests.

**Architecture:** Update `strategies/megadede/get-url.operation.ts` so resolved embed streams retain their origin hoster referer instead of hardcoding `https://megadede.mobi/`. Pass this referer to both primary and fallback `/api/video/m3u8` proxy URLs. In `app/api/video/m3u8/route.ts`, introduce an `AbortSignal.timeout(8000)` on native `fetch` to prevent unbounded hangs on unresponsive CDN nodes.

**Tech Stack:** TypeScript, Next.js (App Router), Undici / Node.js 22 native fetch, Node Test Runner.

**Spec:** `docs/superpowers/specs/2026-11-18-megadede-stream-referer-and-timeout-design.md`

## Global Constraints
- No external residential proxy dependencies (`USE_PROXY=false` must work reliably).
- Do not enable `directSegments: true` for Megadede (upstream tokens are cryptographically bound to the server's IP).
- Follow conventional commits without AI attribution.
- Strictly adhere to `strict` TypeScript without `any` or `@ts-ignore`.

## Review Focus
- **Malformed Embed URLs:** If decrypted embed link cannot be parsed as a valid URL, fallback gracefully to a safe origin or skip the embed without crashing.
- **Upstream Connection Timeouts:** If `fetch` times out at 8 seconds, catch the abort error cleanly without throwing unhandled exceptions.
- **Multiple Embed Candidates:** Ensure the secondary candidate (`fallbackUrl`) gets its own matching hoster referer, not the primary stream's referer.
- **Fallback URL presence:** Verify that if only 1 stream is resolved, `fallbackUrl` remains `undefined`.
- **Clean Query Construction:** Ensure `referer` query param is properly URL-encoded in `/api/video/m3u8`.

---

### Task 1: Update Megadede GetUrl Operation with Dynamic Hoster Referer

**Files:**
- Modify: `strategies/megadede/get-url.operation.ts:80-135`
- Test: `tests/strategies/megadede/get-url.test.ts`

**Interfaces:**
- Consumes: `extractVoeM3u8`, `extractStreamwishM3u8`, `extractVidhideM3u8`, `decryptAesLink`
- Produces: `GetUrl.operation(path: string, options?: GetUrlOptions): Promise<Url>` returning dynamic `referer` and `directSegments: false`.

- [ ] **Step 1: Write unit tests verifying dynamic hoster referer and `directSegments: false`**

In `tests/strategies/megadede/get-url.test.ts`, add test cases asserting:
- When a Vidhide embed (`https://morencius.com/embed/123`) is resolved, `url` has `referer=https%3A%2F%2Fmorencius.com%2F`.
- When a secondary embed exists, `fallbackUrl` contains the secondary embed's origin referer.
- `directSegments` is explicitly `false`.
- `headers.Referer` matches the primary embed's origin.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`  
Expected: FAIL (assertion fails because currently referer is hardcoded to `megadede.mobi`).

- [ ] **Step 3: Update `strategies/megadede/get-url.operation.ts`**

1. Define `interface ResolvedStream { m3u8Url: string; hosterReferer: string; }`.
2. In the embed loop:
   ```ts
   let hosterReferer = "https://megadede.mobi/";
   try {
     hosterReferer = `${new URL(decryptedUrl).origin}/`;
   } catch {}
   ```
3. When `m3u8Url` is resolved, push `{ m3u8Url, hosterReferer }`.
4. Construct:
   ```ts
   const primary = resolvedStreams[0];
   const secondary = resolvedStreams[1];

   return {
     url: `/api/video/m3u8?url=${encodeURIComponent(primary.m3u8Url)}&referer=${encodeURIComponent(primary.hosterReferer)}`,
     fallbackUrl: secondary
       ? `/api/video/m3u8?url=${encodeURIComponent(secondary.m3u8Url)}&referer=${encodeURIComponent(secondary.hosterReferer)}`
       : undefined,
     directSegments: false,
     headers: {
       Referer: primary.hosterReferer,
     },
   };
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/megadede/get-url.operation.ts tests/strategies/megadede/get-url.test.ts
git commit -m "fix(megadede): attach dynamic hoster referer and set directSegments to false"
```

---

### Task 2: Add Connection Timeout in `/api/video/m3u8` Manifest Route

**Files:**
- Modify: `app/api/video/m3u8/route.ts:94-115`

**Interfaces:**
- Consumes: `fetch`, `AbortSignal.timeout`
- Produces: `GET(req: NextRequest)` route handler aborting stalled upstream manifest connections after 8s.

- [ ] **Step 1: Inspect and update `app/api/video/m3u8/route.ts`**

Add `signal: AbortSignal.timeout(8000)` to the native `fetch` call in manifest fetching:
```ts
const fetchRes = await fetch(url, {
  headers: fetchHeaders,
  signal: AbortSignal.timeout(8000),
});
```

- [ ] **Step 2: Verify regression test suite**

Run: `npm test`  
Expected: All tests pass (including existing video proxy tests).

- [ ] **Step 3: Commit**

```bash
git add app/api/video/m3u8/route.ts
git commit -m "fix(api): add 8s timeout to upstream manifest fetch"
```

---

### Task 3: Full Suite Verification & Typecheck

**Files:**
- Entire codebase

- [ ] **Step 1: Run typecheck and linting**

Run: `npm run lint`  
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run all unit tests**

Run: `npm test`  
Expected: 100% pass across all providers and utilities.

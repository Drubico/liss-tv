# Megadede StreamWish Host Detection, Dead CDN Filtering & Proxy Timeout Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Megadede correctly detects and prioritizes StreamWish embeds (including "Wish" and custom domains), enhances StreamWish extraction, filters out dead `radiantgroveproduction.cfd` mirrors in Vidhide, and optimizes proxy timeout to 5s.

**Architecture:** Strategy pattern adherence (`AGENTS.md`) where `strategies/megadede/get-url.operation.ts` uses comprehensive host matching (`wish`, `swish`, `hglink`, etc.), `strategies/megadede/extractors/streamwish.extractor.ts` supports both packed and unpacked sources, `strategies/megadede/extractors/vidhide.extractor.ts` ignores dead CDN hosts, and `app/api/video/m3u8/route.ts` uses a 5s connection timeout.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Node.js test runner (`node:test`).

**Spec:** [docs/superpowers/specs/2026-11-19-megadede-streamwish-and-dead-cdn-filter-design.md](file:///C:/Users/Usuario/Desktop/Work/liss-tv/docs/superpowers/specs/2026-11-19-megadede-streamwish-and-dead-cdn-filter-design.md)

## Global Constraints
- Conventional commits only (no "Co-Authored-By" or AI attribution).
- Strict TypeScript (`strict: true`, no `any`).
- No provider coupling in UI components.
- Preserve backward compatibility for existing providers.

## Review Focus
1. Server labeled as "Wish" or "Swish": must be prioritized at priority 2 (before Vidhide) and correctly routed to `extractStreamwishM3u8`.
2. Vidhide embed returning `radiantgroveproduction.cfd`: must discard this candidate and pick the clean mirror (e.g. `links.hls`, `links.hls4`, etc.).
3. StreamWish HTML without Dean Edwards packer: must extract `sources: [{ file: "..." }]` or direct streams without returning null.
4. Proxy manifest fetch timeout: must abort after 5000ms instead of 8000ms.

---

### Task 1: Dead CDN Filtering in Vidhide Extractor

**Files:**
- Modify: `strategies/megadede/extractors/vidhide.extractor.ts:32-60`
- Test: `tests/strategies/megadede/vidhide.extractor.test.ts`

**Interfaces:**
- Consumes: `extractM3u8FromUnpacked(unpacked, embedUrl)`
- Produces: `extractVidhideM3u8(embedUrl)` skipping known dead domains like `radiantgroveproduction.cfd`.

- [ ] **Step 1: Write failing test in `tests/strategies/megadede/vidhide.extractor.test.ts`**

```ts
test("extractVidhideM3u8 skips dead radiantgroveproduction.cfd domain and selects alternative clean mirror", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      var links = {
        hls3: "https://pfabiwmfmeza.radiantgroveproduction.cfd/hls3/master.txt",
        hls: "https://clean-mirror.example.com/hls/master.m3u8"
      };
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/testdead");
  assert.strictEqual(m3u8, "https://clean-mirror.example.com/hls/master.m3u8");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/vidhide.extractor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement dead CDN filter in `strategies/megadede/extractors/vidhide.extractor.ts`**

```ts
const DEAD_CDNS = ["radiantgroveproduction.cfd"];

function isDeadCdn(url: string): boolean {
  return DEAD_CDNS.some((d) => url.includes(d));
}
```
In `extractM3u8FromUnpacked`:
Check candidates in priority order (`links.hls`, `links.hls4`, `links.hls2`, `links.hls1`, `links.hls3`, etc.), returning the first candidate where `!isDeadCdn(candidate)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/vidhide.extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/megadede/extractors/vidhide.extractor.ts tests/strategies/megadede/vidhide.extractor.test.ts
git commit -m "fix(megadede): filter out dead radiantgroveproduction CDN mirrors in Vidhide"
```

---

### Task 2: Broaden StreamWish Host Detection & Enhance Extraction

**Files:**
- Modify: `strategies/megadede/get-url.operation.ts:70-120`
- Modify: `strategies/megadede/extractors/streamwish.extractor.ts:1-36`
- Test: `tests/strategies/megadede/get-url.test.ts`
- Test: `tests/strategies/megadede/streamwish.extractor.test.ts`

**Interfaces:**
- Consumes: `extractStreamwishM3u8(embedUrl)`
- Produces: `GetUrl.operation` recognizing "Wish", "Swish", `strwish.com`, etc., and prioritizing them ahead of Vidhide.

- [ ] **Step 1: Write failing test in `tests/strategies/megadede/get-url.test.ts` for "Wish" servername and custom domain**

```ts
test("GetUrl prioritizes server named 'Wish' with custom domain over Vidhide", async (t) => {
  // Mock dataLink containing { servername: "Wish", link: cipher("https://strwish.com/e/123") }
  // Assert result.url points to strwish stream and not vidhide
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `strategies/megadede/get-url.operation.ts` and `streamwish.extractor.ts`**

In `strategies/megadede/get-url.operation.ts`:
```ts
const isWish = (server: string, url: string): boolean => {
  const combined = (server + " " + url).toLowerCase();
  return (
    combined.includes("wish") ||
    combined.includes("swish") ||
    combined.includes("hglink")
  );
};
```
In `getServerPriority`:
Use `isWish(s, "")` to assign priority 2.
In embed loop:
Check `isWish(server, decryptedUrl)` to call `extractStreamwishM3u8(decryptedUrl)`.

In `strategies/megadede/extractors/streamwish.extractor.ts`:
Call `extractM3u8FromUnpacked(unpacked, embedUrl)` on packed code, and fallback to `extractM3u8FromUnpacked(html, embedUrl)` on raw HTML.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/strategies/megadede/get-url.test.ts tests/strategies/megadede/streamwish.extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add strategies/megadede/get-url.operation.ts strategies/megadede/extractors/streamwish.extractor.ts tests/strategies/megadede/get-url.test.ts tests/strategies/megadede/streamwish.extractor.test.ts
git commit -m "fix(megadede): broaden StreamWish server detection and enhance HTML extraction"
```

---

### Task 3: Optimize Manifest Fetch Timeout to 5000ms

**Files:**
- Modify: `app/api/video/m3u8/route.ts:94-142`
- Test: `tests/m3u8-route-headers.test.ts`

**Interfaces:**
- Produces: 5-second connection timeout on native fetch and got in `/api/video/m3u8`.

- [ ] **Step 1: Update timeout values in `app/api/video/m3u8/route.ts`**

Change `AbortSignal.timeout(8000)` to `AbortSignal.timeout(5000)` and `timeout: { request: 8000 }` to `timeout: { request: 5000 }`.

- [ ] **Step 2: Run tests to verify no regressions**

Run: `node --import ./tests/register.mjs --test tests/m3u8-rewrite.test.ts tests/m3u8-route-headers.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add app/api/video/m3u8/route.ts
git commit -m "perf(m3u8): reduce manifest fetch timeout to 5s for faster fallback response"
```

---

### Task 4: Integration Verification, Full Build & Main Push
- [ ] **Step 1: Run full test suite and build**
Run: `npm test && npm run build`
- [ ] **Step 2: Push changes to `origin/main`**
Run: `git push origin main`

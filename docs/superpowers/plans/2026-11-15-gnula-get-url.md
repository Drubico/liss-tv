# Gnula GetUrl Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `GetUrl` strategy operation for the `gnula` provider (`ww3.gnulahd.nu`), resolving direct M3U8 streams with fallback to embed iframes.

**Architecture:** Extraction of `_gnrdPid`, `_gnrdTok` and resolver tokens from HTML; querying `/wp-json/gnrd/v1/player` with simulated screen/device telemetry headers; Base64 + XOR unpacking (`[103, 78, 55, 100]`); and server resolution cascade (Vidara `/panel/vidara-resolve.php`, SaveFiles `/panel/savefiles-resolve.php`, The Tube `/panel/the-tube-resolve.php`) with embed fallback.

**Tech Stack:** TypeScript (strict), Node.js fetch, Cheerio, Node native test runner (`node:test`, `node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-11-15-gnula-get-url-design.md`

## Global Constraints

- Must implement `StrategyGetUrl` from `@/types/movie`.
- Must return `Promise<Url>` (`{ url: string, fallbackUrl?: string }`).
- Adhere strictly to `AGENTS.md`: No `any`, no UI modifications, mock all external network requests in unit tests.
- All code formatted to project standards, 0 TypeScript compile errors (`npx tsc --noEmit`), 0 lint errors.

## Review Focus

1. Content with missing or malformed XOR payload (`raw.p` is empty or corrupted): Should gracefully fail or throw domain `Error` without crashing.
2. Servers where Vidara or SaveFiles resolution returns HTTP 404/410/500: Must fallback to `server.src` or the next available server in the list.
3. Content without matching language (e.g., only "Castellano" or "Subtitulado" when "Latino" requested): Fall back to the first available language cleanly.
4. Episodes vs Movies: Both `/ver/<slug>/` and `/<slug>-<season>x<episode>/` paths must be handled without URL mangling.
5. Detail context reuse: When `options.detailContext` already contains `id` and `t`, avoid redundant HTML re-fetching if possible.

---

### Task 1: Implement `GetUrl` Operation with XOR Unpacker and Resolvers (TDD)

**Files:**
- Create: `strategies/gnula/get-url.operation.ts`
- Test: `tests/strategies/gnula/get-url.test.ts`

**Interfaces:**
- Consumes:
  - `gnulaFetch(endpoint: string, init?: RequestInit)` from `@/strategies/gnula/client`
  - `GetUrlOptions`, `StrategyGetUrl`, `Url` from `@/types/movie`
- Produces:
  - `export class GetUrl implements StrategyGetUrl` with method `operation(path: string, options?: GetUrlOptions): Promise<Url>`
  - Exported helper `gnrdUnpack(s: string): GnulaPlayerPayload | null` for standalone testing

- [ ] **Step 1: Write the failing test in `tests/strategies/gnula/get-url.test.ts`**

Cover XOR unpacking, Vidara resolution, SaveFiles resolution, and embed fallback.

```typescript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { GetUrl, gnrdUnpack } from "@/strategies/gnula/get-url.operation";

describe("Gnula GetUrl Operation", () => {
  it("unpacks obfuscated XOR payload correctly", () => {
    // Pack sample payload with k = [103, 78, 55, 100]
    const sample = JSON.stringify({
      langs: [{ label: "Latino", servers: [{ title: "Servidor 1", src: "https://vidaraa.cc/e/abc123" }] }],
    });
    const key = [103, 78, 55, 100];
    const encodedBytes = Buffer.from(sample, "utf-8").map((byte, i) => byte ^ key[i & 3]);
    const packed = Buffer.from(encodedBytes).toString("base64");

    const unpacked = gnrdUnpack(packed);
    assert.deepEqual(unpacked?.langs?.[0]?.servers?.[0]?.src, "https://vidaraa.cc/e/abc123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/strategies/gnula/get-url.test.ts`  
Expected: FAIL with module not found or export not defined.

- [ ] **Step 3: Implement `GetUrl` in `strategies/gnula/get-url.operation.ts`**

Include:
- `gnrdUnpack` helper using Buffer Base64 decoding and cyclic XOR with key `[103, 78, 55, 100]`.
- HTML parsing to extract `_gnrdPid`, `_gnrdTok`, and script tokens (`VD_AUTH`, `SF_AUTH`, `AUTH`).
- Fetch `/wp-json/gnrd/v1/player` with simulated screen and device telemetry headers (`X-Gn-Scr`, `X-Gn-Dev`, `Referer`).
- Resolver logic:
  - Vidara (`vidaraa.cc`, `vidara.to`): fetch `/panel/vidara-resolve.php?pl=1&code=...&host=...&t=...`.
  - SaveFiles (`savefiles.com`): fetch `/panel/savefiles-resolve.php?code=...&t=...` and extract `json.master`.
  - The Tube (`they.tube`): fetch `/panel/the-tube-resolve.php?code=...&t=...` and extract `json.master`.
  - Embed fallback: returns `server.src` if stream resolver fails.

- [ ] **Step 4: Add comprehensive tests in `tests/strategies/gnula/get-url.test.ts`**

Add tests for:
- Full movie `operation("/ver/street-fighter/")` resolving Vidara to `.m3u8`.
- Episode `operation("/the-last-of-us-2x01/")` resolving SaveFiles to `master.m3u8`.
- Fallback to raw embed URL when resolver fails.
- Error handling when player returns empty payload.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/strategies/gnula/get-url.test.ts`  
Expected: PASS all tests.

- [ ] **Step 6: Commit**

```bash
git add strategies/gnula/get-url.operation.ts tests/strategies/gnula/get-url.test.ts
git commit -m "feat(gnula): implement GetUrl strategy with XOR unpack and M3U8 resolver"
```

---

### Task 2: Connect `GetUrl` in `builder/gnula.build.ts`

**Files:**
- Modify: `builder/gnula.build.ts`
- Test: `tests/builder/gnula.build.test.ts`

**Interfaces:**
- Consumes: `GetUrl` from `@/strategies/gnula/get-url.operation`
- Produces: `GnulaMovieBuilder` creating `MovieContext` with real `GetUrl`

- [ ] **Step 1: Write/Update test for Gnula MovieBuilder**

Create/update `tests/builder/gnula.build.test.ts`:
Verify `gnulaBuilder.build().getUrl` invokes the real `GetUrl` strategy instead of throwing `"GetUrl not implemented yet"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/builder/gnula.build.test.ts`  
Expected: FAIL (or throws unimplemented error).

- [ ] **Step 3: Update `builder/gnula.build.ts`**

Import `GetUrl` from `@/strategies/gnula/get-url.operation` and replace the internal placeholder class.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/builder/gnula.build.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add builder/gnula.build.ts tests/builder/gnula.build.test.ts
git commit -m "feat(gnula): wire GetUrl operation into GnulaMovieBuilder"
```

---

### Task 3: Full Regression, Type Check and Lint Verification

**Files:**
- All modified and existing test suites

- [ ] **Step 1: Run full test suite**

Run: `npm test`  
Expected: All tests pass (0 failures).

- [ ] **Step 2: Run TypeScript compile verification**

Run: `npx tsc --noEmit`  
Expected: 0 errors.

- [ ] **Step 3: Run ESLint**

Run: `npm run lint`  
Expected: 0 errors/warnings.

- [ ] **Step 4: Commit any remaining adjustments**

```bash
git commit --allow-empty -m "chore(gnula): verify GetUrl integration and test suite"
```

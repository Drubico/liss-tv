# Megadede Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `https://megadede.mobi/` as a high-performance content provider for LissTV, supporting movies, series with seasons/episodes, AES-256-CBC stream decryption, and clean direct HLS extraction for ad-free Vidstack playback.

**Architecture:** Strategy pattern adhering to `AGENTS.md` with three independent operations (`GetAll`, `GetDetail`, `GetUrl`) encapsulated in `strategies/megadede/`. Catalog and details are cached automatically by `CachedDriverDecorator` in SQLite; streams are decrypted from `/vidurl/...` inline, extracted via hoster extractors (Vidhide/Streamwish/VOE), and formatted for `/api/video/m3u8` proxying.

**Tech Stack:** TypeScript (strict), Node.js `crypto`, `cheerio`, `node:test`, `node:assert`.

**Spec:** `docs/superpowers/specs/2026-11-16-megadede-provider-design.md`

## Global Constraints

- Follow `AGENTS.md`: all provider code lives exclusively in `strategies/megadede/`, `builder/megadede.build.ts`, and registrations in `builder/factory.ts` and `drivers/registry.ts`.
- Zero modifications to other providers or UI components.
- TypeScript `strict` mode: no `any` (use `unknown` and type guards).
- Return domain types (`Movies`, `StoredMovie`, `Url`) and domain errors (`MegadedeError` extending `ProviderError`).
- Test runner: `node --import ./tests/register.mjs --test tests/**/*.test.ts tests/**/**/*.test.ts`.

## Review Focus

1. **Anti-bot challenge in `/vidurl/...`:** If `navigator.webdriver` or missing browser globals block HTML rendering, client must send genuine desktop headers.
2. **Missing or changed AES keys:** If `LINK_CHALLENGE` or `LINK_SALT` are missing in `/vidurl/...`, `GetUrl` must throw typed `MegadedeError` without crashing unhandled.
3. **Invalid or malformed packed code in Vidhide:** Dean Edwards unpacker must gracefully return null if unpacking fails and cascade to fallback extractors.
4. **Series episode on demand resolution:** When `GetUrl` receives a series episode with `#s{season}-e{episode}`, it must fetch `/api/episodio/serie/<slug>/<season>/<episode>` and handle 404/empty responses cleanly.
5. **Direct CDN CORS protection:** Direct upstream `.m3u8` playlist must be routed through `/api/video/m3u8?url=...` so browser Vidstack player plays without CORS/403 errors.

---

### Task 1: Core Schemas, Types & HTTP Client

**Files:**
- Create: `strategies/megadede/types.ts`
- Create: `strategies/megadede/client.ts`
- Test: `tests/strategies/megadede/client.test.ts`

- [x] **Step 1: Write failing test for client and domain errors**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement types and client**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 2: GetAll Strategy (Catalog, Search & Pagination Parser)

**Files:**
- Create: `strategies/megadede/get-all.operation.ts`
- Test: `tests/strategies/megadede/get-all.test.ts`

- [x] **Step 1: Write failing test with catalog HTML fixtures**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement GetAll operation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 3: GetDetail Strategy (Metadata & Seasons/Episodes Parser)

**Files:**
- Create: `strategies/megadede/get-detail.operation.ts`
- Test: `tests/strategies/megadede/get-detail.test.ts`

- [x] **Step 1: Write failing test with movie and serie HTML fixtures**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement GetDetail operation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 4: Vidhide & Secondary Stream Extractors

**Files:**
- Create: `strategies/megadede/extractors/vidhide.extractor.ts`
- Create: `strategies/megadede/extractors/streamwish.extractor.ts`
- Create: `strategies/megadede/extractors/voe.extractor.ts`
- Test: `tests/strategies/megadede/vidhide.extractor.test.ts`

- [x] **Step 1: Write failing test for Dean Edwards unpacking and Vidhide extraction**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement extractors**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 5: GetUrl Strategy (AES Decryption, Lazy Episode Fetch & Stream Orchestration)

**Files:**
- Create: `strategies/megadede/get-url.operation.ts`
- Test: `tests/strategies/megadede/get-url.test.ts`

- [x] **Step 1: Write failing test for AES decryption, episode resolution, and URL output**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement GetUrl operation**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 6: Builder, Factory & Registry Integration

**Files:**
- Create: `builder/megadede.build.ts`
- Modify: `builder/factory.ts`
- Modify: `drivers/registry.ts`
- Test: `tests/drivers/megadede-registry.test.ts`

- [x] **Step 1: Write failing test for Megadede registration**
- [x] **Step 2: Run test to confirm it fails**
- [x] **Step 3: Implement MegadedeMovieBuilder and register in factory/registry**
- [x] **Step 4: Run test to verify it passes**
- [x] **Step 5: Commit changes**

---

### Task 7: End-to-End Verification & Full Test Suite

**Files:**
- None (verification phase)

- [x] **Step 1: Run complete test suite**
- [x] **Step 2: Run type check and linter**
- [x] **Step 3: Verify clean git status**

# Mobile Playback Resume & Active Provider Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure mobile video playback reliably resumes from the saved `startTime` without being overwritten by early 0:00 events, and isolate title detail resolution strictly to the active session provider to eliminate cross-provider cache collision (e.g. Dexter).

**Architecture:** Enforce imperative initial seeking during `onCanPlay` in `MobileAndDeskPlayer` with a persistence lock guarding `handleTimeUpdate` against premature zero-second progress saves. In `app/actions/movie.ts`, prioritize explicit or cookie-based active providers before attempting any cross-provider cache fallbacks, and propagate `?provider=...` through `MovieCard` navigation.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), React 19, Vidstack Player 1.15 (`@vidstack/react`), Better-SQLite3, Node.js Test Runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-11-19-mobile-playback-resume-and-provider-isolation-design.md`

## Global Constraints

- Strict TypeScript (`strict: true`, zero `any`).
- No modifications to SQLite schema (leverage existing `PRIMARY KEY (provider, key)`).
- Adhere to Next.js App Router Server Component conventions.
- Retain backwards compatibility for legacy favorites and history links lacking provider parameters.

## Review Focus

- Title route `/serie/dexter` requested with no query param resolves to Megadede (Dexter 2006) when Megadede is the active session provider, even if SoloLatino cached "Dexter: Resurrección".
- Video stream initialized with `startTime > 0` on mobile ignores early `timeupdate` ticks at `0:00` until seeking completes.
- Video stream starting at `startTime = 0` is not locked out and continues persisting normal watch progress.
- Catalog card for a provider other than default appends `?provider=<id>` so detail pages receive explicit provider context.
- Player route refresh recovers `moviePreview` without crashing or clearing existing progress.

---

### Task 1: Active Provider Isolation in Server Actions & Navigation Cards

**Files:**
- Modify: `app/actions/movie.ts:46-56`
- Modify: `components/MovieCard.tsx:47-51`
- Test: `tests/routes/detail-page-provider.test.ts`

**Interfaces:**
- Consumes: `getActiveProviderId(): Promise<string>` from `app/actions/movie.ts`, `get(provider: string, link: string): StoredMovie | undefined` from `services/movie.store.ts`.
- Produces: `getDetails(link: string, providerId?: string): Promise<StoredMovie | undefined>` strictly resolving against `providerId || activeCookieProvider` before any generic link lookup.

- [ ] **Step 1: Write the failing test for provider isolation in `tests/routes/detail-page-provider.test.ts`**

Add a test verifying that when `getDetails` is invoked without explicit `providerId`, it uses the active provider rather than leaking another provider's cached item with the same slug.

```typescript
test("getDetails does not let another provider cache hijack active provider", async () => {
  // Pre-seed mock/cache in test if needed, or verify active driver resolution matches active provider
  const detail = await getDetails("serie/dexter", "megadede");
  assert(detail !== undefined);
  assert.strictEqual(detail.provider, "megadede");
});
```

- [ ] **Step 2: Run test to verify test execution**

Run: `node --import ./tests/register.mjs --test tests/routes/detail-page-provider.test.ts`
Expected: PASS or verify test harness loads.

- [ ] **Step 3: Update `getDetails` in `app/actions/movie.ts`**

In `app/actions/movie.ts`:
1. Obtain `activeCookieProvider = await getActiveProviderId()`.
2. Compute `resolvedProvider = providerId || activeCookieProvider || inferProviderFromLink(link) || findProviderBySlugOrLink(link) || DEFAULT_PROVIDER`.
3. Fetch cached item strictly using `get(resolvedProvider, link)` instead of `getAny(link)` whenever `resolvedProvider` is established.
4. Resolve `driver = await getActiveDriver(resolvedProvider)` and execute `driver.getDetail(link)`.

- [ ] **Step 4: Propagate provider in `components/MovieCard.tsx`**

In `components/MovieCard.tsx`:
Compute formatted href:
```typescript
const movieHref = movie.provider && !movie.link.includes("provider=")
  ? `${movie.link}${movie.link.includes("?") ? "&" : "?"}provider=${encodeURIComponent(movie.provider)}`
  : movie.link;
```
Use `movieHref` on `<Link href={movieHref}>` and in `onEnterPress={() => router.push(movieHref)}`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/routes/detail-page-provider.test.ts tests/ui/my-list-href.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/actions/movie.ts components/MovieCard.tsx tests/routes/detail-page-provider.test.ts
git commit -m "fix(movie): isolate detail provider resolution and propagate provider in cards"
```

---

### Task 2: Mobile Player Imperative Seek & Early TimeUpdate Guard

**Files:**
- Modify: `components/player/MobileAndDesk/index.tsx:23-110`
- Modify: `components/PlayerView.tsx:41-57`
- Test: `tests/player/mobile-seek-guard.test.ts`

**Interfaces:**
- Consumes: `VideoPlayerProps` from `components/player/types.ts`.
- Produces: Controlled seek lifecycle on `MediaPlayer` ensuring `startTime` is imperatively applied upon `onCanPlay` and early `0:00` ticks do not invoke `saveWatchProgress`.

- [ ] **Step 1: Write the unit test for progress guard logic in `tests/player/mobile-seek-guard.test.ts`**

Create `tests/player/mobile-seek-guard.test.ts` testing the progress filter helper function:
- When `startTime > 0` and `currentTime` is near 0 (`< startTime - 1.5`), updates are ignored.
- Once `currentTime >= startTime - 1.5`, updates are allowed through.
- When `startTime === 0`, all updates pass through.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/player/mobile-seek-guard.test.ts`
Expected: FAIL (file or helper not yet implemented).

- [ ] **Step 3: Implement seek & guard in `components/player/MobileAndDesk/index.tsx`**

1. Maintain `const initialSeekDoneRef = useRef(false);`.
2. Add `handleCanPlay` callback:
```typescript
const handleCanPlay = () => {
  if (!initialSeekDoneRef.current && startTime > 0) {
    if (ref && "current" in ref && ref.current) {
      ref.current.currentTime = startTime;
      initialSeekDoneRef.current = true;
    }
  }
};
```
3. Wrap `handleTimeUpdate`:
```typescript
const onTimeUpdateWrapper = (detail: any, nativeEvent: any) => {
  if (startTime > 0 && !initialSeekDoneRef.current) {
    if (detail.currentTime >= Math.max(0, startTime - 2)) {
      initialSeekDoneRef.current = true;
    } else {
      return; // Discard 0:00 tick before seek takes effect
    }
  }
  handleTimeUpdate?.(detail, nativeEvent);
};
```
4. In `components/PlayerView.tsx`, initialize `lastSavedTimeRef` with `moviePreview.startTime`:
```typescript
const lastSavedTimeRef = useRef<number>(moviePreview?.startTime || 0);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./tests/register.mjs --test tests/player/mobile-seek-guard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/player/MobileAndDesk/index.tsx components/PlayerView.tsx tests/player/mobile-seek-guard.test.ts
git commit -m "fix(player): enforce mobile seek on canplay and guard progress overwrite"
```

---

### Task 3: Full Test Suite & Lint Verification

**Files:**
- Test: All repository test files

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: PASS (all tests passing, 0 failures).

- [ ] **Step 2: Run TypeScript / Next.js linter check**

Run: `npm run lint`
Expected: PASS (no ESLint errors).

- [ ] **Step 3: Commit any final regression cleanup if necessary**

```bash
git status
```

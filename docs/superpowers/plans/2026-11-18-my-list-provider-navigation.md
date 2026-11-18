# Provider-Scoped Navigation from My List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure that movies and series saved to "My List" remember their provider and propagate it via query parameters during navigation, resolving details and playback against the original provider without mutating the global session provider cookie.

**Architecture:** Extend `FavoriteItem` to persist `provider`. Forward `provider` from `HeroBackdrop` into `FavoriteButton`. In `app/my-list/page.tsx`, format card links with `?provider=${encodeURIComponent(item.provider)}`. In `app/pelicula/[slug]/page.tsx` and `app/serie/[slug]/page.tsx`, resolve `searchParams.provider` asynchronously and pass it to `getDetails(link, provider)`.

**Tech Stack:** Next.js 15+ App Router, React 19, TypeScript (strict), Zustand with local storage persistence.

**Spec:** `docs/superpowers/specs/2026-11-18-my-list-provider-navigation-design.md`

## Global Constraints
- Strict TypeScript (`strict: true`, zero `any`).
- Follow Next.js App Router Server Component conventions: `searchParams` is an async Promise in Next.js 15+.
- Backward compatibility: existing favorites without `provider` must continue to load gracefully.
- Commits must follow conventional commits without AI attribution.

## Review Focus
- A favorite item without a `provider` property navigates without query params and falls back gracefully to default resolution.
- Special characters in `provider` are safely URL-encoded (`encodeURIComponent`).
- Existing query parameters in `item.link` are preserved correctly when appending `provider`.
- `HeroBackdrop` passes `provider` correctly to `FavoriteButton`.
- Both `/pelicula/[slug]` and `/serie/[slug]` pass the resolved `provider` into `getDetails`.

---

### Task 1: Extend `FavoriteItem` with `provider` and wire in `HeroBackdrop`

**Files:**
- Modify: `store/useFavoritesStore.ts:5-17`
- Modify: `components/detail/HeroBackdrop.tsx:191-205`
- Test: `tests/store/favorites-provider.test.ts`

**Interfaces:**
- Consumes: `HeroBackdropProps.provider?: string`
- Produces: `FavoriteItem.provider?: string` in `useFavoritesStore`

- [ ] **Step 1: Write the unit test for `FavoriteItem` with `provider`**

Create `tests/store/favorites-provider.test.ts`:
```typescript
import test from "node:test";
import assert from "node:assert";
import { useFavoritesStore, FavoriteItem } from "../../store/useFavoritesStore.ts";

test("useFavoritesStore retains provider property on favorite items", async () => {
  const store = useFavoritesStore.getState();
  const sampleItem: FavoriteItem = {
    link: "serie/breaking-bad",
    title: "Breaking Bad",
    image: "https://image.tmdb.org/t/p/w500/bb.jpg",
    provider: "seriesmetro",
    type: "serie",
  };

  await store.addFavorite(sampleItem);
  assert(store.isFavorite("serie/breaking-bad"));

  const saved = store.favorites.find((f) => f.link === "serie/breaking-bad");
  assert(saved !== undefined);
  assert.strictEqual(saved.provider, "seriesmetro");

  // Cleanup
  await store.removeFavorite("serie/breaking-bad");
});
```

- [ ] **Step 2: Run test to verify it passes or fails**

Run: `node --import ./tests/register.mjs --test tests/store/favorites-provider.test.ts`
Expected: Passes once `FavoriteItem` type supports `provider`.

- [ ] **Step 3: Update `store/useFavoritesStore.ts` and `components/detail/HeroBackdrop.tsx`**

In `store/useFavoritesStore.ts`:
Add `provider?: string;` to `FavoriteItem` interface.

In `components/detail/HeroBackdrop.tsx`:
Add `provider,` to the `item` prop passed to `FavoriteButton` around line 192.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/store/favorites-provider.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add store/useFavoritesStore.ts components/detail/HeroBackdrop.tsx tests/store/favorites-provider.test.ts
git commit -m "feat(favorites): persist provider in favorite items and pass from HeroBackdrop"
```

---

### Task 2: Propagate `provider` query parameter in `app/my-list/page.tsx`

**Files:**
- Modify: `app/my-list/page.tsx:25-41`
- Test: `tests/ui/my-list-href.test.ts`

**Interfaces:**
- Consumes: `FavoriteItem.provider?: string`, `FavoriteItem.link: string`
- Produces: `formatFavoriteHref(item: FavoriteItem): string`

- [ ] **Step 1: Write unit test for `formatFavoriteHref`**

Create `tests/ui/my-list-href.test.ts`:
```typescript
import test from "node:test";
import assert from "node:assert";
import { formatFavoriteHref } from "../../app/my-list/page.tsx";

test("formatFavoriteHref appends provider query parameter when present", () => {
  const itemWithProvider = {
    link: "serie/breaking-bad",
    title: "Breaking Bad",
    image: "https://example.com/img.jpg",
    provider: "seriesmetro",
  };
  assert.strictEqual(
    formatFavoriteHref(itemWithProvider),
    "/serie/breaking-bad?provider=seriesmetro"
  );
});

test("formatFavoriteHref preserves existing query params when appending provider", () => {
  const itemWithQuery = {
    link: "/pelicula/scream?lang=lat",
    title: "Scream",
    image: "https://example.com/img.jpg",
    provider: "megadede",
  };
  assert.strictEqual(
    formatFavoriteHref(itemWithQuery),
    "/pelicula/scream?lang=lat&provider=megadede"
  );
});

test("formatFavoriteHref returns clean link when provider is absent", () => {
  const legacyItem = {
    link: "pelicula/scream-3",
    title: "Scream 3",
    image: "https://example.com/img.jpg",
  };
  assert.strictEqual(formatFavoriteHref(legacyItem), "/pelicula/scream-3");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/ui/my-list-href.test.ts`
Expected: FAIL (formatFavoriteHref is not exported/defined)

- [ ] **Step 3: Implement `formatFavoriteHref` and use in `FavoriteCard`**

In `app/my-list/page.tsx`:
Export helper function:
```typescript
export function formatFavoriteHref(item: FavoriteItem): string {
  const baseHref = item.link.startsWith("/") ? item.link : `/${item.link}`;
  if (!item.provider) return baseHref;
  const separator = baseHref.includes("?") ? "&" : "?";
  return `${baseHref}${separator}provider=${encodeURIComponent(item.provider)}`;
}
```
In `FavoriteCard`: replace `const href = item.link.startsWith("/") ? item.link : `/${item.link}`;` with `const href = formatFavoriteHref(item);`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/ui/my-list-href.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/my-list/page.tsx tests/ui/my-list-href.test.ts
git commit -m "feat(my-list): append provider query parameter when opening favorites"
```

---

### Task 3: Read `searchParams.provider` in detail pages (`pelicula` and `serie`)

**Files:**
- Modify: `app/pelicula/[slug]/page.tsx:6-14`
- Modify: `app/serie/[slug]/page.tsx:7-15`
- Test: `tests/routes/detail-page-provider.test.ts`

**Interfaces:**
- Consumes: Next.js 15 `searchParams: Promise<{ provider?: string }>`
- Produces: Calls `getDetails(link, provider)` with resolved provider

- [ ] **Step 1: Write test verifying `getDetails` accepts provider parameter**

Create `tests/routes/detail-page-provider.test.ts`:
```typescript
import test from "node:test";
import assert from "node:assert";
import { getDetails } from "../../app/actions/movie.ts";

test("getDetails forwards explicit providerId to driver resolution", async () => {
  // Verifies that passing an explicit provider does not throw and resolves through that driver
  const detail = await getDetails("pelicula/scream-3-la-mascara-de-la-muerte", "seriesmetro");
  assert(detail !== undefined);
  assert.strictEqual(detail.provider, "seriesmetro");
});
```

- [ ] **Step 2: Run test to verify current behavior**

Run: `node --import ./tests/register.mjs --test tests/routes/detail-page-provider.test.ts`
Expected: PASS (getDetails already accepts providerId)

- [ ] **Step 3: Update `app/pelicula/[slug]/page.tsx` and `app/serie/[slug]/page.tsx`**

In `app/pelicula/[slug]/page.tsx`:
```typescript
export default async function MovieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ provider?: string }>;
}) {
  const { slug } = await params;
  const { provider } = (await searchParams) || {};
  const movie = await getDetails(`pelicula/${slug}`, provider);
...
```

In `app/serie/[slug]/page.tsx`:
```typescript
export default async function SerieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ provider?: string }>;
}) {
  const { slug } = await params;
  const { provider } = (await searchParams) || {};
  const movie = await getDetails(`serie/${slug}`, provider);
...
```

- [ ] **Step 4: Run full verification suite**

Run:
1. `npm test`
2. `npx eslint app/pelicula/[slug]/page.tsx app/serie/[slug]/page.tsx app/my-list/page.tsx`
3. `npx tsc --noEmit`
Expected: All tests pass, lint is clean, TypeScript compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add app/pelicula/[slug]/page.tsx app/serie/[slug]/page.tsx tests/routes/detail-page-provider.test.ts
git commit -m "feat(detail): consume searchParams.provider in movie and serie detail pages"
```

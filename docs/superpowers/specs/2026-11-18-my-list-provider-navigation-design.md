# Design: Provider-Scoped Navigation from My List

## Intent & The Why
When users add movies or series to "My List" (`app/my-list`), the saved items currently lack provider metadata. Consequently, navigating to a title from "My List" defaults to whichever provider is globally active in the session cookie, rather than the provider from which the title was originally saved. This can cause missing detail pages, mismatched seasons/episodes, or playback failures if the active provider does not index the title or uses a different slug schema.

Capturing the `provider` in favorites and propagating it through route query parameters ensures that opening any item from "My List" resolves against the exact driver that indexed it, while keeping the user's global session provider cookie intact.

## Goals
1. Persist `provider` in `FavoriteItem` within `useFavoritesStore` (local storage and PocketBase sync).
2. Pass `provider` to `FavoriteButton` in `components/detail/HeroBackdrop.tsx`.
3. In `app/my-list/page.tsx`, append `?provider=${item.provider}` to title links when `item.provider` is defined.
4. Update Server Component detail pages (`app/pelicula/[slug]/page.tsx` and `app/serie/[slug]/page.tsx`) to accept Next.js 15+ async `searchParams`, passing `provider` to `getDetails(link, provider)`.
5. Maintain backward compatibility for legacy saved items that lack a `provider` property (falling back to database cache, link inference, or the active session provider).
6. Ensure playback navigation (`WatchButton`, `EpisodeWatchButton`) maintains provider continuity through route parameters or context.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Changing the global session provider cookie (`liss_provider`) when clicking a favorite.
  - Modifying provider strategy scrapers or registry implementations.
- **Anti-Goals:**
  - Converting Next.js Server Component detail pages into Client Components.
  - Adding global ephemeral Zustand states that could cause hydration or SSR mismatch.

## Constraints
- Strict TypeScript (`strict: true`, zero `any`).
- Follow Next.js App Router Server Component conventions: `searchParams` is an async Promise in Next.js 15+.
- Backward compatibility: existing favorites without `provider` must continue to load gracefully without throwing.

## Approaches Considered

### Approach 1: Query Parameter Propagation (Selected)
- **Description:** Append `?provider=${provider}` to the detail page URL when navigating from `my-list`. Read `searchParams.provider` in Server Components and forward it to `getDetails(link, provider)`.
- **Trade-offs:** Deep-linkable, works seamlessly with SSR, does not mutate global session cookies, completely stateless.
- **Why chosen:** Cleanest architecture for Next.js App Router and aligns 100% with the user's requirement to scope the provider strictly to the navigation.

### Approach 2: Ephemeral Client-Side Zustand State (Rejected)
- **Description:** Store the provider in Zustand before router navigation and read it in the target page.
- **Why rejected:** Detail pages are React Server Components that fetch data on the server before client hydration; client state cannot be read during server-side data fetching without complex workarounds.

## Detailed Specifications

### 1. `store/useFavoritesStore.ts`
- Extend `FavoriteItem`:
  ```typescript
  export interface FavoriteItem {
    link: string;
    title: string;
    image: string;
    rating?: string;
    year?: string;
    backgroundImage?: string;
    duration?: string;
    caption?: string;
    tags?: string[];
    type?: "movie" | "serie";
    provider?: string;
  }
  ```

### 2. `components/detail/HeroBackdrop.tsx`
- In `HeroBackdropProps`, `provider?: string` is already passed.
- Forward `provider` into `FavoriteButton`:
  ```typescript
  <FavoriteButton
    item={{
      link,
      title: cleanTitle,
      image: posterSrc,
      backgroundImage: backdropSrc,
      rating: cleanRating,
      year: cleanYear,
      duration,
      caption,
      tags,
      type: isSerie ? "serie" : "movie",
      provider,
    }}
  />
  ```

### 3. `app/my-list/page.tsx`
- In `FavoriteCard`:
  ```typescript
  const baseHref = item.link.startsWith("/") ? item.link : `/${item.link}`;
  const href = item.provider
    ? `${baseHref}${baseHref.includes("?") ? "&" : "?"}provider=${encodeURIComponent(item.provider)}`
    : baseHref;
  ```

### 4. Detail Pages (`app/pelicula/[slug]/page.tsx` & `app/serie/[slug]/page.tsx`)
- Update signature to resolve async `searchParams`:
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
  }
  ```
- Same pattern for `SerieDetailPage` with `serie/${slug}`.

## Verification & Testing Plan
1. **Unit Tests:**
   - Add unit tests verifying `useFavoritesStore` handles `provider` in `FavoriteItem`.
   - Add tests verifying detail pages / `getDetails` resolution with explicit provider.
2. **Automated Verification:**
   - Run `npm test` to ensure existing 114 tests remain green.
   - Run `npx eslint` on modified files.
   - Run `npx tsc --noEmit` to verify type safety.

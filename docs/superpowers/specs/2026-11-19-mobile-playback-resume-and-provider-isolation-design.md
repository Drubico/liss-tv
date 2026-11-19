# Design: Mobile Playback Resume & Active Provider Isolation

## Intent & The Why
1. **Mobile Playback Resume**: On mobile browsers (Safari iOS and Chrome Android), users clicking "Continuar viendo" often find the video restarts from 0:00 instead of their saved timestamp (`startTime`). This happens because mobile media elements discard initial seek assignments made prior to `loadedmetadata`/`canplay`, and early `timeupdate` events subsequently overwrite the user's progress with 0:00.
2. **Provider Isolation**: When navigating to a title (e.g. Dexter) from search or catalog cards, missing `provider` route context causes server actions (`getDetails`) to fall back to an unconstrained database cache search (`getAny`). This allows cached entries from other providers (e.g. SoloLatino's "Dexter: Resurrección") to hijack the resolution and driver execution away from the user's active session provider (Megadede's Dexter 2006).

## Goals
1. Guarantee that video playback on mobile devices seeks accurately to `startTime` before unblocking progress persistence.
2. Prevent `onTimeUpdate` from overriding saved progress with 0:00 while the player is loading or buffering.
3. Ensure server-side detail fetching (`getDetails`) respects the user's active session provider cookie (`getActiveProviderId()`) before falling back to cross-provider cache lookups.
4. Propagate `?provider=${movie.provider}` on catalog and search cards (`MovieCard`) to preserve explicit provider affinity during navigation.

## Non-Goals & Anti-Goals
- **Non-Goals:**
  - Changing the underlying SQLite schema (`movie_cache` already uses `PRIMARY KEY (provider, key)`).
  - Modifying provider video stream extractors or external APIs.
- **Anti-Goals:**
  - Polling timers or arbitrary timeouts for media ready states.
  - Allowing cache lookups to supersede explicit or active session providers.

## Constraints
- Strict TypeScript (`strict: true`, zero `any`).
- Next.js App Router Server Component conventions.
- Vidstack media player lifecycle compliance on mobile platforms.
- Compatibility with Desktop, Mobile, and SmartTV players.

## Approaches Considered

### 1. Mobile Playback Resume
- **Approach 1 (Selected): Event-Driven Seek (`onCanPlay`) with Persistence Lock**
  - Track initial seek completion with a ref (`hasSeekedInitialRef`).
  - Upon `onCanPlay` on `MobileAndDeskPlayer`, if `startTime > 0`, imperatively assign `playerRef.current.currentTime = startTime`.
  - Guard `saveWatchProgress` / `handleTimeUpdate` so that progress saving is skipped until the player confirms initial seek completion (or `currentTime >= startTime - 1`).
  - *Trade-off:* Clean, native event-driven lifecycle that avoids timer drift and race conditions.
- **Approach 2 (Rejected): Timer Polling (`setInterval`)**
  - Repeatedly check `readyState >= 1` every 150ms and assign `currentTime`.
  - *Why rejected:* Flaky, race-prone on slower mobile devices, can cause visual stutter.

### 2. Active Provider Resolution
- **Approach 1 (Selected): Cookie-First Resolution & Card Provider Propagation**
  - In `app/actions/movie.ts`, resolve provider in strict order:
    1. Explicit `providerId` argument.
    2. Active session provider from cookie (`getActiveProviderId()`).
    3. Link heuristic inference (`inferProviderFromLink`).
    4. Only as a last resort, slug cache match (`findProviderBySlugOrLink`).
  - In `components/MovieCard.tsx`, append `?provider=${movie.provider}` when linking to title pages.
  - *Trade-off:* 100% deterministic; completely stops cross-provider cache collision.
- **Approach 2 (Rejected): Clear SQLite Cache on Provider Switch**
  - Purge database rows when switching providers.
  - *Why rejected:* Wasteful, destroys cached catalogs and increases latency.

## Detailed Specifications

### 1. Mobile Player Seek & Guard (`components/player/MobileAndDesk/index.tsx`)
- Accept `playerRef` and forward it to `<MediaPlayer ref={playerRef}>`.
- Add state or ref: `const initialSeekDoneRef = useRef(false);`.
- Add `onCanPlay` handler:
  ```typescript
  const handleCanPlay = () => {
    if (!initialSeekDoneRef.current && startTime > 0 && ref && "current" in ref && ref.current) {
      ref.current.currentTime = startTime;
      initialSeekDoneRef.current = true;
    }
  };
  ```
- Wrap `handleTimeUpdate`:
  ```typescript
  const onTimeUpdateWrapper = (detail: MediaTimeUpdateEventDetail, nativeEvent: MediaTimeUpdateEvent) => {
    if (startTime > 0 && !initialSeekDoneRef.current) {
      if (detail.currentTime >= startTime - 1.5) {
        initialSeekDoneRef.current = true;
      } else {
        // Discard 0:00 tick during initial buffering
        return;
      }
    }
    handleTimeUpdate?.(detail, nativeEvent);
  };
  ```
- Bind `onCanPlay={handleCanPlay}` and `onTimeUpdate={onTimeUpdateWrapper}` on `<MediaPlayer>`.

### 2. Provider Resolution Order (`app/actions/movie.ts`)
- In `getDetails(link: string, providerId?: string)`:
  ```typescript
  export async function getDetails(link: string, providerId?: string) {
    const activeCookieProvider = await getActiveProviderId();
    const resolvedProvider =
      providerId ||
      activeCookieProvider ||
      inferProviderFromLink(link) ||
      findProviderBySlugOrLink(link);

    const stored = get(resolvedProvider, link);
    const driver = await getActiveDriver(resolvedProvider);
    return await driver.getDetail(link);
  }
  ```
- Do not call `getAny(link)` as the primary resolution fallback because it violates provider isolation by querying without `WHERE provider = ?`.

### 3. Navigation Links (`components/MovieCard.tsx`)
- Ensure detail links include provider parameter:
  ```typescript
  const movieHref = movie.provider && !movie.link.includes("provider=")
    ? `${movie.link}${movie.link.includes("?") ? "&" : "?"}provider=${movie.provider}`
    : movie.link;
  ```
- Use `movieHref` for `<Link href={movieHref}>` and router navigation.

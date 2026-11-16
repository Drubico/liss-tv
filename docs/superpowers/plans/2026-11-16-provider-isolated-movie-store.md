# Provider-Isolated Movie Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `services/movie.store.ts` and its consumers to isolate SQLite persistence by provider using a composite primary key `(provider, key)` and prevent saving empty or corrupt movie/series details.

**Architecture:** SQLite database refactoring with composite primary key `(provider, key)` and an index on `provider`. Automatic schema migration for existing SQLite databases. Data validation guard rejecting empty media payloads. Scoped caching in `CachedDriverDecorator` and explicit provider isolation across strategies and actions.

**Tech Stack:** TypeScript, Next.js, better-sqlite3, Node.js native test runner (`node:test`, `node:assert`).

**Spec:** `docs/superpowers/specs/2026-11-16-provider-isolated-movie-store-design.md`

## Global Constraints
- Strict adherence to `AGENTS.md`: clean code, SOLID, strict TypeScript without `any`, early returns.
- Backward compatibility for existing databases via automatic SQLite schema migration on initialization.
- Never persist empty or corrupt media details (`!data.title || data.title.trim() === ""`).
- All 56 existing test suites must continue passing with zero regressions.

## Review Focus
1. Attempting to upsert an item with empty `title` (`""` or whitespace-only): must be rejected and not persisted to SQLite.
2. Saving the same link (`/pelicula/iron-man`) under two distinct providers (`gnula`, `sololatino`): must remain strictly isolated without cross-overwriting.
3. Querying an existing link under the wrong provider: must return `undefined`, preventing cache pollution when switching providers.
4. Automatic migration on legacy `movie_cache` tables lacking the `provider` column: must preserve valid data and drop corrupted records.
5. Legacy resolution fallback: `getAny(link)` must safely return the first matching valid cached record across any provider.

---

### Task 1: SQLite Schema & Automatic Migration in `services/movie.store.ts`

**Files:**
- Modify: `services/movie.store.ts:60-76`
- Create: `tests/services/movie-store-migration.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3` database instance.
- Produces: `ensureSchemaAndMigrate(db: DatabaseType): void` ensuring `movie_cache` has `(provider TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(provider, key))` and index `idx_movie_cache_provider`.

- [ ] **Step 1: Write the failing migration test**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchemaAndMigrate } from "@/services/movie.store";

test("ensureSchemaAndMigrate creates composite primary key table and migrates legacy rows", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE movie_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO movie_cache VALUES ('/pelicula/iron-man', '{"title":"Iron Man","provider":"gnula"}', '2026-01-01');
    INSERT INTO movie_cache VALUES ('/pelicula/legacy', '{"title":"Legacy Movie"}', '2026-01-01');
    INSERT INTO movie_cache VALUES ('/pelicula/empty', '{"title":""}', '2026-01-01');
  `);

  ensureSchemaAndMigrate(db);

  const columns = db.pragma("table_info(movie_cache)") as { name: string; pk: number }[];
  const providerCol = columns.find((c) => c.name === "provider");
  const keyCol = columns.find((c) => c.name === "key");
  assert.ok(providerCol && providerCol.pk > 0, "provider should be part of PK");
  assert.ok(keyCol && keyCol.pk > 0, "key should be part of PK");

  const rows = db.prepare("SELECT provider, key, data FROM movie_cache").all() as { provider: string; key: string }[];
  assert.equal(rows.length, 2, "empty items should be purged during migration");
  assert.ok(rows.some((r) => r.provider === "gnula" && r.key === "/pelicula/iron-man"));
  assert.ok(rows.some((r) => r.provider === "sololatino" && r.key === "/pelicula/legacy"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/services/movie-store-migration.test.ts`  
Expected: FAIL with "ensureSchemaAndMigrate is not defined" or schema assertion failure.

- [ ] **Step 3: Implement `ensureSchemaAndMigrate` in `services/movie.store.ts`**

Implement migration checking `PRAGMA table_info(movie_cache)`. If `provider` column is absent, create `movie_cache_v2` with `(provider, key, data, updated_at, PRIMARY KEY(provider, key))`, migrate valid rows extracting provider or falling back to `'sololatino'`, drop old table, and rename `movie_cache_v2` to `movie_cache`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/services/movie-store-migration.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/movie.store.ts tests/services/movie-store-migration.test.ts
git commit -m "feat(store): add sqlite schema migration for provider composite key"
```

---

### Task 2: Provider-Scoped Store Operations & Anti-Garbage Guard

**Files:**
- Modify: `services/movie.store.ts:78-163`
- Create: `tests/services/movie-store-operations.test.ts`

**Interfaces:**
- Consumes: `provider: string`, `link: string` or `key: string`.
- Produces:
  - `upsert(provider: string, link: string, data: Partial<Omit<StoredMovie, "link" | "updatedAt">>): StoredMovie | null`
  - `get(provider: string, link: string): StoredMovie | undefined`
  - `getAny(link: string): StoredMovie | undefined`
  - `remove(provider: string, link: string): void`
  - `upsertAll<T>(provider: string, key: string, data: T): void`
  - `getAllData<A>(provider: string, key: string): { data: A; updatedAt: string } | undefined`
  - `clearProvider(provider: string): void`

- [ ] **Step 1: Write the failing store operations test**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { upsert, get, getAny, remove, upsertAll, getAllData, clearProvider } from "@/services/movie.store";

test("upsert rejects empty or whitespace-only title", () => {
  const result = upsert("gnula", "/pelicula/empty-test", { title: "   " });
  assert.equal(result, null);
  assert.equal(get("gnula", "/pelicula/empty-test"), undefined);
});

test("upsert and get isolate media by provider", () => {
  upsert("gnula", "/pelicula/spiderman", { title: "Spider-Man Gnula", rating: "8.5" });
  upsert("sololatino", "/pelicula/spiderman", { title: "Spider-Man SoloLatino", rating: "7.0" });

  const gnulaItem = get("gnula", "/pelicula/spiderman");
  const soloItem = get("sololatino", "/pelicula/spiderman");

  assert.equal(gnulaItem?.title, "Spider-Man Gnula");
  assert.equal(soloItem?.title, "Spider-Man SoloLatino");
  assert.equal(get("serieslan", "/pelicula/spiderman"), undefined);
});

test("getAny finds cached item across any provider", () => {
  const item = getAny("/pelicula/spiderman");
  assert.ok(item && item.title.includes("Spider-Man"));
});

test("remove deletes only for the specified provider", () => {
  remove("gnula", "/pelicula/spiderman");
  assert.equal(get("gnula", "/pelicula/spiderman"), undefined);
  assert.equal(get("sololatino", "/pelicula/spiderman")?.title, "Spider-Man SoloLatino");
});

test("upsertAll and getAllData isolate catalog queries by provider", () => {
  upsertAll("gnula", "home:page:1", { movies: [{ title: "G1" }] });
  upsertAll("sololatino", "home:page:1", { movies: [{ title: "S1" }] });

  assert.deepEqual(getAllData<{ movies: { title: string }[] }>("gnula", "home:page:1")?.data.movies[0].title, "G1");
  assert.deepEqual(getAllData<{ movies: { title: string }[] }>("sololatino", "home:page:1")?.data.movies[0].title, "S1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/services/movie-store-operations.test.ts`  
Expected: FAIL due to parameter count or missing guard.

- [ ] **Step 3: Implement provider-scoped operations in `services/movie.store.ts`**

Update `upsert`, `get`, `remove`, `upsertAll`, `getAllData` to query and write using `(provider, key)`. Add validation in `upsert`: if `!data.title || data.title.trim() === ""` (and not a partial `movieUrl` update), return `null`. Implement `getAny(link)` with `SELECT data FROM movie_cache WHERE key = ? LIMIT 1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/services/movie-store-operations.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/movie.store.ts tests/services/movie-store-operations.test.ts
git commit -m "feat(store): implement provider-scoped queries and anti-garbage guard"
```

---

### Task 3: Update `CachedDriverDecorator` and Verify Provider Scope

**Files:**
- Modify: `drivers/cached-driver.decorator.ts:28-115`
- Create: `tests/drivers/cached-driver.decorator.test.ts`

**Interfaces:**
- Consumes: `MovieDriver`, `movie.store` methods with `provider` argument.
- Produces: `CachedDriverDecorator` implementing `MovieDriver` using `this.id` for all cache queries.

- [ ] **Step 1: Write the failing decorator cache test**

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { CachedDriverDecorator } from "@/drivers/cached-driver.decorator";
import type { MovieDriver, StoredMovie } from "@/types/movie";

test("CachedDriverDecorator stores and retrieves details scoped to its own provider ID", async () => {
  let innerCalls = 0;
  const mockDriver: MovieDriver = {
    id: "test-provider",
    name: "Test Provider",
    async getAll() { return undefined; },
    async getDetail(link: string) {
      innerCalls++;
      return {
        title: "Test Movie",
        image: "https://img.test/poster.jpg",
        backgroundImage: "https://img.test/bg.jpg",
        provider: "test-provider",
      };
    },
    async getUrl() { return { url: "" }; },
  };

  const decorator = new CachedDriverDecorator(mockDriver);
  const first = await decorator.getDetail("/pelicula/test-cache");
  assert.equal(first?.title, "Test Movie");
  assert.equal(innerCalls, 1);

  const cached = await decorator.getDetail("/pelicula/test-cache");
  assert.equal(cached?.title, "Test Movie");
  assert.equal(innerCalls, 1, "Should have been retrieved from cache without calling inner driver");
});

test("CachedDriverDecorator does not cache empty details from innerDriver", async () => {
  const emptyDriver: MovieDriver = {
    id: "empty-provider",
    name: "Empty Provider",
    async getAll() { return undefined; },
    async getDetail() { return { title: "" } as any; },
    async getUrl() { return { url: "" }; },
  };

  const decorator = new CachedDriverDecorator(emptyDriver);
  await decorator.getDetail("/pelicula/empty-item");
  const cached = await decorator.getDetail("/pelicula/empty-item");
  assert.equal(cached?.title, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./tests/register.mjs --test tests/drivers/cached-driver.decorator.test.ts`  
Expected: FAIL due to outdated signatures in decorator.

- [ ] **Step 3: Update `CachedDriverDecorator` to pass `this.id` to store operations**

Pass `this.id` to `getAllData(this.id, key)`, `upsertAll(this.id, key, stampedResult)`, `get(this.id, link)`, and `upsert(this.id, link, stamped)`. Add check: if `!fresh || !fresh.title?.trim()`, return `fresh` without calling `upsert`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./tests/register.mjs --test tests/drivers/cached-driver.decorator.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add drivers/cached-driver.decorator.ts tests/drivers/cached-driver.decorator.test.ts
git commit -m "feat(decorator): pass provider id to store and guard against empty details"
```

---

### Task 4: Adapt Callers Across Strategies, Actions, and Stream Services

**Files:**
- Modify: `strategies/gnula/get-detail.operation.ts`
- Modify: `strategies/gnula/get-all.operation.ts`
- Modify: `strategies/sololatino/get-detail.operation.ts`
- Modify: `strategies/sololatino/get-all.operation.ts`
- Modify: `strategies/sololatino/get-url.operation.ts`
- Modify: `app/actions/movie.ts:46-52`
- Modify: `services/stream-cache.service.ts`
- Modify: `app/api/video/m3u8/route.ts`

**Interfaces:**
- Consumes: Scoped store APIs (`upsert`, `get`, `getAny`, `remove`, `upsertAll`, `getAllData`).
- Produces: Complete alignment across the codebase with provider-scoped caching.

- [ ] **Step 1: Update Gnula operations to pass `"gnula"` or rely on Decorator**

In `strategies/gnula/get-detail.operation.ts` and `strategies/gnula/get-all.operation.ts`, pass `"gnula"` as provider argument to `get`, `upsert`, `getAllData`, `upsertAll`. Ensure `upsert` is skipped if `!title?.trim()`.

- [ ] **Step 2: Update SoloLatino operations to pass `"sololatino"`**

In `strategies/sololatino/get-detail.operation.ts`, `get-all.operation.ts`, and `get-url.operation.ts`, pass `"sololatino"` as provider argument to `get`, `upsert`, `remove`, `getAllData`, `upsertAll`.

- [ ] **Step 3: Update Server Actions & Stream Cache Service**

In `app/actions/movie.ts`:
```typescript
export async function getDetails(link: string, providerId?: string) {
  const stored = providerId ? get(providerId, link) : getAny(link);
  const resolvedProvider = providerId || stored?.provider || inferProviderFromLink(link);
  const driver = await getActiveDriver(resolvedProvider);
  return await driver.getDetail(link);
}
```
In `services/stream-cache.service.ts` and `app/api/video/m3u8/route.ts`: update calls to use `getAny(path)` or pass provider where known.

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `node --import ./tests/register.mjs --test tests/**/*.test.ts tests/**/**/*.test.ts`  
Expected: All 56+ tests PASS.

- [ ] **Step 5: Commit**

```bash
git add strategies/ app/ services/
git commit -m "refactor(strategies): align all store callers with provider-scoped signatures"
```

---

### Task 5: Complete Verification & Linter Pass

**Files:**
- Entire repository

- [ ] **Step 1: Run type checking**

Run: `npx tsc --noEmit`  
Expected: 0 type errors.

- [ ] **Step 2: Run linter**

Run: `npm run lint`  
Expected: 0 errors.

- [ ] **Step 3: Run complete test suite**

Run: `npm test`  
Expected: 100% pass across all unit and integration tests.

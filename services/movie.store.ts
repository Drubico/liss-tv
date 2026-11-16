import Database, { type Database as DatabaseType } from "better-sqlite3";
import fs from "fs";
import path from "path";
import type { StoredMovie } from "../types/movie";

const DB_PATH = path.join(process.cwd(), "data", "movies.db");

declare global {
  var __movieDb: DatabaseType | undefined;
}

interface LegacyJsonEntry {
  data?: unknown;
  updatedAt?: string;
  [key: string]: unknown;
}

function migrateJsonIfPresent(db: DatabaseType): void {
  const jsonPath = path.join(process.cwd(), "data", "movies.json");
  if (!fs.existsSync(jsonPath)) return;

  const countRow = db.prepare("SELECT COUNT(*) as count FROM movie_cache").get() as {
    count: number;
  };
  if (countRow.count > 0) return;

  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const json = JSON.parse(raw) as Record<string, LegacyJsonEntry>;
    const insert = db.prepare(`
      INSERT OR REPLACE INTO movie_cache (provider, key, data, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(json)) {
        if (!value) continue;
        const entryData = value.data !== undefined ? value.data : value;
        const parsed = (typeof entryData === "object" && entryData !== null ? entryData : {}) as Record<string, unknown>;
        if (typeof parsed.title === "string" && parsed.title.trim() === "") continue;

        const provider = typeof parsed.provider === "string" && parsed.provider.trim() ? parsed.provider.trim() : "sololatino";
        const updatedAt =
          typeof value.updatedAt === "string"
            ? value.updatedAt
            : new Date().toISOString();

        insert.run(provider, key, JSON.stringify(entryData), updatedAt);
      }
    });

    transaction();
    console.info(
      `[SQLite] Successfully migrated ${Object.keys(json).length} items from movies.json to movies.db`,
    );
    fs.renameSync(jsonPath, `${jsonPath}.bak`);
  } catch (err) {
    console.error("[SQLite] Error migrating movies.json:", err);
  }
}

export function ensureSchemaAndMigrate(db: DatabaseType): void {
  const tableRow = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='movie_cache'")
    .get() as { name: string } | undefined;

  if (!tableRow) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS movie_cache (
        provider TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, key)
      );
      CREATE INDEX IF NOT EXISTS idx_movie_cache_provider ON movie_cache (provider);
    `);
    return;
  }

  const columns = db.pragma("table_info(movie_cache)") as { name: string; pk: number }[];
  const hasProviderPk = columns.some((c) => c.name === "provider" && c.pk > 0);

  if (!hasProviderPk) {
    db.exec(`
      CREATE TABLE movie_cache_v2 (
        provider TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider, key)
      );
    `);

    const oldRows = db.prepare("SELECT key, data, updated_at FROM movie_cache").all() as {
      key: string;
      data: string;
      updated_at: string;
    }[];

    const insert = db.prepare(`
      INSERT OR REPLACE INTO movie_cache_v2 (provider, key, data, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    const migration = db.transaction(() => {
      for (const row of oldRows) {
        try {
          const parsed = JSON.parse(row.data) as Record<string, unknown>;
          if (!parsed || typeof parsed !== "object") continue;

          // Drop corrupt/empty movie details
          if ("title" in parsed && typeof parsed.title === "string" && parsed.title.trim() === "") {
            continue;
          }

          let provider = "sololatino";
          let key = row.key;

          if (typeof parsed.provider === "string" && parsed.provider.trim() !== "") {
            provider = parsed.provider.trim();
          } else if (key.startsWith("gnula:")) {
            provider = "gnula";
            key = key.replace(/^gnula:/, "");
          } else if (key.startsWith("sololatino:")) {
            provider = "sololatino";
            key = key.replace(/^sololatino:/, "");
          } else if (key.startsWith("serieslan:")) {
            provider = "serieslan";
            key = key.replace(/^serieslan:/, "");
          }

          insert.run(provider, key, row.data, row.updated_at);
        } catch {
          // Skip unparseable rows
        }
      }

      db.exec("DROP TABLE movie_cache;");
      db.exec("ALTER TABLE movie_cache_v2 RENAME TO movie_cache;");
      db.exec("CREATE INDEX IF NOT EXISTS idx_movie_cache_provider ON movie_cache (provider);");
    });

    migration();
  }
}

function getDatabase(): DatabaseType {
  if (!globalThis.__movieDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    ensureSchemaAndMigrate(db);
    migrateJsonIfPresent(db);
    globalThis.__movieDb = db;
  }
  return globalThis.__movieDb;
}

export function normalizeKey(key: string): string {
  if (!key) return "";
  let clean = key.trim().split("?")[0].split("#")[0];
  clean = clean.replace(/^https?:\/\/[^/]+/, "");
  if (!clean.startsWith("/")) clean = `/${clean}`;
  return clean;
}

/** Upsert by link and provider — merges partial data, never duplicates */
export function upsert(
  provider: string,
  link: string,
  data: Partial<Omit<StoredMovie, "link" | "updatedAt">>,
): StoredMovie | null {
  if (!provider || typeof provider !== "string" || !link) return null;
  const db = getDatabase();
  const normalized = normalizeKey(link);
  const existing = get(provider, link) || ({} as StoredMovie);

  const targetTitle = data.title !== undefined ? data.title : existing.title;
  // Guard against persisting empty or corrupt movie items
  if ((!targetTitle || targetTitle.trim() === "") && !data.movieUrl) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  const merged: StoredMovie = {
    ...existing,
    ...data,
    provider: provider.trim(),
    link: normalized,
    updatedAt,
  };

  const stmt = db.prepare(`
    INSERT INTO movie_cache (provider, key, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(provider, key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  stmt.run(provider.trim(), normalized, JSON.stringify(merged), updatedAt);
  return merged;
}

export function upsertAll<T>(provider: string, key: string, data: T): void {
  if (!provider || !key || !data) return;
  const db = getDatabase();
  const updatedAt = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO movie_cache (provider, key, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(provider, key) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `);

  stmt.run(provider.trim(), key, JSON.stringify(data), updatedAt);
}

export function get(provider: string, link: string): StoredMovie | undefined {
  if (!provider || !link) return undefined;
  const db = getDatabase();
  const normalized = normalizeKey(link);
  const stmt = db.prepare(`SELECT data FROM movie_cache WHERE provider = ? AND (key = ? OR key = ?)`);
  const row = stmt.get(provider.trim(), normalized, link) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.data) as StoredMovie;
  } catch {
    return undefined;
  }
}

/** Fallback helper to retrieve any valid cached entry across all providers */
export function getAny(link: string): StoredMovie | undefined {
  if (!link) return undefined;
  const db = getDatabase();
  const normalized = normalizeKey(link);
  const stmt = db.prepare(`SELECT data FROM movie_cache WHERE key = ? OR key = ? LIMIT 1`);
  const row = stmt.get(normalized, link) as { data: string } | undefined;
  if (!row) return undefined;
  try {
    return JSON.parse(row.data) as StoredMovie;
  } catch {
    return undefined;
  }
}

export function remove(provider: string, link: string): void {
  if (!provider || !link) return;
  const db = getDatabase();
  const normalized = normalizeKey(link);
  const stmt = db.prepare(`DELETE FROM movie_cache WHERE provider = ? AND (key = ? OR key = ?)`);
  stmt.run(provider.trim(), normalized, link);
}

export function getAllData<A>(
  provider: string,
  key: string,
): { data: A; updatedAt: string } | undefined {
  if (!provider || !key) return undefined;
  const db = getDatabase();
  const stmt = db.prepare(`SELECT data, updated_at FROM movie_cache WHERE provider = ? AND key = ?`);
  const row = stmt.get(provider.trim(), key) as { data: string; updated_at: string } | undefined;
  if (!row) return undefined;
  try {
    return {
      data: JSON.parse(row.data) as A,
      updatedAt: row.updated_at,
    };
  } catch {
    return undefined;
  }
}

export function clearProvider(provider: string): void {
  if (!provider) return;
  const db = getDatabase();
  const stmt = db.prepare(`DELETE FROM movie_cache WHERE provider = ?`);
  stmt.run(provider.trim());
}

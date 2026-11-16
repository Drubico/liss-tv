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

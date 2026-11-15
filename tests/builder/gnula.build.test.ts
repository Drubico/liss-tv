import test from "node:test";
import assert from "node:assert";
import { GnulaMovieBuilder } from "../../builder/gnula.build.ts";

test("GnulaMovieBuilder builds MovieContext with configured strategies", () => {
  const builder = new GnulaMovieBuilder();
  assert.strictEqual(builder.id, "gnula");
  assert.strictEqual(builder.name, "Gnula HD");

  const context = builder.build();
  assert.strictEqual(context.id, "gnula");
  assert.strictEqual(context.name, "Gnula HD");

  assert.strictEqual(typeof context.getAll, "function");
  assert.strictEqual(typeof context.getDetail, "function");
  assert.strictEqual(typeof context.getUrl, "function");
});

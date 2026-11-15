import test from "node:test";
import assert from "node:assert";
import { GnulaMovieBuilder } from "../../builder/gnula.build.ts";

test("GnulaMovieBuilder builds MovieContext and connects real gnula GetUrl operation", async () => {
  const builder = new GnulaMovieBuilder();
  assert.strictEqual(builder.id, "gnula");
  assert.strictEqual(builder.name, "Gnula HD");

  const context = builder.build();
  assert.strictEqual(context.id, "gnula");
  assert.strictEqual(context.name, "Gnula HD");

  // Verify getUrl no longer throws "GetUrl not implemented yet"
  await assert.rejects(
    () => context.getUrl("/ver/test/"),
    (err: Error) => {
      assert.strictEqual(err.message.includes("not implemented yet"), false);
      return true;
    }
  );
});

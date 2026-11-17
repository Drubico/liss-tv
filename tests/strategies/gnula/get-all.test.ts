import test from "node:test";
import assert from "node:assert";
import { extractSlug } from "../../../strategies/gnula/get-all.operation.ts";

test("extractSlug correctly extracts slug from relative and absolute Gnula URLs", () => {
  assert.strictEqual(
    extractSlug("/ver/deadpool-y-wolverine/"),
    "deadpool-y-wolverine",
    "Should extract slug from relative /ver/ URL with trailing slash"
  );

  assert.strictEqual(
    extractSlug("/ver/deadpool-y-wolverine"),
    "deadpool-y-wolverine",
    "Should extract slug from relative /ver/ URL without trailing slash"
  );

  assert.strictEqual(
    extractSlug("/pelicula/deadpool-y-wolverine/"),
    "deadpool-y-wolverine",
    "Should extract slug from relative /pelicula/ URL with trailing slash"
  );

  assert.strictEqual(
    extractSlug("https://ww3.gnulahd.nu/ver/deadpool-y-wolverine/"),
    "deadpool-y-wolverine",
    "Should extract slug from absolute /ver/ URL"
  );

  assert.strictEqual(
    extractSlug("https://ww3.gnulahd.nu/pelicula/deadpool-y-wolverine/"),
    "deadpool-y-wolverine",
    "Should extract slug from absolute /pelicula/ URL without returning 'pelicula'"
  );

  assert.strictEqual(
    extractSlug("/serie/the-last-of-us/"),
    "the-last-of-us",
    "Should extract slug from relative /serie/ URL"
  );

  assert.strictEqual(
    extractSlug("https://ww3.gnulahd.nu/serie/the-last-of-us/"),
    "the-last-of-us",
    "Should extract slug from absolute /serie/ URL without returning 'serie'"
  );

  assert.strictEqual(
    extractSlug("/ver/deadpool-y-wolverine/?ref=home#player"),
    "deadpool-y-wolverine",
    "Should strip query parameters and hash before extracting slug"
  );
});

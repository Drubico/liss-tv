import test from "node:test";
import assert from "node:assert";
import { getDetails } from "../../app/actions/movie.ts";

test("getDetails forwards explicit providerId to driver resolution", async () => {
  const detail = await getDetails("pelicula/scream-3-la-mascara-de-la-muerte", "seriesmetro");
  assert(detail !== undefined);
  assert.strictEqual(detail.provider, "seriesmetro");
});

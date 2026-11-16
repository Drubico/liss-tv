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
  assert.equal(gnulaItem?.provider, "gnula");
  assert.equal(soloItem?.title, "Spider-Man SoloLatino");
  assert.equal(soloItem?.provider, "sololatino");
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

test("clearProvider purges all records belonging to provider", () => {
  upsert("gnula", "/pelicula/purge-1", { title: "Gnula To Purge" });
  upsert("sololatino", "/pelicula/purge-1", { title: "SoloLatino Kept" });

  clearProvider("gnula");

  assert.equal(get("gnula", "/pelicula/purge-1"), undefined);
  assert.equal(get("sololatino", "/pelicula/purge-1")?.title, "SoloLatino Kept");
});

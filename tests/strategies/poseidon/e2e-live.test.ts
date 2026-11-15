import test from "node:test";
import assert from "node:assert";
import { DriverRegistry } from "../../../drivers/registry.ts";

test("Live: Poseidon driver fetches catalog successfully", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  assert.strictEqual(driver.id, "poseidon");
  assert.strictEqual(driver.name, "Poseidon HD");

  const catalog = await driver.getAll({ pageNumber: 1 });
  assert.ok(catalog, "Catalog should be returned");
  assert.ok(catalog.movies.length > 0, "Catalog should contain movies");
  assert.ok(catalog.movies[0].title, "First movie should have a title");
  assert.ok(
    catalog.movies[0].link.startsWith("/pelicula/") ||
      catalog.movies[0].link.startsWith("/serie/"),
    `Link should be canonical: ${catalog.movies[0].link}`,
  );
  assert.strictEqual(catalog.movies[0].provider, "poseidon");
});

test("Live: Poseidon driver searches movies successfully", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  const searchResults = await driver.getAll({ search: "Batman" });
  assert.ok(searchResults, "Search results should be returned");
  assert.ok(searchResults.movies.length > 0, "Should find Batman movies");
  const batman = searchResults.movies.find((m) =>
    m.title.toLowerCase().includes("batman"),
  );
  assert.ok(batman, "Should contain at least one Batman title");
});

test("Live: Poseidon driver gets movie detail and resolves Latino Vidara stream", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  // Dragon Ball Z Bardock (confirmed to have Latino Vidara stream)
  const detail = await driver.getDetail(
    "/pelicula/120475/dragon-ball-z-bardock-el-legendario-super-saiyajin",
  );

  assert.ok(detail, "Detail should be returned");
  assert.strictEqual(
    detail.title,
    "Dragon Ball Z: Bardock El legendario Super Saiyajin",
  );
  assert.ok(detail.image, "Should have poster image");
  assert.strictEqual(detail.provider, "poseidon");

  const stream = await driver.getUrl(
    "/pelicula/120475/dragon-ball-z-bardock-el-legendario-super-saiyajin",
    {
      detailContext: detail.context,
    },
  );

  assert.ok(stream, "Stream result should be returned");
  const finalUrl = stream.url || stream.fallbackUrl;
  assert.ok(finalUrl, "Final streaming URL should exist");
  assert.ok(
    finalUrl.includes(".m3u8") || finalUrl.includes("/api/video/m3u8"),
    `URL should be an HLS stream: ${finalUrl}`,
  );
});

test("Live: Poseidon driver gets serie detail with clean slug", async () => {
  const driver = DriverRegistry.getDriver("poseidon");
  const detail = await driver.getDetail("/serie/the-lowdown");
  assert.ok(detail, "Series detail should be returned");
  assert.strictEqual(detail.title, "The Lowdown");
  assert.ok(detail.episodes && detail.episodes.length > 0, "Should have seasons");
  assert.strictEqual(detail.episodes[0].episodes[0].caption, "The Lowdown 1x1");
  assert.ok(
    detail.episodes[0].episodes[0].link.startsWith("/serie/273247/the-lowdown/"),
    `Episode link should be resolvable: ${detail.episodes[0].episodes[0].link}`,
  );
});

import test from "node:test";
import assert from "node:assert";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";

test("MovieContextFactory creates valid seriesmetro MovieContext", () => {
  const context = MovieContextFactory.driver("seriesmetro");
  assert.strictEqual(context.id, "seriesmetro");
  assert.strictEqual(context.name, "SeriesMetro");
  assert(typeof context.getAll === "function");
  assert(typeof context.getDetail === "function");
  assert(typeof context.getUrl === "function");
});

test("DriverRegistry registers seriesmetro driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("seriesmetro");
  assert.strictEqual(driver.id, "seriesmetro");
  assert.strictEqual(driver.name, "SeriesMetro");

  const available = DriverRegistry.getAvailableProviders();
  const found = available.find((p) => p.id === "seriesmetro");
  assert(found !== undefined);
  assert.strictEqual(found?.name, "SeriesMetro");
});

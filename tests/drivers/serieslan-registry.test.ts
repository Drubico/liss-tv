import test from "node:test";
import assert from "node:assert";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";

test("MovieContextFactory creates valid serieslan MovieContext", () => {
  const context = MovieContextFactory.driver("serieslan");
  assert.strictEqual(context.id, "serieslan");
  assert.strictEqual(context.name, "SeriesLan");
  assert(typeof context.getAll === "function");
  assert(typeof context.getDetail === "function");
  assert(typeof context.getUrl === "function");
});

test("DriverRegistry registers serieslan driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("serieslan");
  assert.strictEqual(driver.id, "serieslan");
  assert.strictEqual(driver.name, "SeriesLan");

  const available = DriverRegistry.getAvailableProviders();
  const found = available.find((p) => p.id === "serieslan");
  assert(found !== undefined);
  assert.strictEqual(found?.name, "SeriesLan");
});

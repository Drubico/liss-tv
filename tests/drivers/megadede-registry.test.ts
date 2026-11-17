import test from "node:test";
import assert from "node:assert";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";

test("MovieContextFactory creates valid megadede MovieContext", () => {
  const context = MovieContextFactory.driver("megadede");
  assert.strictEqual(context.id, "megadede");
  assert.strictEqual(context.name, "Megadede");
  assert(typeof context.getAll === "function");
  assert(typeof context.getDetail === "function");
  assert(typeof context.getUrl === "function");
});

test("DriverRegistry registers megadede driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("megadede");
  assert.strictEqual(driver.id, "megadede");
  assert.strictEqual(driver.name, "Megadede");

  const available = DriverRegistry.getAvailableProviders();
  const found = available.find((p) => p.id === "megadede");
  assert(found !== undefined);
  assert.strictEqual(found?.name, "Megadede");
});

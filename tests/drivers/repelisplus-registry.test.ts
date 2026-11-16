import test from "node:test";
import assert from "node:assert";
import { MovieContextFactory } from "../../builder/factory.ts";
import { DriverRegistry } from "../../drivers/registry.ts";
import { inferProviderFromLink } from "../../utils/navigation.ts";

test("MovieContextFactory creates valid repelisplus MovieContext", () => {
  const context = MovieContextFactory.driver("repelisplus");
  assert.strictEqual(context.id, "repelisplus");
  assert.strictEqual(context.name, "RepelisPlus");
  assert(typeof context.getAll === "function");
  assert(typeof context.getDetail === "function");
  assert(typeof context.getUrl === "function");
});

test("DriverRegistry registers repelisplus driver wrapped in cache decorator", () => {
  const driver = DriverRegistry.getDriver("repelisplus");
  assert.strictEqual(driver.id, "repelisplus");
  assert.strictEqual(driver.name, "RepelisPlus");

  const available = DriverRegistry.getAvailableProviders();
  const found = available.find((p) => p.id === "repelisplus");
  assert(found !== undefined);
  assert.strictEqual(found?.name, "RepelisPlus");

  const resolved = DriverRegistry.resolveDriverForContent("repelisplus");
  assert.strictEqual(resolved.id, "repelisplus");
});

test("inferProviderFromLink correctly detects repelisplus provider", () => {
  assert.strictEqual(
    inferProviderFromLink("https://repelisplus.buzz/pelicula/avatar-3"),
    "repelisplus",
  );
  assert.strictEqual(
    inferProviderFromLink("/pelicula/avatar-3", { provider: "repelisplus" }),
    "repelisplus",
  );
  assert.strictEqual(
    inferProviderFromLink("/serie/fallout-1", { provider: "repelisplus" }),
    "repelisplus",
  );
});

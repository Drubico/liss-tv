import test from "node:test";
import assert from "node:assert";
import { DriverRegistry } from "../../drivers/registry.ts";
import { MovieContextFactory } from "../../builder/factory.ts";

test("MovieContextFactory creates poseidon context", () => {
  const driver = MovieContextFactory.driver("poseidon");
  assert.strictEqual(driver.id, "poseidon");
  assert.strictEqual(driver.name, "Poseidon HD");
});

test("DriverRegistry exposes poseidon in available providers", () => {
  const providers = DriverRegistry.getAvailableProviders();
  const poseidon = providers.find((p) => p.id === "poseidon");
  assert.ok(poseidon, "poseidon should be registered in DriverRegistry");
  assert.strictEqual(poseidon?.name, "Poseidon HD");
});

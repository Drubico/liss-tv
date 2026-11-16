import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RepelisPlusError } from "@/strategies/repelisplus/types";
import { buildRepelisUrl } from "@/strategies/repelisplus/client";

describe("RepelisPlus Client", () => {
  it("should build correct absolute URLs for relative paths", () => {
    assert.equal(buildRepelisUrl("/peliculas"), "https://repelisplus.buzz/peliculas");
    assert.equal(buildRepelisUrl("serie/dexter/"), "https://repelisplus.buzz/serie/dexter/");
    assert.equal(buildRepelisUrl("https://repelisplus.buzz/test"), "https://repelisplus.buzz/test");
  });

  it("should create RepelisPlusError with message and statusCode", () => {
    const err = new RepelisPlusError("Failed to fetch", 403);
    assert.equal(err.name, "RepelisPlusError");
    assert.equal(err.message, "Failed to fetch");
    assert.equal(err.statusCode, 403);
  });
});

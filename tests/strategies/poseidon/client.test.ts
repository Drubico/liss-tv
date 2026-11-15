import test from "node:test";
import assert from "node:assert";
import {
  extractLeafSlug,
  extractNextData,
  resolvePoseidonPath,
} from "../../../strategies/poseidon/client.ts";

test("extractNextData successfully extracts JSON payload", () => {
  const html = `<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"test":123}}}</script></head><body></body></html>`;
  const data = extractNextData<{ props: { pageProps: { test: number } } }>(html);
  assert.strictEqual(data.props.pageProps.test, 123);
});

test("extractNextData handles reversed attribute order and whitespace", () => {
  const html = `<html><head><script type="application/json" crossorigin="anonymous" id="__NEXT_DATA__">{"props":{"pageProps":{"val":"ok"}}}</script></head><body></body></html>`;
  const data = extractNextData<{ props: { pageProps: { val: string } } }>(html);
  assert.strictEqual(data.props.pageProps.val, "ok");
});

test("extractNextData throws descriptive error when script is missing", () => {
  const html = `<html><body><div>No data</div></body></html>`;
  assert.throws(() => extractNextData(html), /__NEXT_DATA__ script not found/);
});

test("extractLeafSlug extracts leaf name from single and nested slugs", () => {
  assert.strictEqual(extractLeafSlug("series/273247/the-lowdown"), "the-lowdown");
  assert.strictEqual(extractLeafSlug("movies/120475/dragon-ball"), "dragon-ball");
  assert.strictEqual(extractLeafSlug("the-lowdown"), "the-lowdown");
  assert.strictEqual(extractLeafSlug("/serie/the-lowdown/"), "the-lowdown");
});

test("resolvePoseidonPath preserves paths that already include numeric ID", async () => {
  const res = await resolvePoseidonPath("serie/273247/the-lowdown");
  assert.strictEqual(res, "serie/273247/the-lowdown");

  const movieRes = await resolvePoseidonPath("pelicula/120475/dragon-ball");
  assert.strictEqual(movieRes, "pelicula/120475/dragon-ball");
});

import test from "node:test";
import assert from "node:assert";
import {
  extractFastreamM3u8,
  unpackDeanEdwards,
} from "../../../strategies/seriesmetro/extractors/fastream.extractor.ts";

test("unpackDeanEdwards unpacks standard P.A.C.K.E.R. string", () => {
  const packed =
    "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('0 1=2;',3,3,'var|foo|bar'.split('|')))";
  const unpacked = unpackDeanEdwards(packed);
  assert.strictEqual(unpacked, "var foo=bar;");
});

test("extractFastreamM3u8 extracts master.m3u8 from packed embed HTML", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const mockHtml = `
    <html>
    <script type='text/javascript'>
    eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('var source = "https://s40.fastream.to/hls2/21/00085/t81r7i1v7blb_,l,n,.urlset/master.m3u8?t=test1234&s=123";',0,0,''.split('|')))
    </script>
    </html>
  `;

  global.fetch = (async () =>
    new Response(mockHtml, { status: 200 })) as typeof fetch;

  const streamUrl = await extractFastreamM3u8("https://fastream.to/embed-test.html");
  assert(streamUrl !== null);
  assert(streamUrl?.includes("https://s40.fastream.to/hls2/"));
  assert(streamUrl?.includes("master.m3u8?t=test1234&s=123"));
});

test("extractFastreamM3u8 returns null when no stream is present or HTTP error", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = (async () =>
    new Response("Not Found", { status: 404 })) as typeof fetch;

  const streamUrl = await extractFastreamM3u8("https://fastream.to/embed-404.html");
  assert.strictEqual(streamUrl, null);
});

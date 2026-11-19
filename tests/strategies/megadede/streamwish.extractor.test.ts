import { test } from "node:test";
import assert from "node:assert/strict";
import { extractStreamwishM3u8 } from "../../../strategies/megadede/extractors/streamwish.extractor.ts";

test("extractStreamwishM3u8 extracts master.m3u8 from packed JavaScript", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <script>
      eval(function(p,a,c,k,e,d){return p}('var links={"hls":"https://cdn.streamwish.com/hls/master.m3u8"};',1,1,''.split('|')))
    </script>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/test1234");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/hls/master.m3u8");
});

test("extractStreamwishM3u8 extracts stream from unpacked sources array in raw HTML", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <html>
      <body>
        <script>
          jwplayer("vplayer").setup({
            sources: [
              { file: "https://cdn.streamwish.com/hls2/master.m3u8", label: "HD" }
            ]
          });
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/unpacked123");
  assert.strictEqual(m3u8, "https://cdn.streamwish.com/hls2/master.m3u8");
});

test("extractStreamwishM3u8 resolves relative master.txt in unpacked sources array", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <html>
      <body>
        <script>
          var links = { hls: "/hls3/01/video/master.txt" };
        </script>
      </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractStreamwishM3u8("https://strwish.com/e/relative123");
  assert.strictEqual(m3u8, "https://strwish.com/hls3/01/video/master.txt");
});


import test from "node:test";
import assert from "node:assert";
import {
  extractVidhideM3u8,
  unpackDeanEdwards,
} from "../../../strategies/megadede/extractors/vidhide.extractor.ts";

const SAMPLE_PACKED_CODE = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4.5/6/7.8";',9,9,'var|streamUrl|https|cdn|video|com|hls|master|m3u8'.split('|')))`;

test("unpackDeanEdwards correctly decodes packed JavaScript", () => {
  const unpacked = unpackDeanEdwards(SAMPLE_PACKED_CODE);
  assert(unpacked !== null);
  assert(unpacked.includes('var streamUrl="https://cdn.video.com/hls/master.m3u8";'));
});

test("extractVidhideM3u8 extracts master.m3u8 from embedded page", async (t) => {
  const originalFetch = global.fetch;
  const mockPageHtml = `
    <!DOCTYPE html>
    <html>
    <body>
      <script type="text/javascript">
        ${SAMPLE_PACKED_CODE}
      </script>
    </body>
    </html>
  `;

  global.fetch = async () => new Response(mockPageHtml, { status: 200 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const m3u8 = await extractVidhideM3u8("https://morencius.com/embed/test1234");
  assert.strictEqual(m3u8, "https://cdn.video.com/hls/master.m3u8");
});

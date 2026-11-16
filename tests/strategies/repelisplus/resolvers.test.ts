import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unpackPackedJs, extractM3u8FromStreamwish } from "@/strategies/repelisplus/resolvers/streamwish";
import { extractM3u8FromVoe } from "@/strategies/repelisplus/resolvers/voe";
import { extractM3u8FromFilelions } from "@/strategies/repelisplus/resolvers/filelions";
import { resolveCyberlockerStream } from "@/strategies/repelisplus/resolvers/index";

describe("Streamwish Packed JS Unpacker", () => {
  it("should decode p,a,c,k,e,d payload and locate direct .m3u8 playlist", () => {
    const packed = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('0://1/2.3',4,4,'https|example.com|stream|m3u8'.split('|')))`;
    const unpacked = unpackPackedJs(packed);
    assert.equal(unpacked, "https://example.com/stream.m3u8");
  });

  it("should extract stream URL from Streamwish HTML containing packed script", () => {
    const html = `
      <html><body><script>
      eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('sources:[{file:"0://1/master.2"}]',3,3,'https|cdn.streamwish.to|m3u8'.split('|')))
      </script></body></html>
    `;
    const url = extractM3u8FromStreamwish(html);
    assert.equal(url, "https://cdn.streamwish.to/master.m3u8");
  });
});

describe("Voe Stream Extractor", () => {
  it("should extract HLS URL from Voe HTML or JSON payload", () => {
    const html = `
      <script>
      let sources = {"hls": "https://delivery.voe.sx/hls/master.m3u8"};
      </script>
    `;
    const url = extractM3u8FromVoe(html);
    assert.equal(url, "https://delivery.voe.sx/hls/master.m3u8");
  });
});

describe("Filelions Stream Extractor", () => {
  it("should extract master .m3u8 stream from Filelions HTML", () => {
    const html = `
      <script>
      var player = new Player({ file: "https://filelions.to/streams/master.m3u8" });
      </script>
    `;
    const url = extractM3u8FromFilelions(html);
    assert.equal(url, "https://filelions.to/streams/master.m3u8");
  });
});

describe("Cyberlocker Resolver Cascade", () => {
  it("should cascade and resolve valid stream for supported hoster", async () => {
    const mockFetcher = async (url: string) => {
      if (url.includes("streamwish")) {
        return `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c+'\\\\b','g'),k[c]);return p}('sources:[{file:"0://1/master.2"}]',3,3,'https|cdn.streamwish.to|m3u8'.split('|')))`;
      }
      return "";
    };

    const stream = await resolveCyberlockerStream("https://streamwish.to/e/123", mockFetcher);
    assert.equal(stream, "https://cdn.streamwish.to/master.m3u8");
  });
});

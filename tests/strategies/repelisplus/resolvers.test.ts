import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unpackPackedJs, extractM3u8FromStreamwish } from "@/strategies/repelisplus/resolvers/streamwish";
import { extractM3u8FromVoe } from "@/strategies/repelisplus/resolvers/voe";
import { extractM3u8FromFilelions } from "@/strategies/repelisplus/resolvers/filelions";
import { extractM3u8FromNupload } from "@/strategies/repelisplus/resolvers/nupload";
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

describe("Nupload Stream Extractor", () => {
  it("should extract direct stream URL by decoding cipher array with subtraction offset and session", () => {
    // Generate valid test payload: "https://sv1.lat/" with offset 1000
    // "h" -> 104 -> 1104 -> "1104" in b64
    const offset = 1000;
    const targetUrl = "https://sv1.lat/";
    const b64Items = targetUrl.split("").map((ch) => {
      const code = ch.charCodeAt(0) + offset;
      return Buffer.from(`foo${code}bar`).toString("base64");
    });

    const html = `
      <script>
        var cipherArr = ${JSON.stringify(b64Items)};
      </script>
      <script>
        var resUrl = ""; cipherArr.forEach(function Oym(value) { resUrl += String.fromCharCode(parseInt(atob(value).replace(/\\D/g,'')) - ${offset}); });
        var sesz="my-session-key-123";
      </script>
    `;

    const result = extractM3u8FromNupload(html);
    assert.ok(result);
    assert.equal(result.type, "stream");
    assert.equal(result.url, "https://sv1.lat/?s=my-session-key-123");
  });

  it("should extract nested iframe URL when Nupload acts as wrapper", () => {
    const html = `
      <html><body>
        <iframe src="https://voe.sx/e/testembed123" width="100%" height="100%"></iframe>
      </body></html>
    `;
    const result = extractM3u8FromNupload(html);
    assert.ok(result);
    assert.equal(result.type, "iframe");
    assert.equal(result.url, "https://voe.sx/e/testembed123");
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

  it("should unwrap nupload iframe wrappers and resolve target hoster stream", async () => {
    const mockFetcher = async (url: string) => {
      if (url.includes("voe.sx")) {
        return `<script>let sources = {"hls": "https://delivery.voe.sx/hls/master.m3u8"};</script>`;
      }
      return "";
    };

    const stream = await resolveCyberlockerStream(
      "https://nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2Fe%2Ftest456",
      mockFetcher,
    );
    assert.equal(stream, "https://delivery.voe.sx/hls/master.m3u8");
  });
});

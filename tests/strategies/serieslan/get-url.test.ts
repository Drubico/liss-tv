import test from "node:test";
import assert from "node:assert";
import {
  GetUrl,
  extractVimeosIframe,
  extractM3u8Stream,
} from "../../../strategies/serieslan/get-url.operation.ts";

test("extractVimeosIframe extracts vimeos embed URL from player HTML", () => {
  const html = `
    <html>
      <body>
        <div id="app">
          <iframe src="https://vimeos.net/embed-abc123xyz.html?cf=token123" allowfullscreen></iframe>
        </div>
      </body>
    </html>
  `;
  const iframeUrl = extractVimeosIframe(html);
  assert.strictEqual(
    iframeUrl,
    "https://vimeos.net/embed-abc123xyz.html?cf=token123"
  );
});

test("extractM3u8Stream extracts master.m3u8 URL from vimeos HTML", () => {
  const html = `
    <script>
      var sources = [{"file":"https://s11.vimeos.net/hls2/02/00015/master.m3u8?t=abc&e=123","type":"hls"}];
    </script>
  `;
  const m3u8 = extractM3u8Stream(html);
  assert.strictEqual(
    m3u8,
    "https://s11.vimeos.net/hls2/02/00015/master.m3u8?t=abc&e=123"
  );
});

test("GetUrl resolves stream when player_url is present in detailContext", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const playerHtml = `
    <html>
      <iframe src="https://vimeos.net/embed-123.html?cf=token"></iframe>
    </html>
  `;
  const vimeosHtml = `
    <script>
      var player = jwplayer("vplayer").setup({
        sources: [{ file: "https://s11.vimeos.net/master.m3u8?token=xyz" }]
      });
    </script>
  `;

  global.fetch = (async (url: string) => {
    if (url.includes("player.serieslan.live")) {
      return new Response(playerHtml, { status: 200 });
    }
    if (url.includes("vimeos.net")) {
      return new Response(vimeosHtml, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;

  const getUrl = new GetUrl();
  const result = await getUrl.operation("/serie/chicago-pd/player?season=1&episode=1", {
    detailContext: {
      player_url: "https://player.serieslan.live/e/tv/58841/1/1",
    },
  });

  assert(result !== undefined);
  assert.strictEqual(result.url, "https://s11.vimeos.net/master.m3u8?token=xyz");
});

test("GetUrl resolves stream by querying series TMDB ID when context is absent", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  const contentDetail = {
    item: {
      slug: "chicago-pd",
      tmdb_id: 58841,
    },
  };
  const playerHtml = `<iframe src="https://vimeos.net/embed-123.html?cf=token"></iframe>`;
  const vimeosHtml = `file: "https://s11.vimeos.net/master.m3u8?token=resolved"`;

  global.fetch = (async (url: string) => {
    if (url.includes("/api/rest/v1/content/serie/chicago-pd")) {
      return new Response(JSON.stringify(contentDetail), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("player.serieslan.live/e/tv/58841/2/5")) {
      return new Response(playerHtml, { status: 200 });
    }
    if (url.includes("vimeos.net")) {
      return new Response(vimeosHtml, { status: 200 });
    }
    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;

  const getUrl = new GetUrl();
  const result = await getUrl.operation(
    "/serie/chicago-pd/player?season=2&episode=5"
  );

  assert(result !== undefined);
  assert.strictEqual(
    result.url,
    "https://s11.vimeos.net/master.m3u8?token=resolved"
  );
});

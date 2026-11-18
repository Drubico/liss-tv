import test from "node:test";
import assert from "node:assert";
import { GetUrl } from "../../../strategies/seriesmetro/get-url.operation.ts";
import { SeriesmetroError } from "../../../strategies/seriesmetro/client.ts";

test("GetUrl resolves trembed iframe and formats directSegments proxy URL", async () => {
  const moviePageHtml = `
    <aside class="video-options">
      <ul class="aa-tbs aa-tbs-video">
        <li><a href="#options-0"><span class="server">-Latino</span></a></li>
        <li><a href="#options-1"><span class="server">-Castellano</span></a></li>
      </ul>
    </aside>
    <div id="options-0">
      <iframe src="https://www3.seriesmetro.net/?trembed=0&trid=39783&trtype=1"></iframe>
    </div>
    <div id="options-1">
      <iframe src="https://www3.seriesmetro.net/?trembed=1&trid=39783&trtype=1"></iframe>
    </div>
  `;

  const trembed0Html = `
    <div class="Video"><IFRAME SRC="https://fastream.to/embed-latino.html"></IFRAME></div>
  `;

  const trembed1Html = `
    <div class="Video"><IFRAME SRC="https://fastream.to/embed-castellano.html"></IFRAME></div>
  `;

  const mockExtractor = async (url: string) => {
    if (url.includes("embed-latino")) {
      return "https://s40.fastream.to/hls2/21/latino/master.m3u8?t=tokLatino";
    }
    if (url.includes("embed-castellano")) {
      return "https://s40.fastream.to/hls2/21/castellano/master.m3u8?t=tokCastellano";
    }
    return null;
  };

  const mockFetch = (async (url: string) => {
    if (url.includes("trembed=0")) {
      return new Response(trembed0Html, { status: 200 });
    }
    if (url.includes("trembed=1")) {
      return new Response(trembed1Html, { status: 200 });
    }
    return new Response(moviePageHtml, { status: 200 });
  }) as typeof fetch;

  const getUrl = new GetUrl(mockFetch, mockExtractor);
  const result = await getUrl.operation("/pelicula/scream-3-la-mascara-de-la-muerte/");

  assert(result.url);
  assert(result.url.startsWith("/api/video/m3u8?url="));
  assert(result.url.includes("directSegments=true"));
  assert(result.url.includes("referer=https%3A%2F%2Ffastream.to%2F"));
  assert(result.url.includes("tokLatino"));
  assert.strictEqual(result.headers?.Referer, "https://fastream.to/");

  assert(result.fallbackUrl !== undefined && result.fallbackUrl !== null);
  assert(result.fallbackUrl?.includes("tokCastellano"));
});

test("GetUrl resolves series episode with season and episode options", async () => {
  const seriesPageHtml = `
    <div class="seasons">
      <a href="/capitulo/living-dead-temporada-1-capitulo-2/">1x2</a>
    </div>
  `;

  const episodePageHtml = `
    <aside class="video-options">
      <ul class="aa-tbs aa-tbs-video">
        <li><a href="#options-0"><span class="server">-Latino</span></a></li>
      </ul>
    </aside>
    <div id="options-0">
      <iframe src="https://www3.seriesmetro.net/?trembed=0&trid=555&trtype=2"></iframe>
    </div>
  `;

  const trembedHtml = `
    <div class="Video"><IFRAME SRC="https://fastream.to/embed-ep2.html"></IFRAME></div>
  `;

  const mockExtractor = async (url: string) => {
    if (url.includes("embed-ep2")) {
      return "https://s40.fastream.to/hls2/21/ep2/master.m3u8?t=tokEp2";
    }
    return null;
  };

  const mockFetch = (async (url: string) => {
    if (url.includes("trembed")) {
      return new Response(trembedHtml, { status: 200 });
    }
    if (url.includes("/capitulo/")) {
      return new Response(episodePageHtml, { status: 200 });
    }
    return new Response(seriesPageHtml, { status: 200 });
  }) as typeof fetch;

  const getUrl = new GetUrl(mockFetch, mockExtractor);
  const result = await getUrl.operation("/serie/living-dead/", {
    season: 1,
    episode: 2,
  });

  assert(result.url);
  assert(result.url.includes("tokEp2"));
  assert.strictEqual(result.directSegments, true);
});

test("GetUrl throws SeriesmetroError when no streams can be extracted", async () => {
  const emptyPage = "<html><body>No players</body></html>";
  const mockFetch = (async () => new Response(emptyPage, { status: 200 })) as typeof fetch;
  const mockExtractor = async () => null;

  const getUrl = new GetUrl(mockFetch, mockExtractor);

  await assert.rejects(
    async () => {
      await getUrl.operation("/pelicula/empty/");
    },
    (err: unknown) => {
      assert(err instanceof SeriesmetroError);
      return true;
    }
  );
});

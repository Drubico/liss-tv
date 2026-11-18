import test from "node:test";
import assert from "node:assert";
import { GetDetail } from "../../../strategies/seriesmetro/get-detail.operation.ts";

test("GetDetail parses movie synopsis and embed context", async () => {
  const movieHtml = `
    <h1 class="entry-title">Scream 3</h1>
    <header class="header"><figure class="logo"><img src="https://www3.seriesmetro.net/wp-content/uploads/2024/04/Logo2.png" /></figure></header>
    <div class="bghd"><img class="TPostBg" src="//image.tmdb.org/t/p/w1280/scream3_backdrop.jpg" /></div>
    <article class="post">
      <div class="description"><p>Sidney Prescott returns...</p></div>
      <div class="post-thumbnail"><img src="https://image.tmdb.org/t/p/w185/poster.jpg" /></div>
      <div class="genres"><a href="#">Terror</a><a href="#">Misterio</a></div>
      <span class="date">2000</span>
      <aside class="video-options">
        <ul class="aa-tbs aa-tbs-video">
          <li><a href="#options-0"><span class="server">-Latino</span></a></li>
          <li><a href="#options-1"><span class="server">-Castellano</span></a></li>
        </ul>
      </aside>
      <div id="options-0"><iframe data-src="https://www3.seriesmetro.net/?trembed=0&trid=39783&trtype=1"></iframe></div>
      <div id="options-1"><iframe data-src="https://www3.seriesmetro.net/?trembed=1&trid=39783&trtype=1"></iframe></div>
    </article>
  `;

  const mockFetch = async () => new Response(movieHtml, { status: 200 });
  const getDetail = new GetDetail(mockFetch as unknown as typeof fetch);

  const detail = await getDetail.operation("/pelicula/scream-3-la-mascara-de-la-muerte/");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Scream 3");
  assert.strictEqual(detail.type, "movie");
  assert(detail.caption?.includes("Sidney Prescott"));
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w500/poster.jpg");
  assert.strictEqual(
    detail.backgroundImage,
    "https://image.tmdb.org/t/p/w1280/scream3_backdrop.jpg"
  );
  assert.strictEqual(detail.provider, "seriesmetro");
  assert(Array.isArray(detail.context?.embeds));
  assert.strictEqual((detail.context?.embeds as unknown[]).length, 2);
});

test("GetDetail parses series seasons and episodes", async () => {
  const seriesHtml = `
    <h1 class="entry-title">Age of the Living Dead</h1>
    <div class="description"><p>In an alternate quarantine world...</p></div>
    <div class="post-thumbnail"><img src="https://image.tmdb.org/t/p/w500/series.jpg" /></div>
    <div class="seasons">
      <div class="season-item">
        <span class="title">Temporada 1</span>
        <a href="https://www3.seriesmetro.net/capitulo/age-of-the-living-dead-temporada-1-capitulo-1/">1x1 Episodio 1</a>
        <a href="https://www3.seriesmetro.net/capitulo/age-of-the-living-dead-temporada-1-capitulo-2/">1x2 Episodio 2</a>
      </div>
    </div>
  `;

  const mockFetch = async () => new Response(seriesHtml, { status: 200 });
  const getDetail = new GetDetail(mockFetch as unknown as typeof fetch);

  const detail = await getDetail.operation("/serie/age-of-the-living-dead/");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Age of the Living Dead");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.provider, "seriesmetro");
  assert(detail.episodes && detail.episodes.length > 0);

  const s1 = detail.episodes[0];
  assert.strictEqual(s1.season, "1");
  assert.strictEqual(s1.episodes.length, 2);

  const ep1 = s1.episodes[0];
  assert.strictEqual(ep1.numberEpisode, "1");
  assert(ep1.link.includes("/capitulo/age-of-the-living-dead-temporada-1-capitulo-1/"));
});

test("GetDetail fetches and parses multiple seasons via AJAX in series", async () => {
  const seriesMainHtml = `
    <h1 class="entry-title">Breaking Bad</h1>
    <div class="description"><p>A chemistry teacher...</p></div>
    <div class="post-thumbnail"><img src="https://image.tmdb.org/t/p/w500/bb.jpg" /></div>
    <div class="seasons">
      <div class="aa-drp choose-season">
        <ul class="aa-cnt sub-menu">
          <li class="sel-temp"><a data-post="10456" data-season="1">Season 1</a></li>
          <li class="sel-temp"><a data-post="10456" data-season="2">Season 2</a></li>
        </ul>
      </div>
      <div id="episode_by_temp">
        <article class="post dfx fcl episodes">
          <div class="post-thumbnail"><figure><img src="//image.tmdb.org/t/p/w185/ep1.jpg" /></figure></div>
          <header class="entry-header">
            <span class="num-epi">1x1</span>
            <h2 class="entry-title">Piloto</h2>
          </header>
          <a href="https://www3.seriesmetro.net/capitulo/breaking-bad-temporada-1-capitulo-1/" class="lnk-blk"></a>
        </article>
      </div>
    </div>
  `;

  const season2AjaxHtml = `
    <li>
      <article class="post dfx fcl episodes">
        <div class="post-thumbnail"><figure><img src="//image.tmdb.org/t/p/w185/ep2_1.jpg" /></figure></div>
        <header class="entry-header">
          <span class="num-epi">2x1</span>
          <h2 class="entry-title">Siete Treinta y Siete</h2>
        </header>
        <a href="https://www3.seriesmetro.net/capitulo/breaking-bad-temporada-2-capitulo-1/" class="lnk-blk"></a>
      </article>
    </li>
  `;

  const mockFetch = async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("admin-ajax.php")) {
      const body = String(init?.body || "");
      if (body.includes("season=2")) {
        return new Response(season2AjaxHtml, { status: 200 });
      }
      return new Response("", { status: 200 });
    }
    return new Response(seriesMainHtml, { status: 200 });
  };

  const getDetail = new GetDetail(mockFetch as unknown as typeof fetch);
  const detail = await getDetail.operation("/serie/breaking-bad/");

  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Breaking Bad");
  assert.strictEqual(detail.type, "serie");
  assert(detail.episodes && detail.episodes.length === 2, `Expected 2 seasons, got ${detail?.episodes?.length}`);

  const [s1, s2] = detail.episodes;
  assert.strictEqual(s1.season, "1");
  assert.strictEqual(s1.episodes.length, 1);
  assert.strictEqual(s1.episodes[0].numberEpisode, "1");
  assert.strictEqual(s1.episodes[0].title, "Piloto");
  assert.strictEqual(s1.episodes[0].image, "https://image.tmdb.org/t/p/w185/ep1.jpg");

  assert.strictEqual(s2.season, "2");
  assert.strictEqual(s2.episodes.length, 1);
  assert.strictEqual(s2.episodes[0].numberEpisode, "1");
  assert.strictEqual(s2.episodes[0].title, "Siete Treinta y Siete");
  assert.strictEqual(s2.episodes[0].image, "https://image.tmdb.org/t/p/w185/ep2_1.jpg");
});

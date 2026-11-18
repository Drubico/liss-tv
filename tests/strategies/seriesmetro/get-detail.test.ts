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

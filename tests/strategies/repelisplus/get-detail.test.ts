import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetDetail, parseDetailHtml, decodeServerLink } from "@/strategies/repelisplus/get-detail.operation";

const SAMPLE_MOVIE_DETAIL_HTML = `
<header class="header">
  <img class="logo-image" src="/images/repelisplus-logo.png" alt="RepelisPlus Logo" />
</header>
<div class="content-detail">
  <h1 class="title">Ver Película Silent Night</h1>
  <figure class="poster">
    <img itemprop="image" src="//repelisplus.buzz/cdn/p/v2/poster.webp" />
  </figure>
  <div class="backdrop-image" style="background-image: linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('//repelisplus.buzz/cdn/b/v2/backdrop.webp');"></div>
  <div class="description"><p>Sinopsis de la película.</p></div>
  <span class="year">2023</span>
  <span class="rating">8.5</span>
  <ul class="genres"><li>Acción</li><li>Crimen</li></ul>
  <div class="servers">
    <li data-server="aHR0cHM6Ly9zdHJlYW13aXNoLnRvL2UvYWJjMTIzeHl6">Streamwish</li>
    <li data-server="https://voe.sx/e/def456uvw">Voe</li>
  </div>
</div>
`;

const SAMPLE_SERIES_DETAIL_HTML = `
<div class="content-detail">
  <h1 class="title">Dexter</h1>
  <img class="poster" src="//repelisplus.buzz/cdn/p/v2/dexter.webp" />
  <p class="overview">Un asesino en serie que caza a criminales.</p>
  <div class="seasons-container">
    <div class="season-block" data-season="1">
      <div class="episode-item" data-episode="1">
        <a href="https://repelisplus.buzz/serie/dexter-1x01/">
          <span class="episode-title">Episodio 1</span>
          <img src="//repelisplus.buzz/cdn/episodes/1x01.webp" />
        </a>
      </div>
      <div class="episode-item" data-episode="2">
        <a href="https://repelisplus.buzz/serie/dexter-1x02/">
          <span class="episode-title">Episodio 2</span>
          <img src="//repelisplus.buzz/cdn/episodes/1x02.webp" />
        </a>
      </div>
    </div>
  </div>
</div>
`;

describe("decodeServerLink helper", () => {
  it("should return plaintext URLs as-is", () => {
    assert.equal(decodeServerLink("https://voe.sx/e/abc"), "https://voe.sx/e/abc");
  });

  it("should decode base64 encoded URLs", () => {
    const b64 = Buffer.from("https://nupload.my/watch/xyz123").toString("base64");
    assert.equal(decodeServerLink(b64), "https://nupload.my/watch/xyz123");
  });

  it("should unwrap nested iframe URLs", () => {
    const raw = "https://nupload.my/iframe/?url=https%3A%2F%2Fvoe.sx%2Fe%2Fabc";
    assert.equal(decodeServerLink(raw), "https://voe.sx/e/abc");
  });
});

describe("RepelisPlus GetDetail Operation", () => {
  it("should parse movie detail, clean title, extract real backdrop and decode base64 servers", () => {
    const detail = parseDetailHtml(SAMPLE_MOVIE_DETAIL_HTML, "/pelicula/silent-night-zsbl/");
    assert.equal(detail.title, "Silent Night");
    assert.equal(detail.provider, "repelisplus");
    assert.equal(detail.context?.provider, "repelisplus");

    // Poster should NOT match header logo
    assert.ok(detail.image);
    assert.ok(!detail.image.includes("logo"));
    assert.ok(detail.image.includes("/api/image?url="));

    // Backdrop should be extracted from linear-gradient url()
    assert.ok(detail.backgroundImage);
    assert.ok(!detail.backgroundImage.includes("logo"));
    assert.ok(detail.backgroundImage.includes("/api/image?url="));

    // Servers should be decoded
    assert.ok(Array.isArray(detail.context?.servers));
    assert.equal((detail.context?.servers as string[])[0], "https://streamwish.to/e/abc123xyz");
    assert.equal((detail.context?.servers as string[])[1], "https://voe.sx/e/def456uvw");

    assert.equal(detail.year, "2023");
    assert.equal(detail.rating, "8.5");
    assert.deepEqual(detail.tags, ["Acción", "Crimen"]);
  });

  it("should parse series with season and episode hierarchy, stamping provider onto every episode", () => {
    const detail = parseDetailHtml(SAMPLE_SERIES_DETAIL_HTML, "/serie/dexter/");
    assert.equal(detail.title, "Dexter");
    assert.equal(detail.provider, "repelisplus");
    assert.ok(detail.episodes && detail.episodes.length > 0);
    assert.equal(detail.episodes![0].season, "1");
    assert.equal(detail.episodes![0].episodes.length, 2);
    assert.equal(detail.episodes![0].episodes[0].context?.provider, "repelisplus");
    assert.equal(detail.episodes![0].episodes[0].numberEpisode, "1");
  });

  it("should execute operation with mocked FlareSolverr fetch", async () => {
    const mockFlareFetch = async () => new Response(SAMPLE_MOVIE_DETAIL_HTML, { status: 200 });
    const getDetail = new GetDetail(mockFlareFetch);
    const result = await getDetail.operation("/pelicula/silent-night-zsbl/");
    assert.ok(result);
    assert.equal(result.title, "Silent Night");
    assert.equal(result.provider, "repelisplus");
  });
});

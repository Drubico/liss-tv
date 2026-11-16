import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetDetail, parseDetailHtml } from "@/strategies/repelisplus/get-detail.operation";

const SAMPLE_MOVIE_DETAIL_HTML = `
<div class="content-detail">
  <h1 class="title">Silent Night</h1>
  <img class="poster" src="//repelisplus.buzz/cdn/p/v2/poster.webp" />
  <div class="card-hover-backdrop" data-backdrop="//repelisplus.buzz/cdn/b/v2/backdrop.webp"></div>
  <p class="overview">Sinopsis de la película.</p>
  <span class="year">2023</span>
  <span class="rating">8.5</span>
  <ul class="genres"><li>Acción</li><li>Crimen</li></ul>
  <div class="servers">
    <a href="#" data-server="https://streamwish.to/e/abc123xyz">Streamwish</a>
    <a href="#" data-server="https://voe.sx/e/def456uvw">Voe</a>
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

describe("RepelisPlus GetDetail Operation", () => {
  it("should parse movie detail with stamped provider and servers context", () => {
    const detail = parseDetailHtml(SAMPLE_MOVIE_DETAIL_HTML, "/pelicula/silent-night-zsbl/");
    assert.equal(detail.title, "Silent Night");
    assert.equal(detail.provider, "repelisplus");
    assert.equal(detail.context?.provider, "repelisplus");
    assert.ok(Array.isArray(detail.context?.servers));
    assert.equal((detail.context?.servers as string[])[0], "https://streamwish.to/e/abc123xyz");
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

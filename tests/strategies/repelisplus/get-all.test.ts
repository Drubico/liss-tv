import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GetAll, parseMovieItems } from "@/strategies/repelisplus/get-all.operation";

const SAMPLE_GRID_HTML = `
<div class="movie-item">
  <a href="https://repelisplus.buzz/pelicula/silent-night-venganza-silenciosa-zsbl/">
    <div class="item-picture">
      <figure>
        <img src="//repelisplus.buzz/cdn/p/v2/w1/sample.webp" class="poster" alt="Poster Silent Night" />
        <span class="year text-center">2023</span>
      </figure>
      <div class="card-hover">
        <div class="card-hover-backdrop" data-backdrop="//repelisplus.buzz/cdn/b/v2/w0/backdrop.webp"></div>
        <div class="card-hover-info">
          <div class="card-hover-info-meta"><div>1h 44min</div><div class="card-hover-meta-quality">HD</div></div>
          <ul class="card-hover-info-genre"><li>Acción</li><li>Crimen</li></ul>
          <div class="card-hover-info-overview"><p>Un padre afligido busca venganza.</p></div>
        </div>
      </div>
    </div>
    <div class="item-detail"><p>Silent Night</p></div>
  </a>
</div>
`;

describe("RepelisPlus GetAll Operation", () => {
  it("should parse .movie-item cards into MediaItem array with clean protocol-relative URLs", () => {
    const items = parseMovieItems(SAMPLE_GRID_HTML);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Silent Night");
    assert.equal(items[0].link, "/pelicula/silent-night-venganza-silenciosa-zsbl/");
    assert.equal(
      items[0].image,
      "/api/image?url=https%3A%2F%2Frepelisplus.buzz%2Fcdn%2Fp%2Fv2%2Fw1%2Fsample.webp",
    );
    assert.equal(
      items[0].context?.backgroundImage,
      "/api/image?url=https%3A%2F%2Frepelisplus.buzz%2Fcdn%2Fb%2Fv2%2Fw0%2Fbackdrop.webp",
    );
    assert.equal(items[0].year, "2023");
    assert.deepEqual(items[0].context?.tags, ["Acción", "Crimen"]);
  });

  it("should route search queries to /busqueda?s={query}", async () => {
    let requestedUrl = "";
    const mockFetch = async (url: string) => {
      requestedUrl = url;
      return new Response(SAMPLE_GRID_HTML, { status: 200 });
    };
    const getAll = new GetAll(mockFetch as unknown as typeof fetch);
    const result = await getAll.operation({ search: "avatar" });
    assert.ok(requestedUrl.includes("s=avatar"));
    assert.equal(result?.movies.length, 1);
  });

  it("should return empty movies list gracefully on empty response without throwing", async () => {
    const mockFetch = async () => new Response("<div>No results</div>", { status: 200 });
    const getAll = new GetAll(mockFetch as unknown as typeof fetch);
    const result = await getAll.operation({ search: "nonexistent123" });
    assert.deepEqual(result?.movies, []);
    assert.equal(result?.hasMore, false);
  });
});

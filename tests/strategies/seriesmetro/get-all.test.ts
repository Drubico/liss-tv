import test from "node:test";
import assert from "node:assert";
import { get, getAny } from "../../../services/movie.store.ts";
import { GetAll } from "../../../strategies/seriesmetro/get-all.operation.ts";

test("GetAll parses movie and series items with correct type disambiguation", async () => {
  const mockHtml = `
    <div class="animation-2 items">
      <article class="post dfx fcl movies">
        <header class="entry-header">
          <h2 class="entry-title">Scream 3 (2000)</h2>
          <div class="entry-meta"><span class="vote"><span>TMDB</span> 5.7</span></div>
        </header>
        <div class="post-thumbnail">
          <figure><img src="https://image.tmdb.org/t/p/w500/scream3.jpg" /></figure>
          <a href="https://www3.seriesmetro.net/pelicula/scream-3-la-mascara-de-la-muerte/"></a>
        </div>
      </article>
      <article class="post dfx fcl movies">
        <header class="entry-header">
          <h2 class="entry-title">Age of the Living Dead</h2>
          <div class="entry-meta"><span class="vote"><span>TMDB</span> 7.1</span></div>
        </header>
        <div class="post-thumbnail">
          <figure><img src="https://image.tmdb.org/t/p/w500/livingdead.jpg" /></figure>
          <a href="https://www3.seriesmetro.net/serie/age-of-the-living-dead/"></a>
        </div>
      </article>
    </div>
    <div class="pagination">
      <span class="current">1</span><a class="page-link" href="https://www3.seriesmetro.net/cartelera-peliculas/page/2/">2</a>
    </div>
  `;

  let requestedUrl = "";
  const mockFetch = async (url: string) => {
    requestedUrl = url;
    return new Response(mockHtml, { status: 200 });
  };
  const getAll = new GetAll(mockFetch as unknown as typeof fetch);

  const result = await getAll.operation(undefined, "movies", 1);
  assert(result !== undefined);
  assert(requestedUrl.includes("/cartelera-peliculas/"));
  assert.strictEqual(result.movies.length, 2);

  const movie = result.movies[0];
  assert.strictEqual(movie.id, "scream-3-la-mascara-de-la-muerte");
  assert.strictEqual(movie.title, "Scream 3");
  assert.strictEqual(movie.year, "2000");
  assert.strictEqual(movie.type, "movie");
  assert.strictEqual(movie.link, "/pelicula/scream-3-la-mascara-de-la-muerte/");
  assert.strictEqual(movie.provider, "seriesmetro");

  const serie = result.movies[1];
  assert.strictEqual(serie.id, "age-of-the-living-dead");
  assert.strictEqual(serie.title, "Age of the Living Dead");
  assert.strictEqual(serie.type, "serie");
  assert.strictEqual(serie.link, "/serie/age-of-the-living-dead/");
  assert.strictEqual(serie.provider, "seriesmetro");

  // Verify that movies are persisted to movie_cache so getAny resolves seriesmetro directly
  const cachedMovie = get("seriesmetro", "/pelicula/scream-3-la-mascara-de-la-muerte");
  assert(cachedMovie !== undefined);
  assert.strictEqual(cachedMovie.title, "Scream 3");
  assert.strictEqual(cachedMovie.provider, "seriesmetro");

  const anyMatch = getAny("pelicula/scream-3-la-mascara-de-la-muerte");
  assert(anyMatch !== undefined);
  assert.strictEqual(anyMatch.provider, "seriesmetro");
});

test("GetAll constructs correct URLs for pagination, series, and search", async () => {
  const urlsCalled: string[] = [];
  const mockFetch = async (url: string) => {
    urlsCalled.push(url);
    return new Response("<html><div class='items'></div></html>", { status: 200 });
  };

  const getAll = new GetAll(mockFetch as unknown as typeof fetch);

  await getAll.operation(undefined, "movies", 2);
  assert(urlsCalled[0].includes("/cartelera-peliculas/page/2/"));

  await getAll.operation(undefined, "series", 1);
  assert(urlsCalled[1].includes("/cartelera-series/"));

  await getAll.operation(undefined, "series", 3);
  assert(urlsCalled[2].includes("/cartelera-series/page/3/"));

  await getAll.operation("batman");
  assert(urlsCalled[3].includes("/?s=batman"));
});

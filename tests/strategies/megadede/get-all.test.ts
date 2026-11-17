import test from "node:test";
import assert from "node:assert";
import { GetAll, parseMegadedeCatalog } from "../../../strategies/megadede/get-all.operation.ts";

const SAMPLE_CATALOG_HTML = `
<!DOCTYPE html>
<html>
<body>
  <div class="content">
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/poster1.jpg" alt="Peleas a domicilio" />
      </figure>
      <div class="data">
        <h2 class="entry-title"><a href="/pelicula/peleas-a-domicilio-fx2PQs">Peleas a domicilio</a></h2>
        <span class="year">2024</span>
        <span class="rating">7.5</span>
      </div>
    </article>
    <article class="mv v por">
      <figure class="im brd1">
        <img src="https://image.tmdb.org/t/p/w300/poster2.jpg" alt="The Afterparty" />
      </figure>
      <div class="data">
        <h2 class="entry-title"><a href="/serie/the-afterparty">The Afterparty</a></h2>
        <span class="year">2022</span>
        <span class="rating">8.0</span>
      </div>
    </article>
  </div>
  <div class="pagination">
    <a href="/peliculas?page=2" class="page-numbers">2</a>
    <a href="/peliculas?page=5" class="page-numbers">5</a>
  </div>
</body>
</html>
`;

test("parseMegadedeCatalog parses movies, series and pagination flags", () => {
  const result = parseMegadedeCatalog(SAMPLE_CATALOG_HTML, 1);
  assert.strictEqual(result.movies.length, 2);

  const movie = result.movies[0];
  assert.strictEqual(movie.title, "Peleas a domicilio");
  assert.strictEqual(movie.link, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert.strictEqual(movie.image, "https://image.tmdb.org/t/p/w300/poster1.jpg");
  assert.strictEqual(movie.year, "2024");
  assert.strictEqual(movie.rating, "7.5");
  assert.strictEqual(movie.type, "movie");
  assert.strictEqual(movie.provider, "megadede");

  const serie = result.movies[1];
  assert.strictEqual(serie.title, "The Afterparty");
  assert.strictEqual(serie.link, "/serie/the-afterparty");
  assert.strictEqual(serie.type, "serie");
  assert.strictEqual(serie.provider, "megadede");

  assert.strictEqual(result.lastPageNumber, 5);
  assert.strictEqual(result.hasMore, true);
});

test("GetAll operation queries search when search parameter is provided", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = input.toString();
    return new Response(SAMPLE_CATALOG_HTML, { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getAll = new GetAll();
  const res = await getAll.operation("batman", undefined, 2);

  assert(requestedUrl.includes("/search?s=batman&page=2") || requestedUrl.includes("/?s=batman&page=2"));
  assert.strictEqual(res?.movies.length, 2);
});

test("GetAll operation queries series catalog when slug is series", async (t) => {
  const originalFetch = global.fetch;
  let requestedUrl = "";

  global.fetch = async (input: RequestInfo | URL) => {
    requestedUrl = input.toString();
    return new Response(SAMPLE_CATALOG_HTML, { status: 200 });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getAll = new GetAll();
  const res = await getAll.operation(undefined, "series", 1);

  assert(requestedUrl.includes("/series?page=1"));
  assert.strictEqual(res?.movies.length, 2);
});

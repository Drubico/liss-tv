import test from "node:test";
import assert from "node:assert";
import { GetDetail, parseMegadedeDetail } from "../../../strategies/megadede/get-detail.operation.ts";

const SAMPLE_MOVIE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Peleas a domicilio (2024)" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500/backdrop_movie.jpg" />
</head>
<body>
  <div class="movie-info" id="item-context" data-type="pelicula" data-slug="peleas-a-domicilio-fx2PQs">
    <div class="poster"><img src="https://image.tmdb.org/t/p/w300/poster_movie.jpg" /></div>
    <h1 class="title">Peleas a domicilio</h1>
    <div class="desc"><p>Dos amigos crean una empresa de peleas clandestinas.</p></div>
    <div class="meta">
      <span class="year">2024</span>
      <span class="rating">7.5</span>
      <span class="duration">1h 45m</span>
      <div class="genres"><a href="/genero/accion">Acción</a><a href="/genero/comedia">Comedia</a></div>
    </div>
    <div class="player-section">
      <button class="server-btn active" onclick="changeServer('/vidurl/tt34724686/', this)">Embed69</button>
    </div>
  </div>
</body>
</html>
`;

const SAMPLE_SERIE_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="The Afterparty" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/original/backdrop_serie.jpg" />
</head>
<body>
  <div class="movie-info" id="item-context" data-type="serie" data-slug="the-afterparty">
    <div class="poster"><img src="https://image.tmdb.org/t/p/w300/poster_serie.jpg" /></div>
    <h1 class="title">The Afterparty</h1>
    <div class="desc"><p>Una reunión de secundaria termina en asesinato.</p></div>
    <div class="meta">
      <span class="year">2022</span>
      <span class="rating">8.0</span>
      <span class="duration">35m</span>
      <div class="genres"><a href="/genero/misterio">Misterio</a><a href="/genero/comedia">Comedia</a></div>
    </div>
    <div class="season-container" data-season="1">
      <a href="/serie/the-afterparty#s1-e1" data-episode-link data-season="1" data-episode="1" class="episode-card">
        <div class="fz5">Ep 1</div>
        <p class="tvw">El día después</p>
      </a>
      <a href="/serie/the-afterparty#s1-e2" data-episode-link data-season="1" data-episode="2" class="episode-card">
        <div class="fz5">Ep 2</div>
        <p class="tvw">Brett</p>
      </a>
    </div>
    <div class="season-container" data-season="2">
      <a href="/serie/the-afterparty#s2-e1" data-episode-link data-season="2" data-episode="1" class="episode-card">
        <div class="fz5">Ep 1</div>
        <p class="tvw">Aniq 2</p>
      </a>
    </div>
  </div>
</body>
</html>
`;

test("parseMegadedeDetail correctly parses movie details and vidurl", () => {
  const detail = parseMegadedeDetail(SAMPLE_MOVIE_DETAIL_HTML, "/pelicula/peleas-a-domicilio-fx2PQs");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Peleas a domicilio");
  assert.strictEqual(detail.year, "2024");
  assert.strictEqual(detail.rating, "7.5");
  assert.strictEqual(detail.duration, "1h 45m");
  assert.strictEqual(detail.caption, "Dos amigos crean una empresa de peleas clandestinas.");
  assert.strictEqual(detail.image, "https://image.tmdb.org/t/p/w300/poster_movie.jpg");
  assert.strictEqual(detail.backgroundImage, "https://image.tmdb.org/t/p/w500/backdrop_movie.jpg");
  assert.deepStrictEqual(detail.tags, ["Acción", "Comedia"]);
  assert.strictEqual(detail.type, "movie");
  assert.strictEqual(detail.provider, "megadede");
  assert.strictEqual(detail.movieUrl, "/vidurl/tt34724686/");
});

test("parseMegadedeDetail correctly parses serie details with seasons and episodes", () => {
  const detail = parseMegadedeDetail(SAMPLE_SERIE_DETAIL_HTML, "/serie/the-afterparty");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "The Afterparty");
  assert.strictEqual(detail.type, "serie");
  assert.strictEqual(detail.provider, "megadede");
  assert.strictEqual(detail.episodes?.length, 2);

  const s1 = detail.episodes[0];
  assert.strictEqual(s1.season, "1");
  assert.strictEqual(s1.episodes.length, 2);
  assert.strictEqual(s1.episodes[0].numberEpisode, "1");
  assert.strictEqual(s1.episodes[0].title, "El día después");
  assert.strictEqual(s1.episodes[0].link, "/serie/the-afterparty#s1-e1");
  assert.deepStrictEqual(s1.episodes[0].context, {
    season: 1,
    episode: 1,
    slug: "the-afterparty",
    provider: "megadede",
  });

  const s2 = detail.episodes[1];
  assert.strictEqual(s2.season, "2");
  assert.strictEqual(s2.episodes.length, 1);
  assert.strictEqual(s2.episodes[0].numberEpisode, "1");
  assert.strictEqual(s2.episodes[0].title, "Aniq 2");
});

test("GetDetail operation returns undefined on 404", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response("Not found", { status: 404 });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const getDetail = new GetDetail();
  const res = await getDetail.operation("/pelicula/not-existing");
  assert.strictEqual(res, undefined);
});

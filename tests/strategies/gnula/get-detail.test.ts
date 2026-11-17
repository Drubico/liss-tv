import test from "node:test";
import assert from "node:assert";
import { GetDetail } from "../../../strategies/gnula/get-detail.operation.ts";
import { Response } from "node-fetch";

const SAMPLE_GNULA_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Ver Deadpool y Wolverine (2024) Online - Gnula" />
  <meta property="og:image" content="https://image.tmdb.org/t/p/w500/backdrop_deadpool.jpg" />
  <meta itemprop="image" content="https://image.tmdb.org/t/p/w300/poster_deadpool.jpg" />
</head>
<body>
  <div class="gnrd-fi-bg" style="background-image: url('https://image.tmdb.org/t/p/w500/backdrop_deadpool.jpg')"></div>
  <h1 class="gnrd-fi-title">
    <span class="gnrd-sr">Deadpool y Wolverine</span>
  </h1>
  <div class="gnrd-fi-meta">
    <span class="gnrd-eyebrow">2024</span>
    <span>2h 8min</span>
  </div>
  <span class="gnrd-cm-rating">★ 7.9</span>
  <p class="gnrd-fi-syn">Wade Wilson es reclutado por la TVA.</p>
  <div class="gnrd-fi-genres">
    <a href="/genero/accion">Acción</a>
    <a href="/genero/comedia">Comedia</a>
  </div>
</body>
</html>
`;

test("GetDetail correctly parses Gnula movie details", async () => {
  const mockFetch = async () =>
    new Response(SAMPLE_GNULA_DETAIL_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

  const getDetail = new GetDetail(mockFetch as unknown as typeof import("../../../strategies/gnula/client.ts").gnulaFetch);
  const detail = await getDetail.operation("/pelicula/deadpool-y-wolverine");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Deadpool y Wolverine");
  assert.strictEqual(detail.year, "2024");
  assert.strictEqual(detail.duration, "2h 8min");
  assert.strictEqual(detail.rating, "7.9");
  assert.strictEqual(detail.caption, "Wade Wilson es reclutado por la TVA.");
  assert.deepStrictEqual(detail.tags, ["Acción", "Comedia"]);
  assert.strictEqual(detail.provider, "gnula");
});

test("GetDetail handles alternative h1 and og:title markup gracefully", async () => {
  const ALT_HTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta property="og:title" content="Ver Gladiador 2 (2024) Online - Gnula" />
    <meta property="og:image" content="https://image.tmdb.org/t/p/w500/gladiador.jpg" />
  </head>
  <body>
    <h1 class="title">Gladiador 2</h1>
    <div class="year">2024</div>
    <p class="desc">Años después de presenciar la muerte del héroe Máximo.</p>
  </body>
  </html>
  `;

  const mockFetch = async () =>
    new Response(ALT_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

  const getDetail = new GetDetail(mockFetch as unknown as typeof import("../../../strategies/gnula/client.ts").gnulaFetch);
  const detail = await getDetail.operation("/pelicula/gladiador-2");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Gladiador 2");
  assert.strictEqual(detail.year, "2024");
  assert.strictEqual(detail.caption, "Años después de presenciar la muerte del héroe Máximo.");
});

test("GetDetail falls back from ver/<slug>/ to pelicula/<slug>/ when ver returns 404", async () => {
  const mockFetch = async (url: string) => {
    if (url.includes("ver/interstellar/")) {
      return new Response("Not found", { status: 404 });
    }
    if (url.includes("pelicula/interstellar/")) {
      return new Response(SAMPLE_GNULA_DETAIL_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
    return new Response("Not found", { status: 404 });
  };

  const getDetail = new GetDetail(mockFetch as unknown as typeof import("../../../strategies/gnula/client.ts").gnulaFetch);
  const detail = await getDetail.operation("/pelicula/interstellar");
  assert(detail !== undefined);
  assert.strictEqual(detail.title, "Deadpool y Wolverine");
});

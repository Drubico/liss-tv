# Diseño Técnico: Proveedor PoseidonHD 2 (`poseidon`)

## 1. Intención y Justificación (Why)
Ampliar las fuentes de contenido de la plataforma integrando **PoseidonHD 2** (`https://www.poseidonhd2.co/`) como un driver desacoplado bajo el patrón Strategy. Este proveedor enriquece el catálogo con metadatos de alta fidelidad provenientes de TMDB y ofrece enlaces de video orientados exclusivamente a la audiencia en idioma **Latino**, resolviendo streams nativos HLS (`master.m3u8`) a través del cyberlocker Vidara para ser persistidos en la caché de MinIO y SQLite.

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### Objetivos (Goals)
1. Implementar las 3 estrategias del patrón Strategy en `strategies/poseidon/`:
   - `get-all.operation.ts`: catálogo de películas y series con paginación y búsqueda textual.
   - `get-detail.operation.ts`: detalle con póster y backdrop en resolución original, metadatos TMDB y lista de episodios/temporadas estructuradas.
   - `get-url.operation.ts`: resolución de video priorizando streams en idioma **Latino** y servidor **Vidara**, generando URLs `.m3u8`.
2. Integrar el cliente HTTP tipado `strategies/poseidon/client.ts` con headers adecuados y extracción resiliente del bloque `<script id="__NEXT_DATA__">`.
3. Encapsular la creación mediante el patrón Builder en `builder/poseidon.build.ts`.
4. Registrar el nuevo driver en `builder/factory.ts` y `drivers/registry.ts`, envuelto automáticamente con `CachedDriverDecorator`.
5. Reutilizar `resolveCachedStream` y `persistUpstreamManifest` para almacenar los manifests HLS en MinIO y SQLite.

### No-Objetivos (Non-Goals)
- No alterar componentes de interfaz (`PlayerView`, `VideoPlayer`, páginas de Next.js, `Navbar`).
- No resolver servidores en idiomas castellano ni inglés a menos que el usuario o el sistema los solicite explícitamente en el futuro (la regla establecida es prioridad exclusiva Latino).
- No implementar bypasses pesados con Playwright/FlareSolverr para metadata, ya que PoseidonHD2 no impone protecciones Cloudflare restrictivas en sus endpoints de contenido.

### Anti-Objetivos (Anti-Goals)
- No acoplar ninguna vista ni Server Action al identificador `poseidon`.
- No alterar los contratos compartidos en `types/driver.ts` ni `types/domain.ts`.
- No intentar resolver cyberlockers con CAPTCHAs interactivos (e.g. Altcha de VOE) si existe una alternativa limpia y automatizable (Vidara / Doodstream / Streamwish).

---

## 3. Restricciones y Principios de Código
- **SOLID & Clean Architecture:** Cumplimiento estricto de [`AGENTS.md`](./AGENTS.md) y [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- **TypeScript Strict:** Prohibido el uso de `any`; todos los payloads de `__NEXT_DATA__` se tipan mediante interfaces TypeScript.
- **Transparencia de Persistencia:** Las estrategias no acceden a base de datos de manera arbitraria; la persistencia del catálogo y detalle la orquesta `CachedDriverDecorator`, y la persistencia de video la realiza `persistUpstreamManifest` dentro de `GetUrl`.

---

## 4. Enfoques Considerados (Approaches)

### Enfoque 1: Extracción vía `__NEXT_DATA__` + Resolvedor Vidara HLS + StreamCache (Seleccionado)
- **Detalle:** PoseidonHD2 es una aplicación Next.js SSR/SSG. Cada página incluye el tag `<script id="__NEXT_DATA__" type="application/json">` con objetos estructurados directamente desde TMDB. `GetUrl` obtiene el identificador de `player.php?h=...` y extrae el token de Vidara para consumir `POST https://vidara.to/api/stream`, el cual entrega un stream nativo `master.m3u8` que se cachea en MinIO con `persistUpstreamManifest`.
- **Por qué fue elegido:** Máxima velocidad (100% peticiones HTTP ligeras sin dependencias de navegadores headless), cero fragilidad por selectores CSS y entrega de streams directos compatibles con `@vidstack/react`.

### Enfoque 2: Scraping HTML con Cheerio
- **Detalle:** Parsear selectores CSS (`.card`, `.poster`, `.title`) en el HTML renderizado.
- **Por qué fue descartado:** Muy frágil ante cambios de diseño y desperdicia los datos TMDB estructurados que ya vienen en `__NEXT_DATA__`.

### Enfoque 3: Rutas de datos internas de Next.js (`/_next/data/<buildId>/...`)
- **Detalle:** Consumir directamente los JSON de rutas de Next.js.
- **Por qué fue descartado:** Los `buildId` de Next.js cambian con cada nuevo despliegue del proveedor en producción, provocando errores 404 súbitos.

---

## 5. Diseño Detallado de la Solución

### 5.1 Estructura de Archivos
```
strategies/
└── poseidon/
    ├── types.ts              # Interfaces del payload __NEXT_DATA__ de Poseidon
    ├── client.ts             # Cliente fetch con User-Agent y extractor de NEXT_DATA
    ├── get-all.operation.ts   # Implementa StrategyGetAllMovies
    ├── get-detail.operation.ts# Implementa StrategyGetMovieDetails
    └── get-url.operation.ts   # Implementa StrategyGetUrl (Vidara m3u8 + StreamCache)
builder/
└── poseidon.build.ts         # Implementa MovieBuilder<MovieContext>
```

### 5.2 Estrategia `GetAll` (`get-all.operation.ts`)
- **Rutas de consulta:**
  - Búsqueda: `/search?q=${encodeURIComponent(query)}&page=${pageNumber}`
  - Catálogo Series: `/series?page=${pageNumber}`
  - Catálogo Películas / Home: `/peliculas?page=${pageNumber}`
- **Transformación de dominio:**
  - `slug`: Si `item.url.slug` inicia con `series/`, se mapea canónicamente a `/serie/<tmdbId>/<slug>`. Si inicia con `movies/`, se mapea a `/pelicula/<tmdbId>/<slug>`.
  - `title`: `item.titles.name`.
  - `image`: `item.images.poster`.
  - `rating`: `String(item.rate?.average || "")`.
  - `year`: Año extraído de `item.releaseDate` o campo directo.
  - Paginación: Extraída de `pageProps.pages` (`hasMore = pageNumber < lastPageNumber`).

### 5.3 Estrategia `GetDetail` (`get-detail.operation.ts`)
- **Rutas de detalle:**
  - Película: `/pelicula/<tmdbId>/<slug>` (o `/movies/<tmdbId>/<slug>`). Extrae `pageProps.thisMovie`. En películas, almacena `thisMovie.videos` en `context` para que `GetUrl` no requiera una segunda petición.
  - Serie: `/serie/<tmdbId>/<slug>` (o `/series/<tmdbId>/<slug>`). Extrae `pageProps.thisSerie`. Solo carga la estructura de temporadas y episodios sin hacer peticiones previas a los episodios (evitando N peticiones lentas).
- **Mapeo:**
  - `backgroundImage`: `thisMovie.images.backdrop` o `thisSerie.images.backdrop` (en resolución original).
  - `image`: `thisMovie.images.poster` o `thisSerie.images.poster`.
  - `tags`: Nombres de `genres`.
  - `caption`: `overview`.
  - `episodes`: Mapea `seasons` filtrando temporada 0 si está vacía. Cada episodio contiene `numberEpisode`, `title`, `image`, y `link: /serie/<tmdbId>/<slug>/temporada/<seasonNum>/episodio/<epNum>`.
  - `context`: En películas incluye `videos`. En episodios individuales, los servidores se resuelven bajo demanda en `GetUrl`.

### 5.4 Estrategia `GetUrl` (`get-url.operation.ts`)
1. **Verificación de Caché:** `resolveCachedStream(path)` (revisa MinIO y SQLite para streams reutilizables).
2. **Obtención de Servidores:**
   - Si `options?.detailContext?.videos` está presente (típico en películas), lo consume directamente.
   - Si no está presente (típico en episodios de series o acceso directo), realiza fetch a la URL del episodio (`/serie/.../temporada/X/episodio/Y`) y extrae `pageProps.episode.videos`.
3. **Selección de Idioma:** Filtra exclusivamente la sección `videos.latino` (regla estricta del usuario).
4. **Resolución de Stream (Vidara First):**
   - Localiza el servidor con `cyberlocker === "vidara"`.
   - Consulta `result` (e.g. `https://player.poseidonhd2.co/player.php?h=...`), extrayendo el enlace embebido `https://vidara.to/e/<filecode>`.
   - Consume `POST https://vidara.to/api/stream` con `{ filecode, device: "web", codecs: [] }`.
   - Obtiene `streaming_url` correspondiente al manifest `master.m3u8`.
5. **Persistencia en MinIO/SQLite:** Invoca `persistUpstreamManifest(path, streamingUrl, { referer: 'https://vidara.to/' })`.
6. **Manejo de Ausencia de Stream:** Si no existen servidores en idioma Latino o Vidara no logra resolver el stream nativo, retorna `{ url: null, fallbackUrl: null }` de forma limpia y controlada, evitando provocar reintentos infructuosos en las Server Actions.

### 5.5 Registro del Proveedor
- `builder/poseidon.build.ts`:
  - `id`: `"poseidon"`
  - `name`: `"Poseidon HD"`
- `builder/factory.ts`: Registro del builder en `MovieContextFactory`.
- `drivers/registry.ts`: Inicialización y envoltura con `CachedDriverDecorator(MovieContextFactory.driver("poseidon"))`.

---

## 6. Decisiones del Usuario y Puntos de Extensión
- **Idioma:** Siempre Latino (definido explícitamente por el usuario).
- **Nombre e ID:** `poseidon` / `"Poseidon HD"`.
- **Caché:** Completamente transparente a través de los decoradores y servicios existentes de la plataforma.

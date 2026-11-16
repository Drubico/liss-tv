# Especificación de Diseño: Aislamiento por Proveedor en Persistencia (movie.store)

**Fecha:** 2026-11-16  
**Estado:** Propuesta  
**Autor:** Antigravity  
**Revisor:** Usuario  

---

## 1. Contexto y Por Qué (Intent & The Why)

En Liss-TV, el contenido proviene de múltiples proveedores (`gnula`, `sololatino`, `serieslan`, etc.). Actualmente, la persistencia en SQLite (`services/movie.store.ts`) utiliza una única tabla `movie_cache` con clave primaria simple `key TEXT PRIMARY KEY` basada en la ruta normalizada (`/pelicula/xyz`, `/serie/xyz`).

### Problema Identificado
1. **Polución cruzada de caché:** Cuando un usuario cambia de proveedor o navega a un título, si el nuevo proveedor no tiene la película o serie (o falla el scraping), se sobreescribía la entrada global en SQLite con datos vacíos o corruptos (`title: ""`, sin imágenes, sin episodios).
2. **Persistencia de estados vacíos:** No existía una guarda que impidiera persistir detalles incompletos o inválidos. Una vez guardado el registro vacío, quedaba cacheado por 7 días y no se recuperaba ni siquiera volviendo al proveedor original.
3. **Claves de catálogo dispares:** Algunas estrategias prefijaban claves (`gnula:home:...`) y otras no (`sololatino` guardaba `"home"`), provocando colisiones en listados.

El objetivo es aislar completamente el almacenamiento por proveedor en SQLite, rechazar el guardado de datos vacíos/inválidos y actualizar de forma coherente los puntos de consumo.

---

## 2. Metas, No-Metas y Anti-Metas

### Metas (Goals)
- **Aislamiento estricto por proveedor:** Cada entrada en `movie_cache` pertenece a un `providerId` explícito (`PRIMARY KEY (provider, key)`).
- **Guarda de calidad de datos:** `upsert` y `upsertAll` deben rechazar y no persistir objetos vacíos o detalles sin título válido (`!data.title?.trim()`).
- **Migración transparente de datos:** Migrar la tabla existente `movie_cache` de clave simple `(key)` a clave compuesta `(provider, key)` sin perder datos y saneando entradas corruptas.
- **Limpieza y operaciones por proveedor:** Posibilidad de invalidar o consultar la caché de un proveedor específico de manera indexada.
- **Desacoplamiento según AGENTS.md:** Mantener la persistencia orquestada en `CachedDriverDecorator` y dar compatibilidad a llamadas existentes en server actions y resolvedores de stream.

### No-Metas (Non-Goals)
- No cambiar la arquitectura de drivers ni el patrón Strategy de proveedores.
- No modificar el sistema de cookies de selección de proveedor ni la UI.
- No alterar el bucket MinIO de manifiestos HLS.

### Anti-Metas (Anti-Goals)
- **No permitir registros sin proveedor:** Evitar que se guarden datos con proveedor indefinido o `null`.
- **No romper compatibilidad temporal de lectura:** Si algún punto externo consulta sin proveedor, contar con una estrategia determinista de resolución/fallback sin lanzar excepciones no controladas.

---

## 3. Enfoques Considerados (Approaches)

### Enfoque A: Claves con prefijo de string (`"${provider}:${link}"`)
- **Descripción:** Mantener la tabla `(key TEXT PRIMARY KEY, data, updated_at)` y prefijar todas las claves con el nombre del proveedor.
- **Pros:** No requiere cambiar el DDL de la tabla SQLite.
- **Contras:** Rompe la forma normal relacional, dificulta la indexación y consultas directas por proveedor (requiere `LIKE`), y no garantiza integridad en el esquema.

### Enfoque B (Elegido por el Usuario): Columna `provider` explícita y clave primaria compuesta `(provider, key)`
- **Descripción:** Modificar el esquema a `(provider TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (provider, key))` con índice adicional en `provider`.
- **Pros:** Modelo relacional limpio y normalizado. Consultas indexadas rápidas por `(provider, key)` y `provider`. Permite invalidación masiva por proveedor.
- **Contras:** Requiere una función de migración en SQLite para actualizar la tabla existente preservando registros válidos.

---

## 4. Diseño Detallado de la Solución

### 4.1 Esquema de SQLite y Migración (`services/movie.store.ts`)

```sql
CREATE TABLE IF NOT EXISTS movie_cache (
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, key)
);
CREATE INDEX IF NOT EXISTS idx_movie_cache_provider ON movie_cache (provider);
```

#### Estrategia de Migración:
1. Inspeccionar `PRAGMA table_info(movie_cache)`.
2. Si la columna `provider` no existe:
   - Crear tabla temporal `movie_cache_v2`.
   - Copiar registros existentes extrayendo el `provider` desde `JSON_EXTRACT(data, '$.provider')`, o detectando prefijos tipo `gnula:` en la clave, o asignando `'sololatino'` por defecto a los legados sin proveedor.
   - Descartar entradas con datos vacíos o sin `title` durante la copia.
   - Eliminar `movie_cache` antigua y renombrar `movie_cache_v2` a `movie_cache`.

### 4.2 Firmas del Módulo `movie.store.ts`

```typescript
export function upsert(
  provider: string,
  link: string,
  data: Partial<Omit<StoredMovie, "link" | "updatedAt">>
): StoredMovie | null;

export function get(provider: string, link: string): StoredMovie | undefined;

export function getAny(link: string): StoredMovie | undefined; // Fallback para actions que infieren proveedor

export function remove(provider: string, link: string): void;

export function upsertAll<T>(provider: string, key: string, data: T): void;

export function getAllData<A>(provider: string, key: string): { data: A; updatedAt: string } | undefined;

export function clearProvider(provider: string): void;
```

### 4.3 Validación y Guarda Anti-Basura
En `upsert`:
- Si `!data.title || data.title.trim() === ""` y no es una actualización parcial de `movieUrl`, abortar y retornar `null` (no persistir).
- Si `provider` no está definido o es string vacío, lanzar o rechazar para garantizar integridad.

### 4.4 Adaptación de Consumidores

1. **`CachedDriverDecorator` (`drivers/cached-driver.decorator.ts`):**
   - Pasa `this.id` a `getAllData(this.id, key)`, `upsertAll(this.id, key, stamped)`, `get(this.id, link)` y `upsert(this.id, link, stamped)`.
   - Si `fresh` viene con `title` vacío, no persiste.

2. **Estrategias (`strategies/gnula`, `strategies/sololatino`, `strategies/serieslan`):**
   - Limpieza de llamadas directas a `movie.store` dentro de las estrategias de scraping (cumpliendo SRP según `AGENTS.md` y `ARCHITECTURE.md`), delegando la persistencia a `CachedDriverDecorator`. O bien, pasar su proveedor explícito (`"gnula"`, `"sololatino"`).

3. **Server Actions (`app/actions/movie.ts`):**
   - En `getDetails(link, providerId)`: si no viene `providerId`, consultar `getAny(link)` o `inferProviderFromLink(link)` para resolver el driver correcto, y luego consultar `driver.getDetail(link)`.

4. **Stream Cache & MinIO (`services/stream-cache.service.ts` & `app/api/video/m3u8/route.ts`):**
   - Permitir actualización de `movieUrl` asociando el proveedor correspondiente o actualizando por `(provider, link)`.

---

## 5. Casos de Prueba (Testing Plan)

1. **Persistencia por Proveedor:**
   - Guardar `/pelicula/spider-man` para `sololatino`.
   - Guardar `/pelicula/spider-man` para `gnula` con metadatos distintos.
   - Comprobar que `get('sololatino', ...)` y `get('gnula', ...)` devuelven sus respectivos datos sin cruzarse.
2. **Guarda de Contenido Vacío:**
   - Intentar `upsert('gnula', '/pelicula/inexistente', { title: "" })`.
   - Comprobar que no se guarda en la base de datos y `get('gnula', ...)` retorna `undefined`.
3. **Migración de Base de Datos:**
   - Ejecutar la migración con registros simulados de la tabla antigua.
   - Validar que los registros válidos se migran con su `provider` correspondiente.
4. **Validación de la Suite Completa:**
   - Ejecutar `npm test` para asegurar que las 56 pruebas existentes se mantengan en verde.

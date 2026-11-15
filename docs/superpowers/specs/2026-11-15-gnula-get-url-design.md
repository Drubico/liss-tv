# Especificación de Diseño: Implementación de GetUrl para Gnula

**Fecha:** 2026-11-15  
**Estado:** Propuesta  
**Autor:** Antigravity  
**Revisor:** Usuario  

---

## 1. Contexto y Objetivos

En la arquitectura actual de Liss-TV, el proveedor `gnula` (`ww3.gnulahd.nu`) cuenta con implementaciones operativas para `GetAll` y `GetDetail`, pero `GetUrl` en `builder/gnula.build.ts` lanza actualmente una excepción `"GetUrl not implemented yet"`.

El objetivo de esta especificación es diseñar e implementar la operación `GetUrl` para el proveedor Gnula cumpliendo estrictamente con:
- `AGENTS.md` (patrón Strategy, Clean Code, SOLID, tipado estricto sin `any`, pruebas unitarias con mocks).
- Obtención de URLs reproducibles prioritariamente en streaming nativo HLS (`.m3u8`) a través de los resolvedores internos de Gnula (Vidara, SaveFiles, The Tube) sin anuncios emergentes ni popups, con fallback funcional a iframes embed.

---

## 2. Análisis Técnico de la Arquitectura de Gnula

Tras la ingeniería inversa sobre `https://ww3.gnulahd.nu/`, se identificó el flujo completo:

### 2.1 Extracción de Parámetros desde el HTML del Contenido
Al solicitar la URL de una película (`/ver/<slug>/`) o de un episodio (`/<slug>-<temporada>x<episodio>/`):
1. **Identificadores del reproductor:**
   - `_gnrdPid`: ID numérico del post (ej. `509498`).
   - `_gnrdTok`: Token de autorización (32 caracteres hexadecimales).
2. **Endpoints y Tokens de Resolvedores (Script 19):**
   - Vidara: `VD_RESOLVE = '/panel/vidara-resolve.php'`, `VD_AUTH = '&t=...'`
   - SaveFiles: `SF_RESOLVE = '/panel/savefiles-resolve.php'`, `SF_AUTH = '&t=...'`
   - The Tube: `RESOLVE = '/panel/the-tube-resolve.php?code='`, `AUTH = '&t=...'`

### 2.2 Consulta al Endpoint del Reproductor Anti-Bot
Gnula invoca:
```http
GET /wp-json/gnrd/v1/player?id={_gnrdPid}&t={_gnrdTok}
X-Gn-Scr: 1920x1080|1920x1040|1920x969|1|0|0|8|8|24|0|1|hw
X-Gn-Dev: <12-hex-chars>
Referer: https://ww3.gnulahd.nu/ver/<slug>/
```
El servidor responde un JSON con carga útil ofuscada:
```json
{
  "p": "<base64_encoded_string>"
}
```

### 2.3 Desempaquetado XOR (`gnrdUnpack`)
La carga se decodifica de Base64 a bytes y se desofusca aplicando una clave XOR cíclica de 4 bytes:
- Clave: `k = [103, 78, 55, 100]` (caracteres ASCII `'g'`, `'N'`, `'7'`, `'d'`).
- La salida desempaquetada es un JSON con la estructura:
```json
{
  "langs": [
    {
      "label": "Latino",
      "flag": "MX",
      "servers": [
        { "title": "Servidor 1", "src": "https://vidaraa.cc/e/..." },
        { "title": "Servidor 2", "src": "https://savefiles.com/e/..." }
      ]
    }
  ]
}
```

### 2.4 Cascada de Resolución a M3U8 Limpio
Para evitar iframes con scripts de publicidad de terceros, se consulta el resolvedor interno correspondiente:
1. **Vidara (`vidaraa.cc`, `vidara.to`):**
   - Parámetros: `code` (ej. `TonyrXmWc1Ie0`), `host` (`vidaraa.cc`).
   - Endpoint: `/panel/vidara-resolve.php?pl=1&code={code}&host={host}&t={VD_AUTH}`.
   - Respuesta: Manifiesto directo HLS `application/vnd.apple.mpegurl` (código HTTP 200).
2. **SaveFiles (`savefiles.com`):**
   - Parámetros: `code` extraído de la URL `/e/{code}`.
   - Endpoint: `/panel/savefiles-resolve.php?code={code}&t={SF_AUTH}`.
   - Respuesta: JSON `{ "master": "https://s1.savefiles.com/.../master.m3u8" }`.
3. **The Tube (`they.tube`):**
   - Parámetros: `code` extraído del embed.
   - Endpoint: `/panel/the-tube-resolve.php?code={code}&t={AUTH}`.
   - Respuesta: JSON `{ "master": "https://..." }`.
4. **Fallback:**
   - Si los resolvedores fallan o devuelven 404/410, se utiliza la URL embed `server.src` original como fallback.

---

## 3. Diseño de la Solución

### 3.1 Nueva Operación: `strategies/gnula/get-url.operation.ts`
Implementa la interfaz `StrategyGetUrl`:
```typescript
export class GetUrl implements StrategyGetUrl {
  async operation(path: string, options?: GetUrlOptions): Promise<Url>
}
```

#### Responsabilidades internas de `GetUrl`:
1. **Normalización de Ruta:** Admite rutas relativas (`/ver/street-fighter/`, `/the-last-of-us-2x07/`) o completas.
2. **Extracción de Metadatos:** Extrae `pid`, `tok`, y tokens de resolvedores de la página con Cheerio y Regex. Si vienen en `options?.detailContext`, los reutiliza evitando peticiones redundantes.
3. **Obtención y Desempaquetado de Servidores:**
   - Llama a `/wp-json/gnrd/v1/player` con headers de emulación de navegador.
   - Ejecuta `gnrdUnpack` con clave `[103, 78, 55, 100]`.
4. **Resolución en Cascada:**
   - Selecciona el idioma preferido (`Latino` por defecto o `options?.params?.lang`).
   - Itera por los servidores disponibles intentando resolver la playlist HLS directa.
   - Retorna objeto `Url` con `url` principal y `fallbackUrl`.

### 3.2 Modificación de `builder/gnula.build.ts`
Reemplaza la clase dummy `GetUrl` interna con la instancia de `strategies/gnula/get-url.operation.ts`.

### 3.3 Mapeo al Dominio Común (`Url`)
Cumple estrictamente con el contrato `@/types/movie`:
```typescript
export interface Url {
  url: string;
  fallbackUrl?: string;
}
```

---

## 4. Pruebas y Validación

Se creará la suite unitaria en `tests/strategies/gnula/get-url.test.ts`:
1. **Desempaquetado XOR:** Verifica que la función unpack descifre correctamente un payload real empaquetado con la clave `[103, 78, 55, 100]`.
2. **Resolución de Vidara:** Mockea la respuesta HTML, la llamada a `/wp-json/gnrd/v1/player` y `/panel/vidara-resolve.php`, validando que se devuelva la URL `.m3u8` resuelta.
3. **Resolución de SaveFiles:** Mockea la llamada de SaveFiles y verifica la extracción del campo `master`.
4. **Manejo de Errores y Fallback:**
   - Cuando el resolvedor devuelve error, retorna la URL embed directa como fallback.
   - Cuando no hay servidores ni reproductor disponible, lanza un error controlado sin romper el proceso.
5. **Type Checking y Lint:**
   - `npx tsc --noEmit` con 0 errores.
   - `npm run lint` con 0 advertencias/errores.

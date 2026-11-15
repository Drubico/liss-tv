import { getAllData, upsertAll } from "../../services/movie.store.ts";
import type { PoseidonNextData } from "./types.ts";

export const POSEIDON_BASE_URL = "https://www.poseidonhd2.co";

export const POSEIDON_DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

/**
 * Extracts and parses the __NEXT_DATA__ JSON payload from an HTML page.
 * Throws a descriptive error if the script tag is not present.
 */
export function extractNextData<T = PoseidonNextData>(html: string): T {
  const match = html.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );

  if (!match || !match[1]) {
    throw new Error(
      "[PoseidonClient] __NEXT_DATA__ script not found in page HTML",
    );
  }

  try {
    return JSON.parse(match[1]) as T;
  } catch (error) {
    throw new Error(
      `[PoseidonClient] Failed to parse __NEXT_DATA__ JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Performs a standard fetch against PoseidonHD 2 with default headers.
 */
export async function poseidonFetch(
  endpointOrUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const url = endpointOrUrl.startsWith("http://") || endpointOrUrl.startsWith("https://")
    ? endpointOrUrl
    : `${POSEIDON_BASE_URL}/${endpointOrUrl.replace(/^\/+/, "")}`;

  const headers = {
    ...POSEIDON_DEFAULT_HEADERS,
    ...(init?.headers || {}),
  };

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `[PoseidonClient] Request to "${url}" failed with HTTP status ${response.status}`,
    );
  }

  return response;
}

/**
 * Extracts the trailing leaf slug (without leading folders or IDs)
 * similar to gnula's extractSlug.
 */
export function extractLeafSlug(urlOrSlug: string): string {
  if (!urlOrSlug) return "";
  const clean = urlOrSlug.replace(/^\/+|\/+$/g, "");
  const match = clean.match(/https?:\/\/[^/]+(?:\/ver)?\/([^/?#]+)/);
  if (match) return match[1];
  return clean.replace(/^.*\/|\/$/g, "");
}

/**
 * Resolves a clean slug (e.g. "serie/the-lowdown" or "pelicula/dragon-ball-...")
 * to Poseidon's full canonical upstream path (e.g. "serie/273247/the-lowdown").
 */
export async function resolvePoseidonPath(link: string): Promise<string> {
  const clean = link.replace(/^\/+/, "");
  const isSerie = clean.startsWith("serie/") || clean.startsWith("series/");

  // 1. If it already has numeric ID (e.g. serie/273247/the-lowdown or pelicula/120475/...)
  const withIdMatch = clean.match(/(?:serie|series|pelicula|movies)\/(\d+\/[^/]+)/);
  if (withIdMatch) {
    const prefix = isSerie ? "serie/" : "pelicula/";
    return `${prefix}${withIdMatch[1]}`;
  }

  // 2. Extract clean leaf slug
  const leafSlug = extractLeafSlug(clean);
  if (!leafSlug) return clean;

  // 3. Check SQLite cache
  try {
    const cached = getAllData<string>(`poseidon:slug:${leafSlug}`);
    if (cached?.data) {
      return cached.data;
    }
  } catch {
    // Ignore store read errors
  }

  // 4. Fallback search on Poseidon
  try {
    const query = leafSlug.replace(/-/g, " ");
    const response = await poseidonFetch(`search?q=${encodeURIComponent(query)}`);
    const html = await response.text();
    const nextData = extractNextData(html);
    const candidates = [
      ...(nextData?.props?.pageProps?.movies || []),
      ...(nextData?.props?.pageProps?.series || []),
    ];

    const matched =
      candidates.find((it) => {
        const s = it.url?.slug || "";
        return s.endsWith(`/${leafSlug}`) || s === leafSlug;
      }) || candidates[0];

    if (matched?.url?.slug) {
      const rawSlug = matched.url.slug.replace(/^\/+|\/+$/g, "");
      const prefix = isSerie ? "serie/" : "pelicula/";
      const resolved = `${prefix}${rawSlug.replace(/^(series|movies|serie|pelicula)\//, "")}`;
      try {
        upsertAll(`poseidon:slug:${leafSlug}`, resolved);
      } catch {
        // Ignore store write errors
      }
      return resolved;
    }
  } catch (err) {
    console.warn(`[Poseidon] Failed to resolve path for slug "${leafSlug}":`, err);
  }

  return clean;
}

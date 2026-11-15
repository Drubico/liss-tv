import type { Movie, Movies, StrategyGetAllMovies } from "../../types/movie.ts";
import { extractLeafSlug, extractNextData, poseidonFetch } from "./client.ts";
import { upsertAll } from "../../services/movie.store.ts";
import type { PoseidonMovieItem, PoseidonPageProps } from "./types.ts";

/**
 * Mappings for Poseidon canonical links:
 * Normalizes to clean, single-segment slugs matching Gnula and Liss-TV dynamic routing:
 * - series/<id>/<slug> -> /serie/<slug>
 * - movies/<id>/<slug> -> /pelicula/<slug>
 * Also caches the mapping from <slug> to upstream <id>/<slug> in SQLite.
 */
export function mapPoseidonItemToMovie(item: PoseidonMovieItem): Movie | null {
  if (!item?.titles?.name || !item?.url?.slug) {
    return null;
  }

  const rawSlug = item.url.slug.replace(/^\/+|\/+$/g, "");
  const isSerie = rawSlug.startsWith("series/") || rawSlug.startsWith("serie/");
  const leafSlug = extractLeafSlug(rawSlug);

  const canonicalLink = `/${isSerie ? "serie" : "pelicula"}/${leafSlug}`;
  const upstreamPath = `${isSerie ? "serie/" : "pelicula/"}${rawSlug.replace(/^(series|movies|serie|pelicula)\//, "")}`;

  try {
    upsertAll(`poseidon:slug:${leafSlug}`, upstreamPath);
  } catch {
    // Ignore cache persistence errors if store offline
  }

  let year = "";
  if (item.releaseDate) {
    const yearMatch = item.releaseDate.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
    }
  }

  const rating =
    item.rate?.average !== undefined && item.rate.average !== null
      ? String(item.rate.average)
      : "";

  return {
    title: item.titles.name,
    link: canonicalLink,
    image: item.images?.poster || "",
    year,
    rating,
  };
}

export class GetAll implements StrategyGetAllMovies {
  async operation(
    search?: string,
    slug?: string,
    pageNumber = 1,
  ): Promise<Movies | undefined> {
    try {
      let endpoint: string;

      if (search && search.trim().length > 0) {
        endpoint = `search?q=${encodeURIComponent(search.trim())}&page=${pageNumber}`;
      } else if (slug === "series" || slug === "/series") {
        endpoint = pageNumber > 1 ? `series?page=${pageNumber}` : "series";
      } else {
        endpoint = pageNumber > 1 ? `peliculas?page=${pageNumber}` : "peliculas";
      }

      const response = await poseidonFetch(endpoint);
      const html = await response.text();
      const nextData = extractNextData(html);
      const rawMovies =
        nextData?.props?.pageProps?.movies ||
        nextData?.props?.pageProps?.series ||
        [];

      const movies: Movie[] = rawMovies
        .map(mapPoseidonItemToMovie)
        .filter((m): m is Movie => m !== null);

      const totalPages = nextData?.props?.pageProps?.pages || 1;
      const hasMore = pageNumber < totalPages;

      return {
        movies,
        lastPageNumber: totalPages,
        hasMore,
      };
    } catch (error) {
      console.error("[Poseidon] GetAll operation failed:", error);
      return undefined;
    }
  }
}

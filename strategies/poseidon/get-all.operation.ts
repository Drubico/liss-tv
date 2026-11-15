import type { Movie, Movies, StrategyGetAllMovies } from "../../types/movie.ts";
import { extractNextData, poseidonFetch } from "./client.ts";
import type { PoseidonMovieItem, PoseidonPageProps } from "./types.ts";

/**
 * Mappings for Poseidon canonical links:
 * - movies/<id>/<slug> -> /pelicula/<id>/<slug>
 * - series/<id>/<slug> -> /serie/<id>/<slug>
 */
export function mapPoseidonItemToMovie(item: PoseidonMovieItem): Movie | null {
  if (!item?.titles?.name || !item?.url?.slug) {
    return null;
  }

  const rawSlug = item.url.slug.replace(/^\/+|\/+$/g, "");
  let canonicalLink: string;

  if (rawSlug.startsWith("series/")) {
    canonicalLink = `/serie/${rawSlug.slice("series/".length)}`;
  } else if (rawSlug.startsWith("movies/")) {
    canonicalLink = `/pelicula/${rawSlug.slice("movies/".length)}`;
  } else {
    canonicalLink = `/pelicula/${rawSlug}`;
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

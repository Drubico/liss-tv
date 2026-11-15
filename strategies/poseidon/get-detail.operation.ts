import type {
  Episode,
  Season,
  StoredMovie,
  StrategyGetMovieDetails,
} from "../../types/movie.ts";
import {
  extractLeafSlug,
  extractNextData,
  poseidonFetch,
  resolvePoseidonPath,
} from "./client.ts";
import type {
  PoseidonPageProps,
  PoseidonThisMovie,
  PoseidonThisSerie,
} from "./types.ts";

export function mapPoseidonMovieDetail(
  movie: PoseidonThisMovie,
): Omit<StoredMovie, "link" | "updatedAt"> {
  let year = "";
  if (movie.releaseDate) {
    const yearMatch = movie.releaseDate.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
    }
  }

  const duration = movie.runtime ? `${movie.runtime} min` : "";
  const rating =
    movie.rate?.average !== undefined && movie.rate.average !== null
      ? String(movie.rate.average)
      : "";

  const tags = (movie.genres || []).map((g) => g.name).filter(Boolean);

  return {
    title: movie.titles?.name || "",
    image: movie.images?.poster || "",
    backgroundImage: movie.images?.backdrop || "",
    year,
    duration,
    rating,
    tags,
    caption: movie.overview || "",
    context: {
      tmdbId: movie.TMDbId,
      videos: movie.videos,
    },
  };
}

export function mapPoseidonSerieDetail(
  serie: PoseidonThisSerie,
  _slugParam?: string,
): Omit<StoredMovie, "link" | "updatedAt"> {
  let year = "";
  if (serie.releaseDate) {
    const yearMatch = serie.releaseDate.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
    }
  }

  const rating =
    serie.rate?.average !== undefined && serie.rate.average !== null
      ? String(serie.rate.average)
      : "";

  const tags = (serie.genres || []).map((g) => g.name).filter(Boolean);

  const tmdbId = serie.TMDbId;
  const rawSlug = serie.url?.slug || "";
  const cleanSlug = extractLeafSlug(rawSlug || _slugParam || "");

  const seasons: Season[] = (serie.seasons || [])
    .filter((s) => s.episodes && s.episodes.length > 0)
    .map((s) => {
      const episodes: Episode[] = (s.episodes || []).map((ep) => {
        const epNum = String(ep.number);
        const sNum = String(s.number);
        const epTitle = ep.title || `Episodio ${epNum}`;
        const epImage = ep.image || serie.images?.poster || "";

        let epLink: string;
        if (ep.url?.slug) {
          const rawEpSlug = ep.url.slug.replace(/^\/+/, "");
          epLink = `/${rawEpSlug.replace(/^series\//, "serie/")}`;
        } else {
          epLink = `/serie/${tmdbId}/${cleanSlug}/seasons/${sNum}/episodes/${epNum}`;
        }

        return {
          numberEpisode: epNum,
          title: epTitle,
          image: epImage,
          link: epLink,
          caption: ep.title || "",
          context: {
            tmdbId,
            season: sNum,
            episode: epNum,
            cleanSlug,
          },
        };
      });

      return {
        season: String(s.number),
        episodes: episodes.sort(
          (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
        ),
      };
    })
    .sort((a, b) => parseInt(a.season, 10) - parseInt(b.season, 10));

  return {
    title: serie.titles?.name || "",
    image: serie.images?.poster || "",
    backgroundImage: serie.images?.backdrop || "",
    year,
    duration: "",
    rating,
    tags,
    caption: serie.overview || "",
    episodes: seasons.length > 0 ? seasons : undefined,
    context: {
      tmdbId,
      slug: cleanSlug,
    },
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  async operation(
    link: string,
  ): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    try {
      const resolvedPath = await resolvePoseidonPath(link);
      const cleanPath = resolvedPath.replace(/^\/+/, "");
      const isSerie = cleanPath.startsWith("serie/") || cleanPath.startsWith("series/");

      const response = await poseidonFetch(cleanPath);
      const html = await response.text();
      const nextData = extractNextData(html);

      if (isSerie && nextData?.props?.pageProps?.thisSerie) {
        return mapPoseidonSerieDetail(nextData.props.pageProps.thisSerie, cleanPath);
      }

      if (nextData?.props?.pageProps?.thisMovie) {
        return mapPoseidonMovieDetail(nextData.props.pageProps.thisMovie);
      }

      console.warn(`[Poseidon] GetDetail: No movie or serie found in pageProps for ${cleanPath}`);
      return undefined;
    } catch (error) {
      console.error("[Poseidon] GetDetail operation failed:", error);
      return undefined;
    }
  }
}

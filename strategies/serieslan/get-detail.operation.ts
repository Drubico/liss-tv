import type { StrategyGetMovieDetails, Episode, Season, StoredMovie } from "@/types/movie";
import { serieslanFetch } from "./client";
import type {
  SeriesLanContentDetail,
  SeriesLanEpisodesResponse,
} from "./types";

const TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original";
const TMDB_STILL_BASE = "https://image.tmdb.org/t/p/w300";

const BATCH_SIZE = 4;

export function cleanSlug(pathOrSlug: string): string {
  let cleaned = pathOrSlug.trim();
  cleaned = cleaned.replace(/^\/+|\/+$/g, "");
  cleaned = cleaned.replace(/^(serie|pelicula)\//, "");
  return cleaned;
}

export class GetDetail implements StrategyGetMovieDetails {
  async operation(
    link: string
  ): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    // If the requested link is a movie path, return undefined safely
    // because SeriesLan has movies disabled upstream.
    if (link.includes("pelicula")) {
      return undefined;
    }

    const slug = cleanSlug(link);
    if (!slug) {
      return undefined;
    }

    try {
      const contentUrl = `/api/rest/v1/content/serie/${slug}`;
      const detail = await serieslanFetch<SeriesLanContentDetail>(contentUrl);
      const item = detail.item;

      if (!item) {
        return undefined;
      }

      const poster = item.poster_path
        ? item.poster_path.startsWith("http")
          ? item.poster_path
          : `${TMDB_POSTER_BASE}${item.poster_path}`
        : "";

      const banner = item.backdrop_path
        ? item.backdrop_path.startsWith("http")
          ? item.backdrop_path
          : `${TMDB_BACKDROP_BASE}${item.backdrop_path}`
        : poster;

      const seasonsData: Season[] = [];
      const episodeSeasons = detail.episode_seasons || [];

      // Fetch episodes in bounded batches of 4 seasons to prevent rate-limiting or timeouts
      const itemId = item.catalog_item_id;
      for (let i = 0; i < episodeSeasons.length; i += BATCH_SIZE) {
        const batch = episodeSeasons.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (seasonInfo): Promise<Season> => {
          const seasonNum = seasonInfo.season;
          try {
            const epUrl = `/api/rest/v1/episodes?item_id=${itemId}&season=${seasonNum}&limit=100`;
            const epRes = await serieslanFetch<SeriesLanEpisodesResponse>(epUrl);
            const eps = epRes.episodes || [];

            const mappedEpisodes: Episode[] = eps.map((ep) => {
              const epImage = ep.still_path
                ? ep.still_path.startsWith("http")
                  ? ep.still_path
                  : `${TMDB_STILL_BASE}${ep.still_path}`
                : poster;

              return {
                numberEpisode: String(ep.episode),
                title: ep.title || `Episodio ${ep.episode}`,
                image: epImage,
                link: `/serie/${slug}/player?season=${seasonNum}&episode=${ep.episode}`,
                caption: ep.air_date ?? "",
                context: {
                  tmdb_id: item.tmdb_id,
                  season: seasonNum,
                  episode: ep.episode,
                  player_url: ep.player_url,
                  slug,
                },
              };
            });

            return {
              season: String(seasonNum),
              episodes: mappedEpisodes.sort(
                (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10)
              ),
            };
          } catch (err) {
            console.warn(
              `[SeriesLan] Error loading season ${seasonNum} for ${slug}:`,
              err
            );
            return { season: String(seasonNum), episodes: [] };
          }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        for (const res of batchResults) {
          if (res.status === "fulfilled" && res.value.episodes.length > 0) {
            seasonsData.push(res.value);
          }
        }
      }

      seasonsData.sort((a, b) => parseInt(a.season, 10) - parseInt(b.season, 10));

      return {
        title: item.title,
        image: poster,
        backgroundImage: banner,
        rating: item.vote_average ? String(item.vote_average) : "",
        year: item.year ? String(item.year) : "",
        duration: item.runtime ? `${item.runtime} min` : "",
        tags: item.genres || [],
        caption: item.overview || detail.overview || "",
        episodes: seasonsData.length > 0 ? seasonsData : undefined,
        context: {
          tmdb_id: item.tmdb_id,
          slug,
          catalog_item_id: item.catalog_item_id,
        },
      };
    } catch (err) {
      console.warn(`[SeriesLan] GetDetail failed for "${link}":`, err);
      return undefined;
    }
  }
}

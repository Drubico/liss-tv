import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { get, upsert } from "@/services/movie.store";
import { repelisFlareFetch } from "./client";
import { normalizeUrl, cleanLinkToPath } from "./mappers";

const CACHE_TTL_DAYS = 7;

function isCacheExpired(dateString: string, maxAgeDays: number): boolean {
  const ageInDays = (Date.now() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24);
  return ageInDays > maxAgeDays;
}

export function parseDetailHtml(
  html: string,
  link: string,
): Omit<StoredMovie, "link" | "updatedAt"> {
  const $ = cheerio.load(html);

  const title =
    $("h1.title, h1").first().text().trim() ||
    $(".item-detail p").first().text().trim();

  const rawPoster =
    $("img.poster, .poster img, img").first().attr("src") || "";
  const image = normalizeUrl(rawPoster) || "/logo-with-background.png";

  const backdropEl = $(".card-hover-backdrop, .backdrop, [data-backdrop]").first();
  const rawBackdrop =
    backdropEl.attr("data-backdrop") ||
    backdropEl.css("background-image")?.replace(/^url\(["']?|["']?\)$/g, "") ||
    "";
  const backgroundImage = normalizeUrl(rawBackdrop) || image;

  const caption =
    $(".overview, .sinopsis, p.caption, .card-hover-info-overview p")
      .first()
      .text()
      .trim();

  const year = $(".year").first().text().trim();
  const ratingRaw = $(".rating, .card-hover-rating").first().text().trim();
  const rating = ratingRaw.replace(/^[☆★\s]+|[☆★\s]+$/g, "");

  const tags = $(".genres li, .card-hover-info-genre li, .tag")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  // Extract server links if present
  const serverLinks: string[] = [];
  $("[data-server]").each((_, el) => {
    const s = $(el).attr("data-server");
    if (s && !serverLinks.includes(s)) {
      serverLinks.push(s);
    }
  });
  $("iframe[src]").each((_, el) => {
    const s = $(el).attr("src");
    if (s && !serverLinks.includes(s)) {
      serverLinks.push(s);
    }
  });

  // Extract seasons and episodes if it is a series
  const seasonsMap = new Map<string, Episode[]>();

  $(".season-block, [data-season]").each((_, sEl) => {
    const seasonAttr = $(sEl).attr("data-season") || "1";
    const seasonNum = String(parseInt(seasonAttr, 10) || 1);

    $(sEl)
      .find(".episode-item, [data-episode]")
      .each((_, epEl) => {
        const epAttr = $(epEl).attr("data-episode") || "1";
        const epNum = String(parseInt(epAttr, 10) || 1);
        const epLinkRaw = $(epEl).find("a").attr("href") || link;
        const epLink = cleanLinkToPath(epLinkRaw);
        const epTitle =
          $(epEl).find(".episode-title, a").text().trim() || `Episodio ${epNum}`;
        const epRawImg = $(epEl).find("img").attr("src");
        const epImage = normalizeUrl(epRawImg) || image;

        const episode: Episode = {
          link: epLink,
          title: epTitle,
          image: epImage,
          numberEpisode: epNum,
          caption: "",
          context: {
            provider: "repelisplus",
            season: seasonNum,
            episode: epNum,
            slug: link,
            serverLinks: serverLinks.length > 0 ? serverLinks : undefined,
          },
        };

        if (!seasonsMap.has(seasonNum)) {
          seasonsMap.set(seasonNum, []);
        }
        seasonsMap.get(seasonNum)!.push(episode);
      });
  });

  const seasons: Season[] = Array.from(seasonsMap.entries()).map(
    ([season, episodes]) => ({
      season,
      episodes: episodes.sort(
        (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10),
      ),
    }),
  );

  return {
    title,
    image,
    backgroundImage,
    caption,
    year: year || undefined,
    rating: rating || undefined,
    tags: tags.length > 0 ? tags : undefined,
    provider: "repelisplus",
    episodes: seasons.length > 0 ? seasons : undefined,
    context: {
      provider: "repelisplus",
      slug: link,
      servers: serverLinks.length > 0 ? serverLinks : undefined,
    },
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly flareFetchFn: (url: string) => Promise<Response>;

  constructor(
    flareFetchFn: (url: string) => Promise<Response> = repelisFlareFetch,
  ) {
    this.flareFetchFn = flareFetchFn;
  }

  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const cached = get(link);
    const isSerie = link.includes("serie");

    if (
      cached?.title &&
      cached?.image &&
      cached?.backgroundImage &&
      !isCacheExpired(cached.updatedAt, CACHE_TTL_DAYS) &&
      (!isSerie || cached?.episodes?.length)
    ) {
      return {
        ...cached,
        provider: "repelisplus",
      };
    }

    try {
      const res = await this.flareFetchFn(link);
      if (!res.ok) {
        return undefined;
      }
      const html = await res.text();
      const movieData = parseDetailHtml(html, link);
      upsert(link, movieData);
      return movieData;
    } catch (err) {
      console.error(`[RepelisPlus] GetDetail failed for "${link}":`, err);
      return undefined;
    }
  }
}

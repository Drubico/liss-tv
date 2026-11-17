import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { megadedeFetch } from "./client";

export function parseMegadedeDetail(
  html: string,
  link: string
): Omit<StoredMovie, "link" | "updatedAt"> | undefined {
  const $ = cheerio.load(html);

  const title =
    $("h1.title, .entry-title, meta[property='og:title']").first().attr("content") ||
    $("h1.title, .entry-title").first().text().trim();

  if (!title) return undefined;

  const cleanTitle = title.replace(/\s*\(\d{4}\)$/, "").trim();

  let image =
    $(".poster img, figure img").attr("src") ||
    $("meta[property='og:image']").attr("content") ||
    "";
  if (image.startsWith("//")) image = `https:${image}`;

  let backgroundImage =
    $("meta[property='og:image']").attr("content") ||
    $(".backdrop img, .cover img").attr("src") ||
    image;
  if (backgroundImage.startsWith("//")) backgroundImage = `https:${backgroundImage}`;

  const year = $(".year, .release-year, .date").first().text().trim();
  const rating = $(".rating, .vote, .imdb").first().text().trim();
  const duration = $(".duration, .runtime").first().text().trim();
  const caption = $(".desc p, .description p, .entry-content p, .overview").first().text().trim();

  const tags: string[] = [];
  $(".genres a, .genre a, a[href*='/genero/']").each((_, el) => {
    const genre = $(el).text().trim();
    if (genre && !tags.includes(genre)) tags.push(genre);
  });

  const isSerie = link.includes("/serie/");

  let movieUrl: string | undefined = undefined;
  if (!isSerie) {
    const serverBtn = $("button.server-btn[onclick*='changeServer'], .server-btn").first();
    const onclick = serverBtn.attr("onclick") || "";
    const match = onclick.match(/changeServer\(['"]([^'"]+)['"]/);
    if (match) {
      movieUrl = match[1];
    } else {
      const dataUrl = serverBtn.attr("data-url");
      if (dataUrl) movieUrl = dataUrl;
    }
  }

  const seasonsMap: Map<string, Episode[]> = new Map();

  if (isSerie) {
    $(".season-container[data-season]").each((_, seasonEl) => {
      const seasonNum = $(seasonEl).attr("data-season") || "1";
      const episodes: Episode[] = [];

      $(seasonEl)
        .find("a.episode-card, a[data-episode-link], a[href*='#s']")
        .each((_, epEl) => {
          const $ep = $(epEl);
          const epNum =
            $ep.attr("data-episode") ||
            $ep.find(".fz5").text().replace(/[^0-9]/g, "").trim() ||
            "1";
          const epTitle =
            $ep.find(".tvw, .episode-title, p").first().text().trim() ||
            `Episodio ${epNum}`;
          const epHref = $ep.attr("href") || `#s${seasonNum}-e${epNum}`;
          const cleanEpLink = epHref.startsWith("http")
            ? epHref
            : epHref.startsWith("/")
            ? epHref
            : `${link}${epHref.startsWith("#") ? epHref : `#${epHref}`}`;

          episodes.push({
            numberEpisode: epNum,
            title: epTitle,
            image,
            caption: "",
            link: cleanEpLink,
            context: {
              season: parseInt(seasonNum, 10),
              episode: parseInt(epNum, 10),
              slug: link.replace(/^\/serie\//, "").replace(/#.*$/, "").replace(/\/+$/, ""),
              provider: "megadede",
            },
          });
        });

      if (episodes.length > 0) {
        seasonsMap.set(seasonNum, episodes);
      }
    });
  }

  const seasons: Season[] = Array.from(seasonsMap.entries()).map(([season, episodes]) => ({
    season,
    episodes,
  }));

  return {
    title: cleanTitle,
    image,
    backgroundImage,
    year,
    rating,
    duration: duration || undefined,
    caption: caption || undefined,
    tags: tags.length > 0 ? tags : undefined,
    type: isSerie ? "serie" : "movie",
    provider: "megadede",
    movieUrl,
    episodes: seasons.length > 0 ? seasons : undefined,
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    try {
      const res = await megadedeFetch(link);
      const html = await res.text();
      return parseMegadedeDetail(html, link);
    } catch {
      return undefined;
    }
  }
}

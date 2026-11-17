import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { megadedeFetch } from "./client";

function isValidImageUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().toLowerCase();
  if (
    clean === "" ||
    clean.endsWith(".svg") ||
    clean.includes("logo") ||
    clean.includes("torovid") ||
    clean.includes("icon")
  ) {
    return false;
  }
  return true;
}

export function parseMegadedeDetail(
  html: string,
  link: string
): Omit<StoredMovie, "link" | "updatedAt"> | undefined {
  const $ = cheerio.load(html);

  let title = $("h1.title, .entry-title, h1").first().text().trim();
  if (!title) {
    const ogTitle = $("meta[property='og:title']").attr("content");
    if (ogTitle) {
      title = ogTitle
        .replace(/^Ver\s+/i, "")
        .replace(/\s*\(\d{4}\).*$/i, "")
        .replace(/\s*online.*$/i, "")
        .replace(/\s*-\s*megadede.*$/i, "")
        .trim();
    }
  }

  if (!title) return undefined;

  const cleanTitle = title.replace(/\s*\(\d{4}\)$/, "").trim();

  // 1. Poster image
  let poster =
    $(".movie-poster img, .item-cover img, .poster img")
      .filter((_, el) => isValidImageUrl($(el).attr("src") || $(el).attr("data-src")))
      .first()
      .attr("src") ||
    $(".movie-poster img, .item-cover img, .poster img")
      .filter((_, el) => isValidImageUrl($(el).attr("data-src")))
      .first()
      .attr("data-src") ||
    "";

  if (!poster) {
    const ogImage = $("meta[property='og:image']").attr("content") || "";
    if (isValidImageUrl(ogImage)) {
      poster = ogImage;
    }
  }

  if (!poster) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).html();
        if (text) {
          const json = JSON.parse(text) as { image?: string };
          if (json.image && typeof json.image === "string" && isValidImageUrl(json.image)) {
            poster = json.image;
          }
        }
      } catch {}
    });
  }

  if (poster.startsWith("//")) poster = `https:${poster}`;

  // 2. Backdrop image
  let backdrop =
    $(".backdrop img, .cover img, .movie-backdrop img")
      .filter((_, el) => isValidImageUrl($(el).attr("src") || $(el).attr("data-src")))
      .first()
      .attr("src") || "";

  if (backdrop.startsWith("//")) backdrop = `https:${backdrop}`;

  let backgroundImage = backdrop;
  if (!backgroundImage) {
    const ogImage = $("meta[property='og:image']").attr("content") || "";
    if (isValidImageUrl(ogImage) && ogImage !== poster) {
      backgroundImage = ogImage.startsWith("//") ? `https:${ogImage}` : ogImage;
    }
  }

  if (!backgroundImage && poster) {
    backgroundImage = poster.replace(/\/w\d+\//, "/original/");
  }

  const image = poster || backgroundImage;
  if (!backgroundImage) {
    backgroundImage = image;
  }

  let year =
    $("a[href*='/year/'], .year, .release-year, .date").first().text().replace(/[^0-9]/g, "").trim() ||
    $(".movie-meta").text().match(/\b(19\d\d|20\d\d)\b/)?.[0] ||
    "";

  const ratingText = $(".rating-badge, .rating, .vote, .imdb").first().text().trim();
  const rating = ratingText.replace(/[^0-9.]/g, "").trim();

  const duration = $(".duration, .runtime").first().text().trim();
  const caption = $(
    ".desc p, .description p, .entry-content p, .overview, .description, .desc"
  )
    .first()
    .text()
    .trim();

  const tags: string[] = [];
  $(".genres a, .genre a, a[href*='/genero/'], a[href*='/generos/']").each((_, el) => {
    const genre = $(el).text().trim();
    if (genre && !tags.includes(genre)) tags.push(genre);
  });

  const cleanLink = link.startsWith("http")
    ? new URL(link).pathname
    : link.startsWith("/")
    ? link
    : `/${link}`;

  const isSerie =
    cleanLink.startsWith("/serie/") ||
    cleanLink.includes("/serie/") ||
    cleanLink.includes("serie") ||
    $("#item-context").attr("data-type") === "serie" ||
    $(".season-container").length > 0;

  const cleanSlug = cleanLink
    .replace(/^\/?(?:serie|pelicula)\//, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");

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
    $(".season-container").each((idx, seasonEl) => {
      const seasonNum = $(seasonEl).attr("data-season") || String(idx + 1);
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
            : `/serie/${cleanSlug}${epHref.startsWith("#") ? epHref : `#${epHref}`}`;

          episodes.push({
            numberEpisode: epNum,
            title: epTitle,
            image,
            caption: "",
            link: cleanEpLink,
            context: {
              season: parseInt(seasonNum, 10),
              episode: parseInt(epNum, 10),
              slug: cleanSlug,
              provider: "megadede",
            },
          });
        });

      if (episodes.length > 0) {
        seasonsMap.set(seasonNum, episodes);
      }
    });

    if (seasonsMap.size === 0) {
      $("a.episode-card, a[data-episode-link], a[href*='#s']").each((_, epEl) => {
        const $ep = $(epEl);
        const seasonNum =
          $ep.attr("data-season") ||
          $ep.attr("href")?.match(/#s(\d+)/)?.[1] ||
          "1";
        const epNum =
          $ep.attr("data-episode") ||
          $ep.attr("href")?.match(/-e(\d+)/)?.[1] ||
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
          : `/serie/${cleanSlug}${epHref.startsWith("#") ? epHref : `#${epHref}`}`;

        const existing = seasonsMap.get(seasonNum) || [];
        existing.push({
          numberEpisode: epNum,
          title: epTitle,
          image,
          caption: "",
          link: cleanEpLink,
          context: {
            season: parseInt(seasonNum, 10),
            episode: parseInt(epNum, 10),
            slug: cleanSlug,
            provider: "megadede",
          },
        });
        seasonsMap.set(seasonNum, existing);
      });
    }
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

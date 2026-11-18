import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { seriesmetroFetch, SERIESMETRO_BASE_URL } from "./client";

function isValidImageUrl(url?: string): boolean {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().toLowerCase();
  if (
    clean === "" ||
    clean.endsWith(".svg") ||
    clean.endsWith(".gif") ||
    clean.includes("logo") ||
    clean.includes("icon") ||
    clean.includes("ajax-loader")
  ) {
    return false;
  }
  return true;
}

function parseEpisodesFromCheerio(
  $: cheerio.CheerioAPI,
  defaultPoster: string,
  cleanSlug: string,
  targetSeasonNum?: number
): Array<{ season: number; episode: Episode }> {
  const episodes: Array<{ season: number; episode: Episode }> = [];

  const processArticle = ($el: ReturnType<cheerio.CheerioAPI>) => {
    const linkEl = $el.find("a[href*='/capitulo/']").first();
    const href = linkEl.attr("href") || ($el.is("a[href*='/capitulo/']") ? $el.attr("href") : "");
    if (!href || !href.includes("/capitulo/")) return;

    const numEpiText = $el.find(".num-epi").text().trim();
    const numMatch = numEpiText.match(/(\d+)x(\d+)/i);
    const hrefMatch = href.match(/temporada-(\d+)-capitulo-(\d+)/i);

    let season = targetSeasonNum || 1;
    let epNum = "1";

    if (numMatch) {
      season = parseInt(numMatch[1], 10);
      epNum = numMatch[2];
    } else if (hrefMatch) {
      season = parseInt(hrefMatch[1], 10);
      epNum = hrefMatch[2];
    }

    let epTitle = $el.find(".entry-title, h2, h3, .title").first().text().trim();
    if (!epTitle) {
      epTitle = `Episodio ${epNum}`;
    }

    let epImg =
      $el.find(".post-thumbnail img, figure img, img").first().attr("data-src") ||
      $el.find(".post-thumbnail img, figure img, img").first().attr("src") ||
      defaultPoster;
    if (epImg.startsWith("//")) {
      epImg = `https:${epImg}`;
    }

    const cleanEpHref = href.startsWith("http")
      ? new URL(href).pathname
      : href.startsWith("/")
      ? href
      : `/${href}`;

    episodes.push({
      season,
      episode: {
        numberEpisode: epNum,
        title: epTitle,
        image: epImg,
        caption: "",
        link: cleanEpHref,
        context: {
          season,
          episode: parseInt(epNum, 10),
          slug: cleanSlug,
          provider: "seriesmetro",
        },
      },
    });
  };

  const containers = $(
    "#episode_by_temp article, ul#episode_by_temp li, article.episodes, article[class*='episodes']"
  );

  if (containers.length > 0) {
    containers.each((_, el) => {
      processArticle($(el));
    });
  }

  // Fallback: direct a[href*='/capitulo/'] if no containers were found
  if (episodes.length === 0) {
    $("a[href*='/capitulo/']").each((_, el) => {
      const $el = $(el);
      const epHref = $el.attr("href") || "";
      if (!epHref || !epHref.includes("/capitulo/")) return;

      const match =
        epHref.match(/temporada-(\d+)-capitulo-(\d+)/i) ||
        $el.text().match(/(\d+)x(\d+)/i) ||
        $el.text().match(/T(\d+)\s*E(\d+)/i);

      let seasonNum = targetSeasonNum || 1;
      let epNum = "1";

      if (match) {
        seasonNum = parseInt(match[1], 10) || 1;
        epNum = match[2];
      }

      const epTitle =
        $el.find(".title, .ep-title, p").first().text().trim() ||
        $el.text().trim() ||
        `Episodio ${epNum}`;

      const cleanEpHref = epHref.startsWith("http")
        ? new URL(epHref).pathname
        : epHref.startsWith("/")
        ? epHref
        : `/${epHref}`;

      episodes.push({
        season: seasonNum,
        episode: {
          numberEpisode: epNum,
          title: epTitle,
          image: defaultPoster,
          caption: "",
          link: cleanEpHref,
          context: {
            season: seasonNum,
            episode: parseInt(epNum, 10),
            slug: cleanSlug,
            provider: "seriesmetro",
          },
        },
      });
    });
  }

  return episodes;
}

export function parseSeriesmetroDetail(
  html: string,
  link: string,
  extraSeasonsHtml: string[] = []
): Omit<StoredMovie, "link" | "updatedAt"> | undefined {
  const $ = cheerio.load(html);

  // 1. Title
  let title = $("h1.entry-title, h1.title, h1").first().text().trim();
  if (!title) {
    const ogTitle = $("meta[property='og:title']").attr("content");
    if (ogTitle) {
      title = ogTitle
        .replace(/\s*-\s*SeriesMetro.*$/i, "")
        .replace(/\s*online.*$/i, "")
        .trim();
    }
  }

  if (!title) return undefined;

  // Extract year from title if present
  let year = $(".entry-meta .year, .date").first().text().trim();
  const yearMatch = title.match(/\((\d{4})\)/);
  if (yearMatch) {
    if (!year) year = yearMatch[1];
    title = title.replace(/\s*\(\d{4}\)/, "").trim();
  }

  // 2. Poster and Backdrop
  let poster =
    $("article.post .post-thumbnail img, .post-thumbnail figure img, .post-thumbnail img")
      .first()
      .attr("data-src") ||
    $("article.post .post-thumbnail img, .post-thumbnail figure img, .post-thumbnail img")
      .first()
      .attr("src") ||
    "";

  if (poster.startsWith("//")) {
    poster = `https:${poster}`;
  }

  if (poster.includes("image.tmdb.org/t/p/w185")) {
    poster = poster.replace("/w185/", "/w500/");
  }

  if (!isValidImageUrl(poster)) {
    poster = "";
  }

  let backdrop =
    $("img.TPostBg, .bghd img, .bgft img, [class*='backdrop'] img")
      .first()
      .attr("data-src") ||
    $("img.TPostBg, .bghd img, .bgft img, [class*='backdrop'] img")
      .first()
      .attr("src") ||
    "";

  if (backdrop.startsWith("//")) {
    backdrop = `https:${backdrop}`;
  }

  if (!isValidImageUrl(backdrop)) {
    backdrop = poster;
  }

  // 3. Synopsis
  const synopsis =
    $(".entry-content p, .description p, .description, .overview p, .overview")
      .first()
      .text()
      .trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    "";

  // 4. Rating & Genres
  const rating = $(".vote, .rating, .score").first().text().replace(/^TMDB\s*/i, "").trim();

  const tags: string[] = [];
  $(".genres a, .genre a, a[href*='/genero/']").each((_, el) => {
    const genre = $(el).text().trim();
    if (genre && !tags.includes(genre)) tags.push(genre);
  });

  const cleanLink = link.startsWith("http")
    ? new URL(link).pathname
    : link.startsWith("/")
    ? link
    : `/${link}`;

  const cleanSlug = cleanLink
    .replace(/^\/?(?:serie|pelicula)\//, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");

  const isSerie =
    cleanLink.includes("/serie/") ||
    $(".seasons, .choose-season, .season-list, a[href*='/capitulo/']").length > 0;

  // 5. Server embed options (for movies)
  const embeds: Array<{ index: number; language: string; url: string }> = [];

  $("aside.video-options ul.aa-tbs-video li a, ul.aa-tbs-video li a").each((i, el) => {
    const $a = $(el);
    const href = $a.attr("href") || `#options-${i}`;
    const targetId = href.replace(/^#/, "");
    const serverLabel = $a.find(".server").text().replace(/^-/, "").trim() || "Latino";

    // Locate iframe inside matching option container
    const iframeEl = $(`#${targetId} iframe`);
    const iframeSrc =
      iframeEl.attr("data-src") ||
      iframeEl.attr("src") ||
      "";

    embeds.push({
      index: i,
      language: serverLabel,
      url: iframeSrc,
    });
  });

  // Fallback if no tab markup exists but iframes exist
  if (embeds.length === 0) {
    $("iframe[src*='trembed'], iframe[data-src*='trembed']").each((i, ifr) => {
      const src = $(ifr).attr("data-src") || $(ifr).attr("src") || "";
      embeds.push({
        index: i,
        language: "Latino",
        url: src,
      });
    });
  }

  // 6. Episodes parsing (for series)
  const seasonsMap: Map<number, Episode[]> = new Map();

  if (isSerie) {
    // 6.1 Parse initial HTML episodes
    const initialEpisodes = parseEpisodesFromCheerio($, poster, cleanSlug);
    for (const { season, episode } of initialEpisodes) {
      if (!seasonsMap.has(season)) {
        seasonsMap.set(season, []);
      }
      const list = seasonsMap.get(season)!;
      if (!list.some((e) => e.numberEpisode === episode.numberEpisode)) {
        list.push(episode);
      }
    }

    // 6.2 Parse extra seasons HTML (from AJAX)
    for (const extraHtml of extraSeasonsHtml) {
      if (!extraHtml || extraHtml.trim() === "") continue;
      const $extra = cheerio.load(extraHtml);
      const extraEpisodes = parseEpisodesFromCheerio($extra, poster, cleanSlug);
      for (const { season, episode } of extraEpisodes) {
        if (!seasonsMap.has(season)) {
          seasonsMap.set(season, []);
        }
        const list = seasonsMap.get(season)!;
        if (!list.some((e) => e.numberEpisode === episode.numberEpisode)) {
          list.push(episode);
        }
      }
    }
  }

  const episodes: Season[] = Array.from(seasonsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, epList]) => ({
      season: String(season),
      episodes: epList.sort(
        (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10)
      ),
    }));

  return {
    title,
    image: poster,
    backgroundImage: backdrop,
    rating: rating || undefined,
    type: isSerie ? "serie" : "movie",
    caption: synopsis || undefined,
    year: year || undefined,
    duration: undefined,
    tags: tags.length ? tags : undefined,
    episodes: isSerie && episodes.length ? episodes : undefined,
    provider: "seriesmetro",
    context: {
      slug: cleanSlug,
      embeds,
      isSerie,
    },
  };
}

export class GetDetail implements StrategyGetMovieDetails {
  private readonly fetchFn: typeof fetch;

  constructor(fetchFn: typeof fetch = seriesmetroFetch as typeof fetch) {
    this.fetchFn = fetchFn;
  }

  async operation(link: string): Promise<Omit<StoredMovie, "link" | "updatedAt"> | undefined> {
    const res = await this.fetchFn(link);
    const html = await res.text();
    const $ = cheerio.load(html);

    const cleanLink = link.startsWith("http")
      ? new URL(link).pathname
      : link.startsWith("/")
      ? link
      : `/${link}`;

    const isSerie =
      cleanLink.includes("/serie/") ||
      $(".seasons, .choose-season, .season-list, a[href*='/capitulo/']").length > 0;

    const extraSeasonsHtml: string[] = [];

    if (isSerie) {
      const extraSeasons: Array<{ season: number; post: string }> = [];
      $(".choose-season .sel-temp a, .choose-season a[data-season]").each((_, el) => {
        const sStr = $(el).attr("data-season");
        const pStr = $(el).attr("data-post");
        if (sStr && pStr) {
          const sNum = parseInt(sStr, 10);
          if (sNum > 1 && !extraSeasons.some((x) => x.season === sNum)) {
            extraSeasons.push({ season: sNum, post: pStr });
          }
        }
      });

      if (extraSeasons.length > 0) {
        const fullReferer = link.startsWith("http")
          ? link
          : `${SERIESMETRO_BASE_URL}${cleanLink}`;

        const settled = await Promise.allSettled(
          extraSeasons.map(async ({ season, post }) => {
            const params = new URLSearchParams();
            params.append("action", "action_select_season");
            params.append("season", String(season));
            params.append("post", post);

            const ajaxRes = await this.fetchFn("wp-admin/admin-ajax.php", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
                Referer: fullReferer,
              },
              body: params.toString(),
            });

            return ajaxRes.text();
          })
        );

        for (const r of settled) {
          if (r.status === "fulfilled" && r.value) {
            extraSeasonsHtml.push(r.value);
          }
        }
      }
    }

    return parseSeriesmetroDetail(html, link, extraSeasonsHtml);
  }
}

import * as cheerio from "cheerio";
import type { Episode, Season, StoredMovie, StrategyGetMovieDetails } from "@/types/movie";
import { seriesmetroFetch, SERIESMETRO_BASE_URL } from "./client";

interface TitleAndYear {
  title: string;
  year?: string;
}

interface MediaImages {
  poster: string;
  backdrop: string;
}

interface EmbedOption {
  index: number;
  language: string;
  url: string;
}

interface SeasonAjaxTarget {
  season: number;
  post: string;
}

const DEFAULT_LANGUAGE = "Latino";
const AJAX_ENDPOINT = "wp-admin/admin-ajax.php";
const AJAX_ACTION = "action_select_season";

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

function cleanMediaUrl(rawLink: string): { cleanLink: string; cleanSlug: string } {
  const cleanLink = rawLink.startsWith("http")
    ? new URL(rawLink).pathname
    : rawLink.startsWith("/")
    ? rawLink
    : `/${rawLink}`;

  const cleanSlug = cleanLink
    .replace(/^\/?(?:serie|pelicula)\//, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "");

  return { cleanLink, cleanSlug };
}

function extractTitleAndYear($: cheerio.CheerioAPI): TitleAndYear | undefined {
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

  let year = $(".entry-meta .year, .date").first().text().trim() || undefined;
  const yearMatch = title.match(/\((\d{4})\)/);
  if (yearMatch) {
    if (!year) year = yearMatch[1];
    title = title.replace(/\s*\(\d{4}\)/, "").trim();
  }

  return { title, year };
}

function extractImages($: cheerio.CheerioAPI): MediaImages {
  const posterEl = $(
    "article.post .post-thumbnail img, .post-thumbnail figure img, .post-thumbnail img"
  ).first();

  let poster = posterEl.attr("data-src") || posterEl.attr("src") || "";
  if (poster.startsWith("//")) {
    poster = `https:${poster}`;
  }
  if (poster.includes("image.tmdb.org/t/p/w185")) {
    poster = poster.replace("/w185/", "/w500/");
  }
  if (!isValidImageUrl(poster)) {
    poster = "";
  }

  const backdropEl = $("img.TPostBg, .bghd img, .bgft img, [class*='backdrop'] img").first();
  let backdrop = backdropEl.attr("data-src") || backdropEl.attr("src") || "";
  if (backdrop.startsWith("//")) {
    backdrop = `https:${backdrop}`;
  }
  if (!isValidImageUrl(backdrop)) {
    backdrop = poster;
  }

  return { poster, backdrop };
}

function extractSynopsis($: cheerio.CheerioAPI): string | undefined {
  const synopsis =
    $(".entry-content p, .description p, .description, .overview p, .overview")
      .first()
      .text()
      .trim() ||
    $("meta[property='og:description']").attr("content")?.trim() ||
    "";

  return synopsis || undefined;
}

function extractRatingAndTags($: cheerio.CheerioAPI): { rating?: string; tags?: string[] } {
  const ratingRaw = $(".vote, .rating, .score").first().text().replace(/^TMDB\s*/i, "").trim();
  const rating = ratingRaw || undefined;

  const tags: string[] = [];
  $(".genres a, .genre a, a[href*='/genero/']").each((_, el) => {
    const genre = $(el).text().trim();
    if (genre && !tags.includes(genre)) tags.push(genre);
  });

  return {
    rating,
    tags: tags.length > 0 ? tags : undefined,
  };
}

function extractMovieEmbeds($: cheerio.CheerioAPI): EmbedOption[] {
  const embeds: EmbedOption[] = [];

  $("aside.video-options ul.aa-tbs-video li a, ul.aa-tbs-video li a").each((i, el) => {
    const $a = $(el);
    const href = $a.attr("href") || `#options-${i}`;
    const targetId = href.replace(/^#/, "");
    const serverLabel = $a.find(".server").text().replace(/^-/, "").trim() || DEFAULT_LANGUAGE;

    const iframeEl = $(`#${targetId} iframe`);
    const iframeSrc = iframeEl.attr("data-src") || iframeEl.attr("src") || "";

    embeds.push({
      index: i,
      language: serverLabel,
      url: iframeSrc,
    });
  });

  if (embeds.length === 0) {
    $("iframe[src*='trembed'], iframe[data-src*='trembed']").each((i, ifr) => {
      const src = $(ifr).attr("data-src") || $(ifr).attr("src") || "";
      embeds.push({
        index: i,
        language: DEFAULT_LANGUAGE,
        url: src,
      });
    });
  }

  return embeds;
}

function detectIsSerie(cleanLink: string, $: cheerio.CheerioAPI): boolean {
  return (
    cleanLink.includes("/serie/") ||
    $(".seasons, .choose-season, .season-list, a[href*='/capitulo/']").length > 0
  );
}

function extractExtraSeasonTargets($: cheerio.CheerioAPI): SeasonAjaxTarget[] {
  const targets: SeasonAjaxTarget[] = [];

  $(".choose-season .sel-temp a, .choose-season a[data-season]").each((_, el) => {
    const sStr = $(el).attr("data-season");
    const pStr = $(el).attr("data-post");
    if (!sStr || !pStr) return;

    const seasonNum = parseInt(sStr, 10);
    if (seasonNum > 1 && !targets.some((t) => t.season === seasonNum)) {
      targets.push({ season: seasonNum, post: pStr });
    }
  });

  return targets;
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

    const epTitle =
      $el.find(".entry-title, h2, h3, .title").first().text().trim() || `Episodio ${epNum}`;

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

function assembleSeasons(
  $: cheerio.CheerioAPI,
  extraSeasonsHtml: string[],
  poster: string,
  cleanSlug: string
): Season[] {
  const seasonsMap: Map<number, Episode[]> = new Map();

  const addEpisodes = (episodesList: Array<{ season: number; episode: Episode }>) => {
    for (const { season, episode } of episodesList) {
      if (!seasonsMap.has(season)) {
        seasonsMap.set(season, []);
      }
      const list = seasonsMap.get(season)!;
      if (!list.some((e) => e.numberEpisode === episode.numberEpisode)) {
        list.push(episode);
      }
    }
  };

  // 1. Initial HTML episodes (usually season 1)
  addEpisodes(parseEpisodesFromCheerio($, poster, cleanSlug));

  // 2. Extra seasons HTML fetched from AJAX
  for (const extraHtml of extraSeasonsHtml) {
    if (!extraHtml || extraHtml.trim() === "") continue;
    const $extra = cheerio.load(extraHtml);
    addEpisodes(parseEpisodesFromCheerio($extra, poster, cleanSlug));
  }

  return Array.from(seasonsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, epList]) => ({
      season: String(season),
      episodes: epList.sort(
        (a, b) => parseInt(a.numberEpisode, 10) - parseInt(b.numberEpisode, 10)
      ),
    }));
}

export function parseSeriesmetroDetail(
  html: string,
  link: string,
  extraSeasonsHtml: string[] = []
): Omit<StoredMovie, "link" | "updatedAt"> | undefined {
  const $ = cheerio.load(html);

  const titleAndYear = extractTitleAndYear($);
  if (!titleAndYear) return undefined;

  const { title, year } = titleAndYear;
  const { cleanLink, cleanSlug } = cleanMediaUrl(link);
  const { poster, backdrop } = extractImages($);
  const synopsis = extractSynopsis($);
  const { rating, tags } = extractRatingAndTags($);
  const isSerie = detectIsSerie(cleanLink, $);
  const embeds = !isSerie ? extractMovieEmbeds($) : [];
  const episodes = isSerie ? assembleSeasons($, extraSeasonsHtml, poster, cleanSlug) : [];

  return {
    title,
    image: poster,
    backgroundImage: backdrop,
    rating,
    type: isSerie ? "serie" : "movie",
    caption: synopsis,
    year,
    duration: undefined,
    tags,
    episodes: isSerie && episodes.length > 0 ? episodes : undefined,
    provider: "seriesmetro",
    context: {
      slug: cleanSlug,
      embeds,
      isSerie,
    },
  };
}

async function fetchExtraSeasonsHtml(
  fetchFn: typeof fetch,
  targets: SeasonAjaxTarget[],
  referer: string
): Promise<string[]> {
  if (targets.length === 0) return [];

  const results = await Promise.allSettled(
    targets.map(async ({ season, post }) => {
      const params = new URLSearchParams();
      params.append("action", AJAX_ACTION);
      params.append("season", String(season));
      params.append("post", post);

      const ajaxRes = await fetchFn(AJAX_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: referer,
        },
        body: params.toString(),
      });

      return ajaxRes.text();
    })
  );

  const extraHtmls: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      extraHtmls.push(r.value);
    }
  }

  return extraHtmls;
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

    const { cleanLink } = cleanMediaUrl(link);
    const isSerie = detectIsSerie(cleanLink, $);

    let extraSeasonsHtml: string[] = [];
    if (isSerie) {
      const targets = extractExtraSeasonTargets($);
      if (targets.length > 0) {
        const fullReferer = link.startsWith("http")
          ? link
          : `${SERIESMETRO_BASE_URL}${cleanLink}`;
        extraSeasonsHtml = await fetchExtraSeasonsHtml(this.fetchFn, targets, fullReferer);
      }
    }

    return parseSeriesmetroDetail(html, link, extraSeasonsHtml);
  }
}

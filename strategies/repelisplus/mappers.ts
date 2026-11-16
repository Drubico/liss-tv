import * as cheerio from "cheerio";
import type { MediaItem } from "@/types/movie";
import { REPELISPLUS_BASE_URL } from "./client";

export function normalizeUrl(urlOrPath: string | undefined | null): string {
  if (!urlOrPath) return "";
  const trimmed = urlOrPath.trim();
  if (trimmed.startsWith("/api/image")) {
    return trimmed;
  }
  let absolute = trimmed;
  if (trimmed.startsWith("//")) {
    absolute = `https:${trimmed}`;
  } else if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    absolute = `${REPELISPLUS_BASE_URL}${cleanPath}`;
  }

  // RepelisPlus CDN blocks direct browser/optimizer hotlinking with Cloudflare 403.
  // Route CDN images through the application image proxy.
  if (absolute.includes("repelisplus.buzz/cdn/")) {
    return `/api/image?url=${encodeURIComponent(absolute)}`;
  }

  return absolute;
}

export function cleanLinkToPath(link: string | undefined | null): string {
  if (!link) return "";
  const trimmed = link.trim();
  const match = trimmed.match(/https?:\/\/[^/]+(\/.*)/);
  if (match) {
    return match[1];
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function parseMovieCard(
  $: cheerio.CheerioAPI,
  el: Parameters<cheerio.CheerioAPI>[0],
): MediaItem | null {
  const linkEl = $(el).is("a") ? $(el) : $(el).find("a").first();
  const rawHref = linkEl.attr("href") || "";
  const link = cleanLinkToPath(rawHref);

  if (!link) return null;

  const titleFromDetail = $(el).find(".item-detail p").text().trim();
  const titleFromAlt = $(el).find(".poster").attr("alt")?.replace(/^Poster\s+/i, "").trim();
  const title = titleFromDetail || titleFromAlt || link;

  const rawPoster = $(el).find("img.poster, img").first().attr("src") || "";
  const image = normalizeUrl(rawPoster) || "/logo-with-background.png";

  const backdropEl = $(el).find(".card-hover-backdrop");
  const rawBackdrop =
    backdropEl.attr("data-backdrop") ||
    backdropEl.css("background-image")?.replace(/^url\(["']?|["']?\)$/g, "") ||
    "";
  const backgroundImage = normalizeUrl(rawBackdrop) || image;

  const year = $(el).find(".year").first().text().trim();
  const ratingRaw = $(el).find(".card-hover-rating").first().text().trim();
  const rating = ratingRaw.replace(/^[☆★\s]+|[☆★\s]+$/g, "");
  const duration = $(el).find(".card-hover-info-meta div").first().text().trim();

  const tags = $(el)
    .find(".card-hover-info-genre li, .genres li")
    .map((_, tag) => $(tag).text().trim())
    .get()
    .filter(Boolean);

  const caption = $(el).find(".card-hover-info-overview p").first().text().trim();

  return {
    id: link,
    link,
    title,
    image,
    year: year || "",
    rating: rating || "",
    type: link.includes("/serie/") ? "serie" : "movie",
    provider: "repelisplus",
    context: {
      backgroundImage,
      duration: duration || undefined,
      tags: tags.length > 0 ? tags : undefined,
      caption: caption || undefined,
    },
  };
}

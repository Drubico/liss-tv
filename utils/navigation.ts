/**
 * Client-safe navigation and provider detection utilities.
 * Contains no Node.js dependencies and can safely be bundled by Turbopack/Next.js client components.
 */

export function inferProviderFromLink(
  link?: string,
  context?: Record<string, unknown>,
): string | undefined {
  if (context?.provider && typeof context.provider === "string") {
    return context.provider;
  }
  if (!link) return undefined;
  const clean = link.toLowerCase();
  if (clean.includes("repelisplus")) {
    return "repelisplus";
  }
  if (
    clean.includes("serieslan") ||
    Boolean(context?.player_url) ||
    Boolean(context?.tmdb_id)
  ) {
    return "serieslan";
  }
  if (
    clean.includes("gnula") ||
    /^[a-z0-9_-]+-\d+x\d+/.test(clean.replace(/^\/+/, "")) ||
    clean.startsWith("ver/") ||
    clean.startsWith("/ver/")
  ) {
    return "gnula";
  }
  return undefined;
}

export function getPlayerHref(link: string): string {
  if (!link) return "/";

  // If already a player route, retain path and query params
  if (link.includes("/player")) {
    return link.startsWith("/") ? link : `/${link}`;
  }

  const [pathOnly, queryString] = link.split("?");
  const querySuffix = queryString ? `?${queryString}` : "";
  const clean = pathOnly.replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/");

  if (parts[0] === "pelicula" || parts[0] === "serie") {
    const type = parts[0];
    const slug = parts[1] || "";
    const extra = parts.slice(2);
    if (extra.length >= 2 && !isNaN(Number(extra[0])) && !isNaN(Number(extra[1]))) {
      return `/${type}/${slug}/player?season=${extra[0]}&episode=${extra[1]}`;
    }
    return `/${type}/${slug}/player${querySuffix}`;
  }

  // Gnula episode format, e.g. "ragna-crimson-1x01" or "breaking-bad-5x16"
  const gnulaMatch = clean.match(/^([^/]+)-\d+x\d+$/i);
  if (gnulaMatch) {
    return `/serie/${gnulaMatch[1]}/player${querySuffix}`;
  }

  // Gnula movie format, e.g. "ver/godzilla-minus-zero"
  if (parts[0] === "ver" && parts[1]) {
    return `/pelicula/${parts[1]}/player${querySuffix}`;
  }

  return `/${parts.slice(0, 2).join("/")}/player${querySuffix}`;
}

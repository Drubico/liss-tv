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
  if (
    clean.includes("megadede") ||
    clean.includes("/vidurl/") ||
    /-[a-z0-9]{6}(?:#.*)?$/i.test(clean) ||
    /#s\d+-e\d+/i.test(clean)
  ) {
    return "megadede";
  }
  return undefined;
}

export function getPlayerHref(link: string): string {
  if (!link) return "/";

  // If full absolute URL with protocol, extract relative path + search + hash
  let raw = link.trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      raw = parsed.pathname + parsed.search + parsed.hash;
    } catch {
      raw = raw.replace(/^https?:\/\/[^/]+/i, "");
    }
  }

  // Separate hash fragment (if any)
  let hash = "";
  const hashIdx = raw.indexOf("#");
  if (hashIdx !== -1) {
    hash = raw.slice(hashIdx);
    raw = raw.slice(0, hashIdx);
  }

  // Strip accidental trailing /player inside hash fragment (e.g. #s3-e7/player)
  if (hash) {
    hash = hash.replace(/\/player\/?$/i, "");
  }

  // Separate query string (if any)
  let queryString = "";
  const queryIdx = raw.indexOf("?");
  if (queryIdx !== -1) {
    queryString = raw.slice(queryIdx + 1);
    raw = raw.slice(0, queryIdx);
  }

  // Pure pathname without query or hash
  const clean = raw.replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);

  // If already ends in /player, preserve route and re-attach query params
  if (parts[parts.length - 1] === "player") {
    const existingParams = new URLSearchParams(queryString);
    const hashMatch = hash.match(/#s(\d+)-e(\d+)/i);
    if (hashMatch) {
      if (!existingParams.has("season")) existingParams.set("season", hashMatch[1]);
      if (!existingParams.has("episode")) existingParams.set("episode", hashMatch[2]);
    }
    const qs = existingParams.toString();
    const querySuffix = qs ? `?${qs}` : "";
    return `/${parts.join("/")}${querySuffix}`;
  }

  // Extract season & episode from hash if present (#s3-e7)
  const hashMatch = hash.match(/#s(\d+)-e(\d+)/i);
  const searchParams = new URLSearchParams(queryString);
  if (hashMatch) {
    if (!searchParams.has("season")) searchParams.set("season", hashMatch[1]);
    if (!searchParams.has("episode")) searchParams.set("episode", hashMatch[2]);
  }

  if (parts[0] === "pelicula" || parts[0] === "serie") {
    const type = parts[0];
    const slug = parts[1] || "";
    const extra = parts.slice(2);
    if (extra.length >= 2 && !isNaN(Number(extra[0])) && !isNaN(Number(extra[1]))) {
      searchParams.set("season", extra[0]);
      searchParams.set("episode", extra[1]);
    }
    const qs = searchParams.toString();
    const querySuffix = qs ? `?${qs}` : "";
    return `/${type}/${slug}/player${querySuffix}`;
  }

  // Gnula episode format, e.g. "ragna-crimson-1x01" or "breaking-bad-5x16"
  const gnulaMatch = clean.match(/^([^/]+)-\d+x\d+$/i);
  if (gnulaMatch) {
    const qs = searchParams.toString();
    const querySuffix = qs ? `?${qs}` : "";
    return `/serie/${gnulaMatch[1]}/player${querySuffix}`;
  }

  // Gnula movie format, e.g. "ver/godzilla-minus-one"
  if (parts[0] === "ver" && parts[1]) {
    const qs = searchParams.toString();
    const querySuffix = qs ? `?${qs}` : "";
    return `/pelicula/${parts[1]}/player${querySuffix}`;
  }

  const qs = searchParams.toString();
  const querySuffix = qs ? `?${qs}` : "";
  return `/${parts.slice(0, 2).join("/")}/player${querySuffix}`;
}

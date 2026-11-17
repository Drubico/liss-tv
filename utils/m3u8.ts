export const M3U8_PROXY_PATH = "/api/video/m3u8";

export interface RewriteManifestOptions {
  baseOrigin?: string;
  directSegments?: boolean;
  referer?: string;
}

export function resolveUrl(uri: string, manifestUrl: string): string {
  if (/^https?:\/\//i.test(uri)) return uri;
  const base = new URL(manifestUrl);
  base.pathname = base.pathname.replace(/\/[^/]*$/, "/");
  return new URL(uri, base).href;
}

export function rewriteManifest(
  body: string,
  manifestUrl: string,
  options?: RewriteManifestOptions | string,
  legacyReferer?: string,
): string {
  const normalizedOptions: RewriteManifestOptions =
    typeof options === "string"
      ? { baseOrigin: options, referer: legacyReferer }
      : options || {};

  const baseOrigin = normalizedOptions.baseOrigin;
  const directSegments = !!normalizedOptions.directSegments;
  const referer = normalizedOptions.referer || legacyReferer;

  const validOrigin =
    baseOrigin && !baseOrigin.includes("0.0.0.0")
      ? baseOrigin.replace(/\/+$/, "")
      : "";
  const prefix = validOrigin
    ? `${validOrigin}${M3U8_PROXY_PATH}`
    : M3U8_PROXY_PATH;

  const refererParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";

  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("#") && trimmed.includes("URI=")) {
        return line.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
          const absolute = resolveUrl(uri, manifestUrl);
          return `URI="${prefix}?url=${encodeURIComponent(absolute)}${refererParam}"`;
        });
      }

      if (trimmed !== "" && !trimmed.startsWith("#")) {
        const absolute = resolveUrl(trimmed, manifestUrl);
        const isSubManifest = absolute.includes(".m3u8");

        if (directSegments && !isSubManifest) {
          return absolute;
        }

        const directParam = directSegments && isSubManifest ? "&directSegments=true" : "";
        return `${prefix}?url=${encodeURIComponent(absolute)}${directParam}${refererParam}`;
      }

      return line;
    })
    .join("\n");
}

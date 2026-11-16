import { RepelisPlusError } from "./types";
import { fetchFlare } from "@/utils/flaresolverr";

export const REPELISPLUS_BASE_URL = "https://repelisplus.buzz";
const DEFAULT_TIMEOUT_MS = 8000;

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

export function buildRepelisUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${REPELISPLUS_BASE_URL}${cleanPath}`;
}

export async function repelisFetch(
  pathOrUrl: string,
  options?: RequestInit,
): Promise<Response> {
  const url = buildRepelisUrl(pathOrUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        ...DEFAULT_HEADERS,
        ...options?.headers,
      },
      signal: controller.signal,
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new RepelisPlusError(
        `[RepelisPlus] Request timed out after ${DEFAULT_TIMEOUT_MS}ms for ${url}`,
        408,
      );
    }
    throw new RepelisPlusError(
      `[RepelisPlus] Network failure for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function repelisFlareFetch(
  pathOrUrl: string,
): Promise<Response> {
  const url = buildRepelisUrl(pathOrUrl);
  try {
    const res = await fetchFlare(url);
    return res;
  } catch (err: unknown) {
    throw new RepelisPlusError(
      `[RepelisPlus] FlareSolverr request failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

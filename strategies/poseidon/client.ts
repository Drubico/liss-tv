import type { PoseidonNextData } from "./types";

export const POSEIDON_BASE_URL = "https://www.poseidonhd2.co";

export const POSEIDON_DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

/**
 * Extracts and parses the __NEXT_DATA__ JSON payload from an HTML page.
 * Throws a descriptive error if the script tag is not present.
 */
export function extractNextData<T = PoseidonNextData>(html: string): T {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match || !match[1]) {
    throw new Error(
      "[PoseidonClient] __NEXT_DATA__ script not found in page HTML",
    );
  }

  try {
    return JSON.parse(match[1]) as T;
  } catch (error) {
    throw new Error(
      `[PoseidonClient] Failed to parse __NEXT_DATA__ JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Performs a standard fetch against PoseidonHD 2 with default headers.
 */
export async function poseidonFetch(
  endpointOrUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const url = endpointOrUrl.startsWith("http://") || endpointOrUrl.startsWith("https://")
    ? endpointOrUrl
    : `${POSEIDON_BASE_URL}/${endpointOrUrl.replace(/^\/+/, "")}`;

  const headers = {
    ...POSEIDON_DEFAULT_HEADERS,
    ...(init?.headers || {}),
  };

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `[PoseidonClient] Request to "${url}" failed with HTTP status ${response.status}`,
    );
  }

  return response;
}

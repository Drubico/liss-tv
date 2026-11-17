export const MEGADEDE_BASE_URL = "https://megadede.mobi";

export class MegadedeError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MegadedeError";
    this.status = status;
  }
}

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: `${MEGADEDE_BASE_URL}/`,
  "Accept-Language": "es-ES,es;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * Executes an HTTP request against Megadede with appropriate desktop headers.
 */
export async function megadedeFetch(
  endpointOrUrl: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = endpointOrUrl.startsWith("http")
    ? endpointOrUrl
    : `${MEGADEDE_BASE_URL}${endpointOrUrl.startsWith("/") ? "" : "/"}${endpointOrUrl}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    throw new MegadedeError(
      `[Megadede] Request failed with status ${res.status}: ${url}`,
      res.status
    );
  }

  return res;
}

export const SERIESLAN_BASE_URL = "https://serieslan.live";
const DEFAULT_TIMEOUT_MS = 8000;

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

export class SeriesLanError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SeriesLanError";
    this.status = status;
  }
}

export function buildSerieslanUrl(
  path: string,
  params?: Record<string, string | number | undefined>
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${SERIESLAN_BASE_URL}${normalizedPath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

export async function serieslanFetch<T>(
  endpointOrUrl: string,
  options?: {
    headers?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<T> {
  const url = endpointOrUrl.startsWith("http")
    ? endpointOrUrl
    : buildSerieslanUrl(endpointOrUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      headers: {
        ...DEFAULT_HEADERS,
        ...options?.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new SeriesLanError(
        `[SeriesLanClient] Request to "${url}" failed with HTTP status ${response.status}`,
        response.status
      );
    }

    const json = (await response.json()) as T;
    return json;
  } catch (err: unknown) {
    if (err instanceof SeriesLanError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new SeriesLanError(
      `[SeriesLanClient] Network request failed for "${url}": ${message}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

import { BROWSER_UA, createStickySession } from "@/utils/browser";
import { isProxyEnabled } from "@/utils/proxy";
import { rewriteManifest } from "@/utils/m3u8";
import {
  getManifest,
  saveManifest,
  getManifestAppUrl,
} from "@/services/minio.service";
import { getAny, upsert } from "@/services/movie.store";
import got from "got";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const pathParam = req.nextUrl.searchParams.get("path");

  // 1. Si viene pathParam, buscar primero si ya está almacenado en MinIO
  if (pathParam) {
    try {
      const storedManifest = await getManifest(pathParam);
      if (storedManifest) {
        try {
          const existing = getAny(pathParam);
          const provider = existing?.provider || "sololatino";
          upsert(provider, pathParam, { movieUrl: getManifestAppUrl(pathParam) });
        } catch {}

        return new NextResponse(storedManifest, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    } catch (err) {
      console.warn(`[MinIO] Failed to retrieve manifest for ${pathParam}:`, err);
    }
  }

  // 2. Si no hay manifest guardado y no se proporcionó URL, devolver error
  if (!url) {
    if (pathParam) {
      return NextResponse.json(
        { error: `Manifest not found in storage for '${pathParam}' and no 'url' provided` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Missing 'url' or 'path' parameter" },
      { status: 400 },
    );
  }

  const isManifestUrl = url.includes(".m3u8");

  // Determine appropriate upstream referer header
  const refererParam = req.nextUrl.searchParams.get("referer");
  let effectiveReferer = refererParam;
  if (!effectiveReferer) {
    try {
      const parsedUrl = new URL(url);
      if (
        parsedUrl.hostname.includes("acek-cdn") ||
        parsedUrl.hostname.includes("dramiyos-cdn") ||
        parsedUrl.hostname.includes("-cdn.com") ||
        parsedUrl.hostname.includes("vidhide") ||
        parsedUrl.hostname.includes("morencius")
      ) {
        effectiveReferer = "https://megadede.mobi/";
      } else {
        effectiveReferer = `${parsedUrl.origin}/`;
      }
    } catch {
      effectiveReferer = "https://megadede.mobi/";
    }
  }

  try {
    // ------------------------------------------------------------------
    // MANIFEST path — fetch via sticky proxy, rewrite, return as text.
    // The proxy is used HERE and nowhere else, so segment bandwidth
    // never touches the proxy.
    // ------------------------------------------------------------------
    if (isManifestUrl) {
      const { agent } = isProxyEnabled()
        ? createStickySession()
        : { agent: undefined };

      const manifestRes = await got(url, {
        headers: {
          "user-agent": BROWSER_UA,
          ...(effectiveReferer ? { referer: effectiveReferer } : {}),
        },
        throwHttpErrors: false,
        ...(agent ? { agent: { https: agent, http: agent } } : {}),
      });

      if (manifestRes.statusCode >= 400) {
        return NextResponse.json(
          { error: "Upstream manifest error", status: manifestRes.statusCode },
          { status: 502 },
        );
      }

      const body = manifestRes.body;
      const origin = process.env.APP_URL;
      const appOrigin = origin || (req.nextUrl.origin.includes("0.0.0.0") ? "" : req.nextUrl.origin);
      const rewrittenBody = rewriteManifest(body, url, appOrigin, effectiveReferer);

      // Si viene el pathParam, guardar la versión reescrita en MinIO en background y actualizar SQLite
      if (pathParam) {
        void saveManifest(pathParam, rewrittenBody)
          .then((savedAppUrl) => {
            try {
              const existing = getAny(pathParam);
              const provider = existing?.provider || "sololatino";
              upsert(provider, pathParam, { movieUrl: savedAppUrl });
            } catch {}
          })
          .catch((err) => {
            console.warn(`[MinIO] Background save failed for ${pathParam}:`, err);
          });
      }

      return new NextResponse(rewrittenBody, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=60",
        },
      });
    }

    // ------------------------------------------------------------------
    // SEGMENT path — stream directly with native fetch, no proxy.
    // ------------------------------------------------------------------
    const segmentHeaders: Record<string, string> = {
      "user-agent": BROWSER_UA,
      ...(effectiveReferer ? { referer: effectiveReferer } : {}),
    };

    const rangeHeader = req.headers.get("range");
    if (rangeHeader) {
      segmentHeaders["range"] = rangeHeader;
    }

    // Timeout only applies to initial connection & receiving HTTP headers (15s)
    // so slow large segment downloads are not aborted midway.
    const controller = new AbortController();
    const connectTimeoutId = setTimeout(() => {
      controller.abort(new Error("Upstream connection timeout"));
    }, 15000);

    const onReqAbort = () => controller.abort();
    req.signal?.addEventListener("abort", onReqAbort);

    let upstreamRes: Response;
    try {
      upstreamRes = await fetch(url, {
        headers: segmentHeaders,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(connectTimeoutId);
      req.signal?.removeEventListener("abort", onReqAbort);
    }

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      console.warn(
        `[m3u8 proxy] Upstream segment returned ${upstreamRes.status} for ${url}`,
      );
      return new NextResponse(null, { status: upstreamRes.status });
    }

    // Force video MIME — some upstreams disguise segments
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstreamRes.headers.get("content-type") || "video/mp2t",
    );
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Headers", "Range");
    headers.set("Cache-Control", "public, max-age=3600");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Range, Accept-Ranges",
    );

    // IMPORTANT: Do NOT set Content-Length on chunked ReadableStreams in HTTP/2.
    // If a client cancels/seeks or closes before every byte is transferred,
    // sending a Content-Length that doesn't match the transmitted DATA frames
    // triggers an RFC 7540 PROTOCOL_ERROR (net::ERR_HTTP2_PROTOCOL_ERROR).
    const contentRange = upstreamRes.headers.get("content-range");
    const acceptRanges = upstreamRes.headers.get("accept-ranges");
    if (contentRange) headers.set("Content-Range", contentRange);
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);

    const status = upstreamRes.status === 206 && !contentRange ? 200 : upstreamRes.status;

    // Wrap body stream safely so client cancellations/aborts close cleanly
    // without triggering Next.js 'failed to pipe response' crashes.
    const upstreamBody = upstreamRes.body;
    let safeStream: ReadableStream | null = null;

    if (upstreamBody) {
      safeStream = new ReadableStream({
        async start(ctrl) {
          const reader = upstreamBody.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                try {
                  ctrl.close();
                } catch {}
                break;
              }
              ctrl.enqueue(value);
            }
          } catch {
            // Client closed connection or aborted; gracefully terminate stream
            try {
              ctrl.close();
            } catch {}
          }
        },
        cancel(reason) {
          upstreamBody.cancel(reason).catch(() => {});
        },
      });
    }

    return new NextResponse(safeStream, {
      status,
      headers,
    });
  } catch (err: unknown) {
    if (
      req.signal?.aborted ||
      (err instanceof Error &&
        (err.name === "AbortError" || err.name === "TimeoutError"))
    ) {
      return new NextResponse(null, { status: 499 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[m3u8 proxy] Error proxying:", message, url);
    return NextResponse.json(
      { error: "Failed to fetch upstream", details: message },
      { status: 502 },
    );
  }
}

import * as cheerio from "cheerio";
import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { gnulaFetch, GNULA_BASE_URL, GnulaError } from "./client";

const DEFAULT_X_GN_SCR = "1920x1080|1920x1040|1920x969|1|0|0|8|8|24|0|1|hw";
const DEFAULT_X_GN_DEV = "4f8a2c1b9e3d";
const XOR_KEY = [103, 78, 55, 100];

export interface GnulaServer {
  title: string;
  src: string;
}

export interface GnulaLanguage {
  label: string;
  flag?: string;
  servers: GnulaServer[];
}

export interface GnulaPlayerPayload {
  t?: string;
  langs?: GnulaLanguage[];
}

interface ScriptTokens {
  pid?: string;
  tok?: string;
  vdResolve?: string;
  vdAuth?: string;
  sfResolve?: string;
  sfAuth?: string;
  ttResolve?: string;
  ttAuth?: string;
}

export function gnrdUnpack(s: string): GnulaPlayerPayload | null {
  if (!s || typeof s !== "string") return null;

  try {
    const rawBytes = Buffer.from(s, "base64");
    if (!rawBytes.length) return null;

    const decodedBytes = new Uint8Array(rawBytes.length);
    for (let i = 0; i < rawBytes.length; i++) {
      decodedBytes[i] = rawBytes[i] ^ XOR_KEY[i & 3];
    }

    const jsonStr = new TextDecoder("utf-8").decode(decodedBytes);
    return JSON.parse(jsonStr) as GnulaPlayerPayload;
  } catch {
    return null;
  }
}

function extractScriptTokens($: cheerio.CheerioAPI): ScriptTokens {
  const tokens: ScriptTokens = {};

  $("script").each((_, el) => {
    const text = $(el).html() || "";

    const pidMatch = text.match(/_gnrdPid\s*=\s*(\d+)/);
    if (pidMatch && !tokens.pid) {
      tokens.pid = pidMatch[1];
    }

    const tokMatch = text.match(/_gnrdTok\s*=\s*["']([^"']+)["']/);
    if (tokMatch && !tokens.tok) {
      tokens.tok = tokMatch[1];
    }

    const vdResolveMatch = text.match(/VD_RESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (vdResolveMatch && !tokens.vdResolve) {
      tokens.vdResolve = vdResolveMatch[1];
    }

    const vdAuthMatch = text.match(/VD_AUTH\s*=\s*['"]([^'"]+)['"]/);
    if (vdAuthMatch && !tokens.vdAuth) {
      tokens.vdAuth = vdAuthMatch[1];
    }

    const sfResolveMatch = text.match(/SF_RESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (sfResolveMatch && !tokens.sfResolve) {
      tokens.sfResolve = sfResolveMatch[1];
    }

    const sfAuthMatch = text.match(/SF_AUTH\s*=\s*['"]([^'"]+)['"]/);
    if (sfAuthMatch && !tokens.sfAuth) {
      tokens.sfAuth = sfAuthMatch[1];
    }

    const ttResolveMatch = text.match(/\bRESOLVE\s*=\s*['"]([^'"]+)['"]/);
    if (ttResolveMatch && !tokens.ttResolve) {
      tokens.ttResolve = ttResolveMatch[1];
    }

    const ttAuthMatch = text.match(/\bAUTH\s*=\s*['"]([^'"]+)['"]/);
    if (ttAuthMatch && !tokens.ttAuth) {
      tokens.ttAuth = ttAuthMatch[1];
    }
  });

  return tokens;
}

function resolveDetailPath(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const clean = path.replace(/^\/+/, "");
  if (clean.startsWith("ver/")) {
    return clean;
  }
  // Movie path
  if (clean.startsWith("pelicula/")) {
    return `ver/${clean.replace(/^pelicula\//, "").replace(/\/+$/, "")}/`;
  }
  return clean.endsWith("/") ? clean : `${clean}/`;
}

function extractVidaraInfo(src: string): { code: string; host: string } | null {
  try {
    const url = new URL(src);
    if (url.hostname.includes("vidara") || url.hostname.includes("bysevepoin")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const code = parts[parts.length - 1];
      if (code) {
        return { code, host: url.hostname };
      }
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

function extractSaveFilesCode(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname.includes("savefiles")) {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

function extractTheTubeCode(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname.includes("tube")) {
      const parts = url.pathname.split("/").filter(Boolean);
      return parts[parts.length - 1] || null;
    }
  } catch {
    // Ignore invalid url
  }
  return null;
}

export class GetUrl implements StrategyGetUrl {
  private readonly fetchFn: typeof gnulaFetch;

  constructor(fetchFn: typeof gnulaFetch = gnulaFetch) {
    this.fetchFn = fetchFn;
  }

  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const endpoint = resolveDetailPath(path);
    const detailContext = options?.detailContext as Record<string, unknown> | undefined;

    // 1. Fetch content page if complete tokens are not already provided in context
    let tokens: ScriptTokens = {};
    if (
      typeof detailContext?.pid === "string" &&
      typeof detailContext?.tok === "string" &&
      typeof detailContext?.vdResolve === "string"
    ) {
      tokens.pid = detailContext.pid;
      tokens.tok = detailContext.tok;
      tokens.vdResolve = detailContext.vdResolve;
      tokens.vdAuth = typeof detailContext.vdAuth === "string" ? detailContext.vdAuth : undefined;
      tokens.sfResolve = typeof detailContext.sfResolve === "string" ? detailContext.sfResolve : undefined;
      tokens.sfAuth = typeof detailContext.sfAuth === "string" ? detailContext.sfAuth : undefined;
      tokens.ttResolve = typeof detailContext.ttResolve === "string" ? detailContext.ttResolve : undefined;
      tokens.ttAuth = typeof detailContext.ttAuth === "string" ? detailContext.ttAuth : undefined;
    } else {
      const pageRes = await this.fetchFn(endpoint, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!pageRes.ok) {
        throw new GnulaError(
          `[Gnula] Failed to load content page ${endpoint}: HTTP ${pageRes.status}`,
          pageRes.status
        );
      }

      const html = await pageRes.text();
      const $ = cheerio.load(html);
      tokens = extractScriptTokens($);
    }

    if (!tokens.pid || !tokens.tok) {
      throw new GnulaError(`[Gnula] Failed to extract player tokens for ${path}`);
    }

    // 2. Fetch player endpoint
    const cleanBase = GNULA_BASE_URL.replace(/\/+$/, "");
    const referer = path.startsWith("http")
      ? path
      : `${cleanBase}/${endpoint.replace(/^\/+/, "")}`;

    const playerEndpoint = `/wp-json/gnrd/v1/player?id=${tokens.pid}&t=${encodeURIComponent(tokens.tok)}`;
    const playerRes = await this.fetchFn(playerEndpoint, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "X-Gn-Scr": DEFAULT_X_GN_SCR,
        "X-Gn-Dev": DEFAULT_X_GN_DEV,
        Referer: referer,
      },
    });

    if (!playerRes.ok) {
      throw new GnulaError(
        `[Gnula] Player endpoint returned HTTP ${playerRes.status} for ${path}`,
        playerRes.status
      );
    }

    const playerJson = (await playerRes.json()) as { p?: string };
    const payload = gnrdUnpack(playerJson.p || "");

    const langs = payload?.langs || [];
    if (langs.length === 0) {
      throw new GnulaError(`[Gnula] No streaming servers found for ${path}`);
    }

    // 3. Select language (prefer requested language, then Latino, then first available)
    const preferredLang = (options?.params?.lang as string | undefined)?.toLowerCase();
    const selectedLang =
      langs.find((l) => preferredLang && l.label.toLowerCase().includes(preferredLang)) ||
      langs.find((l) => l.label.toLowerCase().includes("latino")) ||
      langs[0];

    const servers = selectedLang?.servers || [];
    if (servers.length === 0) {
      throw new GnulaError(`[Gnula] No servers found in language group for ${path}`);
    }

    const fallbackCandidate = servers[0].src;

    // 4. Cascade resolution to direct M3U8
    for (const server of servers) {
      // 4.1 Vidara Resolver
      const vidara = extractVidaraInfo(server.src);
      if (vidara && tokens.vdResolve) {
        const vdAuth = tokens.vdAuth || "";
        const vdUrl = `${tokens.vdResolve}?pl=1&code=${encodeURIComponent(vidara.code)}&host=${encodeURIComponent(vidara.host)}${vdAuth.startsWith("&") ? vdAuth : `&${vdAuth}`}`;
        try {
          const res = await this.fetchFn(vdUrl, {
            headers: { Referer: referer },
          });
          if (res.ok) {
            const fullVdUrl = vdUrl.startsWith("http")
              ? vdUrl
              : `${cleanBase}${vdUrl.startsWith("/") ? "" : "/"}${vdUrl}`;
            return {
              url: fullVdUrl,
              fallbackUrl: server.src,
            };
          }
        } catch {
          // Continue to next server
        }
      }

      // 4.2 SaveFiles Resolver
      const sfCode = extractSaveFilesCode(server.src);
      if (sfCode && tokens.sfResolve) {
        const sfAuth = tokens.sfAuth || "";
        const sfUrl = `${tokens.sfResolve}?code=${encodeURIComponent(sfCode)}${sfAuth.startsWith("&") ? sfAuth : `&${sfAuth}`}`;
        try {
          const res = await this.fetchFn(sfUrl, {
            headers: { Referer: referer },
          });
          if (res.ok) {
            const sfJson = (await res.json()) as { master?: string };
            if (sfJson.master) {
              return {
                url: sfJson.master,
                fallbackUrl: server.src,
              };
            }
          }
        } catch {
          // Continue to next server
        }
      }

      // 4.3 The Tube Resolver
      const ttCode = extractTheTubeCode(server.src);
      if (ttCode && tokens.ttResolve) {
        const ttAuth = tokens.ttAuth || "";
        const ttUrl = `${tokens.ttResolve}${encodeURIComponent(ttCode)}${ttAuth.startsWith("&") ? ttAuth : `&${ttAuth}`}`;
        try {
          const res = await this.fetchFn(ttUrl, {
            headers: { Referer: referer },
          });
          if (res.ok) {
            const ttJson = (await res.json()) as { master?: string };
            if (ttJson.master) {
              return {
                url: ttJson.master,
                fallbackUrl: server.src,
              };
            }
          }
        } catch {
          // Continue to next server
        }
      }
    }

    // 5. Fallback to raw embed URL
    return {
      url: fallbackCandidate,
      fallbackUrl: fallbackCandidate,
    };
  }
}

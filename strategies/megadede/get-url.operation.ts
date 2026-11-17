import crypto from "crypto";
import type { GetUrlOptions, StrategyGetUrl, Url } from "@/types/movie";
import { MegadedeError, megadedeFetch } from "./client";
import type { MegadedeEpisodeApiResponse, MegadedeLanguageGroup } from "./types";
import { extractVidhideM3u8 } from "./extractors/vidhide.extractor";
import { extractStreamwishM3u8 } from "./extractors/streamwish.extractor";
import { extractVoeM3u8 } from "./extractors/voe.extractor";

export function decryptAesLink(encryptedBase64: string, challenge: string, salt: string): string {
  const rawKey = crypto.createHash("sha256").update(challenge + salt).digest();
  const raw = Buffer.from(encryptedBase64, "base64");
  const iv = raw.subarray(0, 16);
  const ciphertext = raw.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", rawKey, iv);
  let decrypted = decipher.update(ciphertext, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export class GetUrl implements StrategyGetUrl {
  async operation(path: string, options?: GetUrlOptions): Promise<Url> {
    const vidurlPath = await this.resolveVidurlPath(path, options);

    const vidurlRes = await megadedeFetch(vidurlPath, {
      headers: {
        Referer: path.startsWith("http") ? path : `https://megadede.mobi${path.startsWith("/") ? "" : "/"}${path}`,
      },
    });

    const html = await vidurlRes.text();

    const challenge = html.match(/LINK_CHALLENGE\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const salt = html.match(/LINK_SALT\s*=\s*['"]([^'"]+)['"]/)?.[1];

    if (!challenge || !salt) {
      throw new MegadedeError(
        `[Megadede] Missing cryptographic keys in player endpoint: ${vidurlPath}`
      );
    }

    const dataMatch = html.match(/dataLink\s*=\s*(\[\s*\{[\s\S]*?\}\s*\]);/);
    if (!dataMatch) {
      throw new MegadedeError(`[Megadede] No dataLink array found in ${vidurlPath}`);
    }

    let groups: MegadedeLanguageGroup[] = [];
    try {
      groups = JSON.parse(dataMatch[1]);
    } catch {
      try {
        const parseFn = new Function(`return ${dataMatch[1]}`);
        groups = parseFn() as MegadedeLanguageGroup[];
      } catch {
        throw new MegadedeError(`[Megadede] Failed to parse dataLink array in ${vidurlPath}`);
      }
    }

    const preferredLang = (
      options?.language ||
      (options?.params?.lang as string | undefined) ||
      "LAT"
    ).toUpperCase();

    const selectedGroup =
      groups.find((g) => g.video_language?.toUpperCase().includes(preferredLang)) ||
      groups.find((g) => g.video_language?.toUpperCase().includes("LAT")) ||
      groups[0];

    if (!selectedGroup || !selectedGroup.sortedEmbeds?.length) {
      throw new MegadedeError(`[Megadede] No streaming embeds available for language ${preferredLang}`);
    }

    const resolvedStreams: string[] = [];

    for (const embed of selectedGroup.sortedEmbeds) {
      try {
        const decryptedUrl = decryptAesLink(embed.link, challenge, salt);
        if (!decryptedUrl) continue;

        let m3u8Url: string | null = null;
        const server = embed.servername?.toLowerCase() || "";

        if (server.includes("vidhide") || decryptedUrl.includes("morencius") || decryptedUrl.includes("vidhide")) {
          m3u8Url = await extractVidhideM3u8(decryptedUrl);
        } else if (server.includes("streamwish") || decryptedUrl.includes("hglink")) {
          m3u8Url = await extractStreamwishM3u8(decryptedUrl);
        } else if (server.includes("voe") || decryptedUrl.includes("voe.sx")) {
          m3u8Url = await extractVoeM3u8(decryptedUrl);
        }

        if (m3u8Url) {
          resolvedStreams.push(m3u8Url);
        }
      } catch {
        // Continue to next embed
      }
    }

    if (resolvedStreams.length === 0) {
      throw new MegadedeError(`[Megadede] Could not extract any playable HLS stream for ${path}`);
    }

    const primaryM3u8 = resolvedStreams[0];
    const secondaryM3u8 = resolvedStreams[1];

    const referer = encodeURIComponent("https://megadede.mobi/");
    return {
      url: `/api/video/m3u8?url=${encodeURIComponent(primaryM3u8)}&referer=${referer}`,
      fallbackUrl: secondaryM3u8
        ? `/api/video/m3u8?url=${encodeURIComponent(secondaryM3u8)}&referer=${referer}`
        : undefined,
      headers: {
        Referer: "https://megadede.mobi/",
      },
    };
  }

  private async resolveVidurlPath(path: string, options?: GetUrlOptions): Promise<string> {
    if (path.startsWith("/vidurl/")) {
      return path;
    }

    // Check if it's a series episode coordinate: either in path (#sX-eY) or in options
    const hashMatch = path.match(/#s(\d+)-e(\d+)/i);
    const season = options?.season || hashMatch?.[1];
    const episode = options?.episode || hashMatch?.[2];

    if (season !== undefined && episode !== undefined) {
      const slug =
        (options?.params?.slug as string | undefined) ||
        (options?.detailContext?.slug as string | undefined) ||
        path.replace(/^\/?(?:serie|pelicula)\//, "").replace(/#.*$/, "").replace(/\/+$/, "");

      const episodeApiUrl = `/api/episodio/serie/${encodeURIComponent(slug)}/${season}/${episode}`;
      const epRes = await megadedeFetch(episodeApiUrl, {
        headers: {
          Accept: "application/json",
          Referer: `https://megadede.mobi/serie/${encodeURIComponent(slug)}`,
        },
      });

      const epData = (await epRes.json()) as MegadedeEpisodeApiResponse;
      const vidurlMatch = epData.html?.match(/data-url="(\/vidurl\/[^"]+)"/);
      if (vidurlMatch) {
        return vidurlMatch[1];
      }
      throw new MegadedeError(`[Megadede] Episode player endpoint not found in ${episodeApiUrl}`);
    }

    // Otherwise, assume it's a movie page: fetch page to locate vidurl button
    const movieRes = await megadedeFetch(path);
    const html = await movieRes.text();
    const vidurlMatch =
      html.match(/changeServer\(['"](\/vidurl\/[^'"]+)['"]/i) ||
      html.match(/data-url="(\/vidurl\/[^"]+)"/i);

    if (vidurlMatch) {
      return vidurlMatch[1];
    }

    throw new MegadedeError(`[Megadede] Unable to locate /vidurl/ player for ${path}`);
  }
}

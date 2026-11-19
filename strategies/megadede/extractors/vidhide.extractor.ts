export function unpackDeanEdwards(packedCode: string): string | null {
  const match = packedCode.match(
    /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/
  );
  if (!match) return null;

  let p = match[1];
  const aStr = match[2];
  const cStr = match[3];
  const kStr = match[4];
  const a = parseInt(aStr, 10);
  let c = parseInt(cStr, 10);
  const dict = kStr.split("|");

  const baseN = (num: number, radix: number): string => {
    return (
      (num < radix ? "" : baseN(Math.floor(num / radix), radix)) +
      ((num = num % radix) > 35 ? String.fromCharCode(num + 29) : num.toString(36))
    );
  };

  while (c--) {
    if (dict[c]) {
      const token = baseN(c, a);
      p = p.replace(new RegExp("\\b" + token + "\\b", "g"), dict[c]);
    }
  }

  return p;
}

const DEAD_CDNS = ["radiantgroveproduction.cfd"];

export function isDeadCdn(url: string): boolean {
  return DEAD_CDNS.some((d) => url.toLowerCase().includes(d));
}

export function extractM3u8FromUnpacked(unpacked: string, embedUrl: string): string | null {
  // 1. Look for var links = { ... } object used by JWPlayer in Vidhide/Morencius
  const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/);
  if (linksMatch) {
    try {
      const parseFn = new Function(`return ${linksMatch[1]}`);
      const links = parseFn() as Record<string, string>;
      const prioritizedKeys = ["hls", "hls4", "hls2", "hls1", "hls3"];
      const candidateList = [
        ...prioritizedKeys.map((k) => links[k]).filter(Boolean),
        ...Object.values(links),
      ];

      for (const candidate of candidateList) {
        if (candidate && !isDeadCdn(candidate)) {
          return new URL(candidate, embedUrl).href;
        }
      }
    } catch {
      // Continue to next checks
    }
  }

  // 2. Check for jwplayer sources array: sources: [{ file: "..." }]
  const sourcesMatch = unpacked.match(
    /sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/,
  );
  if (sourcesMatch && !isDeadCdn(sourcesMatch[1])) {
    return new URL(sourcesMatch[1], embedUrl).href;
  }

  // 3. Check for direct absolute or relative m3u8 or master/index playlist
  const directMatch = unpacked.match(
    /(https?:\/\/[^"'\s]+(?:\.m3u8|\.txt|master\.|index\.)[^"'\s]*)/
  );
  if (directMatch && !isDeadCdn(directMatch[1])) return directMatch[1];

  const relativeMatch = unpacked.match(
    /["'](\/[^"'\s]+(?:\.m3u8|\.txt|master\.|index\.)[^"'\s]*)["']/
  );
  if (relativeMatch && !isDeadCdn(relativeMatch[1])) {
    return new URL(relativeMatch[1], embedUrl).href;
  }

  return null;
}

export async function extractVidhideM3u8(embedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://megadede.mobi/",
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    // 1. Check packed script first (where JWPlayer setup and links are defined)
    const packedMatch = html.match(
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/,
    );
    if (packedMatch) {
      const unpacked = unpackDeanEdwards(packedMatch[0]);
      if (unpacked) {
        const stream = extractM3u8FromUnpacked(unpacked, embedUrl);
        if (stream) return stream;
      }
    }

    // 2. Check unpacked/raw HTML as fallback
    const rawStream = extractM3u8FromUnpacked(html, embedUrl);
    if (rawStream) return rawStream;

    return null;
  } catch {
    return null;
  }
}

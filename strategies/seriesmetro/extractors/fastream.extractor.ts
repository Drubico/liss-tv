/**
 * Unpacks JavaScript code packed with Dean Edwards' P.A.C.K.E.R.
 */
export function unpackDeanEdwards(packedCode: string): string | null {
  const match = packedCode.match(
    /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/
  );
  if (!match) {
    // Alternate format with object/arguments
    const altMatch = packedCode.match(
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/
    );
    if (!altMatch) return null;
  }

  try {
    let p: string;
    let a: number;
    let c: number;
    let kStr: string;

    if (match) {
      [, p, , , kStr] = match;
      a = parseInt(match[2], 10);
      c = parseInt(match[3], 10);
    } else {
      const parts = packedCode.match(
        /\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split/
      );
      if (!parts) return null;
      p = parts[1];
      a = parseInt(parts[2], 10);
      c = parseInt(parts[3], 10);
      kStr = parts[4];
    }

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
        p = p.replace(new RegExp("\\b" + token + "\\b", "g"), () => dict[c]);
      }
    }

    return p;
  } catch {
    return null;
  }
}

/**
 * Extracts a playable HLS (.m3u8) master stream from a Fastream embed URL.
 */
export async function extractFastreamM3u8(
  embedUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchFn(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www3.seriesmetro.net/",
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    // 1. Check for direct .m3u8 link in HTML
    const directMatch = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (directMatch) return directMatch[1];

    // 2. Check for packed Dean Edwards script
    const packedMatch = html.match(
      /eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/
    );
    if (packedMatch) {
      const unpacked = unpackDeanEdwards(packedMatch[0]);
      if (unpacked) {
        const m3u8Match = unpacked.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/);
        if (m3u8Match) return m3u8Match[0];
      }
    }

    return null;
  } catch {
    return null;
  }
}

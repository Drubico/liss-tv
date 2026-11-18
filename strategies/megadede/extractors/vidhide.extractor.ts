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

    // Check direct m3u8 in html
    const directMatch = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (directMatch) return directMatch[1];

    // Check packed script
    const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
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

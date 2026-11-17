import { unpackDeanEdwards } from "./vidhide.extractor";

export async function extractStreamwishM3u8(embedUrl: string): Promise<string | null> {
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

    const directMatch = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (directMatch) return directMatch[1];

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

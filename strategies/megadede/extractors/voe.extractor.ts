export async function extractVoeM3u8(embedUrl: string): Promise<string | null> {
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

    const redirectMatch = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (redirectMatch) {
      return extractVoeM3u8(redirectMatch[1]);
    }

    const hlsMatch = html.match(/'hls':\s*'([^']+)'/) || html.match(/"hls":\s*"([^"]+)"/);
    if (hlsMatch) return hlsMatch[1];

    const mp4Match = html.match(/'mp4':\s*'([^']+)'/) || html.match(/"mp4":\s*"([^"]+)"/);
    if (mp4Match) return mp4Match[1];

    return null;
  } catch {
    return null;
  }
}

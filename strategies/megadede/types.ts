export interface MegadedeEmbedEntry {
  servername: string;
  link: string;
  type: string;
}

export interface MegadedeLanguageGroup {
  file_id?: number | string;
  video_language: string;
  sortedEmbeds: MegadedeEmbedEntry[];
  downloadEmbeds?: MegadedeEmbedEntry[];
}

export interface MegadedeEpisodeApiResponse {
  success?: boolean;
  html?: string;
  title?: string;
  episodeTitle?: string;
  serieTitle?: string;
  type?: string;
  slug?: string;
  temporada?: number | string;
  episodio?: number | string;
  previous?: string | null;
  next?: string | null;
  totalEpisodes?: number;
}

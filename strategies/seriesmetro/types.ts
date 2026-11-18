export interface SeriesmetroServerOption {
  index: number;
  name: string;
  language: string;
  url: string;
}

export interface SeriesmetroEpisodeItem {
  slug: string;
  title: string;
  season: number;
  episode: number;
}

export interface SeriesmetroSeasonGroup {
  season: number;
  episodes: SeriesmetroEpisodeItem[];
}

export interface SeriesmetroParsedMedia {
  id: string;
  title: string;
  url: string;
  poster: string;
  backdrop?: string;
  year?: string;
  rating?: string;
  type: "movie" | "serie";
}

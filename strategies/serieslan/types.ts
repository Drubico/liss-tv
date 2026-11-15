export interface SeriesLanGenre {
  slug?: string;
  title?: string;
  type?: string;
  url?: string;
}

export interface SeriesLanItem {
  backdrop_path: string | null;
  cast_included?: boolean;
  cast_url?: string;
  catalog_item_id: number;
  certification?: string | null;
  countries?: string[];
  featured?: boolean;
  first_air_date?: string | null;
  genres?: Array<SeriesLanGenre | string>;
  imdb_id?: string | null;
  kind: "serie" | "movie" | string;
  last_air_date?: string | null;
  likes_count?: number;
  logo_path?: string | null;
  number_of_episodes?: number | null;
  number_of_seasons?: number | null;
  original_language?: string | null;
  original_title?: string | null;
  overview?: string | null;
  poster_path: string | null;
  quality?: string | null;
  rating_avg?: number;
  ratings_count?: number;
  release_date?: string | null;
  runtime?: number | null;
  slug: string;
  status?: string | null;
  studios?: string[];
  tagline?: string | null;
  title: string;
  tmdb_id?: number | null;
  trailer_youtube_key?: string | null;
  url: string;
  views_7d?: number;
  views_total?: number;
  vote_average?: number;
  year?: number | null;
}

export interface SeriesLanPagination {
  has_next: boolean;
  has_prev: boolean;
  limit: number;
  page: number;
  total: number;
  total_pages: number;
}

export interface SeriesLanListingResponse {
  items: SeriesLanItem[];
  pagination: SeriesLanPagination;
  kind?: string;
  order?: string;
}

export interface SeriesLanSearchResponse {
  items: SeriesLanItem[];
  pagination?: SeriesLanPagination;
  q?: string;
}

export interface SeriesLanEpisodeSeason {
  air_date: string | null;
  count: number;
  first_episode: number;
  last_episode: number;
  name: string | null;
  overview: string | null;
  playable_count: number;
  poster_path: string | null;
  season: number;
}

export interface SeriesLanContentDetail {
  item: SeriesLanItem;
  episode_seasons?: SeriesLanEpisodeSeason[];
  overview?: string | null;
  cast?: Array<{
    name: string;
    role: string;
    profile_url?: string;
  }>;
}

export interface SeriesLanEpisode {
  air_date: string | null;
  episode: number;
  episode_type?: string | null;
  overview?: string | null;
  playable: boolean;
  player_url: string;
  runtime?: number | null;
  season: number;
  still_path?: string | null;
  title?: string | null;
  url: string;
  vote_average?: number | null;
  vote_count?: number | null;
}

export interface SeriesLanEpisodesResponse {
  episodes: SeriesLanEpisode[];
  item_id: number;
  season: number;
  total: number;
  total_pages?: number;
  pagination?: SeriesLanPagination;
}

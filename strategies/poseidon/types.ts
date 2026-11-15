export interface PoseidonTitle {
  name: string;
  original?: {
    name?: string;
  };
}

export interface PoseidonImages {
  poster?: string;
  backdrop?: string;
}

export interface PoseidonGenre {
  id?: string | number;
  name: string;
}

export interface PoseidonUrl {
  slug: string;
}

export interface PoseidonMovieItem {
  TMDbId: string;
  titles: PoseidonTitle;
  images: PoseidonImages;
  overview?: string;
  runtime?: number;
  releaseDate?: string;
  url: PoseidonUrl;
  rate?: {
    average?: number;
  };
  genres?: PoseidonGenre[];
}

export interface PoseidonVideoSource {
  cyberlocker: string;
  result: string;
  quality?: string;
}

export interface PoseidonVideosMap {
  latino?: PoseidonVideoSource[];
  spanish?: PoseidonVideoSource[];
  english?: PoseidonVideoSource[];
}

export interface PoseidonThisMovie extends PoseidonMovieItem {
  videos?: PoseidonVideosMap;
  downloads?: unknown[];
}

export interface PoseidonEpisode {
  number: number | string;
  title?: string;
  TMDbId?: string;
  releaseDate?: string;
  image?: string;
  url?: PoseidonUrl;
  videos?: PoseidonVideosMap;
}

export interface PoseidonSeason {
  number: number;
  episodes: PoseidonEpisode[];
}

export interface PoseidonThisSerie {
  TMDbId: string;
  titles: PoseidonTitle;
  images: PoseidonImages;
  overview?: string;
  releaseDate?: string;
  url?: PoseidonUrl;
  rate?: {
    average?: number;
  };
  genres?: PoseidonGenre[];
  seasons: PoseidonSeason[];
}

export interface PoseidonPageProps {
  movies?: PoseidonMovieItem[];
  series?: PoseidonMovieItem[];
  pages?: number;
  thisMovie?: PoseidonThisMovie;
  thisSerie?: PoseidonThisSerie;
  episode?: PoseidonEpisode;
  season?: { number: number };
}

export interface PoseidonNextData<P = PoseidonPageProps> {
  props: {
    pageProps: P;
    __N_SSG?: boolean;
    __N_SSP?: boolean;
  };
  page: string;
  query?: Record<string, string>;
  buildId?: string;
}

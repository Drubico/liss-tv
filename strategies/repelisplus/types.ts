export class RepelisPlusError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "RepelisPlusError";
    this.statusCode = statusCode;
  }
}

export interface RepelisRawCard {
  link: string;
  title: string;
  image: string;
  backgroundImage?: string;
  year?: string;
  rating?: string;
  duration?: string;
  quality?: string;
  tags?: string[];
  caption?: string;
}

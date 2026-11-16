import { MovieContext } from "@/strategies/context";
import { SoloLatinoMovieBuilder } from "./solo-latino.build";
import { GnulaMovieBuilder } from "./gnula.build";
import { SerieslanMovieBuilder } from "./serieslan.build";
import { RepelisPlusMovieBuilder } from "./repelisplus.build";
import type { MovieBuilder } from "@/types/movie";

export class MovieContextFactory {
  private static providers: { [key: string]: MovieBuilder<MovieContext> } = {
    "solo-latino": new SoloLatinoMovieBuilder(),
    gnula: new GnulaMovieBuilder(),
    serieslan: new SerieslanMovieBuilder(),
    repelisplus: new RepelisPlusMovieBuilder(),
  };

  private constructor() {}

  static createSoloLatinoContext(): MovieContext {
    return new SoloLatinoMovieBuilder().build();
  }

  static createGnulaContext(): MovieContext {
    return new GnulaMovieBuilder().build();
  }

  static createSerieslanContext(): MovieContext {
    return new SerieslanMovieBuilder().build();
  }

  static createRepelisPlusContext(): MovieContext {
    return new RepelisPlusMovieBuilder().build();
  }

  static driver(
    name: "solo-latino" | "gnula" | "serieslan" | "repelisplus",
  ): MovieContext {
    const builder = MovieContextFactory.providers[name];

    if (!builder) {
      throw new Error(`No builder found for provider: ${name}`);
    }

    return builder.build();
  }
}

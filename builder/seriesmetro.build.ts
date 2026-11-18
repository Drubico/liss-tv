import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/seriesmetro/get-all.operation";
import { GetDetail } from "@/strategies/seriesmetro/get-detail.operation";
import { GetUrl } from "@/strategies/seriesmetro/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class SeriesmetroMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "SeriesMetro";
  id: string = "seriesmetro";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "seriesmetro",
      "SeriesMetro"
    );
  }
}

import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/serieslan/get-all.operation";
import { GetDetail } from "@/strategies/serieslan/get-detail.operation";
import { GetUrl } from "@/strategies/serieslan/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class SerieslanMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "SeriesLan";
  id: string = "serieslan";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "serieslan",
      "SeriesLan"
    );
  }
}

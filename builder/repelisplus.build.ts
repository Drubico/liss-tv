import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/repelisplus/get-all.operation";
import { GetDetail } from "@/strategies/repelisplus/get-detail.operation";
import { GetUrl } from "@/strategies/repelisplus/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class RepelisPlusMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "RepelisPlus";
  id: string = "repelisplus";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "repelisplus",
      "RepelisPlus",
    );
  }
}

import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/gnula/get-all.operation";
import { GetDetail } from "@/strategies/gnula/get-detail.operation";
import { GetUrl } from "@/strategies/gnula/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class GnulaMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Gnula HD";
  id: string = "gnula";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "gnula",
      "Gnula HD",
    );
  }
}


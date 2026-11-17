import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/megadede/get-all.operation";
import { GetDetail } from "@/strategies/megadede/get-detail.operation";
import { GetUrl } from "@/strategies/megadede/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class MegadedeMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Megadede";
  id: string = "megadede";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "megadede",
      "Megadede"
    );
  }
}

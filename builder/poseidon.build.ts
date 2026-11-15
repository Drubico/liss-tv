import { MovieContext } from "@/strategies/context";
import { GetAll } from "@/strategies/poseidon/get-all.operation";
import { GetDetail } from "@/strategies/poseidon/get-detail.operation";
import { GetUrl } from "@/strategies/poseidon/get-url.operation";
import type { MovieBuilder } from "@/types/movie";

export class PoseidonMovieBuilder implements MovieBuilder<MovieContext> {
  name: string = "Poseidon HD";
  id: string = "poseidon";

  build(): MovieContext {
    return new MovieContext(
      new GetAll(),
      new GetDetail(),
      new GetUrl(),
      "poseidon",
      "Poseidon HD",
    );
  }
}

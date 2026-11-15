import test from "node:test";
import assert from "node:assert";
import {
  extractVidaraFilecode,
  selectLatinoVideoSource,
} from "../../../strategies/poseidon/get-url.operation.ts";
import type { PoseidonVideosMap } from "../../../strategies/poseidon/types.ts";

test("selectLatinoVideoSource picks vidara first in latino audio", () => {
  const videos: PoseidonVideosMap = {
    latino: [
      {
        cyberlocker: "doodstream",
        result: "https://player.poseidonhd2.co/player.php?h=dood",
      },
      {
        cyberlocker: "vidara",
        result: "https://player.poseidonhd2.co/player.php?h=vidara123",
      },
    ],
    spanish: [
      {
        cyberlocker: "vidara",
        result: "https://player.poseidonhd2.co/player.php?h=castellano",
      },
    ],
  };

  const selected = selectLatinoVideoSource(videos);
  assert.strictEqual(selected?.cyberlocker, "vidara");
  assert.strictEqual(
    selected?.result,
    "https://player.poseidonhd2.co/player.php?h=vidara123",
  );
});

test("selectLatinoVideoSource returns null if no latino audio available", () => {
  const videos: PoseidonVideosMap = {
    latino: [],
    spanish: [
      {
        cyberlocker: "vidara",
        result: "https://player.poseidonhd2.co/player.php?h=castellano",
      },
    ],
  };
  const selected = selectLatinoVideoSource(videos);
  assert.strictEqual(selected, null);
});

test("extractVidaraFilecode extracts filecode from player html", () => {
  const html = `<script>var url = 'https://vidara.to/e/AjM6l3aLFAamo';</script>`;
  const filecode = extractVidaraFilecode(html);
  assert.strictEqual(filecode, "AjM6l3aLFAamo");
});

test("extractVidaraFilecode handles alternate quotes and formats", () => {
  const html = `var url = "https://vidara.so/e/X987abc";`;
  const filecode = extractVidaraFilecode(html);
  assert.strictEqual(filecode, "X987abc");
});

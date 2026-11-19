import test from "node:test";
import assert from "node:assert";

export function formatMovieCardHref(link: string, provider?: string): string {
  if (provider && !link.includes("provider=")) {
    return `${link}${link.includes("?") ? "&" : "?"}provider=${encodeURIComponent(provider)}`;
  }
  return link;
}

test("formatMovieCardHref appends provider query parameter when present", () => {
  const result = formatMovieCardHref("/serie/dexter", "megadede");
  assert.strictEqual(result, "/serie/dexter?provider=megadede");
});

test("formatMovieCardHref preserves existing query params when appending provider", () => {
  const result = formatMovieCardHref("/serie/dexter?season=1", "megadede");
  assert.strictEqual(result, "/serie/dexter?season=1&provider=megadede");
});

test("formatMovieCardHref does not duplicate provider if already in URL", () => {
  const result = formatMovieCardHref("/serie/dexter?provider=megadede", "megadede");
  assert.strictEqual(result, "/serie/dexter?provider=megadede");
});

test("formatMovieCardHref returns original link if provider is absent", () => {
  const result = formatMovieCardHref("/serie/dexter");
  assert.strictEqual(result, "/serie/dexter");
});

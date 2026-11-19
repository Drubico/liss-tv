import test from "node:test";
import assert from "node:assert";

export function shouldPersistWatchProgress(params: {
  startTime: number;
  currentTime: number;
  initialSeekDone: boolean;
  lastSavedTime?: number;
}): { shouldSave: boolean; markSeekDone: boolean } {
  const { startTime, currentTime, initialSeekDone, lastSavedTime = 0 } = params;

  // Never overwrite existing progress (> 20s) with 0:00 tick
  if (currentTime < 5 && (startTime > 20 || lastSavedTime > 20) && !initialSeekDone) {
    return { shouldSave: false, markSeekDone: false };
  }

  if (startTime <= 0 || initialSeekDone) {
    return { shouldSave: true, markSeekDone: true };
  }

  // If media currentTime reached near the target startTime, consider seek complete
  if (currentTime >= Math.max(0, startTime - 3)) {
    return { shouldSave: true, markSeekDone: true };
  }

  // Discard early 0:00 ticks before seek takes effect
  return { shouldSave: false, markSeekDone: false };
}

test("shouldPersistWatchProgress allows updates when startTime is 0", () => {
  const result = shouldPersistWatchProgress({
    startTime: 0,
    currentTime: 5,
    initialSeekDone: false,
  });
  assert.strictEqual(result.shouldSave, true);
});

test("shouldPersistWatchProgress discards early 0:00 ticks when startTime is 600 and seek not done", () => {
  const result = shouldPersistWatchProgress({
    startTime: 600,
    currentTime: 0.2,
    initialSeekDone: false,
    lastSavedTime: 600,
  });
  assert.strictEqual(result.shouldSave, false);
  assert.strictEqual(result.markSeekDone, false);
});

test("shouldPersistWatchProgress prevents overwriting saved progress with 0:00 tick", () => {
  const result = shouldPersistWatchProgress({
    startTime: 450,
    currentTime: 0,
    initialSeekDone: false,
    lastSavedTime: 450,
  });
  assert.strictEqual(result.shouldSave, false);
});

test("shouldPersistWatchProgress allows updates once currentTime reaches within threshold of startTime", () => {
  const result = shouldPersistWatchProgress({
    startTime: 600,
    currentTime: 598.5,
    initialSeekDone: false,
  });
  assert.strictEqual(result.shouldSave, true);
  assert.strictEqual(result.markSeekDone, true);
});

test("shouldPersistWatchProgress always allows updates once initialSeekDone is true", () => {
  const result = shouldPersistWatchProgress({
    startTime: 600,
    currentTime: 10,
    initialSeekDone: true,
  });
  assert.strictEqual(result.shouldSave, true);
  assert.strictEqual(result.markSeekDone, true);
});

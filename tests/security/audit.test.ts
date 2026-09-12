import assert from "node:assert/strict";
import test from "node:test";
import { uuidV7 } from "../../packages/platform/audit/src/security-audit.ts";

test("security audit identifiers are RFC UUIDv7-shaped and timestamp ordered", () => {
  const earlier = uuidV7(1_700_000_000_000);
  const later = uuidV7(1_700_000_000_001);
  assert.match(earlier, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(later, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(earlier < later, true);
});

test("security audit UUIDv7 rejects invalid timestamp input", () => {
  assert.throws(() => uuidV7(-1), RangeError);
  assert.throws(() => uuidV7(Number.MAX_SAFE_INTEGER), RangeError);
});

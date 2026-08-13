import test from "node:test";
import assert from "node:assert/strict";
import { parseUnits, unitsToNumber, pct, csvEscape } from "../src/helpers.mjs";

test("parseUnits handles USDT decimals", () => {
  assert.equal(parseUnits("25", 6), 25_000_000n);
  assert.equal(parseUnits("1.234567", 6), 1_234_567n);
});

test("unitsToNumber handles GRAM decimals", () => {
  assert.equal(unitsToNumber(1_500_000_000n, 9), 1.5);
});

test("pct computes percentage", () => {
  assert.equal(pct(0.5, 100), 0.5);
});

test("csvEscape quotes commas and quotes", () => {
  assert.equal(csvEscape('a,b"c'), '"a,b""c"');
});

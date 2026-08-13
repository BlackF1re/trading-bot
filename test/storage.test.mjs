import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.mjs";

test("Storage creates expected output files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trading-bot-"));
  try {
    const storage = new Storage(dir);
    storage.writeSummary({ ok: true });

    assert.ok(fs.existsSync(path.join(dir, "snapshots.csv")));
    assert.ok(fs.existsSync(path.join(dir, "opportunities.csv")));
    assert.ok(fs.existsSync(path.join(dir, "paper_trades.csv")));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), { ok: true });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

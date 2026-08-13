import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Storage } from "../src/storage.mjs";

test("Storage creates output files and exposes dashboard data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trading-bot-"));
  try {
    const storage = new Storage(dir);
    storage.writeSummary({ paperTrades: 1, cumulativePaperPnlUsdt: 0.25 });
    storage.appendPaperTrade({
      signal_timestamp: "2026-08-14T00:00:00.000Z",
      execution_timestamp: "2026-08-14T00:00:03.000Z",
      route: "STON -> DEDUST",
      size_usdt: 25,
      detected_net_pct: 0.2,
      detected_net_pnl_usdt: 0.05,
      execution_leg1_out_gram: 10,
      execution_leg2_out_usdt: 25.25,
      execution_gross_pnl_usdt: 0.25,
      execution_network_cost_usdt: 0,
      execution_safety_buffer_usdt: 0,
      execution_net_pnl_usdt: 0.25,
      execution_net_pct: 1,
      signal_survived: true,
      detection_to_execution_ms: 1200,
      between_legs_ms: 2500,
      leg1_latency_ms: 100,
      leg2_latency_ms: 100,
    });

    assert.ok(fs.existsSync(path.join(dir, "snapshots.csv")));
    assert.ok(fs.existsSync(path.join(dir, "opportunities.csv")));
    assert.ok(fs.existsSync(path.join(dir, "paper_trades.csv")));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "summary.json"), "utf8")), {
      paperTrades: 1,
      cumulativePaperPnlUsdt: 0.25,
    });

    const dashboard = storage.getDashboardData();
    assert.equal(dashboard.summary.paperTrades, 1);
    assert.equal(dashboard.paperTrades.length, 1);
    assert.equal(dashboard.paperTrades[0].route, "STON -> DEDUST");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

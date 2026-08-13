import test from "node:test";
import assert from "node:assert/strict";
import { DashboardServer } from "../src/dashboard.mjs";

test("Dashboard serves health, state and static UI", async () => {
  const storage = {
    getDashboardData: () => ({ summary: { paperTrades: 0 }, snapshots: [], opportunities: [], paperTrades: [] }),
    getDownloadPath: () => null,
  };
  const runtime = {
    status: "running",
    lastScanAt: "2026-08-14T00:00:00.000Z",
    lastSuccessfulScanAt: "2026-08-14T00:00:00.000Z",
  };
  const server = new DashboardServer({
    host: "127.0.0.1",
    port: 0,
    storage,
    getRuntimeState: () => runtime,
    publicConfig: { pair: "GRAM / USDT" },
  });

  const { url } = await server.start();
  try {
    const health = await fetch(`${url}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, "running");

    const state = await fetch(`${url}/api/state`);
    assert.equal(state.status, 200);
    const payload = await state.json();
    assert.equal(payload.mode, "paper");
    assert.equal(payload.config.pair, "GRAM / USDT");

    const page = await fetch(`${url}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /DEX Arbitrage/);
  } finally {
    await server.stop();
  }
});

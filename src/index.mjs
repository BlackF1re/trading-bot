import { config } from "./config.mjs";
import { StonDex } from "./dex/ston.mjs";
import { DeDustDex } from "./dex/dedust.mjs";
import { Storage } from "./storage.mjs";
import { ArbitrageEngine, ROUTES } from "./engine.mjs";
import { sleep } from "./helpers.mjs";

const storage = new Storage(config.dataDir);
const dexes = {
  STON: new StonDex({
    usdtMaster: config.usdtMaster,
    slippageTolerance: config.stonSlippageTolerance,
  }),
  DEDUST: new DeDustDex({
    usdtMaster: config.usdtMaster,
    endpoint: config.tonV4Endpoint,
  }),
};

console.log("TON / GRAM paper arbitrage scanner");
console.log("==================================");
console.log("MODE: PAPER ONLY — no wallet, no signing, no transactions");
console.log(`Pair: GRAM / USDT`);
console.log(`Trade sizes: ${config.tradeSizesUsdt.join(", ")} USDT`);
console.log(`Poll: ${config.pollIntervalMs} ms`);
console.log(`Signal threshold: ${config.minSignalPct}% estimated net`);
console.log(`Estimated gas reserve: ${config.estimatedGasPerLegGram} GRAM per leg`);
console.log(`Safety buffer: ${config.safetyBufferBps} bps`);
console.log("Initializing DeDust read-only pool...");

await dexes.DEDUST.init();
console.log("DeDust pool READY. Starting live-mainnet quotes.\n");

const engine = new ArbitrageEngine({ config, dexes, storage });
let stopRequested = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopRequested) return;
    stopRequested = true;
    console.log(`\n${signal} received. Finishing current scan...`);
  });
}

while (!stopRequested) {
  const cycleStarted = Date.now();

  for (const sizeUsdt of config.tradeSizesUsdt) {
    for (const route of ROUTES) {
      if (stopRequested) break;
      try {
        const { result, isOpportunity } = await engine.scanOne(route, sizeUsdt);
        const marker = isOpportunity ? " >>> SIGNAL" : "";
        console.log(
          `[${new Date().toLocaleTimeString()}] ${result.route.padEnd(22)} | ${String(sizeUsdt).padStart(7)} USDT | ` +
          `gross ${signed(result.grossPct)}% | net ${signed(result.netPct)}% | ` +
          `${result.quoteLatencyMs} ms${marker}`
        );

        if (isOpportunity) engine.maybeStartPaperExecution(result);
      } catch (err) {
        const message = err?.message ?? String(err);
        console.error(`[scan] ${route.leg1}->${route.leg2} ${sizeUsdt} USDT: ${message}`);
        if (config.verboseErrors && err?.stack) console.error(err.stack);
      }
    }
  }

  const elapsed = Date.now() - cycleStarted;
  const waitMs = Math.max(0, config.pollIntervalMs - elapsed);
  if (!stopRequested && waitMs > 0) await sleep(waitMs);
}

console.log("Scanner stopped. Results are in the data directory.");

function signed(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(4)}`;
}

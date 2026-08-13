import { config } from "./config.mjs";
import { StonDex } from "./dex/ston.mjs";
import { DeDustDex } from "./dex/dedust.mjs";
import { Storage } from "./storage.mjs";
import { ArbitrageEngine, ROUTES } from "./engine.mjs";
import { DashboardServer } from "./dashboard.mjs";
import { openBrowser } from "./open-browser.mjs";
import { sleep } from "./helpers.mjs";

const runtime = {
  status: "starting",
  message: "Starting paper-arbitrage scanner",
  startedAt: new Date().toISOString(),
  lastScanAt: null,
  lastSuccessfulScanAt: null,
  lastError: null,
  scansCompleted: 0,
  lastQuoteLatencyMs: null,
  lastResult: null,
};

let stopRequested = false;
let dashboard = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopRequested) return;
    stopRequested = true;
    runtime.status = "stopping";
    runtime.message = "Finishing the current scan";
    console.log(`\n${signal} received. Finishing current scan...`);
  });
}

try {
  await main();
} catch (error) {
  runtime.status = "fatal";
  runtime.message = "Scanner stopped because of an unrecoverable error";
  runtime.lastError = error?.message ?? String(error);
  console.error(`[fatal] ${runtime.lastError}`);
  if (config.verboseErrors && error?.stack) console.error(error.stack);
  process.exitCode = 1;
} finally {
  runtime.status = runtime.status === "fatal" ? "fatal" : "stopped";
  runtime.message = runtime.status === "fatal" ? runtime.message : "Scanner stopped";
  await dashboard?.stop().catch(() => {});
}

async function main() {
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

  if (config.uiEnabled) {
    dashboard = new DashboardServer({
      host: config.uiHost,
      port: config.uiPort,
      storage,
      getRuntimeState: () => ({ ...runtime }),
      publicConfig: getPublicConfig(),
    });
    const address = await dashboard.start();
    console.log(`Dashboard: ${address.url}`);
    if (config.autoOpenBrowser) setTimeout(() => openBrowser(address.url), 500);
  }

  printBanner();
  await initializeDeDust(dexes.DEDUST);
  if (stopRequested) return;

  const engine = new ArbitrageEngine({ config, dexes, storage });
  runtime.status = "running";
  runtime.message = "Live mainnet quotes are being scanned";
  runtime.lastError = null;
  console.log("DeDust pool READY. Starting live-mainnet quotes.\n");

  while (!stopRequested) {
    const cycleStarted = Date.now();

    for (const sizeUsdt of config.tradeSizesUsdt) {
      for (const route of ROUTES) {
        if (stopRequested) break;
        runtime.lastScanAt = new Date().toISOString();

        try {
          const { result, isOpportunity } = await engine.scanOne(route, sizeUsdt);
          runtime.lastSuccessfulScanAt = result.timestamp;
          runtime.lastQuoteLatencyMs = result.quoteLatencyMs;
          runtime.scansCompleted += 1;
          runtime.lastError = null;
          runtime.lastResult = {
            route: result.route,
            sizeUsdt: result.sizeUsdt,
            grossPct: result.grossPct,
            netPct: result.netPct,
            netPnlUsdt: result.netPnlUsdt,
          };

          const marker = isOpportunity ? " >>> SIGNAL" : "";
          console.log(
            `[${new Date().toLocaleTimeString()}] ${result.route.padEnd(22)} | ${String(sizeUsdt).padStart(7)} USDT | ` +
            `gross ${signed(result.grossPct)}% | net ${signed(result.netPct)}% | ` +
            `${result.quoteLatencyMs} ms${marker}`,
          );

          if (isOpportunity) engine.maybeStartPaperExecution(result);
        } catch (error) {
          const message = error?.message ?? String(error);
          runtime.lastError = message;
          runtime.message = "Scanner is running, but the latest quote failed";
          console.error(`[scan] ${route.leg1}->${route.leg2} ${sizeUsdt} USDT: ${message}`);
          if (config.verboseErrors && error?.stack) console.error(error.stack);
        }
      }
    }

    if (runtime.status === "running" && !runtime.lastError) {
      runtime.message = "Live mainnet quotes are being scanned";
    }

    const elapsed = Date.now() - cycleStarted;
    const waitMs = Math.max(0, config.pollIntervalMs - elapsed);
    if (!stopRequested && waitMs > 0) await sleep(waitMs);
  }

  console.log("Scanner stopped. Results are in the data directory.");
}

async function initializeDeDust(dedust) {
  runtime.status = "initializing";
  runtime.message = "Connecting to DeDust and TON mainnet";
  console.log("Initializing DeDust read-only pool...");

  while (!stopRequested) {
    try {
      await dedust.init();
      runtime.lastError = null;
      return;
    } catch (error) {
      const message = error?.message ?? String(error);
      runtime.status = "degraded";
      runtime.message = "Cannot reach DeDust/TON. Retrying automatically in 10 seconds";
      runtime.lastError = message;
      console.error(`[init] ${message}. Retrying in 10 seconds...`);
      await sleep(10_000);
      runtime.status = "initializing";
    }
  }
}

function printBanner() {
  console.log("TON / GRAM paper arbitrage scanner");
  console.log("==================================");
  console.log("MODE: PAPER ONLY — no wallet, no signing, no transactions");
  console.log("Pair: GRAM / USDT");
  console.log(`Trade sizes: ${config.tradeSizesUsdt.join(", ")} USDT`);
  console.log(`Poll: ${config.pollIntervalMs} ms`);
  console.log(`Signal threshold: ${config.minSignalPct}% estimated net`);
  console.log(`Estimated gas reserve: ${config.estimatedGasPerLegGram} GRAM per leg`);
  console.log(`Safety buffer: ${config.safetyBufferBps} bps`);
}

function getPublicConfig() {
  return {
    pair: "GRAM / USDT",
    dexes: ["STON.fi", "DeDust"],
    tradeSizesUsdt: config.tradeSizesUsdt,
    pollIntervalMs: config.pollIntervalMs,
    minSignalPct: config.minSignalPct,
    stonSlippageTolerance: Number(config.stonSlippageTolerance),
    detectionToExecutionMs: config.detectionToExecutionMs,
    betweenLegsMs: config.betweenLegsMs,
    eventCooldownMs: config.eventCooldownMs,
    estimatedGasPerLegGram: config.estimatedGasPerLegGram,
    safetyBufferBps: config.safetyBufferBps,
  };
}

function signed(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(4)}`;
}

import { ASSETS } from "./config.mjs";
import { nowIso, parseUnits, pct, sleep, unitsToNumber, routeLabel } from "./helpers.mjs";

export const ROUTES = Object.freeze([
  { id: "STON_BUY_DEDUST_SELL", leg1: "STON", leg2: "DEDUST" },
  { id: "DEDUST_BUY_STON_SELL", leg1: "DEDUST", leg2: "STON" },
]);

export class ArbitrageEngine {
  constructor({ config, dexes, storage }) {
    this.config = config;
    this.dexes = dexes;
    this.storage = storage;
    this.activeExecutions = new Set();
    this.lastTriggeredAt = new Map();
    this.stats = {
      startedAt: nowIso(),
      snapshots: 0,
      detectedOpportunities: 0,
      paperTrades: 0,
      survivedTrades: 0,
      profitablePaperTrades: 0,
      cumulativePaperPnlUsdt: 0,
      bestPaperPnlUsdt: null,
      worstPaperPnlUsdt: null,
      lastUpdatedAt: null,
    };
  }

  async evaluateRoute(route, sizeUsdt) {
    const amountStartUnits = parseUnits(String(sizeUsdt), ASSETS.USDT.decimals);
    const started = Date.now();
    const leg1 = await this.dexes[route.leg1].quote({
      from: "USDT",
      to: "GRAM",
      amountUnits: amountStartUnits,
    });
    const leg2 = await this.dexes[route.leg2].quote({
      from: "GRAM",
      to: "USDT",
      amountUnits: leg1.amountOutUnits,
    });

    return this.calculateResult({
      timestamp: nowIso(),
      route,
      sizeUsdt,
      leg1,
      leg2,
      quoteLatencyMs: Date.now() - started,
    });
  }

  calculateResult({ timestamp, route, sizeUsdt, leg1, leg2, quoteLatencyMs }) {
    const leg1OutGram = unitsToNumber(leg1.amountOutUnits, ASSETS.GRAM.decimals);
    const leg2OutUsdt = unitsToNumber(leg2.amountOutUnits, ASSETS.USDT.decimals);
    const grossPnlUsdt = leg2OutUsdt - sizeUsdt;
    const impliedUsdtPerGram = leg1OutGram > 0 ? sizeUsdt / leg1OutGram : NaN;
    const networkCostUsdt = Number.isFinite(impliedUsdtPerGram)
      ? this.config.estimatedGasPerLegGram * 2 * impliedUsdtPerGram
      : NaN;
    const safetyBufferUsdt = sizeUsdt * (this.config.safetyBufferBps / 10000);
    const netPnlUsdt = grossPnlUsdt - networkCostUsdt - safetyBufferUsdt;

    return {
      timestamp,
      route: routeLabel(route),
      routeId: route.id,
      routeDef: route,
      sizeUsdt,
      leg1,
      leg2,
      leg1OutGram,
      leg2OutUsdt,
      grossPnlUsdt,
      grossPct: pct(grossPnlUsdt, sizeUsdt),
      networkCostUsdt,
      safetyBufferUsdt,
      netPnlUsdt,
      netPct: pct(netPnlUsdt, sizeUsdt),
      quoteLatencyMs,
    };
  }

  async scanOne(route, sizeUsdt) {
    const result = await this.evaluateRoute(route, sizeUsdt);
    const isOpportunity = result.netPct >= this.config.minSignalPct;
    this.storage.appendSnapshot(result, isOpportunity);
    this.stats.snapshots += 1;
    if (isOpportunity) this.stats.detectedOpportunities += 1;
    this.touchSummary();
    return { result, isOpportunity };
  }

  maybeStartPaperExecution(detected) {
    const key = `${detected.routeId}:${detected.sizeUsdt}`;
    const now = Date.now();
    const last = this.lastTriggeredAt.get(key) ?? 0;
    if (this.activeExecutions.has(key)) return false;
    if (now - last < this.config.eventCooldownMs) return false;

    this.lastTriggeredAt.set(key, now);
    this.activeExecutions.add(key);
    void this.runPaperExecution(detected)
      .catch((err) => {
        console.error(`[paper] ${key} failed: ${err?.message ?? err}`);
      })
      .finally(() => this.activeExecutions.delete(key));
    return true;
  }

  async runPaperExecution(detected) {
    await sleep(this.config.detectionToExecutionMs);

    const route = detected.routeDef;
    const sizeUsdt = detected.sizeUsdt;
    const amountStartUnits = parseUnits(String(sizeUsdt), ASSETS.USDT.decimals);

    const leg1 = await this.dexes[route.leg1].quote({
      from: "USDT",
      to: "GRAM",
      amountUnits: amountStartUnits,
    });

    await sleep(this.config.betweenLegsMs);

    const leg2 = await this.dexes[route.leg2].quote({
      from: "GRAM",
      to: "USDT",
      amountUnits: leg1.amountOutUnits,
    });

    const executed = this.calculateResult({
      timestamp: nowIso(),
      route,
      sizeUsdt,
      leg1,
      leg2,
      quoteLatencyMs: leg1.latencyMs + leg2.latencyMs,
    });

    const survived = executed.netPct >= this.config.minSignalPct;
    const profitable = executed.netPnlUsdt > 0;

    this.storage.appendPaperTrade({
      signal_timestamp: detected.timestamp,
      execution_timestamp: executed.timestamp,
      route: executed.route,
      size_usdt: sizeUsdt,
      detected_net_pct: detected.netPct,
      detected_net_pnl_usdt: detected.netPnlUsdt,
      execution_leg1_out_gram: executed.leg1OutGram,
      execution_leg2_out_usdt: executed.leg2OutUsdt,
      execution_gross_pnl_usdt: executed.grossPnlUsdt,
      execution_network_cost_usdt: executed.networkCostUsdt,
      execution_safety_buffer_usdt: executed.safetyBufferUsdt,
      execution_net_pnl_usdt: executed.netPnlUsdt,
      execution_net_pct: executed.netPct,
      signal_survived: survived,
      detection_to_execution_ms: this.config.detectionToExecutionMs,
      between_legs_ms: this.config.betweenLegsMs,
      leg1_latency_ms: leg1.latencyMs,
      leg2_latency_ms: leg2.latencyMs,
    });

    this.stats.paperTrades += 1;
    if (survived) this.stats.survivedTrades += 1;
    if (profitable) this.stats.profitablePaperTrades += 1;
    this.stats.cumulativePaperPnlUsdt += executed.netPnlUsdt;
    this.stats.bestPaperPnlUsdt = this.stats.bestPaperPnlUsdt === null
      ? executed.netPnlUsdt
      : Math.max(this.stats.bestPaperPnlUsdt, executed.netPnlUsdt);
    this.stats.worstPaperPnlUsdt = this.stats.worstPaperPnlUsdt === null
      ? executed.netPnlUsdt
      : Math.min(this.stats.worstPaperPnlUsdt, executed.netPnlUsdt);
    this.touchSummary();

    const mark = profitable ? "PROFIT" : "LOSS";
    console.log(
      `\n[PAPER ${mark}] ${executed.route} | ${sizeUsdt} USDT | detected ${detected.netPct.toFixed(4)}% -> delayed ${executed.netPct.toFixed(4)}% | PnL ${executed.netPnlUsdt.toFixed(6)} USDT\n`
    );
  }

  touchSummary() {
    this.stats.lastUpdatedAt = nowIso();
    const trades = this.stats.paperTrades;
    this.storage.writeSummary({
      ...this.stats,
      survivalRatePct: trades ? (this.stats.survivedTrades / trades) * 100 : null,
      profitableRatePct: trades ? (this.stats.profitablePaperTrades / trades) * 100 : null,
      averagePaperPnlUsdt: trades ? this.stats.cumulativePaperPnlUsdt / trades : null,
      note: "Paper results use live quotes/get-method estimates but do not represent executed blockchain transactions. Network cost is an estimate from .env.",
    });
  }
}

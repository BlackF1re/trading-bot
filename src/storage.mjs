import fs from "node:fs";
import path from "node:path";
import { csvEscape } from "./helpers.mjs";

const SNAPSHOT_HEADERS = [
  "timestamp",
  "route",
  "size_usdt",
  "leg1_out_gram",
  "leg2_out_usdt",
  "gross_pnl_usdt",
  "gross_pct",
  "estimated_network_cost_usdt",
  "safety_buffer_usdt",
  "paper_net_pnl_usdt",
  "paper_net_pct",
  "leg1_latency_ms",
  "leg2_latency_ms",
  "total_quote_latency_ms",
  "leg1_pool",
  "leg2_pool",
  "leg1_fee_units",
  "leg2_fee_units",
  "leg1_price_impact",
  "leg2_price_impact"
];

const TRADE_HEADERS = [
  "signal_timestamp",
  "execution_timestamp",
  "route",
  "size_usdt",
  "detected_net_pct",
  "detected_net_pnl_usdt",
  "execution_leg1_out_gram",
  "execution_leg2_out_usdt",
  "execution_gross_pnl_usdt",
  "execution_network_cost_usdt",
  "execution_safety_buffer_usdt",
  "execution_net_pnl_usdt",
  "execution_net_pct",
  "signal_survived",
  "detection_to_execution_ms",
  "between_legs_ms",
  "leg1_latency_ms",
  "leg2_latency_ms"
];

export class Storage {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.snapshotsPath = path.join(this.dataDir, "snapshots.csv");
    this.opportunitiesPath = path.join(this.dataDir, "opportunities.csv");
    this.tradesPath = path.join(this.dataDir, "paper_trades.csv");
    this.summaryPath = path.join(this.dataDir, "summary.json");
    ensureCsv(this.snapshotsPath, SNAPSHOT_HEADERS);
    ensureCsv(this.opportunitiesPath, SNAPSHOT_HEADERS);
    ensureCsv(this.tradesPath, TRADE_HEADERS);
  }

  appendSnapshot(result, isOpportunity = false) {
    const row = snapshotRow(result);
    appendCsv(this.snapshotsPath, SNAPSHOT_HEADERS, row);
    if (isOpportunity) appendCsv(this.opportunitiesPath, SNAPSHOT_HEADERS, row);
  }

  appendPaperTrade(trade) {
    appendCsv(this.tradesPath, TRADE_HEADERS, trade);
  }

  writeSummary(summary) {
    fs.writeFileSync(this.summaryPath, JSON.stringify(summary, null, 2), "utf8");
  }
}

function snapshotRow(r) {
  return {
    timestamp: r.timestamp,
    route: r.route,
    size_usdt: r.sizeUsdt,
    leg1_out_gram: r.leg1OutGram,
    leg2_out_usdt: r.leg2OutUsdt,
    gross_pnl_usdt: r.grossPnlUsdt,
    gross_pct: r.grossPct,
    estimated_network_cost_usdt: r.networkCostUsdt,
    safety_buffer_usdt: r.safetyBufferUsdt,
    paper_net_pnl_usdt: r.netPnlUsdt,
    paper_net_pct: r.netPct,
    leg1_latency_ms: r.leg1.latencyMs,
    leg2_latency_ms: r.leg2.latencyMs,
    total_quote_latency_ms: r.quoteLatencyMs,
    leg1_pool: r.leg1.poolAddress,
    leg2_pool: r.leg2.poolAddress,
    leg1_fee_units: r.leg1.feeUnits?.toString?.() ?? "",
    leg2_fee_units: r.leg2.feeUnits?.toString?.() ?? "",
    leg1_price_impact: r.leg1.priceImpact ?? "",
    leg2_price_impact: r.leg2.priceImpact ?? "",
  };
}

function ensureCsv(file, headers) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    fs.writeFileSync(file, headers.join(",") + "\n", "utf8");
  }
}

function appendCsv(file, headers, obj) {
  const line = headers.map((h) => csvEscape(obj[h])).join(",") + "\n";
  fs.appendFileSync(file, line, "utf8");
}

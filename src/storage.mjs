import fs from "node:fs";
import path from "node:path";
import { csvEscape } from "./helpers.mjs";

const RECENT_LIMIT = 250;

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
  "leg2_price_impact",
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
  "leg2_latency_ms",
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

    this.recentSnapshots = loadRecentCsv(this.snapshotsPath, SNAPSHOT_HEADERS, RECENT_LIMIT);
    this.recentOpportunities = loadRecentCsv(this.opportunitiesPath, SNAPSHOT_HEADERS, RECENT_LIMIT);
    this.recentPaperTrades = loadRecentCsv(this.tradesPath, TRADE_HEADERS, RECENT_LIMIT);
    this.summary = readJson(this.summaryPath);
  }

  appendSnapshot(result, isOpportunity = false) {
    const row = snapshotRow(result);
    appendCsv(this.snapshotsPath, SNAPSHOT_HEADERS, row);
    pushRecent(this.recentSnapshots, row);
    if (isOpportunity) {
      appendCsv(this.opportunitiesPath, SNAPSHOT_HEADERS, row);
      pushRecent(this.recentOpportunities, row);
    }
  }

  appendPaperTrade(trade) {
    appendCsv(this.tradesPath, TRADE_HEADERS, trade);
    pushRecent(this.recentPaperTrades, trade);
  }

  writeSummary(summary) {
    this.summary = summary;
    const tempPath = `${this.summaryPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(summary, null, 2), "utf8");
    fs.renameSync(tempPath, this.summaryPath);
  }

  getDashboardData(limit = 50) {
    const takeNewest = (rows) => rows.slice(-limit).reverse();
    return {
      summary: this.summary,
      snapshots: takeNewest(this.recentSnapshots),
      opportunities: takeNewest(this.recentOpportunities),
      paperTrades: takeNewest(this.recentPaperTrades),
    };
  }

  getDownloadPath(name) {
    const files = {
      snapshots: this.snapshotsPath,
      opportunities: this.opportunitiesPath,
      paperTrades: this.tradesPath,
      summary: this.summaryPath,
    };
    return files[name] ?? null;
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
  const line = headers.map((header) => csvEscape(obj[header])).join(",") + "\n";
  fs.appendFileSync(file, line, "utf8");
}

function pushRecent(rows, row) {
  rows.push(row);
  if (rows.length > RECENT_LIMIT) rows.splice(0, rows.length - RECENT_LIMIT);
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadRecentCsv(file, headers, limit) {
  try {
    const stat = fs.statSync(file);
    if (stat.size === 0) return [];

    const maxBytes = 1024 * 1024;
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    fs.closeSync(fd);

    let lines = buffer.toString("utf8").split(/\r?\n/);
    if (start > 0) lines = lines.slice(1);
    lines = lines.filter(Boolean);
    if (start === 0 && lines[0] === headers.join(",")) lines.shift();

    return lines.slice(-limit).map((line) => {
      const values = parseCsvLine(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
  } catch {
    return [];
  }
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === ',') {
      values.push(value);
      value = "";
    } else if (char === '"') {
      quoted = true;
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

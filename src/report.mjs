import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

const file = path.resolve(config.dataDir, "paper_trades.csv");
if (!fs.existsSync(file)) {
  console.log(`No paper_trades.csv found at ${file}`);
  process.exit(0);
}

const rows = parseCsv(fs.readFileSync(file, "utf8"));
if (!rows.length) {
  console.log("No completed paper trades yet.");
  process.exit(0);
}

const groups = new Map();
for (const r of rows) {
  const key = `${r.route} | ${r.size_usdt} USDT`;
  const g = groups.get(key) ?? {
    route: r.route,
    size: Number(r.size_usdt),
    count: 0,
    profitable: 0,
    survived: 0,
    pnl: [],
    detectedPct: [],
    executedPct: [],
  };
  const pnl = Number(r.execution_net_pnl_usdt);
  const detectedPct = Number(r.detected_net_pct);
  const executedPct = Number(r.execution_net_pct);
  g.count++;
  if (pnl > 0) g.profitable++;
  if (String(r.signal_survived).toLowerCase() === "true") g.survived++;
  if (Number.isFinite(pnl)) g.pnl.push(pnl);
  if (Number.isFinite(detectedPct)) g.detectedPct.push(detectedPct);
  if (Number.isFinite(executedPct)) g.executedPct.push(executedPct);
  groups.set(key, g);
}

const output = [...groups.values()]
  .sort((a, b) => a.size - b.size || a.route.localeCompare(b.route))
  .map((g) => ({
    Route: g.route,
    "Size USDT": g.size,
    Trades: g.count,
    "Profitable %": fixed((g.profitable / g.count) * 100, 2),
    "Signal survived %": fixed((g.survived / g.count) * 100, 2),
    "Avg PnL USDT": fixed(avg(g.pnl), 6),
    "Median PnL": fixed(median(g.pnl), 6),
    "Best PnL": fixed(Math.max(...g.pnl), 6),
    "Worst PnL": fixed(Math.min(...g.pnl), 6),
    "Avg detected %": fixed(avg(g.detectedPct), 4),
    "Avg delayed %": fixed(avg(g.executedPct), 4),
  }));

console.table(output);

const allPnl = rows.map((r) => Number(r.execution_net_pnl_usdt)).filter(Number.isFinite);
console.log(`Completed paper trades: ${rows.length}`);
console.log(`Sum of independent paper PnL: ${fixed(allPnl.reduce((a, b) => a + b, 0), 6)} USDT`);
console.log(`Average paper PnL: ${fixed(avg(allPnl), 6)} USDT`);
console.log("Note: the sum treats every signal as an independent hypothetical trade; it is not a compounded wallet balance.");

function avg(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function median(xs) {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function fixed(x, d) {
  return Number.isFinite(x) ? Number(x.toFixed(d)) : null;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]));
  });
}

function parseLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

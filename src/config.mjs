import "dotenv/config";

function envNumber(name, fallback, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`Invalid ${name}: ${raw ?? value}`);
  }
  return value;
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (/^(1|true|yes|on)$/i.test(raw)) return true;
  if (/^(0|false|no|off)$/i.test(raw)) return false;
  throw new Error(`Invalid ${name}: ${raw}`);
}

function envString(name, fallback) {
  const value = String(process.env[name] ?? fallback).trim();
  if (!value) throw new Error(`Invalid ${name}: value must not be empty`);
  return value;
}

function envDecimalString(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return String(raw);
}

function parseSizes(raw) {
  const parts = String(raw ?? "10,25,50,100,250").split(",");
  const values = parts.map((part) => Number(part.trim()));
  if (!values.length || values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("TRADE_SIZES_USDT must be a comma-separated list of positive numbers");
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

export const config = Object.freeze({
  tradeSizesUsdt: parseSizes(process.env.TRADE_SIZES_USDT),
  pollIntervalMs: envNumber("POLL_INTERVAL_MS", 5000, { min: 1000, max: 3_600_000, integer: true }),
  minSignalPct: envNumber("MIN_SIGNAL_PCT", 0.10, { min: -100, max: 100 }),
  stonSlippageTolerance: envDecimalString("STON_SLIPPAGE_TOLERANCE", "0.005", { min: 0, max: 1 }),
  detectionToExecutionMs: envNumber("DETECTION_TO_EXECUTION_MS", 1200, { min: 0, max: 300_000, integer: true }),
  betweenLegsMs: envNumber("BETWEEN_LEGS_MS", 2500, { min: 0, max: 300_000, integer: true }),
  eventCooldownMs: envNumber("EVENT_COOLDOWN_MS", 20000, { min: 0, max: 86_400_000, integer: true }),
  estimatedGasPerLegGram: envNumber("ESTIMATED_GAS_PER_LEG_GRAM", 0.05, { min: 0, max: 100 }),
  safetyBufferBps: envNumber("SAFETY_BUFFER_BPS", 10, { min: 0, max: 10_000 }),
  usdtMaster: envString("USDT_MASTER", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"),
  tonV4Endpoint: envString("TON_V4_ENDPOINT", "https://mainnet-v4.tonhubapi.com"),
  dataDir: envString("DATA_DIR", "./data"),
  verboseErrors: envBool("VERBOSE_ERRORS", false),
  uiEnabled: envBool("UI_ENABLED", true),
  uiHost: envString("UI_HOST", "127.0.0.1"),
  uiPort: envNumber("UI_PORT", 3000, { min: 1, max: 65535, integer: true }),
  autoOpenBrowser: envBool("AUTO_OPEN_BROWSER", false),
});

export const ASSETS = Object.freeze({
  USDT: { symbol: "USDT", decimals: 6 },
  GRAM: { symbol: "GRAM", decimals: 9 },
});

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseUnits(value, decimals) {
  const s = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Invalid positive decimal value: ${value}`);
  }
  const [whole, fraction = ""] = s.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Too many decimals in ${value}; max ${decimals}`);
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals));
}

export function unitsToNumber(units, decimals) {
  return Number(units) / 10 ** decimals;
}

export function numberToFixed(value, digits = 6) {
  return Number.isFinite(value) ? value.toFixed(digits) : "NaN";
}

export function pct(part, base) {
  if (!Number.isFinite(part) || !Number.isFinite(base) || base === 0) return NaN;
  return (part / base) * 100;
}

export function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

export function bigintOrZero(value) {
  if (value === undefined || value === null || value === "") return 0n;
  return BigInt(value);
}

export function csvEscape(value) {
  const s = value === undefined || value === null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function routeLabel(route) {
  return `${route.leg1} -> ${route.leg2}`;
}

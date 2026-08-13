const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 });
let refreshTimer;
let refreshInFlight = false;

$("refreshButton").addEventListener("click", () => void refresh());
void refresh();
refreshTimer = setInterval(() => void refresh(), 2000);
window.addEventListener("beforeunload", () => clearInterval(refreshTimer));

async function refresh() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  $("refreshButton").disabled = true;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    renderOffline(error);
  } finally {
    refreshInFlight = false;
    $("refreshButton").disabled = false;
  }
}

function render(state) {
  renderStatus(state);
  renderKpis(state.summary ?? {});
  renderSettings(state.config ?? {});
  renderMarket(state.snapshots ?? []);
  renderTrades(state.paperTrades ?? []);
  renderChart(state.paperTrades ?? []);
  $("updatedAt").textContent = `Панель обновлена: ${formatTime(state.generatedAt)}`;
}

function renderStatus(state) {
  const runtime = state.runtime ?? {};
  const staleMs = Math.max(15_000, Number(state.config?.pollIntervalMs ?? 5000) * 3);
  const lastSuccess = runtime.lastSuccessfulScanAt ? Date.parse(runtime.lastSuccessfulScanAt) : NaN;
  const stale = Number.isFinite(lastSuccess) && Date.now() - lastSuccess > staleMs;
  const statusMap = {
    starting: ["Запуск", "neutral"],
    initializing: ["Подключение к mainnet", "neutral"],
    running: [stale ? "Данные устарели" : "Сканер работает", stale ? "warning" : "good"],
    degraded: ["Нет связи, повторяем", "warning"],
    stopping: ["Остановка", "warning"],
    stopped: ["Остановлен", "neutral"],
    fatal: ["Ошибка запуска", "bad"],
  };
  const [label, tone] = statusMap[runtime.status] ?? [runtime.status || "Неизвестно", "neutral"];
  $("statusTitle").textContent = label;
  $("statusMessage").textContent = runtime.lastError ? `${runtime.message ?? "Ошибка"}: ${runtime.lastError}` : runtime.message ?? "—";
  $("statusDot").className = `status-dot ${tone}`;
  $("lastScan").textContent = runtime.lastSuccessfulScanAt ? formatDateTime(runtime.lastSuccessfulScanAt) : "—";
  $("latency").textContent = Number.isFinite(Number(runtime.lastQuoteLatencyMs)) ? `${nf.format(runtime.lastQuoteLatencyMs)} ms` : "—";
  $("scanCount").textContent = nf.format(Number(runtime.scansCompleted ?? 0));
}

function renderKpis(summary) {
  const pnl = Number(summary.cumulativePaperPnlUsdt ?? 0);
  setSigned($("paperPnl"), `${signedNumber(pnl, 6)} USDT`, pnl);
  $("paperTrades").textContent = nf.format(Number(summary.paperTrades ?? 0));
  $("profitableRate").textContent = percentOrDash(summary.profitableRatePct);
  $("survivalRate").textContent = percentOrDash(summary.survivalRatePct);
  $("opportunities").textContent = nf.format(Number(summary.detectedOpportunities ?? 0));
}

function renderSettings(config) {
  const rows = [
    ["Размеры", `${(config.tradeSizesUsdt ?? []).join(", ")} USDT`],
    ["Порог сигнала", `${nf.format(Number(config.minSignalPct ?? 0))}% net`],
    ["Интервал сканирования", `${nf.format(Number(config.pollIntervalMs ?? 0))} ms`],
    ["До исполнения", `${nf.format(Number(config.detectionToExecutionMs ?? 0))} ms`],
    ["Между ногами", `${nf.format(Number(config.betweenLegsMs ?? 0))} ms`],
    ["Резерв gas", `${nf.format(Number(config.estimatedGasPerLegGram ?? 0))} GRAM / leg`],
    ["Safety buffer", `${nf.format(Number(config.safetyBufferBps ?? 0))} bps`],
  ];
  const list = $("settingsList");
  list.replaceChildren(...rows.map(([label, value]) => {
    const wrapper = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    wrapper.append(dt, dd);
    return wrapper;
  }));
}

function renderMarket(rows) {
  const latestByKey = new Map();
  for (const row of rows) {
    const key = `${row.route}|${row.size_usdt}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }
  const sorted = [...latestByKey.values()].sort((a, b) => Number(a.size_usdt) - Number(b.size_usdt) || String(a.route).localeCompare(String(b.route)));
  const tbody = $("marketRows");
  if (!sorted.length) return setEmptyRow(tbody, 7, "Ожидание первых котировок…");
  tbody.replaceChildren(...sorted.map((row) => {
    const tr = document.createElement("tr");
    addCell(tr, row.route || "—");
    addCell(tr, `${nf.format(Number(row.size_usdt))} USDT`);
    addSignedCell(tr, Number(row.gross_pct), "%");
    addSignedCell(tr, Number(row.paper_net_pct), "%", true);
    addSignedCell(tr, Number(row.paper_net_pnl_usdt), " USDT");
    addCell(tr, `${nf.format(Number(row.total_quote_latency_ms))} ms`);
    addCell(tr, formatTime(row.timestamp));
    return tr;
  }));
}

function renderTrades(rows) {
  const tbody = $("tradeRows");
  const trades = rows.slice(0, 20);
  if (!trades.length) return setEmptyRow(tbody, 7, "Paper-сделок пока нет.");
  tbody.replaceChildren(...trades.map((row) => {
    const tr = document.createElement("tr");
    addCell(tr, formatDateTime(row.execution_timestamp));
    addCell(tr, row.route || "—");
    addCell(tr, `${nf.format(Number(row.size_usdt))} USDT`);
    addSignedCell(tr, Number(row.detected_net_pct), "%");
    addSignedCell(tr, Number(row.execution_net_pct), "%");
    addSignedCell(tr, Number(row.execution_net_pnl_usdt), " USDT", true);
    const survived = normalizeBool(row.signal_survived);
    const td = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = `table-badge ${survived ? "good" : "neutral"}`;
    badge.textContent = survived ? "Да" : "Нет";
    td.append(badge);
    tr.append(td);
    return tr;
  }));
}

function renderChart(rows) {
  const host = $("pnlChart");
  const chronological = rows.slice(0, 50).reverse();
  if (!chronological.length) {
    host.replaceChildren(makeEmptyChart("График появится после первой paper-сделки"));
    $("chartCaption").textContent = "Нет сделок";
    return;
  }
  let cumulative = 0;
  const values = chronological.map((row) => {
    cumulative += Number(row.execution_net_pnl_usdt ?? 0);
    return cumulative;
  });
  const width = 640, height = 220, padX = 18, padY = 24;
  let min = Math.min(0, ...values), max = Math.max(0, ...values);
  if (min === max) { min -= 1; max += 1; }
  const extra = (max - min) * 0.12;
  min -= extra; max += extra;
  const x = (i) => padX + (values.length === 1 ? (width - padX * 2) / 2 : i * (width - padX * 2) / (values.length - 1));
  const y = (value) => padY + (max - value) * (height - padY * 2) / (max - min);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");
  const zero = document.createElementNS(svg.namespaceURI, "line");
  zero.setAttribute("x1", padX); zero.setAttribute("x2", width - padX); zero.setAttribute("y1", y(0)); zero.setAttribute("y2", y(0)); zero.setAttribute("class", "chart-zero");
  const line = document.createElementNS(svg.namespaceURI, "polyline");
  const area = document.createElementNS(svg.namespaceURI, "path");
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  line.setAttribute("points", points); line.setAttribute("class", cumulative >= 0 ? "chart-line positive" : "chart-line negative");
  area.setAttribute("d", `M ${x(0)} ${y(0)} L ${points.replaceAll(" ", " L ")} L ${x(values.length - 1)} ${y(0)} Z`);
  area.setAttribute("class", cumulative >= 0 ? "chart-area positive" : "chart-area negative");
  svg.append(zero, area, line);
  host.replaceChildren(svg);
  $("chartCaption").textContent = `${chronological.length} сделок · ${signedNumber(cumulative, 6)} USDT`;
}

function renderOffline(error) {
  $("statusTitle").textContent = "Панель не получает данные";
  $("statusMessage").textContent = `Проверьте, запущен ли бот. ${error?.message ?? ""}`.trim();
  $("statusDot").className = "status-dot bad";
}
function addCell(tr, value) { const td = document.createElement("td"); td.textContent = String(value ?? "—"); tr.append(td); }
function addSignedCell(tr, value, suffix, emphasize = false) { const td = document.createElement("td"); td.textContent = Number.isFinite(value) ? `${signedNumber(value, 4)}${suffix}` : "—"; td.classList.add("number"); if (emphasize) td.classList.add("emphasis"); if (value > 0) td.classList.add("positive"); if (value < 0) td.classList.add("negative"); tr.append(td); }
function setSigned(element, text, value) { element.textContent = text; element.classList.toggle("positive", value > 0); element.classList.toggle("negative", value < 0); }
function setEmptyRow(tbody, columns, message) { const tr = document.createElement("tr"); const td = document.createElement("td"); td.colSpan = columns; td.className = "empty"; td.textContent = message; tr.append(td); tbody.replaceChildren(tr); }
function makeEmptyChart(message) { const div = document.createElement("div"); div.className = "empty-chart"; div.textContent = message; return div; }
function signedNumber(value, digits = 4) { const number = Number(value); if (!Number.isFinite(number)) return "—"; return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`; }
function percentOrDash(value) { const number = Number(value); return Number.isFinite(number) ? `${nf.format(number)}%` : "—"; }
function normalizeBool(value) { return value === true || value === "true" || value === "1" || value === 1; }
function formatTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "—"; return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function formatDateTime(value) { const date = new Date(value); if (Number.isNaN(date.getTime())) return "—"; return date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

// When the site is hosted on GitHub Pages, API requests go to the Oracle
// server; when served by the FastAPI backend itself, relative paths work.
const API_BASE = window.location.hostname.endsWith("github.io")
  ? "https://158-101-235-233.sslip.io"
  : "";

const state = {
  selectedSymbol: null,
  symbols: [],
  symbolFilter: "",
  chart: null,
  candleSeries: null,
  ma20Series: null,
  allCandles: [],
  currentCandles: [],
  selectedTrade: null,
  selectedTradeAnalysis: null,
  selectedTradeAnalysisFresh: false,
  currentAnalysis: null,
  experimentalEnabled: false,
  experimentalAnalysis: null,
  equityChart: null,
  equitySeries: null,
  marketStructure: null,
  selectionToken: 0,
  overlayFrame: null,
  overlayDebounce: null,
  replayEnabled: false,
  replayIndex: null,
  dashboardTrades: [],
  tradeFilters: {
    search: "",
    outcome: "",
    direction: "",
    pnl: "",
  },
  lastSystemStatus: null,
};

const symbolList = document.getElementById("symbol-list");
const symbolSearch = document.getElementById("symbol-search");
const appShell = document.querySelector(".app-shell");
const tradeLogBody = document.getElementById("trade-log-body");
const signalOutput = document.getElementById("signal-output");
const statusText = document.getElementById("status-text");
const title = document.getElementById("selected-symbol-title");
const lastPriceBadge = document.getElementById("last-price-badge");
const activeTradeCard = document.getElementById("active-trade-card");
const tradeReasonPanel = document.getElementById("trade-reason-panel");
const tradeFilterSearch = document.getElementById("trade-filter-search");
const tradeFilterOutcome = document.getElementById("trade-filter-outcome");
const tradeFilterDirection = document.getElementById("trade-filter-direction");
const tradeFilterPnl = document.getElementById("trade-filter-pnl");
const exportTradesButton = document.getElementById("export-trades-button");
const chartOverlay = document.getElementById("chart-overlay");
const chartContainer = document.getElementById("chart");
const replayEnabledInput = document.getElementById("replay-enabled");
const replaySlider = document.getElementById("replay-slider");
const replayLabel = document.getElementById("replay-label");
const experimentalEnabledInput = document.getElementById("experimental-enabled");
const experimentalLabel = document.getElementById("experimental-label");
const adminLoginForm = document.getElementById("admin-login-form");
const adminPasswordInput = document.getElementById("admin-password-input");
const adminLoginStatus = document.getElementById("admin-login-status");
const adminLogoutButton = document.getElementById("admin-logout-button");
const pageTitle = document.getElementById("page-title");
const pageDescription = document.getElementById("page-description");
const initialUrlParams = new URLSearchParams(window.location.search);
const isCaptureMode = initialUrlParams.get("capture") === "1";
let resizeFrame = null;
let resizeTimer = null;
window.__captureReady = false;

const PAGE_META = {
  "analysis-tab": {
    hash: "#analysis",
    title: "التحليل",
    description: "راقب الشارت والصفقات الحالية والأسباب المرتبطة بكل دخول.",
  },
  "performance-tab": {
    hash: "#performance",
    title: "الأداء",
    description: "تابع الإحصائيات، أفضل وأسوأ الصفقات، والعائد على المحفظة.",
  },
  "subscribers-tab": {
    hash: "#subscribers",
    title: "المشتركون",
    description: "هنا ستجد الطلبات المعلقة، المشتركين الحاليين، وإدارة القبول والتمديد والإيقاف.",
  },
};

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSeconds(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const seconds = Number(value);
  if (seconds < 60) return `${seconds.toFixed(1)} ث`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} د ${remainingSeconds} ث`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ar-SA", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value).split("T")[0];
  }
  return date.toLocaleDateString("en-CA");
}

function getDeepLinkTradeRequest() {
  const symbol = initialUrlParams.get("symbol");
  const interval = initialUrlParams.get("interval");
  const period = initialUrlParams.get("period");
  const signalTime = initialUrlParams.get("signal_time");
  const entryPrice = initialUrlParams.get("entry_price");
  if (!symbol || !signalTime) return null;
  return {
    symbol,
    interval,
    period,
    signalTime,
    entryPrice: entryPrice != null ? Number(entryPrice) : null,
    applied: false,
  };
}

state.deepLinkTrade = getDeepLinkTradeRequest();

function getChartHeight() {
  return window.matchMedia("(max-width: 1080px)").matches ? 620 : 960;
}

function resizeCharts() {
  chartContainer.style.height = `${getChartHeight()}px`;
  const chartWidth = Math.floor(chartContainer.getBoundingClientRect().width);
  const equityContainer = document.getElementById("equity-chart");
  const equityWidth = Math.floor(equityContainer.getBoundingClientRect().width);
  if (chartWidth > 0) {
    state.chart?.applyOptions({ width: chartWidth, height: getChartHeight() });
  }
  if (equityWidth > 0) {
    state.equityChart?.applyOptions({ width: equityWidth, height: 240 });
  }
  scheduleRenderAnalysisOverlay();
}

function scheduleResizeCharts() {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame);
  }
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeCharts();
    resizeTimer = setTimeout(resizeCharts, 180);
  });
}

function createCharts() {
  state.chart = LightweightCharts.createChart(chartContainer, {
    width: Math.floor(chartContainer.getBoundingClientRect().width),
    height: getChartHeight(),
    layout: { background: { color: "#ffffff" }, textColor: "#1a1a1a" },
    grid: { vertLines: { color: "rgba(0, 0, 0, 0.07)" }, horzLines: { color: "rgba(0, 0, 0, 0.07)" } },
    rightPriceScale: { borderColor: "rgba(0, 0, 0, 0.18)" },
    timeScale: { borderColor: "rgba(0, 0, 0, 0.18)" },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  });
  state.candleSeries = state.chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: "#ffffff",
    downColor: "#000000",
    wickUpColor: "#000000",
    wickDownColor: "#000000",
    borderUpColor: "#000000",
    borderDownColor: "#000000",
    priceLineColor: "#000000",
  });
  state.ma20Series = state.chart.addSeries(LightweightCharts.LineSeries, {
    color: "rgba(0, 0, 0, 0.34)",
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle?.Dotted ?? 1,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  });

  state.equityChart = LightweightCharts.createChart(document.getElementById("equity-chart"), {
    width: Math.floor(document.getElementById("equity-chart").getBoundingClientRect().width),
    height: 240,
    layout: { background: { color: "#ffffff" }, textColor: "#1a1a1a" },
    grid: { vertLines: { color: "rgba(0, 0, 0, 0.07)" }, horzLines: { color: "rgba(0, 0, 0, 0.07)" } },
    rightPriceScale: { borderColor: "rgba(0, 0, 0, 0.18)" },
    timeScale: { borderColor: "rgba(0, 0, 0, 0.18)" },
  });
  state.equitySeries = state.equityChart.addSeries(LightweightCharts.LineSeries, {
    color: "#7c9cff",
    lineWidth: 3,
  });

  state.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
    scheduleRenderAnalysisOverlay(90);
  });
}

async function fetchJson(url, options = {}) {
  const requestOptions = { ...options };
  const headers = new Headers(requestOptions.headers || {});
  requestOptions.headers = headers;
  const target = url.startsWith("/") ? `${API_BASE}${url}` : url;
  const response = await fetch(target, requestOptions);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
}

function getSymbolSearchText(item) {
  return [
    item.symbol,
    item.name_ar,
    item.name_en,
    getArabicDisplayName(item),
  ].filter(Boolean).join(" ").toLowerCase();
}

function renderSymbols() {
  symbolList.innerHTML = "";
  const query = state.symbolFilter.trim().toLowerCase();
  const filteredSymbols = query
    ? state.symbols.filter((item) => getSymbolSearchText(item).includes(query))
    : state.symbols;

  if (!filteredSymbols.length) {
    const empty = document.createElement("div");
    empty.className = "symbol-empty";
    empty.textContent = "\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u062a\u0627\u0626\u062c";
    symbolList.appendChild(empty);
    return;
  }

  filteredSymbols.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `symbol-item ${state.selectedSymbol === item.symbol ? "active" : ""}`;
    card.innerHTML = `
      <strong>${getArabicDisplayName(item)}</strong>
      <span class="symbol-code">${item.symbol}</span>
      <small class="symbol-en">${item.name_en || item.name_ar || ""}</small>
    `;
    card.addEventListener("click", () => selectSymbol(item.symbol));
    symbolList.appendChild(card);
  });
}

async function loadSymbols() {
  const data = await fetchJson("/api/symbols");
  state.symbols = data.items;
  state.selectedSymbol = state.deepLinkTrade?.symbol || data.items[0]?.symbol || null;
  renderSymbols();
  if (state.selectedSymbol) {
    if (state.deepLinkTrade?.interval) {
      document.getElementById("interval-select").value = state.deepLinkTrade.interval;
      if (state.deepLinkTrade?.period) {
        document.getElementById("period-select").value = state.deepLinkTrade.period;
      } else {
        syncPeriodToInterval();
      }
    }
    await selectSymbol(state.selectedSymbol);
  }
}

async function selectSymbol(symbol) {
  const token = ++state.selectionToken;
  window.__captureReady = false;
  state.selectedSymbol = symbol;
  state.selectedTrade = null;
  state.selectedTradeAnalysis = null;
  state.selectedTradeAnalysisFresh = false;
  state.currentAnalysis = null;
  state.experimentalAnalysis = null;
  state.marketStructure = null;
  renderSymbols();
  title.textContent = symbol;
  clearAnalysisOverlay();
  statusText.textContent = "جاري تحميل الشارت...";
  await loadCandles(token);
  if (token !== state.selectionToken) return;

  statusText.textContent = "تم تحميل الشارت. جاري تحميل التحليل والصفقات...";
  Promise.allSettled([loadDashboard(token), loadAnalysis(token)]).then(() => {
    if (token === state.selectionToken) {
      statusText.textContent = `تم تحميل بيانات ${state.selectedSymbol}.`;
    }
  });
}

function getQueryParams() {
  const interval = document.getElementById("interval-select").value;
  let period = document.getElementById("period-select").value;
  if (interval === "1mo" || interval === "1wk" || interval === "1h") {
    period = getRecommendedPeriod(interval);
  }
  return { period, interval };
}

function findMatchingTrade(trades) {
  const request = state.deepLinkTrade;
  if (!request || request.applied || request.symbol !== state.selectedSymbol) return null;
  const selectedInterval = getQueryParams().interval;
  if (request.interval && request.interval !== selectedInterval) return null;

  return trades.find((trade) => {
    const sameTime = trade.signal_time === request.signalTime;
    const sameEntry = request.entryPrice == null || Number(trade.entry_price) === Number(request.entryPrice);
    return sameTime && sameEntry;
  }) || null;
}

function getRecommendedPeriod(interval) {
  if (interval === "1h") return "3mo";
  if (interval === "1mo") return "10y";
  if (interval === "1wk") return "5y";
  return "1y";
}

function syncPeriodToInterval() {
  const interval = document.getElementById("interval-select").value;
  const periodSelect = document.getElementById("period-select");
  const recommended = getRecommendedPeriod(interval);
  if (periodSelect.value !== recommended) {
    periodSelect.value = recommended;
  }
}

function isDailyInterval(interval) {
  return interval.endsWith("d") || interval.endsWith("wk") || interval.endsWith("mo");
}

function buildTimeKey(rawTime, interval) {
  return isDailyInterval(interval) ? rawTime.slice(0, 10) : rawTime.slice(0, 19);
}

function toBusinessDay(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return { year, month, day };
}

function toUnixTimestamp(rawTime) {
  return Math.floor(new Date(rawTime).getTime() / 1000);
}

function toChartTime(rawTime, interval) {
  const timeKey = buildTimeKey(rawTime, interval);
  return isDailyInterval(interval) ? toBusinessDay(timeKey) : toUnixTimestamp(rawTime);
}

function findCandleByTimeKey(timeKey) {
  return state.currentCandles.find((item) => item.timeKey === timeKey);
}

function getReplayTimestamp() {
  if (!state.replayEnabled || state.replayIndex == null) return null;
  return state.allCandles[state.replayIndex]?.rawTime ?? null;
}

function getVisibleCandles() {
  if (!state.replayEnabled || state.replayIndex == null) {
    return state.allCandles;
  }
  return state.allCandles.slice(0, state.replayIndex + 1);
}

function updateReplayControls() {
  if (!state.allCandles.length) {
    replaySlider.disabled = true;
    replaySlider.min = "0";
    replaySlider.max = "0";
    replaySlider.value = "0";
    replayLabel.textContent = "الريلاب غير متاح";
    return;
  }

  replaySlider.disabled = !state.replayEnabled;
  replaySlider.min = "0";
  replaySlider.max = String(state.allCandles.length - 1);
  const activeIndex = state.replayIndex ?? (state.allCandles.length - 1);
  replaySlider.value = String(activeIndex);
  const activeCandle = state.allCandles[activeIndex];
  replayLabel.textContent = state.replayEnabled
    ? `الشمعة المحددة: ${activeCandle?.rawTime ?? "-"}`
    : "الريلاب غير مفعل";
}

function applyVisibleCandles() {
  const candles = getVisibleCandles();
  state.currentCandles = candles;
  clearChartOverlays();
  state.candleSeries.setData(candles.map((item) => ({
    time: item.chartTime,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  })));
  state.ma20Series?.setData(buildMa20Series(candles));
  applyCandleMarkers(candles);
  state.chart.timeScale().fitContent();
  const lastCandle = candles[candles.length - 1];
  lastPriceBadge.textContent = lastCandle ? `آخر سعر: ${lastCandle.close}` : "-";
  updateReplayControls();
  scheduleRenderAnalysisOverlay();
}

function findChartCoordinate(timeKey) {
  const candle = findCandleByTimeKey(timeKey);
  return candle ? state.chart.timeScale().timeToCoordinate(candle.chartTime) : null;
}

function buildMa20Series(candles) {
  const result = [];
  let ema = null;
  const period = 20;
  const multiplier = 2 / (period + 1);
  candles.forEach((item, index) => {
    const close = Number(item.close);
    if (Number.isNaN(close)) return;
    if (ema == null) {
      ema = close;
    } else {
      ema = ((close - ema) * multiplier) + ema;
    }
    if (index >= period - 1) {
      result.push({ time: item.chartTime, value: Number(ema.toFixed(4)) });
    }
  });
  return result;
}

function applyCandleMarkers(candles) {
  const markers = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    const body = Math.abs(Number(candle.close) - Number(candle.open));
    const range = Math.max(Number(candle.high) - Number(candle.low), 1e-9);
    const bodyMax = Math.max(Number(candle.open), Number(candle.close));
    const bodyMin = Math.min(Number(candle.open), Number(candle.close));
    const prevBodyMax = Math.max(Number(previous.open), Number(previous.close));
    const prevBodyMin = Math.min(Number(previous.open), Number(previous.close));
    const bullishEngulfing = Number(candle.close) > Number(candle.open) && bodyMax >= prevBodyMax && bodyMin <= prevBodyMin;
    const bearishEngulfing = Number(candle.close) < Number(candle.open) && bodyMax >= prevBodyMax && bodyMin <= prevBodyMin;
    const isBaseCandle = body <= range * 0.5;

    if (isBaseCandle) {
      markers.push({
        time: candle.chartTime,
        position: "inBar",
        color: "#ff0000",
        shape: "cross",
        text: "",
      });
    }
  }
  if (typeof state.candleSeries.setMarkers === "function") {
    state.candleSeries.setMarkers(markers);
  } else if (typeof LightweightCharts.createSeriesMarkers === "function") {
    LightweightCharts.createSeriesMarkers(state.candleSeries, markers);
  }
}

function getActiveOverlaySignal() {
  if (state.selectedTradeAnalysis) {
    return state.selectedTradeAnalysis;
  }
  if (state.selectedTrade && state.selectedTradeAnalysisFresh) {
    return null;
  }
  return state.currentAnalysis?.signal ?? null;
}

function getExperimentalOverlaySignal() {
  return state.experimentalEnabled ? state.experimentalAnalysis?.signal ?? null : null;
}

async function loadCandles(token = null) {
  if (!state.selectedSymbol) return;
  const { period, interval } = getQueryParams();
  const requestedSymbol = state.selectedSymbol;
  const data = await fetchJson(`/api/candles?symbol=${requestedSymbol}&period=${period}&interval=${interval}`);
  if ((token !== null && token !== state.selectionToken) || requestedSymbol !== state.selectedSymbol) return;
  const candles = data.items.map((item) => ({
    rawTime: item.time,
    timeKey: buildTimeKey(item.time, interval),
    chartTime: toChartTime(item.time, interval),
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
  }));
  state.allCandles = candles;
  state.replayIndex = candles.length ? candles.length - 1 : null;
  applyVisibleCandles();
}

function filteredTrades(trades) {
  const query = state.tradeFilters.search.trim().toLowerCase();
  return trades.filter((trade) => {
    const reason = getTradeReasonText(trade).toLowerCase();
    const matchesSearch = !query || String(trade.symbol || "").toLowerCase().includes(query) || reason.includes(query);
    const matchesOutcome = !state.tradeFilters.outcome || trade.outcome === state.tradeFilters.outcome;
    const matchesDirection = !state.tradeFilters.direction || (trade.direction || "long") === state.tradeFilters.direction;
    const pnl = Number(trade.pnl ?? trade.current_pnl ?? 0);
    const matchesPnl = !state.tradeFilters.pnl
      || (state.tradeFilters.pnl === "positive" && pnl > 0)
      || (state.tradeFilters.pnl === "negative" && pnl < 0);
    return matchesSearch && matchesOutcome && matchesDirection && matchesPnl;
  });
}

function formatDirection(direction) {
  if (direction === "long") return "شراء";
  if (direction === "short") return "بيع";
  return "-";
}

function formatOutcome(outcome) {
  if (outcome === "win") return "ناجحة";
  if (outcome === "loss") return "خاسرة";
  if (outcome === "open") return "مفتوحة";
  if (outcome === "expired") return "منتهية";
  if (outcome === "cancelled") return "ملغية";
  return outcome || "-";
}

function clearChartOverlays() {
  if (typeof state.candleSeries.setMarkers === "function") {
    state.candleSeries.setMarkers([]);
  } else if (typeof LightweightCharts.createSeriesMarkers === "function") {
    LightweightCharts.createSeriesMarkers(state.candleSeries, []);
  }
}

function clearAnalysisOverlay() {
  chartOverlay.innerHTML = "";
}

function scheduleRenderAnalysisOverlay(delayMs = 0) {
  if (state.overlayDebounce != null) {
    clearTimeout(state.overlayDebounce);
    state.overlayDebounce = null;
  }
  if (state.overlayFrame != null) {
    cancelAnimationFrame(state.overlayFrame);
    state.overlayFrame = null;
  }
  const run = () => {
    state.overlayFrame = requestAnimationFrame(() => {
      state.overlayFrame = null;
      renderAnalysisOverlay();
    });
  };
  if (delayMs > 0) {
    state.overlayDebounce = setTimeout(() => {
      state.overlayDebounce = null;
      run();
    }, delayMs);
    return;
  }
  run();
}

function findCandleIndexByTime(time) {
  return state.currentCandles.findIndex((item) => item.timeKey === time);
}

function findMitigationTime(level, direction, mode, startIndex) {
  for (let i = Math.max(startIndex + 1, 0); i < state.currentCandles.length; i += 1) {
    const candle = state.currentCandles[i];
    if (mode === "zone") {
      if (direction === "long" && candle.close < level) return candle.timeKey;
      if (direction === "short" && candle.close > level) return candle.timeKey;
    }
    if (mode === "structure") {
      if (direction === "long" && candle.close < level) return candle.timeKey;
      if (direction === "short" && candle.close > level) return candle.timeKey;
    }
  }
  return state.currentCandles[state.currentCandles.length - 1]?.timeKey ?? null;
}

function containsArabicText(text) {
  return /[\u0600-\u06FF]/.test(text || "");
}

function localizeCompanyName(name, symbol) {
  if (!name) return `سهم ${symbol}`;

  const exactMatches = {
    "Saudi Arabian Oil Company": "شركة الزيت العربية السعودية",
    "Al Rajhi Banking and Investment Corporation": "مصرف الراجحي",
    "Saudi Arabian Mining Company (Maaden)": "شركة التعدين العربية السعودية",
    "The Saudi National Bank": "البنك الأهلي السعودي",
    "Saudi Telecom Company": "شركة الاتصالات السعودية",
    "Saudi Basic Industries Corporation": "الشركة السعودية للصناعات الأساسية",
    "ACWA Power Company": "شركة أكوا باور",
    "Riyad Bank": "بنك الرياض",
    "Saudi Awwal Bank": "البنك السعودي الأول",
    "Alinma Bank": "مصرف الإنماء",
    "Banque Saudi Fransi": "البنك السعودي الفرنسي",
    "Elm Company": "شركة علم",
    "Arab National Bank": "البنك العربي الوطني",
    "Almarai Company": "شركة المراعي",
    "Kingdom Holding Company": "شركة المملكة القابضة",
  };
  if (exactMatches[name]) return exactMatches[name];

  const replacements = [
    [/Saudi Arabian/g, "العربية السعودية"],
    [/Saudi/g, "السعودية"],
    [/National/g, "الوطني"],
    [/Banking and Investment/g, "المصرفية والاستثمار"],
    [/Bank/g, "بنك"],
    [/Company/g, "شركة"],
    [/Corporation/g, "مؤسسة"],
    [/Medical Services/g, "الخدمات الطبية"],
    [/Medical/g, "الطبية"],
    [/Power/g, "الطاقة"],
    [/Energy/g, "الطاقة"],
    [/Telecom/g, "الاتصالات"],
    [/Telecommunications/g, "الاتصالات"],
    [/Industries/g, "الصناعات"],
    [/Mining/g, "التعدين"],
    [/Holding/g, "القابضة"],
    [/Group/g, "مجموعة"],
  ];

  let localized = name;
  replacements.forEach(([pattern, replacement]) => {
    localized = localized.replace(pattern, replacement);
  });
  localized = localized.replace(/\s+/g, " ").trim();
  return containsArabicText(localized) ? localized : `سهم ${symbol}`;
}

function getArabicDisplayName(item) {
  if (containsArabicText(item.name_ar)) {
    return item.name_ar;
  }
  return localizeCompanyName(item.name_ar || item.name_en, item.symbol);
}

function getTradeReasonText(trade) {
  const reasonFromAnalysis = trade.analysis?.entry_reason;
  if (reasonFromAnalysis) return reasonFromAnalysis;
  if (trade.notes) return trade.notes;
  return "لا يوجد تفسير مسجل لهذه الصفقة.";
}

function getTradeReasonList(trade) {
  const details = trade.analysis?.reason_details;
  if (Array.isArray(details) && details.length) {
    return details
      .filter((item) => item.passed)
      .map((item) => item.detail);
  }
  return [];
}

function getReasonDetails(signal) {
  return (signal?.analysis?.reason_details || [])
    .filter((item) => item.passed)
    .map((item) => `- ${item.label}: ${item.detail}`)
    .join("\n");
}

function renderSignalSummary(result, mode) {
  if (!result) {
    return "لا توجد نتيجة.";
  }
  if (mode === "backtest") {
    return [
      `الباك تست على ${result.symbol}`,
      `عدد الصفقات: ${result.generated_trades?.length ?? 0}`,
      `نسبة النجاح: ${result.summary?.win_rate ?? 0}%`,
      `صافي الربح: ${result.summary?.net_profit ?? 0}`,
    ].join("\n");
  }

  if (!result.matched || !result.signal) {
    return "لا توجد إشارة مطابقة بالشروط الحالية.";
  }

  const signal = result.signal;
  const details = getReasonDetails(signal);
  return [
    `تم العثور على صفقة ${formatDirection(signal.direction)} على ${signal.symbol}`,
    `وقت الإشارة: ${signal.signal_time}`,
    `الدخول: ${signal.entry_price}`,
    `الهدف: ${signal.target_price ?? "-"}`,
    `وقف الخسارة: ${signal.stop_loss ?? "-"}`,
    `سبب الدخول: ${signal.analysis?.entry_reason ?? signal.notes ?? "-"}`,
    details ? "" : null,
    details || null,
  ].filter(Boolean).join("\n");
}

function renderTradeOverlays(trades) {
  clearChartOverlays();
  if (!trades.length) {
    renderActiveTrade(null);
    return;
  }

  const latestTrade = state.selectedTrade || trades[0];
  renderActiveTrade(latestTrade);
}

async function selectTrade(trade) {
  state.selectedTrade = trade;
  state.selectedTradeAnalysis = null;
  state.selectedTradeAnalysisFresh = false;
  renderTrades(await fetchDashboardTrades());
  renderActiveTrade(trade);
  try {
    const { period, interval } = getQueryParams();
    const params = new URLSearchParams({
      symbol: trade.symbol,
      signal_time: trade.signal_time,
      direction: trade.direction ?? "long",
      period,
      interval,
    });
    if (trade.entry_price != null) {
      params.set("entry_price", String(trade.entry_price));
    }
    const data = await fetchJson(`/api/trade-analysis?${params.toString()}`);
    state.selectedTradeAnalysis = data.signal;
    state.selectedTradeAnalysisFresh = true;
  } catch (error) {
    console.error(error);
    state.selectedTradeAnalysis = null;
    state.selectedTradeAnalysisFresh = true;
  }
  focusTradeOnChart(trade);
  scheduleRenderAnalysisOverlay();
}

function focusTradeOnChart(trade) {
  const interval = getQueryParams().interval;
  const timeKey = buildTimeKey(trade.signal_time, interval);
  const index = state.currentCandles.findIndex((item) => item.timeKey === timeKey);
  if (index < 0) {
    state.chart.timeScale().fitContent();
    return;
  }
  state.chart.timeScale().setVisibleLogicalRange({
    from: Math.max(index - 25, 0),
    to: Math.min(index + 15, state.currentCandles.length - 1),
  });
}

async function fetchDashboardTrades() {
  const { interval } = getQueryParams();
  const data = await fetchJson(`/api/dashboard?symbol=${state.selectedSymbol}&interval=${interval}`);
  state.dashboardTrades = data.trades || [];
  return data.trades;
}

function createOverlayElement(className, styles = {}) {
  const element = document.createElement("div");
  element.className = className;
  Object.entries(styles).forEach(([key, value]) => {
    element.style[key] = value;
  });
  return element;
}

function createHorizontalOverlayLine({ y, color, left = 0, right = null, label = null, className = "" }) {
  if (y == null) return;
  const lineRight = right ?? (chartContainer.clientWidth - 12);
  const width = Math.max(lineRight - left, 8);
  chartOverlay.appendChild(createOverlayElement(`analysis-hline ${className}`.trim(), {
    left: `${left}px`,
    width: `${width}px`,
    top: `${y}px`,
    borderTopColor: color,
  }));
}

function renderAnalysisOverlay() {
  clearAnalysisOverlay();
  const structure = state.marketStructure;
  if (!structure || !state.currentCandles.length) return;

  const interval = getQueryParams().interval;
  const chartWidth = chartContainer.clientWidth;
  const chartRight = chartWidth - 12;

  // Structure lines (BOS/CHOCH) hidden for cleaner chart

  // 2. Render Order ???s (Last 2 Long, Last 2 Short)
  (structure.signals || []).forEach((signal) => {
    const analysis = signal.analysis;
    const direction = signal.direction ?? "long";
    const obStart = buildTimeKey(analysis.order_block_start_time, interval);
    const x1Coordinate = findChartCoordinate(obStart);
    const yTop = state.candleSeries.priceToCoordinate(analysis.order_block_top);
    const yBottom = state.candleSeries.priceToCoordinate(analysis.order_block_bottom);

    if (x1Coordinate != null && yTop != null && yBottom != null) {
      const zoneLeft = Math.max(x1Coordinate, 0);
      const mitigationTime = findMitigationTime(
        direction === "short" ? analysis.order_block_top : analysis.order_block_bottom,
        direction,
        "zone",
        findCandleIndexByTime(obStart),
      );
      const mitigationX = mitigationTime ? findChartCoordinate(mitigationTime) : null;
      const zoneRight = mitigationX != null ? mitigationX : chartRight;
      const zoneWidth = Math.max(zoneRight - zoneLeft, 8);
      const zoneTop = Math.min(yTop, yBottom);
      const zoneHeight = Math.max(Math.abs(yBottom - yTop), 16);

      // Main Zone
      chartOverlay.appendChild(createOverlayElement(
        `analysis-zone ${direction === "short" ? "supply" : "demand"}`,
        {
          left: `${zoneLeft}px`,
          width: `${zoneWidth}px`,
          top: `${zoneTop}px`,
          height: `${zoneHeight}px`,
          opacity: "0.12",
        },
      ));

      // Edges
      chartOverlay.appendChild(createOverlayElement(
        `analysis-zone-edge ${direction === "short" ? "supply" : "demand"}`,
        { left: `${zoneLeft}px`, width: `${zoneWidth}px`, top: `${zoneTop}px` },
      ));
      chartOverlay.appendChild(createOverlayElement(
        `analysis-zone-edge ${direction === "short" ? "supply" : "demand"}`,
        { left: `${zoneLeft}px`, width: `${zoneWidth}px`, top: `${zoneTop + zoneHeight}px` },
      ));
    }
  });

  // 3. Render entry markers for the currently selected signal (if any)
  const activeSignal = getActiveOverlaySignal();
  if (activeSignal && activeSignal.signal_time) {
    const activeAnalysis = activeSignal.analysis || {};
    const entryTime = buildTimeKey(activeSignal.signal_time, interval);
    const entryCandle = findCandleByTimeKey(entryTime);
    const entryPrice = Number(activeSignal.entry_price ?? entryCandle?.close);
    const targetPrice = activeSignal.target_price != null ? Number(activeSignal.target_price) : null;
    const stopPrice = activeSignal.stop_loss != null ? Number(activeSignal.stop_loss) : null;
    const midpointPrice = activeAnalysis.midpoint != null ? Number(activeAnalysis.midpoint) : null;
    const retestTimeKey = activeAnalysis.retest_time ? buildTimeKey(activeAnalysis.retest_time, interval) : null;

    createHorizontalOverlayLine({
      y: state.candleSeries.priceToCoordinate(entryPrice),
      color: (activeSignal.direction ?? "long") === "short" ? "#ff3366" : "#00cc66",
      left: 0,
      right: chartRight,
      label: "الدخول",
      className: "entry",
    });
    createHorizontalOverlayLine({
      y: targetPrice != null ? state.candleSeries.priceToCoordinate(targetPrice) : null,
      color: "#7c9cff",
      left: 0,
      right: chartRight,
      label: "الهدف",
      className: "target",
    });
    createHorizontalOverlayLine({
      y: stopPrice != null ? state.candleSeries.priceToCoordinate(stopPrice) : null,
      color: "#f43f5e",
      left: 0,
      right: chartRight,
      label: "الوقف",
      className: "stop",
    });
    createHorizontalOverlayLine({
      y: midpointPrice != null ? state.candleSeries.priceToCoordinate(midpointPrice) : null,
      color: "#f59e0b",
      left: 0,
      right: chartRight,
      label: "EQ",
      className: "midpoint",
    });
    if (state.selectedTrade?.outcome && state.selectedTrade.outcome !== "open") {
      createHorizontalOverlayLine({
        y: state.selectedTrade.exit_price != null ? state.candleSeries.priceToCoordinate(Number(state.selectedTrade.exit_price)) : null,
        color: "#e5e7eb",
        left: 0,
        right: chartRight,
        label: "الخروج",
        className: "exit",
      });
    }

    // Retest dots removed per user request

    if (entryCandle) {
      const entryX = findChartCoordinate(entryTime);
      const entryY = state.candleSeries.priceToCoordinate(entryPrice);
      if (entryX != null && entryY != null) {
        chartOverlay.appendChild(createOverlayElement("analysis-entry-diamond", {
          left: `${Math.max(entryX - 7, 0)}px`,
          top: `${Math.max(entryY - 7, 0)}px`,
          borderColor: (activeSignal.direction ?? "long") === "short" ? "#ff3366" : "#00cc66",
        }));
      }
    }
  }
}

function renderActiveTrade(trade) {
  if (!trade) {
    activeTradeCard.className = "active-trade-card empty";
    activeTradeCard.innerHTML = `
      <div>
        <span>الصفقة الحالية</span>
        <strong>لا توجد صفقة معروضة</strong>
      </div>
    `;
    tradeReasonPanel.className = "trade-reason-panel empty";
    tradeReasonPanel.innerHTML = `
      <span>سبب الدخول</span>
      <strong>عند ظهور صفقة ستجد هنا شرحًا واضحًا: هل الدخول من أوردر بلوك، كسر هيكل، سيولة، أو عدم توازن.</strong>
    `;
    return;
  }

  activeTradeCard.className = "active-trade-card";
  activeTradeCard.innerHTML = `
    <div>
      <span>الاتجاه</span>
      <strong>${formatDirection(trade.direction)}</strong>
    </div>
    <div>
      <span>الدخول</span>
      <strong>${trade.entry_price ?? "-"}</strong>
    </div>
    <div>
      <span>الهدف</span>
      <strong>${trade.target_price ?? "-"}</strong>
    </div>
    <div>
      <span>وقف الخسارة</span>
      <strong>${trade.stop_loss ?? "-"}</strong>
    </div>
    <div>
      <span>الحالة</span>
      <strong>${formatOutcome(trade.outcome)}</strong>
    </div>
  `;

  tradeReasonPanel.className = "trade-reason-panel";
  const reasonItems = getTradeReasonList(trade);
  tradeReasonPanel.innerHTML = `
    <span>سبب الدخول</span>
    <strong>${getTradeReasonText(trade)}</strong>
    ${reasonItems.length ? `<ul class="trade-reason-list">${reasonItems.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
  `;
}

function renderSummary(summary) {
  document.getElementById("open-signals").textContent = summary.open_signals;
  document.getElementById("total-trades").textContent = summary.total_trades;
  document.getElementById("win-rate").textContent = `${summary.win_rate}%`;
  document.getElementById("profit-factor").textContent = summary.profit_factor ?? "غير محدود";
  document.getElementById("net-profit").textContent = summary.net_profit;
  const equityCurve = (summary.equity_curve || []).map((point) => ({
    time: point.time.slice(0, 10),
    value: point.equity,
  }));
  state.equitySeries.setData(equityCurve);
  state.equityChart.timeScale().fitContent();
}

async function loadDashboard(token = null) {
  const requestedSymbol = state.selectedSymbol;
  const { interval } = getQueryParams();
  const data = await fetchJson(`/api/dashboard?symbol=${requestedSymbol}&interval=${interval}`);
  if ((token !== null && token !== state.selectionToken) || requestedSymbol !== state.selectedSymbol) return;
  renderSummary(data.summary);
  state.dashboardTrades = data.trades || [];
  const deepLinkTrade = findMatchingTrade(data.trades);
  if (deepLinkTrade) {
    state.deepLinkTrade.applied = true;
    state.selectedTrade = deepLinkTrade;
  }
  if (!state.selectedTrade && data.trades.length) {
    state.selectedTrade = data.trades[0];
    state.selectedTradeAnalysis = null;
    state.selectedTradeAnalysisFresh = false;
  }
  renderTrades(data.trades);
  renderTradeOverlays(data.trades);
  if (state.selectedTrade) {
    await selectTrade(state.selectedTrade);
  }
  await refreshAdminPanels();
}

async function refreshScannerStatus() {
  try {
    const data = await fetchJson("/api/scanner/status");
    const scanners = data.scanners || {};
    const activeItems = Object.values(scanners);
    const inProgressItem = activeItems.find((item) => item.scan_in_progress) || activeItems[0] || {};
    const progress = inProgressItem.current_scan_progress_pct ?? 0;
    const completed = inProgressItem.current_scan_completed_count ?? 0;
    const total = inProgressItem.current_scan_total_count || inProgressItem.last_scan_symbol_count || 0;
    const runningCount = activeItems.filter((item) => item.running).length;
    const intervalMinutes = inProgressItem.interval_seconds ? Math.round(inProgressItem.interval_seconds / 60) : 0;
    document.getElementById("scanner-progress").textContent = `${progress}%`;
    document.getElementById("scanner-started-at").textContent = formatDateTime(inProgressItem.current_scan_started_at || inProgressItem.last_scan_started_at);
    document.getElementById("scanner-count").textContent = `${completed} / ${total}`;
    document.getElementById("scanner-duration").textContent = inProgressItem.scan_in_progress
      ? formatSeconds(inProgressItem.current_scan_elapsed_seconds)
      : formatSeconds(inProgressItem.last_scan_duration_seconds);
    statusText.textContent = runningCount
      ? `السكانر يعمل الآن على ${runningCount} فريم ويفحص كل ${intervalMinutes} دقيقة.`
      : "السكانر متوقف حالياً.";
    if (runningCount) {
      statusText.textContent = inProgressItem.scan_in_progress
        ? `تقدم آخر فحص: ${progress}% (${completed} / ${total}).`
        : `السكانر يعمل على ${runningCount} فريم. آخر فحص استغرق ${formatSeconds(inProgressItem.last_scan_duration_seconds)}.`;
    }
    await refreshAdminPanels();
    setTimeout(refreshScannerStatus, inProgressItem.scan_in_progress ? 5000 : 30000);
  } catch (error) {
    console.error(error);
    setTimeout(refreshScannerStatus, 60000);
  }
}

function renderExperimentalStatus() {
  if (!experimentalLabel) return;
  if (!state.experimentalEnabled) {
    experimentalLabel.textContent = "غير مفعلة";
    return;
  }
  const signal = state.experimentalAnalysis?.signal;
  experimentalLabel.textContent = signal
    ? `إشارة تجريبية: ${formatDirection(signal.direction)} | دخول ${signal.entry_price ?? "-"}`
    : "مفعلة: لا توجد إشارة تجريبية على هذا السهم";
}

async function loadAnalysis(token = null) {
  if (!state.selectedSymbol) return;
  const { period, interval } = getQueryParams();
  const requestedSymbol = state.selectedSymbol;
  const params = new URLSearchParams({ period, interval });
  const replayTimestamp = getReplayTimestamp();
  if (replayTimestamp) {
    params.set("replay_to", replayTimestamp);
  }
  state.marketStructure = await fetchJson(`/api/market-structure/${requestedSymbol}?${params.toString()}`);
  if (state.experimentalEnabled) {
    state.experimentalAnalysis = await fetchJson(`/api/experimental-analysis/${requestedSymbol}?${params.toString()}`);
  } else {
    state.experimentalAnalysis = null;
  }
  if ((token !== null && token !== state.selectionToken) || requestedSymbol !== state.selectedSymbol) return;
  renderExperimentalStatus();

  if (state.marketStructure.signals && state.marketStructure.signals.length > 0) {
    state.currentAnalysis = { signal: state.marketStructure.signals[0] };
  } else {
    state.currentAnalysis = null;
  }

  if (!state.selectedTrade) {
    state.selectedTradeAnalysis = null;
    state.selectedTradeAnalysisFresh = false;
  }
  scheduleRenderAnalysisOverlay();
}

async function scanSelectedSymbol() {
  if (!state.selectedSymbol) return;
  const { period, interval } = getQueryParams();
  signalOutput.textContent = "جارٍ فحص السهم...";
  try {
    const data = await fetchJson(`/api/scan/${state.selectedSymbol}?period=${period}&interval=${interval}`, {
      method: "POST",
    });
    signalOutput.textContent = renderSignalSummary(data, "scan");
    await selectSymbol(state.selectedSymbol);
  } catch (error) {
    signalOutput.textContent = error.message;
  }
}

async function backtestSelectedSymbol() {
  if (!state.selectedSymbol) return;
  const { period, interval } = getQueryParams();
  signalOutput.textContent = "جارٍ تشغيل الاختبار الخلفي...";
  try {
    const data = await fetchJson(`/api/backtest/${state.selectedSymbol}?period=${period}&interval=${interval}`, {
      method: "POST",
    });
    signalOutput.textContent = renderSignalSummary(data, "backtest");
    await selectSymbol(state.selectedSymbol);
  } catch (error) {
    signalOutput.textContent = error.message;
  }
}

async function loadWeeklySummary() {
  const { interval } = getQueryParams();
  signalOutput.textContent = "جارٍ تحميل ملخص الأسبوع...";
  try {
    const data = await fetchJson(`/api/weekly-summary?interval=${interval}`);
    const summary = data.summary || {};
    const closedTrades = (data.trades || []).filter((trade) => ["win", "loss"].includes(trade.outcome));
    const topLines = closedTrades
      .slice(0, 10)
      .map((trade) => `${trade.symbol} | ${formatOutcome(trade.outcome)} | الربح ${formatNumber(trade.pnl, 4)} | ${trade.signal_time}`)
      .join("\n");

    signalOutput.textContent = [
      `ملخص صفقات الأسبوع | ${data.week_start} إلى ${data.week_end} | ${data.interval}`,
      `إجمالي الإشارات: ${summary.total_signals ?? 0}`,
      `الصفقات المغلقة: ${summary.closed_trades ?? 0}`,
      `الصفقات المفتوحة: ${summary.open_signals ?? 0}`,
      `الرابحة: ${summary.wins ?? 0}`,
      `الخاسرة: ${summary.losses ?? 0}`,
      `نسبة النجاح: ${summary.win_rate ?? 0}%`,
      `صافي الربح: ${formatNumber(summary.net_profit, 4)}`,
      `معامل الربح: ${summary.profit_factor ?? "-"}`,
      `متوسط الربح / الخسارة: ${formatNumber(summary.avg_win, 4)} / ${formatNumber(summary.avg_loss, 4)}`,
      topLines ? "" : null,
      topLines || null,
    ].filter(Boolean).join("\n");
  } catch (error) {
    signalOutput.textContent = error.message;
  }
}

function renderTrades(trades) {
  tradeLogBody.innerHTML = "";
  const visibleTrades = filteredTrades(trades);
  visibleTrades.forEach((trade) => {
    const row = document.createElement("tr");
    const statusClass = trade.outcome === "win" ? "status-win" : trade.outcome === "loss" ? "status-loss" : "";
    const entryReason = getTradeReasonText(trade);
    const isSelectedTrade = state.selectedTrade
      && state.selectedTrade.symbol === trade.symbol
      && state.selectedTrade.signal_time === trade.signal_time
      && (state.selectedTrade.direction ?? "long") === (trade.direction ?? "long")
      && Number(state.selectedTrade.entry_price) === Number(trade.entry_price);
    row.className = isSelectedTrade ? "trade-row active" : "trade-row";
    row.innerHTML = `
      <td>${trade.symbol}</td>
      <td>${trade.signal_time}</td>
      <td>${formatDirection(trade.direction)}</td>
      <td>${formatNumber(trade.alert_price, 4)}</td>
      <td>${formatNumber(trade.entry_price, 4)}</td>
      <td>${formatNumber(trade.current_price, 4)}</td>
      <td>${trade.target_price != null ? formatNumber(trade.target_price, 4) : "-"}</td>
      <td>${trade.stop_loss != null ? formatNumber(trade.stop_loss, 4) : "-"}</td>
      <td class="${statusClass}">${formatOutcome(trade.outcome)}</td>
      <td>${formatNumber(trade.pnl, 4)}</td>
      <td>${formatNumber(trade.current_pnl, 4)} (${formatNumber(trade.current_return_pct, 2)}%)</td>
      <td>${formatNumber(trade.max_favorable_excursion, 4)}</td>
      <td>${formatNumber(trade.max_adverse_excursion, 4)}</td>
      <td class="reason-cell">${entryReason}</td>
    `;
    row.addEventListener("click", () => selectTrade(trade));
    tradeLogBody.appendChild(row);
  });
  if (!visibleTrades.length) {
    tradeLogBody.innerHTML = '<tr><td colspan="14">لا توجد صفقات مطابقة للفلاتر الحالية.</td></tr>';
  }
}

function renderActiveTrade(trade) {
  if (!trade) {
    activeTradeCard.className = "active-trade-card empty";
    activeTradeCard.innerHTML = `
      <div>
        <span>الصفقة الحالية</span>
        <strong>لا توجد صفقة معروضة</strong>
      </div>
    `;
    tradeReasonPanel.className = "trade-reason-panel empty";
    tradeReasonPanel.innerHTML = `
      <span>سبب الدخول</span>
      <strong>عند ظهور صفقة ستجد هنا شرحًا واضحًا: هل الدخول من أوردر بلوك، كسر هيكل، سيولة، أو عدم توازن.</strong>
    `;
    return;
  }

  activeTradeCard.className = "active-trade-card";
  activeTradeCard.innerHTML = `
    <div>
      <span>الاتجاه</span>
      <strong>${formatDirection(trade.direction)}</strong>
    </div>
    <div>
      <span>سعر التنبيه</span>
      <strong>${trade.alert_price != null ? formatNumber(trade.alert_price, 4) : "-"}</strong>
    </div>
    <div>
      <span>الدخول</span>
      <strong>${trade.entry_price != null ? formatNumber(trade.entry_price, 4) : "-"}</strong>
    </div>
    <div>
      <span>السعر الحالي</span>
      <strong>${trade.current_price != null ? formatNumber(trade.current_price, 4) : "-"}</strong>
    </div>
    <div>
      <span>الهدف</span>
      <strong>${trade.target_price != null ? formatNumber(trade.target_price, 4) : "-"}</strong>
    </div>
    <div>
      <span>وقف الخسارة</span>
      <strong>${trade.stop_loss != null ? formatNumber(trade.stop_loss, 4) : "-"}</strong>
    </div>
    <div>
      <span>الحالة</span>
      <strong>${formatOutcome(trade.outcome)}</strong>
    </div>
    <div>
      <span>الأداء الحالي</span>
      <strong>${formatNumber(trade.current_pnl, 4)} / ${formatNumber(trade.current_return_pct, 2)}%</strong>
    </div>
    <div>
      <span>أفضل حركة / أسوأ حركة</span>
      <strong>${formatNumber(trade.max_favorable_excursion, 4)} / ${formatNumber(trade.max_adverse_excursion, 4)}</strong>
    </div>
  `;

  tradeReasonPanel.className = "trade-reason-panel";
  const reasonItems = getTradeReasonList(trade);
  tradeReasonPanel.innerHTML = `
    <span>سبب الدخول</span>
    <strong>${getTradeReasonText(trade)}</strong>
    ${reasonItems.length ? `<ul class="trade-reason-list">${reasonItems.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
  `;
}

function renderSummary(summary) {
  document.getElementById("open-signals").textContent = summary.open_signals;
  document.getElementById("total-trades").textContent = summary.total_trades;
  document.getElementById("win-rate").textContent = `${summary.win_rate}%`;
  document.getElementById("profit-factor").textContent = summary.profit_factor ?? "غير محدود";
  document.getElementById("net-profit").textContent = formatNumber(summary.net_profit, 2);
  document.getElementById("current-open-pnl").textContent = formatNumber(summary.current_open_pnl, 2);
  document.getElementById("expectancy").textContent = formatNumber(summary.expectancy, 2);
  document.getElementById("avg-win-loss").textContent = `${formatNumber(summary.avg_win, 2)} / ${formatNumber(summary.avg_loss, 2)}`;
  document.getElementById("total-signals").textContent = summary.total_signals;
  document.getElementById("closed-trades").textContent = summary.closed_trades;
  document.getElementById("wins-losses").textContent = `${summary.wins} / ${summary.losses}`;
  document.getElementById("best-trade").textContent = formatNumber(summary.best_trade, 2);
  document.getElementById("worst-trade").textContent = formatNumber(summary.worst_trade, 2);
  document.getElementById("avg-current-return-pct").textContent = `${formatNumber(summary.avg_current_return_pct, 2)}%`;
  document.getElementById("avg-mfe").textContent = formatNumber(summary.avg_mfe, 4);
  document.getElementById("avg-mae").textContent = formatNumber(summary.avg_mae, 4);
  const equityCurve = (summary.equity_curve || []).map((point) => ({
    time: point.time.slice(0, 10),
    value: point.equity,
  }));
  state.equitySeries.setData(equityCurve);
  state.equityChart.timeScale().fitContent();
}

function renderAnalysisOverlay() {
  clearAnalysisOverlay();
  if (!state.currentCandles.length) return;

  const interval = getQueryParams().interval;
  const chartRight = chartContainer.clientWidth - 12;
  const activeSignal = getActiveOverlaySignal();
  if (!activeSignal || !activeSignal.signal_time) return;

  const activeAnalysis = activeSignal.analysis || {};
  const direction = activeSignal.direction ?? "long";
  const entryTime = buildTimeKey(activeSignal.signal_time, interval);
  const entryCandle = findCandleByTimeKey(entryTime);
  const entryPrice = Number(activeSignal.entry_price ?? entryCandle?.close);
  const obStart = activeAnalysis.order_block_start_time ? buildTimeKey(activeAnalysis.order_block_start_time, interval) : entryTime;
  const obTop = activeAnalysis.order_block_top != null ? Number(activeAnalysis.order_block_top) : null;
  const obBottom = activeAnalysis.order_block_bottom != null ? Number(activeAnalysis.order_block_bottom) : null;
  const x1Coordinate = findChartCoordinate(obStart);
  const yTop = obTop != null ? state.candleSeries.priceToCoordinate(obTop) : null;
  const yBottom = obBottom != null ? state.candleSeries.priceToCoordinate(obBottom) : null;

  if (x1Coordinate != null && yTop != null && yBottom != null) {
    const zoneLeft = Math.max(x1Coordinate, 0);
    const completionTime = findSignalCompletionTime(activeSignal);
    const mitigationTime = findMitigationTime(
      direction === "short" ? obTop : obBottom,
      direction,
      "zone",
      findCandleIndexByTime(obStart),
    );
    const mitigationX = mitigationTime ? findChartCoordinate(mitigationTime) : null;
    const zoneRight = mitigationX != null ? mitigationX : chartRight;
    const zoneWidth = Math.max(zoneRight - zoneLeft, 8);
    const zoneTop = Math.min(yTop, yBottom);
    const zoneHeight = Math.max(Math.abs(yBottom - yTop), 16);

    chartOverlay.appendChild(createOverlayElement("analysis-zone active-trade-zone", {
      left: `${zoneLeft}px`,
      width: `${zoneWidth}px`,
      top: `${zoneTop}px`,
      height: `${zoneHeight}px`,
    }));
    chartOverlay.appendChild(createOverlayElement("analysis-zone-edge active-trade-zone", {
      left: `${zoneLeft}px`,
      width: `${zoneWidth}px`,
      top: `${zoneTop}px`,
    }));
    chartOverlay.appendChild(createOverlayElement("analysis-zone-edge active-trade-zone", {
      left: `${zoneLeft}px`,
      width: `${zoneWidth}px`,
      top: `${zoneTop + zoneHeight}px`,
    }));
  }

  // Draw Broken Opposing Zone (Page 44 SnD PDF)
  if (activeAnalysis.opposing_zone) {
    const oz = activeAnalysis.opposing_zone;
    const ozTime = buildTimeKey(oz.timestamp, interval);
    const ozX = findChartCoordinate(ozTime);
    const ozY = state.candleSeries.priceToCoordinate(Number(oz.level));

    if (ozX != null && ozY != null) {
      const bosTime = buildTimeKey(activeAnalysis.bos_time, interval);
      const bosX = findChartCoordinate(bosTime);
      const ozLeft = Math.max(ozX - 40, 0);
      const ozRight = bosX != null ? bosX : chartRight;
      const ozWidth = Math.max(ozRight - ozLeft, 40);
      const ozHeight = 24;
      const ozTop = ozY - (oz.kind === 'supply' ? 0 : ozHeight);

      chartOverlay.appendChild(createOverlayElement("analysis-zone broken-opposing", {
        left: `${ozLeft}px`,
        width: `${ozWidth}px`,
        top: `${ozTop}px`,
        height: `${ozHeight}px`,
      }));

      // Center the label in the broken zone
      const labelX = ozLeft + (ozWidth / 2) - 40;
      const labelY = ozTop + (ozHeight / 2) - 10;
      createOverlayLabel(`Broken ${oz.kind}`, labelX, labelY, "zone-tag broken-tag transparent-tag");
    }
  }

  // Draw Broken Trend Line (Page 33 SnD PDF)
  if (activeAnalysis.broken_trend) {
    const bt = activeAnalysis.broken_trend;
    const t1Time = buildTimeKey(bt.time1, interval);
    const t2Time = buildTimeKey(bt.time2, interval);
    const x1 = findChartCoordinate(t1Time);
    const x2 = findChartCoordinate(t2Time);
    const breakX = bt.break_time ? findChartCoordinate(buildTimeKey(bt.break_time, interval)) : null;
    const y1 = state.candleSeries.priceToCoordinate(Number(bt.y1));
    const y2 = state.candleSeries.priceToCoordinate(Number(bt.y2));

    if (x1 != null && x2 != null && y1 != null && y2 != null) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const slope = dy / dx;

      const lineEndX = breakX != null ? breakX : chartRight;
      const lineEndY = y1 + slope * (lineEndX - x1);

      const length = Math.sqrt(Math.pow(lineEndX - x1, 2) + Math.pow(lineEndY - y1, 2));
      const angle = Math.atan2(lineEndY - y1, lineEndX - x1) * (180 / Math.PI);

      const trendLine = createOverlayElement("analysis-structure-line broken-trend", {
        left: `${x1}px`,
        top: `${y1}px`,
        width: `${length}px`,
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 0"
      });
      chartOverlay.appendChild(trendLine);
    }
  }

  if (entryCandle) {
    // Visual indicators for entry point removed per user request
  }
}

function createOverlayLabel(text, x, y, className = "") {
  if (x == null || y == null) return;
  const label = createOverlayElement(`analysis-label-clean ${className}`.trim(), {
    left: `${Math.max(x, 0)}px`,
    top: `${Math.max(y, 0)}px`,
  });
  label.textContent = text;
  chartOverlay.appendChild(label);
}

function getSvgOverlay() {
  let svg = chartOverlay.querySelector(".chart-svg-overlay");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "chart-svg-overlay");
    chartOverlay.appendChild(svg);
  }
  return svg;
}

function clearSvgOverlay() {
  const svg = chartOverlay.querySelector(".chart-svg-overlay");
  if (svg) svg.innerHTML = "";
}

function drawBrokenTrendLine(trendline, interval) {
  if (!trendline || !trendline.time1 || !trendline.time2) return;
  const x1 = findChartCoordinate(buildTimeKey(trendline.time1, interval));
  const x2 = findChartCoordinate(buildTimeKey(trendline.time2, interval));
  const y1 = state.candleSeries.priceToCoordinate(trendline.y1);
  const y2 = state.candleSeries.priceToCoordinate(trendline.y2);

  if (x1 != null && x2 != null && y1 != null && y2 != null) {
    const svg = getSvgOverlay();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("class", "broken-trendline");
    svg.appendChild(line);

    // Project the line to the right
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx > 5) {
      const x3 = chartContainer.clientWidth;
      const y3 = y2 + (dy / dx) * (x3 - x2);
      if (y3 >= -1000 && y3 <= 3000) {
        const projection = document.createElementNS("http://www.w3.org/2000/svg", "line");
        projection.setAttribute("x1", x2);
        projection.setAttribute("y1", y2);
        projection.setAttribute("x2", x3);
        projection.setAttribute("y2", y3);
        projection.setAttribute("class", "broken-trendline");
        projection.setAttribute("stroke-dasharray", "2, 4");
        svg.appendChild(projection);
      }
    }
  }
}

function drawBookTrendLine(trendline, interval) {
  if (!trendline || !trendline.time1 || !trendline.time2) return;
  const x1 = findChartCoordinate(buildTimeKey(trendline.time1, interval));
  const x2 = findChartCoordinate(buildTimeKey(trendline.time2, interval));
  const breakX = trendline.break_time ? findChartCoordinate(buildTimeKey(trendline.break_time, interval)) : null;
  const y1 = state.candleSeries.priceToCoordinate(Number(trendline.y1));
  const y2 = state.candleSeries.priceToCoordinate(Number(trendline.y2));
  if (x1 == null || x2 == null || y1 == null || y2 == null) return;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const renderRight = breakX != null ? breakX : x2;
  const renderY = Math.abs(dx) > 5 ? y2 + (dy / dx) * (renderRight - x2) : y2;

  const svg = getSvgOverlay();
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", renderRight);
  line.setAttribute("y2", renderY);
  line.setAttribute("class", `book-trendline ${trendline.kind || "up"} ${trendline.broken ? "broken" : "active"}`);
  svg.appendChild(line);

  const trendLabel = trendline.kind === "down" ? "\u062a\u0631\u0646\u062f \u0647\u0627\u0628\u0637" : "\u062a\u0631\u0646\u062f \u0635\u0627\u0639\u062f";
  createOverlayLabel(
    trendLabel,
    Math.min(Math.max(x2 + 8, 0), Math.max(chartContainer.clientWidth - 104, 0)),
    Math.max(y2 - 22, 0),
    `trend-tag ${trendline.kind === "down" ? "down" : "up"}`,
  );

  if (breakX != null) {
    createOverlayLabel(
      "\u0643\u0633\u0631 \u0643\u0627\u0645\u0644",
      Math.min(Math.max(breakX + 8, 0), Math.max(chartContainer.clientWidth - 104, 0)),
      Math.max(renderY - 22, 0),
      "trend-tag break",
    );
  }

  if (!trendline.broken && Math.abs(dx) > 5) {
    const x3 = chartContainer.clientWidth - 12;
    const y3 = y2 + (dy / dx) * (x3 - x2);
    if (y3 >= -1000 && y3 <= 3000) {
      const projection = document.createElementNS("http://www.w3.org/2000/svg", "line");
      projection.setAttribute("x1", x2);
      projection.setAttribute("y1", y2);
      projection.setAttribute("x2", x3);
      projection.setAttribute("y2", y3);
      projection.setAttribute("class", `book-trendline ${trendline.kind || "up"} projected ${trendline.broken ? "broken" : "active"}`);
      svg.appendChild(projection);
    }
  }

}

function drawBookPivot(pivot, interval) {
  if (!pivot || pivot.price == null || !pivot.timestamp) return;
  const x = findChartCoordinate(buildTimeKey(pivot.timestamp, interval));
  const y = state.candleSeries.priceToCoordinate(Number(pivot.price));
  if (x == null || y == null) return;
  chartOverlay.appendChild(createOverlayElement(`book-pivot ${pivot.kind === "high" ? "high" : "low"}`, {
    left: `${Math.max(x - 4, 0)}px`,
    top: `${Math.max(y - 4, 0)}px`,
  }));
}

function drawBrokenOpposingZone(zone, interval) {
  if (!zone || !zone.timestamp || zone.level == null) return;
  const x1 = findChartCoordinate(buildTimeKey(zone.timestamp, interval));
  const y = state.candleSeries.priceToCoordinate(zone.level);
  const x2 = chartContainer.clientWidth;

  if (x1 != null && y != null) {
    const svg = getSvgOverlay();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y);
    line.setAttribute("class", "broken-trendline");
    line.setAttribute("stroke", "#ff3366");
    svg.appendChild(line);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", x1 + 5);
    label.setAttribute("y", y - 5);
    label.setAttribute("fill", "#ff3366");
    label.setAttribute("font-size", "10px");
    label.textContent = `مكسورة: ${zone.kind === 'supply' ? 'عرض' : 'طلب'}`;
    svg.appendChild(label);
  }
}

function drawOverlayFibZone({ left, right, top, bottom, topPrice, bottomPrice, className, label }) {
  if ([left, right, top, bottom].some((value) => value == null)) return;
  const zoneLeft = Math.max(Math.min(left, right), 0);
  const zoneRight = Math.min(Math.max(left, right), chartContainer.clientWidth - 12);
  const zoneWidth = Math.max(zoneRight - zoneLeft, 8);
  const topY = Math.min(top, bottom);
  const bottomY = Math.max(top, bottom);
  chartOverlay.appendChild(createOverlayElement(`analysis-fib-line ${className}`.trim(), {
    left: `${zoneLeft}px`,
    width: `${zoneWidth}px`,
    top: `${topY}px`,
  }));
  chartOverlay.appendChild(createOverlayElement(`analysis-fib-line ${className}`.trim(), {
    left: `${zoneLeft}px`,
    width: `${zoneWidth}px`,
    top: `${bottomY}px`,
  }));
  createOverlayLabel(formatNumber(topPrice, 4), Math.max(zoneRight - 64, zoneLeft + 8), topY - 10, "fib");
  createOverlayLabel(formatNumber(bottomPrice, 4), Math.max(zoneRight - 64, zoneLeft + 8), bottomY - 10, "fib");
  if (label) {
    createOverlayLabel(label, zoneLeft + 8, topY + 6, "zone-tag");
  }
}

function findSignalCompletionTime(signal) {
  if (!signal?.signal_time) return null;
  const interval = getQueryParams().interval;
  const signalTime = buildTimeKey(signal.signal_time, interval);
  const startIndex = findCandleIndexByTime(signalTime);
  if (startIndex < 0) return null;
  const direction = signal.direction ?? "long";
  const targetPrice = signal.target_price != null ? Number(signal.target_price) : null;
  const stopPrice = signal.stop_loss != null ? Number(signal.stop_loss) : null;
  const analysis = signal.analysis || {};
  const zoneTop = analysis.order_block_top != null ? Number(analysis.order_block_top) : null;
  const zoneBottom = analysis.order_block_bottom != null ? Number(analysis.order_block_bottom) : null;

  for (let index = startIndex + 1; index < state.currentCandles.length; index += 1) {
    const candle = state.currentCandles[index];
    if (direction === "long") {
      if (targetPrice != null && Number(candle.high) >= targetPrice) return candle.timeKey;
      if ((zoneBottom != null && Number(candle.close) < zoneBottom) || (stopPrice != null && Number(candle.close) <= stopPrice)) return candle.timeKey;
    } else {
      if (targetPrice != null && Number(candle.low) <= targetPrice) return candle.timeKey;
      if ((zoneTop != null && Number(candle.close) > zoneTop) || (stopPrice != null && Number(candle.close) >= stopPrice)) return candle.timeKey;
    }
  }
  return null;
}

function findSignalForZone(zone, structure) {
  return (structure?.signals || []).find((signal) => {
    const analysis = signal.analysis || {};
    return (signal.direction ?? "long") === (zone.direction ?? "long")
      && String(analysis.order_block_start_time || "") === String(zone.start_time || zone.order_block_start_time || "")
      && Number(analysis.order_block_top) === Number(zone.top ?? zone.order_block_top)
      && Number(analysis.order_block_bottom) === Number(zone.bottom ?? zone.order_block_bottom);
  }) || null;
}

function timeKeyFromAnalysisIndex(index) {
  if (index == null) return null;
  return state.currentCandles[Number(index)]?.timeKey ?? state.allCandles[Number(index)]?.timeKey ?? null;
}

function findPivotBreakTime(pivot) {
  const pivotTime = buildTimeKey(pivot.timestamp, getQueryParams().interval);
  const startIndex = state.currentCandles.findIndex((item) => item.timeKey === pivotTime);
  if (startIndex < 0) return null;
  const level = Number(pivot.price);
  for (let index = startIndex + 1; index < state.currentCandles.length; index += 1) {
    const candle = state.currentCandles[index];
    if (pivot.kind === "high" && Number(candle.close) > level) return candle.timeKey;
    if (pivot.kind === "low" && Number(candle.close) < level) return candle.timeKey;
  }
  return null;
}

function drawSmcSignal(signal, { active = false, experimental = false } = {}) {
  if (!signal) return;
  const interval = getQueryParams().interval;
  const analysis = signal.analysis || {};
  const direction = signal.direction ?? "long";
  const chartRight = chartContainer.clientWidth - 12;
  const obStart = analysis.order_block_start_time ? buildTimeKey(analysis.order_block_start_time, interval) : null;
  const obX = obStart ? findChartCoordinate(obStart) : null;
  const obTopY = analysis.order_block_top != null ? state.candleSeries.priceToCoordinate(Number(analysis.order_block_top)) : null;
  const obBottomY = analysis.order_block_bottom != null ? state.candleSeries.priceToCoordinate(Number(analysis.order_block_bottom)) : null;
  const completionTime = findSignalCompletionTime(signal);

  if (obX != null && obTopY != null && obBottomY != null) {
    const mitigationTime = findMitigationTime(
      direction === "short" ? Number(analysis.order_block_top) : Number(analysis.order_block_bottom),
      direction,
      "zone",
      findCandleIndexByTime(obStart),
    );
    const zoneRight = findChartCoordinate(completionTime || mitigationTime) ?? chartRight;
    drawOverlayFibZone({
      left: obX,
      right: zoneRight,
      top: obTopY,
      bottom: obBottomY,
      topPrice: Number(analysis.order_block_top),
      bottomPrice: Number(analysis.order_block_bottom),
      className: `${direction === "short" ? "supply" : "demand"} ${experimental ? "experimental-zone" : ""} ${active ? "active-trade-zone" : "faded-zone"}`,
      label: experimental ? "تجريبي" : null,
    });
  }

  // Draw broken technical evidence
  if (active) {
    if (analysis.opposing_zone) {
      drawBrokenOpposingZone(analysis.opposing_zone, interval);
    }
  }

  // Retest dots removed per user request

  const entryTime = buildTimeKey(signal.signal_time, interval);
  const entryX = findChartCoordinate(entryTime);
  const entryY = signal.entry_price != null ? state.candleSeries.priceToCoordinate(Number(signal.entry_price)) : null;
  if (entryX != null && entryY != null) {
    // Trade circles removed per user request
    if (active || experimental) {
      const tag = createOverlayElement(`analysis-trade-tag ${sideClass} ${experimental ? "experimental" : ""}`.trim(), {
        left: `${Math.max(entryX + 14, 0)}px`,
        top: `${Math.max(entryY - 13, 0)}px`,
      });
      tag.textContent = direction === "short" ? "بيع" : "شراء";
      chartOverlay.appendChild(tag);
    }
  }

  const sweepTimeKey = timeKeyFromAnalysisIndex(analysis.liquidity_sweep_index);
  const sweepX = sweepTimeKey ? findChartCoordinate(sweepTimeKey) : null;
  const sweepCandle = sweepTimeKey ? findCandleByTimeKey(sweepTimeKey) : null;
  const sweepPrice = sweepCandle ? (direction === "long" ? sweepCandle.low : sweepCandle.high) : null;
  const sweepY = sweepPrice != null ? state.candleSeries.priceToCoordinate(sweepPrice) : null;
  if (sweepX != null && sweepY != null) {
    chartOverlay.appendChild(createOverlayElement("analysis-liquidity-marker", {
      left: `${Math.max(sweepX - 8, 0)}px`,
      top: `${Math.max(sweepY - 8, 0)}px`,
    }));
  }
}

function drawSdHistoricalZone(zone) {
  if (!zone) return;
  const interval = getQueryParams().interval;
  const direction = zone.direction || "long";
  const matchingSignal = findSignalForZone(zone, state.marketStructure);
  const startTime = zone.start_time || zone.order_block_start_time || zone.departure_time;
  if (!startTime) return;
  const startX = findChartCoordinate(buildTimeKey(startTime, interval));
  const topY = state.candleSeries.priceToCoordinate(Number(zone.top ?? zone.order_block_top));
  const bottomY = state.candleSeries.priceToCoordinate(Number(zone.bottom ?? zone.order_block_bottom));
  if (startX == null || topY == null || bottomY == null) return;

  let label = direction === "long" ? "طلب سابق" : "عرض سابق";
  if (zone.inherited_zone) label = direction === "long" ? "منطقة طلب وارثة" : "منطقة عرض وارثة";
  const decision = zone.decision || {};
  const fixedEndTime = zone.invalidated_time || (!decision.allowed ? (zone.first_touch_time || zone.departure_time || zone.end_time) : null);
  const signalEndTime = matchingSignal ? findSignalCompletionTime(matchingSignal) : null;
  const rightTime = fixedEndTime || signalEndTime;
  const rightX = rightTime ? findChartCoordinate(buildTimeKey(rightTime, interval)) : null;
  const extendRight = decision.allowed && !zone.invalidated && !rightTime;

  drawOverlayFibZone({
    left: startX,
    right: rightX ?? (extendRight ? (chartContainer.clientWidth - 12) : startX + 32),
    top: topY,
    bottom: bottomY,
    topPrice: Number(zone.top ?? zone.order_block_top),
    bottomPrice: Number(zone.bottom ?? zone.order_block_bottom),
    className: `${direction === "short" ? "supply" : "demand"} historical-zone ${zone.inherited_zone ? "inherited-zone" : ""}`,
    label: label,
  });


}

function renderAnalysisOverlay() {
  clearAnalysisOverlay();
  if (!state.currentCandles.length) return;

  const chartRight = chartContainer.clientWidth - 12;
  const structure = state.marketStructure;
  const interval = getQueryParams().interval;

  (structure?.trendlines || []).forEach((trendline) => drawBookTrendLine(trendline, interval));
  (structure?.pivots || []).slice(-24).forEach((pivot) => drawBookPivot(pivot, interval));

  (structure?.zones || []).forEach((zone) => drawSdHistoricalZone(zone));


  (structure?.signals || []).forEach((signal) => drawSmcSignal(signal, { active: false }));

  const experimentalSignal = getExperimentalOverlaySignal();
  if (experimentalSignal?.signal_time) {
    drawSmcSignal(experimentalSignal, { experimental: true });
  }

  const activeSignal = getActiveOverlaySignal();
  if (!activeSignal || !activeSignal.signal_time) return;
  drawSmcSignal(activeSignal, { active: true });

  const activeAnalysis = activeSignal.analysis || {};
  const direction = activeSignal.direction ?? "long";
  const entryPrice = Number(activeSignal.entry_price);
  const midpointPrice = activeAnalysis.midpoint != null ? Number(activeAnalysis.midpoint) : null;

  createHorizontalOverlayLine({
    y: state.candleSeries.priceToCoordinate(entryPrice),
    color: direction === "short" ? "#ff3366" : "#00cc66",
    left: 0,
    right: chartRight,
    label: "الدخول",
    className: "entry",
  });
  createHorizontalOverlayLine({
    y: midpointPrice != null ? state.candleSeries.priceToCoordinate(midpointPrice) : null,
    color: "#f59e0b",
    left: 0,
    right: chartRight,
    label: "EQ 50%",
    className: "midpoint",
  });
}

function metricClass(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric === 0) return "";
  return numeric > 0 ? "metric-positive" : "metric-negative";
}

function renderStatusCards(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = items.map((item) => `
    <div class="status-card">
      <span>${item.label}</span>
      <strong class="${item.emphasis != null ? metricClass(item.emphasis) : ""}">${item.value}</strong>
      ${item.subtle ? `<div class="subtle-line">${item.subtle}</div>` : ""}
    </div>
  `).join("");
}

function renderPerformanceBreakdown(rows) {
  const body = document.getElementById("performance-breakdown-body");
  if (!body) return;
  body.innerHTML = rows.map((row) => {
    const summary = row.summary || {};
    return `
      <tr>
        <td>${row.label}</td>
        <td>${summary.closed_trades ?? 0}</td>
        <td>${summary.wins ?? 0} / ${summary.losses ?? 0}</td>
        <td>${summary.win_rate ?? 0}%</td>
        <td class="${metricClass(summary.net_profit)}">${formatNumber(summary.net_profit, 2)}</td>
        <td>${summary.profit_factor ?? "-"}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="6">لا توجد بيانات بعد.</td></tr>';
}

function renderReportPeriod(containerId, report) {
  if (!report) return;
  const summary = report.summary || {};
  const cards = [
    { label: "الفترة", value: `${report.range?.start ?? "-"} -> ${report.range?.end ?? "-"}` },
    { label: "الصفقات المغلقة", value: summary.closed_trades ?? 0 },
    { label: "نسبة النجاح", value: `${summary.win_rate ?? 0}%` },
    { label: "صافي الربح", value: formatNumber(summary.net_profit, 2), emphasis: summary.net_profit },
    { label: "أفضل سوق", value: report.best_market?.label ?? "-", subtle: report.best_market ? `صافي ${formatNumber(report.best_market.summary?.net_profit, 2)}` : "" },
    { label: "أفضل فريم", value: report.best_timeframe?.label ?? "-", subtle: report.best_timeframe ? `صافي ${formatNumber(report.best_timeframe.summary?.net_profit, 2)}` : "" },
    { label: "أفضل تقسيم", value: report.best_bucket?.label ?? "-", subtle: report.best_bucket ? `صافي ${formatNumber(report.best_bucket.summary?.net_profit, 2)}` : "" },
    { label: "أفضل صفقة", value: report.best_trade ? `${report.best_trade.symbol} | ${formatNumber(report.best_trade.pnl, 2)}` : "-", emphasis: report.best_trade?.pnl },
    { label: "أسوأ صفقة", value: report.worst_trade ? `${report.worst_trade.symbol} | ${formatNumber(report.worst_trade.pnl, 2)}` : "-", emphasis: report.worst_trade?.pnl },
  ];
  renderStatusCards(cards, containerId);
}

function renderSystemStatus(data) {
  state.lastSystemStatus = data;
  const scanners = data.scanners || {};
  const scannerCounts = data.scanner_symbol_counts || {};
  const backup = data.backup || {};
  const items = [
    { label: "وقت السيرفر", value: formatDateTime(data.server_time) },
    { label: "المشتركون النشطون", value: data.telegram?.active_subscribers ?? 0 },
    { label: "طلبات الاشتراك", value: data.telegram?.pending_subscribers ?? 0 },
    { label: "الصفقات المفتوحة", value: data.open_scanner_trades ?? 0 },
    { label: "السوق السعودي", value: data.markets?.saudi?.active ? "مفتوح" : "مغلق", subtle: data.markets?.saudi?.window ?? "-" },
    { label: "السوق الأمريكي", value: data.markets?.us?.active ? "مفتوح" : "مغلق", subtle: data.markets?.us?.window ?? "-" },
    { label: "سكانر اليومي", value: scanners["1d"]?.running ? "نشط" : "متوقف", subtle: `الرموز الحالية: ${scannerCounts["1d"] ?? 0}` },
    { label: "سكانر الساعة", value: scanners["1h"]?.running ? "نشط" : "متوقف", subtle: `الرموز الحالية: ${scannerCounts["1h"] ?? 0}` },
    { label: "آخر نسخة احتياطية", value: formatDateTime(backup.last_backup_at), subtle: backup.latest_exists ? (backup.latest_path || "") : "لا توجد نسخة بعد" },
  ];
  renderStatusCards(items, "system-status-grid");
  renderNotificationCenter(data);
  renderSettingsSummary(data);
}

function renderNotificationCenter(data) {
  const container = document.getElementById("notification-center");
  if (!container) return;
  const scanners = data.scanners || {};
  const backup = data.backup || {};
  const notifications = [];
  Object.values(scanners).forEach((scanner) => {
    if (!scanner.running) {
      notifications.push({ level: "warn", title: `السكانر ${scanner.interval || ""} متوقف`, detail: "يمكن تشغيله من إعدادات التشغيل." });
    }
    if (scanner.scan_in_progress) {
      notifications.push({ level: "info", title: `فحص ${scanner.interval || ""} قيد التنفيذ`, detail: `التقدم ${scanner.current_scan_progress_pct ?? 0}%` });
    }
    if (scanner.last_scan_error) {
      notifications.push({ level: "danger", title: `خطأ في سكانر ${scanner.interval || ""}`, detail: scanner.last_scan_error });
    }
  });
  if (!backup.latest_exists) {
    notifications.push({ level: "warn", title: "لا توجد نسخة احتياطية حديثة", detail: "أنشئ نسخة من زر النسخ الاحتياطي." });
  }
  if (!data.telegram?.configured) {
    notifications.push({ level: "danger", title: "Telegram غير مفعّل", detail: "راجع إعدادات TELEGRAM_BOT_TOKEN." });
  }
  if (!notifications.length) {
    notifications.push({ level: "ok", title: "النظام مستقر", detail: "لا توجد تنبيهات حرجة الآن." });
  }
  container.innerHTML = notifications.map((item) => `
    <div class="notification-item ${item.level}">
      <strong>${item.title}</strong>
      <span>${item.detail}</span>
    </div>
  `).join("");
}

function renderSettingsSummary(data) {
  const scanners = data.scanners || {};
  const rows = [
    { label: "مسار قاعدة البيانات", value: data.database_path || "-" },
    { label: "السوق السعودي", value: data.markets?.saudi?.active ? "مفتوح" : "مغلق" },
    { label: "السوق الأمريكي", value: data.markets?.us?.active ? "مفتوح" : "مغلق" },
    { label: "السكانرات النشطة", value: Object.values(scanners).filter((item) => item.running).length },
  ];
  renderStatusCards(rows, "settings-summary");
}

function renderOwnerTradeStats(data) {
  renderStatusCards([
    { label: "بداية الإحصائيات", value: data.period_start_date || "اليوم", subtle: data.period_timezone || "Asia/Riyadh" },
    { label: "الصفقات المغلقة", value: data.closed_trades ?? 0 },
    { label: "الناجحة", value: data.wins ?? 0 },
    { label: "الفاشلة", value: data.losses ?? 0 },
    { label: "نسبة النجاح", value: `${data.win_rate ?? 0}%` },
    { label: "المفتوحة", value: data.open_trades ?? 0 },
    { label: "الملغاة", value: data.cancelled_trades ?? 0 },
    { label: "رأس المال الابتدائي", value: formatNumber(data.capital?.starting_capital ?? 10000, 2) },
    { label: "رأس المال الحالي", value: formatNumber(data.capital?.ending_capital, 2), emphasis: data.capital?.net_profit },
    { label: "الربح / الخسارة", value: `${formatNumber(data.capital?.net_profit, 2)} (${formatNumber(data.capital?.return_pct, 2)}%)`, emphasis: data.capital?.net_profit },
    { label: "متوسط عائد الصفقة", value: `${formatNumber(data.avg_return_pct, 2)}%`, emphasis: data.avg_return_pct },
    { label: "أفضل عائد", value: `${formatNumber(data.best_return_pct, 2)}%`, emphasis: data.best_return_pct },
    { label: "أسوأ عائد", value: `${formatNumber(data.worst_return_pct, 2)}%`, emphasis: data.worst_return_pct },
  ], "owner-stats-cards");

  const body = document.getElementById("owner-stats-timeframes-body");
  if (!body) return;
  body.innerHTML = (data.by_timeframe || []).map((row) => {
    const summary = row.summary || {};
    const capital = row.capital || {};
    return `
      <tr>
        <td>${row.label || row.timeframe || "-"}</td>
        <td>${summary.closed_trades ?? 0}</td>
        <td>${summary.wins ?? 0} / ${summary.losses ?? 0}</td>
        <td>${summary.win_rate ?? 0}%</td>
        <td class="${metricClass(capital.net_profit)}">${formatNumber(capital.ending_capital, 2)}</td>
      </tr>
    `;
  }).join("") || '<tr><td colspan="5">لا توجد بيانات بعد.</td></tr>';
}

async function loadOwnerTradeStats() {
  const data = await fetchJson("/api/admin/trade-stats?starting_capital=10000");
  renderOwnerTradeStats(data);
}

function liveTradeStateLabel(stateName) {
  if (stateName === "near_target") return "قريبة من الهدف";
  if (stateName === "near_stop") return "قريبة من وقف الخسارة";
  return "مفتوحة";
}

function liveTradeStateClass(stateName) {
  if (stateName === "near_target") return "near-target";
  if (stateName === "near_stop") return "near-stop";
  return "open";
}

function renderLiveTrades(payload) {
  const container = document.getElementById("live-trades-grid");
  if (!container) return;
  const items = payload?.items || [];
  if (!items.length) {
    container.innerHTML = `
      <div class="live-trades-empty">
        <strong>لا توجد صفقات مفتوحة الآن</strong>
        <span>أي صفقة جديدة من السكانر ستظهر هنا تلقائيًا بعد تسجيل الدخول.</span>
      </div>
    `;
    return;
  }
  container.innerHTML = items.map((trade) => {
    const progress = trade.target_progress_pct == null ? 0 : Math.max(0, Math.min(100, Number(trade.target_progress_pct)));
    const stateName = trade.risk_state || "open";
    const stateClass = liveTradeStateClass(stateName);
    const returnPct = trade.current_return_pct;
    const symbol = escapeHtml(trade.symbol || "-");
    const timeframe = escapeHtml(trade.timeframe || "-");
    return `
      <article class="live-trade-card ${stateClass}">
        <div class="live-trade-head">
          <div>
            <strong>${symbol}</strong>
            <span>${formatDirection(trade.direction)} | ${timeframe}</span>
          </div>
          <mark>${liveTradeStateLabel(stateName)}</mark>
        </div>
        <div class="live-trade-prices">
          <div><span>الدخول</span><strong>${formatNumber(trade.entry_price, 4)}</strong></div>
          <div><span>الحالي</span><strong>${formatNumber(trade.current_price, 4)}</strong></div>
          <div><span>الهدف</span><strong>${formatNumber(trade.target_price, 4)}</strong></div>
          <div><span>الوقف</span><strong>${formatNumber(trade.stop_loss, 4)}</strong></div>
        </div>
        <div class="live-trade-meter" aria-label="target progress">
          <span style="width: ${progress}%"></span>
        </div>
        <div class="live-trade-meta">
          <span class="${metricClass(returnPct)}">العائد الحالي ${formatNumber(returnPct, 2)}%</span>
          <span>للهدف ${trade.target_distance_pct == null ? "-" : `${formatNumber(trade.target_distance_pct, 2)}%`}</span>
          <span>للوقف ${trade.stop_distance_pct == null ? "-" : `${formatNumber(trade.stop_distance_pct, 2)}%`}</span>
          <span>آخر تحديث ${formatDateTime(trade.last_price_at)}</span>
        </div>
      </article>
    `;
  }).join("");
}

async function loadLiveTrades(refresh = false) {
  const container = document.getElementById("live-trades-grid");
  if (!container) return;
  if (refresh) {
    container.innerHTML = '<div class="live-trades-empty"><strong>جاري تحديث الأسعار...</strong></div>';
  }
  const data = await fetchJson(refresh ? "/api/admin/live-trades/refresh" : "/api/admin/live-trades", {
    method: refresh ? "POST" : "GET",
  });
  renderLiveTrades(data);
  if (data.refresh_errors?.length && signalOutput) {
    signalOutput.textContent = `تعذر تحديث ${data.refresh_errors.length} صفقة، وتم عرض آخر بيانات متاحة.`;
  }
}

async function revalidateLiveTradesWithStrategy() {
  const confirmed = window.confirm("سيتم إلغاء أي صفقة مفتوحة لا تطابق الاستراتيجية الحالية. هل تريد المتابعة؟");
  if (!confirmed) return;
  const result = await fetchJson("/api/admin/live-trades/revalidate-strategy", { method: "POST" });
  signalOutput.textContent = [
    "تمت مطابقة الصفقات المفتوحة مع الاستراتيجية الحالية.",
    `تم الفحص: ${result.checked_count ?? 0}`,
    `بقيت مفتوحة: ${result.kept_count ?? 0}`,
    `تم إلغاؤها: ${result.cancelled_count ?? 0}`,
    `أخطاء: ${result.error_count ?? 0}`,
  ].join("\n");
  await refreshAdminPanels();
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function exportVisibleTradesCsv() {
  const trades = filteredTrades(state.dashboardTrades);
  const headers = ["symbol", "signal_time", "direction", "outcome", "entry_price", "current_price", "target_price", "stop_loss", "pnl", "reason"];
  const rows = trades.map((trade) => [
    trade.symbol,
    trade.signal_time,
    formatDirection(trade.direction),
    formatOutcome(trade.outcome),
    trade.entry_price,
    trade.current_price,
    trade.target_price,
    trade.stop_loss,
    trade.pnl,
    getTradeReasonText(trade),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `trades-${state.selectedSymbol || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function scannerAdminAction(action) {
  const result = await fetchJson(`/api/scanner/${action}`, { method: "POST" });
  signalOutput.textContent = `تم تنفيذ الأمر: ${action}\n${JSON.stringify(result, null, 2)}`;
  await refreshScannerStatus();
  await refreshAdminPanels();
}

function renderSubscriberSummary(items) {
  const total = items.length;
  const active = items.filter((item) => item.status === "active" && item.is_active).length;
  const pending = items.filter((item) => item.status === "pending").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const expired = items.filter((item) => item.status === "expired").length;
  renderStatusCards([
    { label: "إجمالي المشتركين", value: total },
    { label: "النشطون", value: active },
    { label: "قيد المراجعة", value: pending },
    { label: "المحظورون", value: blocked },
    { label: "المنتهون", value: expired },
  ], "subscriber-summary-cards");
}

function renderPendingSubscribers(items) {
  const body = document.getElementById("pending-subscriber-table-body");
  if (!body) return;
  const pendingItems = items.filter((item) => item.status === "pending");
  body.innerHTML = pendingItems.map((item) => `
    <tr>
      <td>
        <div class="subscriber-name">${item.display_name || item.username || item.chat_id}</div>
        <div class="subscriber-meta">@${item.username || "-"}</div>
      </td>
      <td>${item.chat_id}</td>
      <td>${item.status_label || item.status || "-"}</td>
      <td>${formatDateOnly(item.subscribed_at)}</td>
      <td>
        <div class="subscriber-actions">
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'approve')">قبول وتحديد المدة</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'block')">حظر</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'delete')">حذف</button>
        </div>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="5">لا توجد طلبات معلقة الآن.</td></tr>';
}

function renderSubscribers(items) {
  const body = document.getElementById("subscriber-table-body");
  if (!body) return;
  body.innerHTML = items.map((item) => `
    <tr>
      <td>
        <div class="subscriber-name">${item.display_name || item.username || item.chat_id}</div>
        <div class="subscriber-meta">@${item.username || "-"}</div>
      </td>
      <td>${item.chat_id}</td>
      <td>${item.status_label || item.status || "-"}</td>
      <td>${item.role_label || "-"}</td>
      <td>${formatDateOnly(item.subscribed_at)}</td>
      <td>${formatDateOnly(item.expires_at)}</td>
      <td>
        <div class="subscriber-actions">
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'approve')">قبول</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'extend')">تمديد</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'deactivate')">إيقاف</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'block')">حظر</button>
          <button class="ghost" onclick="adminSubscriberAction('${item.chat_id}', 'delete')">حذف</button>
        </div>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="7">لا يوجد مشتركون بعد.</td></tr>';
}

async function loadSystemStatus() {
  const data = await fetchJson("/api/system-status");
  renderSystemStatus(data);
}

async function loadPerformanceBreakdown() {
  const data = await fetchJson("/api/performance-breakdown");
  renderPerformanceBreakdown(data.rows || []);
}

async function loadReportsOverview() {
  const data = await fetchJson("/api/reports/overview");
  renderReportPeriod("weekly-report-cards", data.weekly);
  renderReportPeriod("monthly-report-cards", data.monthly);
}

async function loadSubscribers() {
  try {
    const data = await fetchJson("/api/admin/subscribers");
    const items = data.items || [];
    renderSubscribers(items);
    renderPendingSubscribers(items);
    renderSubscriberSummary(items);
    if (adminLoginStatus) {
      adminLoginStatus.textContent = "تم تسجيل الدخول.";
    }
  } catch (error) {
    if (adminLoginStatus) {
      adminLoginStatus.textContent = "سجل الدخول لعرض وإدارة المشتركين.";
    }
    throw error;
  }
}

async function refreshAdminSession() {
  try {
    const data = await fetchJson("/api/admin/session");
    if (adminLoginStatus) {
      adminLoginStatus.textContent = data.authenticated ? "تم تسجيل الدخول." : "سجل الدخول لعرض وإدارة المشتركين.";
    }
    return Boolean(data.authenticated);
  } catch (error) {
    if (adminLoginStatus) {
      adminLoginStatus.textContent = "تعذر التحقق من جلسة الإدارة.";
    }
    return false;
  }
}

async function loginAdmin(event) {
  event.preventDefault();
  const password = adminPasswordInput?.value || "";
  if (!password) return;
  try {
    await fetchJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (adminPasswordInput) adminPasswordInput.value = "";
    if (adminLoginStatus) adminLoginStatus.textContent = "تم تسجيل الدخول.";
    await refreshAdminPanels();
  } catch (error) {
    if (adminLoginStatus) adminLoginStatus.textContent = "كلمة المرور غير صحيحة.";
  }
}

async function logoutAdmin() {
  await fetchJson("/api/admin/logout", { method: "POST" });
  if (adminLoginStatus) adminLoginStatus.textContent = "تم تسجيل الخروج.";
  renderSubscribers([]);
  renderPendingSubscribers([]);
  renderSubscriberSummary([]);
  renderLiveTrades({ items: [] });
  renderOwnerTradeStats({ by_timeframe: [] });
}

async function refreshAdminPanels() {
  await Promise.allSettled([
    loadSystemStatus(),
    loadPerformanceBreakdown(),
    loadReportsOverview(),
    loadSubscribers(),
    loadOwnerTradeStats(),
    loadLiveTrades(false),
  ]);
}

async function adminSubscriberAction(chatId, action) {
  let url = `/api/admin/subscribers/${chatId}/${action}`;
  let method = "POST";
  if (action === "approve" || action === "extend") {
    const input = window.prompt("عدد الأيام", "30");
    if (!input) return;
    const days = Number(input);
    if (!Number.isFinite(days) || days <= 0) return;
    url += `?days=${Math.round(days)}`;
  }
  if (action === "delete") {
    const confirmed = window.confirm(`حذف المشترك ${chatId}؟`);
    if (!confirmed) return;
    url = `/api/admin/subscribers/${chatId}`;
    method = "DELETE";
  }
  await fetchJson(url, { method });
  await refreshAdminPanels();
}

async function triggerBackupNow() {
  const result = await fetchJson("/api/admin/backup-now", { method: "POST" });
  const label = result.created ? "تم إنشاء نسخة احتياطية جديدة." : "تم تحديث النسخة الاحتياطية الحالية.";
  signalOutput.textContent = `${label}
${result.latest_path || ""}`.trim();
  await refreshAdminPanels();
}

window.adminSubscriberAction = adminSubscriberAction;

function openDashboardPage(target, updateHash = true) {
  const fallback = "analysis-tab";
  const activeTarget = PAGE_META[target] ? target : fallback;
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tabTarget === activeTarget);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.id === activeTarget;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
  const meta = PAGE_META[activeTarget] || PAGE_META[fallback];
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageDescription) pageDescription.textContent = meta.description;
  document.querySelectorAll("[data-page-scope]").forEach((element) => {
    const scopes = (element.dataset.pageScope || "").split(",").map((item) => item.trim()).filter(Boolean);
    element.hidden = scopes.length ? !scopes.includes(activeTarget) : false;
  });
  appShell?.classList.toggle("page-focus-mode", activeTarget !== "analysis-tab");
  if (updateHash && window.location.hash !== meta.hash) {
    window.history.replaceState(null, "", meta.hash);
  }
  if (activeTarget === "subscribers-tab") {
    refreshAdminSession();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getPageTargetFromHash() {
  const hash = (window.location.hash || "").toLowerCase();
  const match = Object.entries(PAGE_META).find(([, meta]) => meta.hash === hash);
  return match ? match[0] : "analysis-tab";
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    openDashboardPage(button.dataset.tabTarget, true);
  });
});

window.addEventListener("hashchange", () => {
  openDashboardPage(getPageTargetFromHash(), false);
});

document.getElementById("scan-button").addEventListener("click", scanSelectedSymbol);
document.getElementById("backtest-button").addEventListener("click", backtestSelectedSymbol);
document.getElementById("weekly-summary-button").addEventListener("click", loadWeeklySummary);
document.getElementById("backup-now-button")?.addEventListener("click", triggerBackupNow);
exportTradesButton?.addEventListener("click", exportVisibleTradesCsv);
tradeFilterSearch?.addEventListener("input", () => {
  state.tradeFilters.search = tradeFilterSearch.value;
  renderTrades(state.dashboardTrades);
});
tradeFilterOutcome?.addEventListener("change", () => {
  state.tradeFilters.outcome = tradeFilterOutcome.value;
  renderTrades(state.dashboardTrades);
});
tradeFilterDirection?.addEventListener("change", () => {
  state.tradeFilters.direction = tradeFilterDirection.value;
  renderTrades(state.dashboardTrades);
});
tradeFilterPnl?.addEventListener("change", () => {
  state.tradeFilters.pnl = tradeFilterPnl.value;
  renderTrades(state.dashboardTrades);
});
document.getElementById("scanner-start-button")?.addEventListener("click", () => scannerAdminAction("start"));
document.getElementById("scanner-stop-button")?.addEventListener("click", () => scannerAdminAction("stop"));
document.getElementById("scanner-scan-now-button")?.addEventListener("click", () => scannerAdminAction("scan-now"));
document.getElementById("refresh-live-trades-button")?.addEventListener("click", () => loadLiveTrades(true));
document.getElementById("revalidate-strategy-button")?.addEventListener("click", revalidateLiveTradesWithStrategy);
adminLoginForm?.addEventListener("submit", loginAdmin);
adminLogoutButton?.addEventListener("click", logoutAdmin);
document.getElementById("period-select").addEventListener("change", () => selectSymbol(state.selectedSymbol));
document.getElementById("interval-select").addEventListener("change", () => {
  syncPeriodToInterval();
  selectSymbol(state.selectedSymbol);
});
experimentalEnabledInput?.addEventListener("change", async () => {
  state.experimentalEnabled = experimentalEnabledInput.checked;
  state.experimentalAnalysis = null;
  renderExperimentalStatus();
  await loadAnalysis();
});
symbolSearch.addEventListener("input", () => {
  state.symbolFilter = symbolSearch.value;
  renderSymbols();
});
replayEnabledInput.addEventListener("change", async () => {
  state.replayEnabled = replayEnabledInput.checked;
  state.replayIndex = state.allCandles.length ? state.allCandles.length - 1 : null;
  state.selectedTrade = null;
  state.selectedTradeAnalysis = null;
  state.selectedTradeAnalysisFresh = false;
  applyVisibleCandles();
  await loadAnalysis();
  renderActiveTrade(null);
});
replaySlider.addEventListener("input", async () => {
  if (!state.replayEnabled) return;
  state.replayIndex = Number(replaySlider.value);
  state.selectedTrade = null;
  state.selectedTradeAnalysis = null;
  state.selectedTradeAnalysisFresh = false;
  applyVisibleCandles();
  await loadAnalysis();
  renderActiveTrade(null);
});

window.addEventListener("resize", scheduleResizeCharts);
window.visualViewport?.addEventListener("resize", scheduleResizeCharts);
new ResizeObserver(scheduleResizeCharts).observe(chartContainer);
new ResizeObserver(scheduleResizeCharts).observe(document.getElementById("equity-chart"));

createCharts();
scheduleResizeCharts();
if (isCaptureMode) {
  document.body.classList.add("capture-mode");
  appShell?.classList.add("page-focus-mode");
}
syncPeriodToInterval();
openDashboardPage(getPageTargetFromHash(), false);
loadSymbols().catch((error) => {
  signalOutput.textContent = error.message;
});
refreshScannerStatus();

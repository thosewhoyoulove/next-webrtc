/**
 * 现货短线“动量/流动性”筛选器（不构成投资建议）
 *
 * 说明：
 * - 该脚本只做“筛选与信息汇总”，不保证盈利，也不提供买卖指令。
 * - 数字资产波动极大，短线更可能亏损；请自行承担风险。
 *
 * 数据源：
 * - 默认：Coinbase Exchange 公共 REST（不需要 API Key）
 * - 可选：Binance 公共 REST（在部分地区/环境可能返回 451 无法使用）
 *
 * 用法示例：
 *   node scripts/spot-screener.js
 *   node scripts/spot-screener.js --exchange coinbase --quote USD
 *   node scripts/spot-screener.js --exchange coinbase --quote USD --top 120 --analyze 40 --minQuoteVol 20000000
 *   node scripts/spot-screener.js --exchange binance --quote USDT
 */
/* eslint-disable no-console */

const DEFAULTS = {
  exchange: "coinbase", // coinbase | binance
  quote: "USD",
  // 从 24h ticker 中按成交额选前 top 个候选
  top: 80,
  // 对候选中前 analyze 个进行 K 线分析（越大越慢、越容易触发限速）
  analyze: 30,
  // 24h 计价成交额最低阈值（例如 USDT）
  minQuoteVol: 20_000_000,
  // K 线区间与长度
  klineInterval: "1h",
  klineLimit: 200,
  // 技术指标
  rsiPeriod: 14,
  // 并发控制（避免触发交易所限速）
  concurrency: 4,
  // 排除杠杆代币/可疑符号
  exclude: ".*(UP|DOWN|BULL|BEAR)([-]?USDT|[-]?USD)?$",
  // 打印数量
  out: 15,
};

function parseArgs(argv) {
  const out = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    if (key in out) {
      if (typeof out[key] === "number") out[key] = Number(val);
      else out[key] = val;
    }
  }
  return out;
}

function fmtNum(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function pct(n, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  const s = (n * 100).toFixed(digits);
  return `${s}%`;
}

function nowISO() {
  return new Date().toISOString().replace("T", " ").replace("Z", " UTC");
}

async function fetchJson(url) {
  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": "spot-screener/1.0" },
    });
    if (res.ok) return res.json();
    const status = res.status;
    const body = await res.text().catch(() => "");
    const retryable = status === 429 || (status >= 500 && status <= 599);
    if (!retryable || attempt === maxRetries) {
      const snippet = body.slice(0, 240);
      throw new Error(`HTTP ${status} ${res.statusText} for ${url} :: ${snippet}`);
    }
    const backoffMs = 500 * 2 ** attempt;
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  // 理论上到不了这里
  throw new Error(`Failed to fetch ${url}`);
}

// 简易并发限制器
function pLimit(limit) {
  let active = 0;
  /** @type {Array<() => void>} */
  const queue = [];
  const next = () => {
    active--;
    const fn = queue.shift();
    if (fn) fn();
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      const run = () => {
        active++;
        Promise.resolve()
          .then(fn)
          .then((v) => resolve(v), (e) => reject(e))
          .finally(next);
      };
      if (active < limit) run();
      else queue.push(run);
    });
}

function calcReturns(closes) {
  // closes: number[]
  const last = closes.at(-1);
  const prev1 = closes.at(-2);
  const prev4 = closes.at(-5);
  const prev24 = closes.at(-25);
  const ret1 = last && prev1 ? last / prev1 - 1 : NaN;
  const ret4 = last && prev4 ? last / prev4 - 1 : NaN;
  const ret24 = last && prev24 ? last / prev24 - 1 : NaN;
  return { ret1, ret4, ret24 };
}

function calcRsi(closes, period = 14) {
  if (closes.length < period + 1) return NaN;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period - 1; i < closes.length - 1; i++) {
    const diff = closes[i + 1] - closes[i];
    if (diff >= 0) gains += diff;
    else losses += -diff;
  }
  if (losses === 0 && gains === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function calcVolatility(closes) {
  // 1h log return 标准差
  if (closes.length < 30) return NaN;
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  if (rets.length < 10) return NaN;
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const var_ = rets.reduce((s, x) => s + (x - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(var_);
}

function zScore(x, mean, sd) {
  if (!Number.isFinite(x) || !Number.isFinite(mean) || !Number.isFinite(sd) || sd === 0) return 0;
  return (x - mean) / sd;
}

function makeReason({ ret1, ret4, ret24, rsi, vol }) {
  const parts = [];
  if (Number.isFinite(ret1) && ret1 > 0) parts.push("1h 上涨");
  if (Number.isFinite(ret4) && ret4 > 0) parts.push("4h 上涨");
  if (Number.isFinite(ret24) && ret24 > 0) parts.push("24h 上涨");
  if (Number.isFinite(rsi)) {
    if (rsi >= 75) parts.push("RSI 偏热(可能回撤)");
    else if (rsi <= 30) parts.push("RSI 偏冷(可能反弹)");
    else parts.push("RSI 中性");
  }
  if (Number.isFinite(vol)) parts.push(`波动${fmtNum(vol * 100, 2)}%/h`);
  return parts.join("，");
}

function normalizeExchange(name) {
  const s = String(name || "").toLowerCase();
  if (s === "coinbase" || s === "cb") return "coinbase";
  if (s === "binance" || s === "bn") return "binance";
  return "coinbase";
}

async function listCandidatesBinance({ quote, excludeRe, top, minQuoteVol }) {
  const tickers = await fetchJson("https://api.binance.com/api/v3/ticker/24hr");
  return tickers
    .filter((t) => typeof t?.symbol === "string" && t.symbol.endsWith(quote))
    .filter((t) => !excludeRe.test(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      lastPrice: Number(t.lastPrice),
      priceChangePercent24h: Number(t.priceChangePercent) / 100,
      quoteVolume24h: Number(t.quoteVolume),
      count: Number(t.count),
    }))
    .filter((t) => Number.isFinite(t.quoteVolume24h) && t.quoteVolume24h >= minQuoteVol)
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, top);
}

async function analyzeSymbolBinance({ symbol, klineInterval, klineLimit, rsiPeriod }) {
  const url = new URL("https://api.binance.com/api/v3/klines");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", klineInterval);
  url.searchParams.set("limit", String(klineLimit));
  const klines = await fetchJson(url.toString());
  const closes = klines.map((k) => Number(k[4])).filter((x) => Number.isFinite(x));
  const { ret1, ret4, ret24 } = calcReturns(closes);
  const rsi = calcRsi(closes, rsiPeriod);
  const vol = calcVolatility(closes);
  return { ret1, ret4, ret24, rsi, vol };
}

async function listCandidatesCoinbase({ quote, excludeRe, top, minQuoteVol, concurrency }) {
  const products = await fetchJson("https://api.exchange.coinbase.com/products");

  const filtered = products
    .filter((p) => p?.status === "online")
    .filter((p) => String(p?.quote_currency).toUpperCase() === quote)
    .filter((p) => !excludeRe.test(String(p?.id || "")))
    .map((p) => ({
      productId: String(p.id), // e.g. BTC-USD
      base: String(p.base_currency),
      quote: String(p.quote_currency),
    }));

  if (filtered.length === 0) return [];

  const limit = pLimit(concurrency);
  const enriched = await Promise.all(
    filtered.map((p) =>
      limit(async () => {
        // ticker: { price, volume(24h base) ... }
        const t = await fetchJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(p.productId)}/ticker`);
        const lastPrice = Number(t.price);
        const baseVol24h = Number(t.volume);
        const quoteVolume24h = lastPrice * baseVol24h;
        return {
          symbol: p.productId,
          lastPrice,
          quoteVolume24h,
          priceChangePercent24h: NaN, // coinbase ticker 不提供 24h 涨跌幅，改用 1hK 推导的 24h
          count: NaN,
        };
      }),
    ),
  );

  return enriched
    .filter((x) => Number.isFinite(x.quoteVolume24h) && x.quoteVolume24h >= minQuoteVol)
    .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h)
    .slice(0, top);
}

async function analyzeSymbolCoinbase({ symbol, klineLimit, rsiPeriod }) {
  // coinbase: granularity=3600 为 1h
  const url = new URL(`https://api.exchange.coinbase.com/products/${encodeURIComponent(symbol)}/candles`);
  url.searchParams.set("granularity", "3600");
  // coinbase 不支持 limit 参数，靠 start/end；这里取最近 ~klineLimit 小时（倒序返回）
  const end = new Date();
  const start = new Date(end.getTime() - (Number(klineLimit) - 1) * 3600_000);
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());
  const candles = await fetchJson(url.toString());
  // candles: [time, low, high, open, close, volume]，通常是倒序
  const closes = candles
    .slice()
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((c) => Number(c[4]))
    .filter((x) => Number.isFinite(x));

  const { ret1, ret4, ret24 } = calcReturns(closes);
  const rsi = calcRsi(closes, rsiPeriod);
  const vol = calcVolatility(closes);
  return { ret1, ret4, ret24, rsi, vol };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  cfg.exchange = normalizeExchange(cfg.exchange);
  const quote = String(cfg.quote).toUpperCase();
  const excludeRe = new RegExp(String(cfg.exclude));

  console.log(`\n现货短线筛选（仅供学习研究，不构成投资建议）`);
  console.log(`时间：${nowISO()}`);
  console.log(
    `参数：exchange=${cfg.exchange}, quote=${quote}, top=${cfg.top}, analyze=${cfg.analyze}, minQuoteVol=${cfg.minQuoteVol}, interval=${cfg.klineInterval}, out=${cfg.out}\n`,
  );

  /** @type {Array<{symbol: string, lastPrice: number, priceChangePercent24h: number, quoteVolume24h: number, count: number}>} */
  let candidates = [];
  if (cfg.exchange === "binance") {
    try {
      candidates = await listCandidatesBinance({
        quote,
        excludeRe,
        top: cfg.top,
        minQuoteVol: cfg.minQuoteVol,
      });
    } catch (e) {
      const msg = String(e?.message || "");
      // Binance 在一些环境会直接 451，自动降级
      if (msg.includes("HTTP 451")) {
        console.log("检测到 Binance 接口不可用（451 地区限制），自动切换到 Coinbase Exchange。");
        cfg.exchange = "coinbase";
      } else {
        throw e;
      }
    }
  }
  if (cfg.exchange === "coinbase") {
    candidates = await listCandidatesCoinbase({
      quote,
      excludeRe,
      top: cfg.top,
      minQuoteVol: cfg.minQuoteVol,
      concurrency: cfg.concurrency,
    });
  }

  if (candidates.length === 0) {
    console.log("没有找到满足流动性阈值的币对（可能是阈值太高或接口异常）。");
    process.exit(1);
  }

  const limit = pLimit(cfg.concurrency);
  const analyzed = await Promise.all(
    candidates.slice(0, cfg.analyze).map((c) =>
      limit(async () => {
        const { ret1, ret4, ret24, rsi, vol } =
          cfg.exchange === "coinbase"
            ? await analyzeSymbolCoinbase({
                symbol: c.symbol,
                klineLimit: cfg.klineLimit,
                rsiPeriod: cfg.rsiPeriod,
              })
            : await analyzeSymbolBinance({
                symbol: c.symbol,
                klineInterval: cfg.klineInterval,
                klineLimit: cfg.klineLimit,
                rsiPeriod: cfg.rsiPeriod,
              });
        return {
          ...c,
          ret1,
          ret4,
          ret24,
          rsi,
          vol,
        };
      }),
    ),
  );

  // 评分：动量（1h/4h/24h）+ 流动性（对数成交额）- 过热惩罚 + 波动偏好（适度）
  const xs = analyzed.map((a) => ({
    mom: (a.ret1 ?? 0) * 3 + (a.ret4 ?? 0) * 2 + (a.ret24 ?? a.priceChangePercent24h ?? 0) * 1,
    liq: Math.log10(Math.max(1, a.quoteVolume24h)),
    vol: a.vol,
    rsi: a.rsi,
  }));
  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / Math.max(1, arr.length);
  const sd = (arr) => {
    if (arr.length < 2) return 1;
    const m = mean(arr);
    const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v) || 1;
  };

  const momArr = xs.map((x) => x.mom);
  const liqArr = xs.map((x) => x.liq);
  const volArr = xs.map((x) => (Number.isFinite(x.vol) ? x.vol : 0));
  const momM = mean(momArr),
    momS = sd(momArr);
  const liqM = mean(liqArr),
    liqS = sd(liqArr);
  const volM = mean(volArr),
    volS = sd(volArr);

  const scored = analyzed
    .map((a, idx) => {
      const mom = xs[idx].mom;
      const liq = xs[idx].liq;
      const vol = Number.isFinite(a.vol) ? a.vol : 0;
      const rsi = Number.isFinite(a.rsi) ? a.rsi : 50;
      const hotPenalty = rsi > 75 ? (rsi - 75) / 25 : 0; // 0~1
      // 偏好“适度波动”：离均值越远扣分
      const volPenalty = Math.min(2, Math.abs(zScore(vol, volM, volS))) * 0.15;
      const score =
        zScore(mom, momM, momS) * 0.65 + zScore(liq, liqM, liqS) * 0.35 - hotPenalty * 0.25 - volPenalty;
      return { ...a, score, reason: makeReason(a) };
    })
    .sort((a, b) => b.score - a.score);

  const rows = scored.slice(0, cfg.out).map((a, i) => ({
    "#": i + 1,
    symbol: a.symbol,
    price: fmtNum(a.lastPrice, a.lastPrice < 1 ? 6 : 2),
    "1h": pct(a.ret1),
    "4h": pct(a.ret4),
    "24h(1hK)": pct(a.ret24),
    "24h(ticker)": pct(a.priceChangePercent24h),
    "RSI(1h)": fmtNum(a.rsi, 1),
    "quoteVol24h": fmtNum(a.quoteVolume24h, 0),
    "vol(1h)": fmtNum((a.vol ?? NaN) * 100, 2) + "%",
    score: fmtNum(a.score, 3),
    reason: a.reason,
  }));

  console.table(rows);

  console.log(
    "\n提示：可以把输出当作“候选清单”，再结合你的入场/止损/仓位规则、以及更高周期趋势做二次过滤。\n",
  );
}

main().catch((e) => {
  console.error("运行失败：", e?.message || e);
  process.exit(1);
});


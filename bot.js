'use strict';
/**
 * 0XBLAQ · KALSHI ENGINE — single-file build
 *
 * Hourly and quarter-hour crypto binaries. Ten modules held in separate scopes
 * by a ~10 line inline registry, so the code reads as it would across ten files
 * and nothing leaks between them. Search `=== module: name ===` to jump around.
 *
 * Companion files: index.html (dashboard), package.json.
 */

const __registry = {};
const __cache = {};
const __def = (name, factory) => { __registry[name] = factory; };
function __req(name) {
  if (__cache[name]) return __cache[name].exports;
  const m = { exports: {} };
  __cache[name] = m;
  __registry[name](m, m.exports);
  return m.exports;
}

// ═══ module: config ════════════════════════════════════
__def('config', (module, exports) => {
  const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));
  const bool = (v, d) => (v === undefined || v === '' ? d : String(v).toLowerCase() === 'true');
  const str = (v, d) => (v === undefined || v === '' ? d : String(v));

  /**
   * Every knob lives here. Nothing else in the codebase reads process.env.
   * Frozen at boot so a mid-run env edit can never half-apply.
   */
  const CFG = {
    // ---------- runtime ----------
    PORT: num(process.env.PORT, 3000),
    PAPER_MODE: bool(process.env.PAPER_MODE, true),
    LOG_LEVEL: str(process.env.LOG_LEVEL, 'info'),
    ENGINE_TICK_MS: num(process.env.ENGINE_TICK_MS, 2000),

    // ---------- kalshi ----------
    // prod: https://api.elections.kalshi.com/trade-api/v2
    // demo: https://demo-api.kalshi.co/trade-api/v2
    KALSHI_BASE: str(process.env.KALSHI_BASE, 'https://api.elections.kalshi.com/trade-api/v2'),
    KALSHI_KEY_ID: str(process.env.KALSHI_KEY_ID, ''),
    // Paste the full PEM. Newlines may be literal "\n" — we normalise below.
    KALSHI_PRIVATE_KEY: str(process.env.KALSHI_PRIVATE_KEY, '').replace(/\\n/g, '\n'),

    // Hourly crypto series. Kalshi rotates tickers — the engine verifies each one
    // exists at boot and drops any that 404, so a stale entry is harmless.
    SERIES: str(
      process.env.SERIES,
      'KXBTCD,KXETHD,KXSOLD,KXXRPD,KXDOGED,KXBNBD,KXHYPED'
    ).split(',').map(s => s.trim().toUpperCase()).filter(Boolean),

    // Quarter-hour up/down families. Same engine, different clock — see FREQ below.
    SERIES_15M: str(
      process.env.SERIES_15M,
      'KXBTC15M,KXETH15M,KXSOL15M,KXXRP15M,KXDOGE15M'
    ).split(',').map(s => s.trim().toUpperCase()).filter(Boolean),

    // ---------- oracle ----------
    // Kalshi settles on CF Benchmarks Real-Time Indexes. We reconstruct the index
    // from its own constituent venues rather than using whatever exchange is loudest.
    ORACLE_VENUES: str(process.env.ORACLE_VENUES, 'coinbase,kraken,bitstamp')
      .split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    MIN_VENUES: num(process.env.MIN_VENUES, 2),           // below this, asset is untradeable
    MAX_VENUE_DISPERSION_BPS: num(process.env.MAX_VENUE_DISPERSION_BPS, 12),
    STALE_TICK_MS: num(process.env.STALE_TICK_MS, 6000),
    // Half-life of the index's own TWAP smoothing. CF RTIs lag venue spot ~8-14s.
    INDEX_LAG_HALFLIFE_S: num(process.env.INDEX_LAG_HALFLIFE_S, 9),
    COINBASE_MAKER_SIDE: bool(process.env.COINBASE_MAKER_SIDE, true),

    // ---------- pricing ----------
    SETTLE_WINDOW_S: num(process.env.SETTLE_WINDOW_S, 60),  // Kalshi averages final 60s
    VOL_FAST_S: num(process.env.VOL_FAST_S, 120),
    VOL_SLOW_S: num(process.env.VOL_SLOW_S, 900),
    VOL_BLEND_FAST: num(process.env.VOL_BLEND_FAST, 0.45),
    VOL_FLOOR_BPS_PER_ROOT_S: num(process.env.VOL_FLOOR_BPS_PER_ROOT_S, 0.15),
    ORACLE_NOISE_BPS: num(process.env.ORACLE_NOISE_BPS, 4),  // added variance floor
    EMPIRICAL_MIN_SAMPLES: num(process.env.EMPIRICAL_MIN_SAMPLES, 240),
    EMPIRICAL_MIN_HISTORY_MULT: num(process.env.EMPIRICAL_MIN_HISTORY_MULT, 12),
    EMPIRICAL_FULL_WEIGHT_DRAWS: num(process.env.EMPIRICAL_FULL_WEIGHT_DRAWS, 40),
    EMPIRICAL_MAX_WEIGHT: num(process.env.EMPIRICAL_MAX_WEIGHT, 0.4),
    DRIFT_CATCHUP: num(process.env.DRIFT_CATCHUP, 0.85),     // how much index-lag gap closes
    FLOW_TILT_MAX_BPS: num(process.env.FLOW_TILT_MAX_BPS, 6),

    // ---------- gates ----------
    MIN_SECONDS_TO_CLOSE: num(process.env.MIN_SECONDS_TO_CLOSE, 90),
    MAX_SECONDS_TO_CLOSE: num(process.env.MAX_SECONDS_TO_CLOSE, 2700),
    MAX_SPREAD_CENTS: num(process.env.MAX_SPREAD_CENTS, 4),
    MIN_BOOK_DEPTH: num(process.env.MIN_BOOK_DEPTH, 25),     // contracts at touch
    MIN_EDGE_CENTS: num(process.env.MIN_EDGE_CENTS, 4.0),    // net of fees + slippage
    MAX_ABS_Z: num(process.env.MAX_ABS_Z, 2.2),              // moneyness band
    MIN_ABS_Z: num(process.env.MIN_ABS_Z, 0.0),
    MIN_PRICE_CENTS: num(process.env.MIN_PRICE_CENTS, 8),
    MAX_PRICE_CENTS: num(process.env.MAX_PRICE_CENTS, 92),
    VOL_REGIME_LOW: num(process.env.VOL_REGIME_LOW, 0.35),
    VOL_REGIME_HIGH: num(process.env.VOL_REGIME_HIGH, 2.8),
    MAX_MODEL_DISAGREE: num(process.env.MAX_MODEL_DISAGREE, 0.14),
    FLOW_VETO: num(process.env.FLOW_VETO, 0.72),             // |flow| above this vetoes fades

    // ---------- sizing & risk ----------
    BET_MIN_USD: num(process.env.BET_MIN_USD, 10),
    BET_MAX_USD: num(process.env.BET_MAX_USD, 100),
    BET_USD: num(process.env.BET_USD, 25),                   // live value, slider-controlled
    EDGE_SCALING: bool(process.env.EDGE_SCALING, false),     // scale within band by edge
    EDGE_SCALE_FULL_CENTS: num(process.env.EDGE_SCALE_FULL_CENTS, 12),
    SLOTS: num(process.env.SLOTS, 3),                        // live value, toggle-controlled
    SLOTS_MIN: num(process.env.SLOTS_MIN, 1),
    SLOTS_MAX: num(process.env.SLOTS_MAX, 5),
    MAX_OPEN_POSITIONS: num(process.env.MAX_OPEN_POSITIONS, 6), // hard ceiling above the toggle
    MAX_PER_ASSET: num(process.env.MAX_PER_ASSET, 2),
    MAX_PER_MARKET: num(process.env.MAX_PER_MARKET, 1),
    DAILY_LOSS_LIMIT_USD: num(process.env.DAILY_LOSS_LIMIT_USD, 150),
    DAILY_TRADE_LIMIT: num(process.env.DAILY_TRADE_LIMIT, 60),
    START_BANKROLL_USD: num(process.env.START_BANKROLL_USD, 1000),

    // ---------- execution ----------
    ORDER_STYLE: str(process.env.ORDER_STYLE, 'limit_touch'), // limit_touch | cross
    LIMIT_OFFSET_CENTS: num(process.env.LIMIT_OFFSET_CENTS, 0),
    ORDER_TTL_S: num(process.env.ORDER_TTL_S, 25),
    FEE_RATE: num(process.env.FEE_RATE, 0.07),               // Kalshi: ceil(rate*C*P*(1-P))
    SLIPPAGE_CENTS: num(process.env.SLIPPAGE_CENTS, 0.5),

    // ---------- exits ----------
    TAKE_PROFIT_CENTS: num(process.env.TAKE_PROFIT_CENTS, 14),
    STOP_EDGE_CENTS: num(process.env.STOP_EDGE_CENTS, -6),   // exit if edge inverts this far
    HOLD_TO_SETTLE_Z: num(process.env.HOLD_TO_SETTLE_Z, 1.6),// deep ITM: ride it out
    FLATTEN_BEFORE_CLOSE_S: num(process.env.FLATTEN_BEFORE_CLOSE_S, 0), // 0 = never

    // ---------- storage ----------
    UPSTASH_REDIS_REST_URL: str(process.env.UPSTASH_REDIS_REST_URL, ''),
    UPSTASH_REDIS_REST_TOKEN: str(process.env.UPSTASH_REDIS_REST_TOKEN, ''),
    REDIS_PREFIX: str(process.env.REDIS_PREFIX, 'kho:'),

    // ---------- per-frequency overrides ----------
    // A 15-minute contract lives 900s end to end, so hourly time gates would let
    // it trade for two thirds of its life and then some. Everything that scales
    // with the clock gets its own value.
    MIN_SECONDS_15M: num(process.env.MIN_SECONDS_15M, 45),
    MAX_SECONDS_15M: num(process.env.MAX_SECONDS_15M, 720),
    MIN_EDGE_CENTS_15M: num(process.env.MIN_EDGE_CENTS_15M, 5.0),
    MAX_SPREAD_CENTS_15M: num(process.env.MAX_SPREAD_CENTS_15M, 3),
    // Sources disagree on whether the quarter-hour families settle on the same
    // 60s index average as the hourlies or on a point reference captured on the
    // market record. Set to 1 to price them as a point settlement instead.
    SETTLE_WINDOW_15M: num(process.env.SETTLE_WINDOW_15M, 60),

    // ---------- dashboard ----------
    DASH_TOKEN: str(process.env.DASH_TOKEN, ''),             // optional write-auth
  };

  CFG.LIVE = !CFG.PAPER_MODE;

  Object.freeze(CFG);
  module.exports = CFG;
});

// ═══ module: log ════════════════════════════════════
__def('log', (module, exports) => {
  const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
  const min = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || 20;

  const ring = [];
  const CAP = 400;

  function emit(level, msg, extra) {
    if (LEVELS[level] < min) return;
    const rec = { t: Date.now(), level, msg: String(msg), extra: extra ?? null };
    ring.unshift(rec);
    if (ring.length > CAP) ring.pop();
    const line = `[${new Date(rec.t).toISOString()}] ${level.toUpperCase()} ${rec.msg}`;
    if (level === 'error') console.error(line, extra ?? '');
    else if (level === 'warn') console.warn(line, extra ?? '');
    else console.log(line, extra ?? '');
  }

  module.exports = {
    debug: (m, e) => emit('debug', m, e),
    info: (m, e) => emit('info', m, e),
    warn: (m, e) => emit('warn', m, e),
    error: (m, e) => emit('error', m, e),
    tail: (n = 120) => ring.slice(0, n),
  };
});

// ═══ module: store ════════════════════════════════════
__def('store', (module, exports) => {
  const CFG = __req('config');

  /**
   * Upstash Redis over REST (no client library — plain fetch, works on Railway).
   * If Upstash isn't configured the whole thing degrades to an in-process map so
   * the bot still runs; you just lose history across restarts.
   */

  const mem = new Map();
  const enabled = Boolean(CFG.UPSTASH_REDIS_REST_URL && CFG.UPSTASH_REDIS_REST_TOKEN);
  const K = k => CFG.REDIS_PREFIX + k;

  async function cmd(args) {
    if (!enabled) return null;
    try {
      const res = await fetch(CFG.UPSTASH_REDIS_REST_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CFG.UPSTASH_REDIS_REST_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args.map(String)),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return j.result;
    } catch {
      return null;
    }
  }

  const store = {
    enabled,

    async get(key) {
      if (!enabled) return mem.has(K(key)) ? mem.get(K(key)) : null;
      const r = await cmd(['GET', K(key)]);
      if (r == null) return null;
      try { return JSON.parse(r); } catch { return r; }
    },

    async set(key, value) {
      if (!enabled) { mem.set(K(key), value); return true; }
      await cmd(['SET', K(key), JSON.stringify(value)]);
      return true;
    },

    async incrByFloat(key, delta) {
      if (!enabled) {
        const cur = Number(mem.get(K(key)) || 0) + delta;
        mem.set(K(key), cur);
        return cur;
      }
      const r = await cmd(['INCRBYFLOAT', K(key), delta]);
      return Number(r);
    },

    /** Append to a capped list, newest first. */
    async push(key, value, cap = 500) {
      if (!enabled) {
        const arr = mem.get(K(key)) || [];
        arr.unshift(value);
        mem.set(K(key), arr.slice(0, cap));
        return true;
      }
      await cmd(['LPUSH', K(key), JSON.stringify(value)]);
      await cmd(['LTRIM', K(key), 0, cap - 1]);
      return true;
    },

    async list(key, n = 200) {
      if (!enabled) return (mem.get(K(key)) || []).slice(0, n);
      const r = await cmd(['LRANGE', K(key), 0, n - 1]);
      if (!Array.isArray(r)) return [];
      return r.map(x => { try { return JSON.parse(x); } catch { return x; } });
    },

    async hset(key, field, value) {
      if (!enabled) {
        const h = mem.get(K(key)) || {};
        h[field] = value; mem.set(K(key), h); return true;
      }
      await cmd(['HSET', K(key), field, JSON.stringify(value)]);
      return true;
    },

    async hgetall(key) {
      if (!enabled) return mem.get(K(key)) || {};
      const r = await cmd(['HGETALL', K(key)]);
      const out = {};
      if (Array.isArray(r)) {
        for (let i = 0; i < r.length; i += 2) {
          try { out[r[i]] = JSON.parse(r[i + 1]); } catch { out[r[i]] = r[i + 1]; }
        }
      } else if (r && typeof r === 'object') {
        for (const [k, v] of Object.entries(r)) {
          try { out[k] = JSON.parse(v); } catch { out[k] = v; }
        }
      }
      return out;
    },

    async hdel(key, field) {
      if (!enabled) {
        const h = mem.get(K(key)) || {};
        delete h[field]; mem.set(K(key), h); return true;
      }
      await cmd(['HDEL', K(key), field]);
      return true;
    },
  };

  module.exports = store;
});

// ═══ module: kalshi ════════════════════════════════════
__def('kalshi', (module, exports) => {
  const crypto = require('crypto');
  const CFG = __req('config');

  /**
   * Kalshi Trade API v2 client.
   *
   * Auth is RSA-PSS: sign `${timestampMs}${METHOD}${path}` where `path` includes
   * the /trade-api/v2 prefix and EXCLUDES the query string. Signature goes in
   * KALSHI-ACCESS-SIGNATURE, key id in KALSHI-ACCESS-KEY, ms timestamp in
   * KALSHI-ACCESS-TIMESTAMP.
   */

  const url = new URL(CFG.KALSHI_BASE);
  const ORIGIN = url.origin;
  const PREFIX = url.pathname.replace(/\/$/, ''); // e.g. /trade-api/v2

  let privateKey = null;
  function key() {
    if (privateKey) return privateKey;
    if (!CFG.KALSHI_PRIVATE_KEY) throw new Error('KALSHI_PRIVATE_KEY is not set');
    privateKey = crypto.createPrivateKey(CFG.KALSHI_PRIVATE_KEY);
    return privateKey;
  }

  function sign(ts, method, path) {
    return crypto
      .sign('sha256', Buffer.from(`${ts}${method}${path}`, 'utf8'), {
        key: key(),
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      })
      .toString('base64');
  }

  // --- crude but effective token bucket: Kalshi throttles hard on bursts ---
  let tokens = 10;
  const MAX_TOKENS = 10;
  setInterval(() => { tokens = Math.min(MAX_TOKENS, tokens + 5); }, 1000).unref();

  async function throttle() {
    while (tokens <= 0) await new Promise(r => setTimeout(r, 60));
    tokens -= 1;
  }

  const stats = { calls: 0, errors: 0, lastError: null, lastLatencyMs: 0 };

  async function request(method, path, { query, body, retries = 2 } = {}) {
    await throttle();
    const fullPath = PREFIX + path;
    const qs = query
      ? '?' + new URLSearchParams(
          Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
        ).toString()
      : '';
    const ts = Date.now().toString();

    const headers = {
      'Content-Type': 'application/json',
      'KALSHI-ACCESS-KEY': CFG.KALSHI_KEY_ID,
      'KALSHI-ACCESS-TIMESTAMP': ts,
      'KALSHI-ACCESS-SIGNATURE': sign(ts, method, fullPath),
    };

    const t0 = Date.now();
    try {
      stats.calls += 1;
      const res = await fetch(ORIGIN + fullPath + qs, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      stats.lastLatencyMs = Date.now() - t0;

      if (res.status === 429 && retries > 0) {
        await new Promise(r => setTimeout(r, 700));
        return request(method, path, { query, body, retries: retries - 1 });
      }
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

      if (!res.ok) {
        const err = new Error(`Kalshi ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      return json;
    } catch (e) {
      stats.errors += 1;
      stats.lastError = { at: Date.now(), msg: String(e.message || e) };
      if (retries > 0 && !e.status) {
        await new Promise(r => setTimeout(r, 400));
        return request(method, path, { query, body, retries: retries - 1 });
      }
      throw e;
    }
  }

  const kalshi = {
    stats,

    configured: () => Boolean(CFG.KALSHI_KEY_ID && CFG.KALSHI_PRIVATE_KEY),

    balance: () => request('GET', '/portfolio/balance'),

    series: t => request('GET', `/series/${encodeURIComponent(t)}`),

    /** Open markets for a series, newest close first. */
    markets: (seriesTicker, limit = 200) =>
      request('GET', '/markets', {
        query: { series_ticker: seriesTicker, status: 'open', limit },
      }),

    market: ticker => request('GET', `/markets/${encodeURIComponent(ticker)}`),

    orderbook: (ticker, depth = 10) =>
      request('GET', `/markets/${encodeURIComponent(ticker)}/orderbook`, { query: { depth } }),

    positions: () =>
      request('GET', '/portfolio/positions', { query: { count_filter: 'position', limit: 200 } }),

    orders: (status = 'resting') =>
      request('GET', '/portfolio/orders', { query: { status, limit: 200 } }),

    /**
     * side: 'yes' | 'no'; action: 'buy' | 'sell'
     * priceCents is the limit for the chosen side (1..99).
     */
    createOrder: ({ ticker, side, action, count, priceCents, clientOrderId, type = 'limit', tif }) => {
      const body = {
        ticker,
        action,
        side,
        count,
        type,
        client_order_id: clientOrderId || crypto.randomUUID(),
      };
      if (type === 'limit') {
        if (side === 'yes') body.yes_price = Math.round(priceCents);
        else body.no_price = Math.round(priceCents);
      }
      if (tif) body.time_in_force = tif;
      return request('POST', '/portfolio/orders', { body });
    },

    cancelOrder: id => request('DELETE', `/portfolio/orders/${encodeURIComponent(id)}`),

    order: id => request('GET', `/portfolio/orders/${encodeURIComponent(id)}`),

    fills: (ticker, limit = 100) =>
      request('GET', '/portfolio/fills', { query: { ticker, limit } }),
  };

  module.exports = kalshi;
});

// ═══ module: pricing ════════════════════════════════════
__def('pricing', (module, exports) => {
  const CFG = __req('config');

  /**
   * FAIR VALUE
   *
   * A Kalshi hourly crypto contract is a digital option, but not on the terminal
   * price — on the *average of the index over the final 60 seconds*. Almost every
   * naive model prices P(S_T > K). That is the wrong random variable and it
   * systematically overstates uncertainty near the close.
   *
   * Variance of the settlement value, τ seconds out, averaging window W:
   *
   *   before the window opens (τ > W):   σ² · [ (τ − W) + W/3 ]
   *   inside the window       (τ ≤ W):   σ² · τ³ / (3W²)
   *
   * The W/3 term is the variance of the mean of a Brownian path over the window —
   * one third of the terminal variance. Ignoring it prices every contract as if it
   * were 40 seconds longer-dated than it is.
   *
   * The centre of the distribution is not spot either. Settlement runs on a
   * time-weighted index that lags venue spot. We start from where the index
   * actually is and let it converge toward spot over the remaining horizon.
   */

  // ---- normal CDF (Abramowitz & Stegun 7.1.26 on erf) ----
  function erf(x) {
    const s = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = z => 0.5 * (1 + erf(z / Math.SQRT2));

  /** Variance multiplier for an average-over-window settlement. */
  function settleVarMultiplier(tau, W) {
    if (tau <= 0) return 0;
    if (tau <= W) return (tau * tau * tau) / (3 * W * W);
    return (tau - W) + W / 3;
  }

  /**
   * @param {object} o oracle asset snapshot-ish live state
   * @param {object} m { floorStrike, capStrike, tau }
   */
  function fairValue(o, m) {
    const tau = Math.max(1, m.tau);
    const W = Math.max(1, m.settleWindow ?? CFG.SETTLE_WINDOW_S);
    const spot = o.composite;
    const index = o.index ?? spot;
    if (!(spot > 0) || !(index > 0) || !(o.sigma > 0)) return null;

    // --- centre: index converging toward spot over the remaining horizon ---
    const tauMid = Math.max(0, tau - W / 2);
    const absorbed = 1 - Math.pow(0.5, tauMid / CFG.INDEX_LAG_HALFLIFE_S);
    const gap = spot - index;
    const centre = index + gap * absorbed * CFG.DRIFT_CATCHUP;

    // --- micro drift from aggressive order flow, capped and horizon-scaled ---
    const tilt = (o.flow || 0) * (CFG.FLOW_TILT_MAX_BPS / 10000) * Math.min(1, tau / 300);

    // --- dispersion ---
    const varMult = settleVarMultiplier(tau, W);
    const noise = Math.pow(CFG.ORACLE_NOISE_BPS / 10000, 2);
    const sigmaEff = Math.sqrt(o.sigma * o.sigma * varMult + noise);
    if (!(sigmaEff > 0)) return null;

    const above = k => {
      const z = (Math.log(k / centre) - tilt) / sigmaEff;
      return { p: 1 - Phi(z), z };
    };

    let pGauss, zRef;
    if (m.floorStrike != null && m.capStrike != null) {
      const lo = above(m.floorStrike), hi = above(m.capStrike);
      pGauss = Math.max(0, lo.p - hi.p);
      zRef = Math.min(Math.abs(lo.z), Math.abs(hi.z));
    } else if (m.floorStrike != null) {
      const r = above(m.floorStrike);
      pGauss = r.p; zRef = r.z;
    } else if (m.capStrike != null) {
      const r = above(m.capStrike);
      pGauss = 1 - r.p; zRef = -r.z;
    } else {
      return null;
    }

    // --- empirical: bootstrap the actual return distribution at this horizon ---
    let pEmp = null, empN = 0, empDraws = 0;
    const rets = o.empiricalReturns ? o.empiricalReturns(tauMid + W / 3) : null;
    if (rets && rets.length >= CFG.EMPIRICAL_MIN_SAMPLES) {
      empN = rets.length;
      empDraws = rets.independent || 1;
      const hitLo = m.floorStrike != null ? Math.log(m.floorStrike / centre) - tilt : null;
      const hitHi = m.capStrike != null ? Math.log(m.capStrike / centre) - tilt : null;
      let hits = 0;
      for (const r of rets) {
        const okLo = hitLo == null ? true : r > hitLo;
        const okHi = hitHi == null ? true : r < hitHi;
        if (okLo && okHi) hits += 1;
      }
      pEmp = hits / rets.length;
    }

    // Weight the bootstrap by INDEPENDENT draws, not by how many overlapping
    // slices we managed to cut. Thin history gets a quiet vote.
    let wEmp = 0;
    if (pEmp != null) {
      const draws = rets.independent || 1;
      wEmp = Math.min(CFG.EMPIRICAL_MAX_WEIGHT,
        CFG.EMPIRICAL_MAX_WEIGHT * Math.min(1, draws / CFG.EMPIRICAL_FULL_WEIGHT_DRAWS));
    }
    const p = Math.max(0.001, Math.min(0.999, (1 - wEmp) * pGauss + wEmp * (pEmp ?? pGauss)));

    return {
      p,                                   // P(YES settles true)
      pGauss,
      pEmp,
      empN,
      empDraws,
      wEmp,
      z: zRef,
      centre,
      spot,
      index,
      lagBps: ((spot - index) / index) * 10000,
      driftBps: ((centre - index) / index) * 10000,
      sigmaEff,
      sigmaEffBps: sigmaEff * 10000,
      tiltBps: tilt * 10000,
      disagree: pEmp == null ? 0 : Math.abs(pGauss - pEmp),
      tau,
    };
  }

  /** Kalshi trading fee, in cents, for `count` contracts at price P (dollars). */
  function feeCents(count, priceDollars) {
    const p = Math.max(0, Math.min(1, priceDollars));
    return Math.ceil(CFG.FEE_RATE * count * p * (1 - p) * 100);
  }

  module.exports = { fairValue, feeCents, Phi, settleVarMultiplier };
});

// ═══ module: oracle ════════════════════════════════════
__def('oracle', (module, exports) => {
  const WebSocket = require('ws');
  const CFG = __req('config');
  const log = __req('log');

  /**
   * THE ORACLE
   *
   * Kalshi does not settle crypto on "the price on Binance". Every crypto contract
   * settles on a 60-second average of the relevant CF Benchmarks Real-Time Index,
   * sampled once per second over the final minute of the window.
   *
   * That has two consequences this module is built around:
   *
   *  1. The right spot feed is a *reconstruction of the index*, not the loudest
   *     exchange. We aggregate the index's own constituent venues (regulated USD
   *     spot: Coinbase, Kraken, Bitstamp) into a volume-weighted composite. Using
   *     Binance perp here would answer a slightly different question than the one
   *     Kalshi resolves, and on a binary that residual flips outcomes.
   *
   *  2. The index is time-weighted, so it *lags* venue spot by roughly 8-14s on a
   *     fast move. We therefore track two numbers: the live composite (where price
   *     actually is) and an EWMA-smoothed emulation of the index (where the
   *     settlement source currently thinks price is). The gap between them is a
   *     known, mechanical, forward-looking drift — the index must catch up. That
   *     gap is the single largest source of edge in this bot.
   */

  const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'HYPE'];

  const SYMBOLS = {
    coinbase: { BTC: 'BTC-USD', ETH: 'ETH-USD', SOL: 'SOL-USD', XRP: 'XRP-USD', DOGE: 'DOGE-USD', HYPE: 'HYPE-USD' },
    kraken:   { BTC: 'BTC/USD', ETH: 'ETH/USD', SOL: 'SOL/USD', XRP: 'XRP/USD', DOGE: 'XDG/USD' },
    bitstamp: { BTC: 'btcusd', ETH: 'ethusd', SOL: 'solusd', XRP: 'xrpusd', DOGE: 'dogeusd' },
  };

  // Rough constituent weights. Renormalised over whichever venues are live.
  const VENUE_WEIGHT = { coinbase: 0.40, kraken: 0.35, bitstamp: 0.25 };

  const RING_S = 4 * 3600;      // 4h of 1Hz composite samples per asset
  const HALF_LIFE_FAST = CFG.VOL_FAST_S;
  const HALF_LIFE_SLOW = CFG.VOL_SLOW_S;

  function decay(halfLifeS, dtS) { return Math.pow(0.5, dtS / halfLifeS); }

  class AssetState {
    constructor(asset) {
      this.asset = asset;
      this.venues = {};              // venue -> { price, ts }
      this.composite = null;         // live volume-weighted composite
      this.index = null;             // EWMA emulation of the CF RTI
      this.dispersionBps = 0;
      this.liveVenues = 0;

      this.ring = new Float64Array(RING_S);
      this.ringTs = new Float64Array(RING_S);
      this.ringLen = 0;
      this.ringHead = 0;

      // Last 120 emulated index prints — Kalshi settles on the mean of the final 60.
      this.idxRing = [];

      this.varFast = 0;
      this.varSlow = 0;
      this.sigma = 0;                // per-sqrt(second) log-return vol
      this.sigmaBaseline = 0;        // 6h EWMA of sigma, for regime detection
      this.flow = 0;                 // signed aggressive volume EWMA, [-1,1]
      this.flowNotional = 0;
      this.lastSample = 0;
    }

    onTick(venue, price, ts) {
      if (!(price > 0)) return;
      this.venues[venue] = { price, ts };
    }

    onTrade(venue, price, size, side, ts) {
      this.onTick(venue, price, ts);
      if (!size || !side) return;
      const notional = price * size;
      const d = decay(20, 1);
      this.flowNotional = this.flowNotional * d + notional;
      const signed = side === 'buy' ? notional : -notional;
      this.flowRaw = (this.flowRaw || 0) * d + signed;
      this.flow = this.flowNotional > 0
        ? Math.max(-1, Math.min(1, this.flowRaw / this.flowNotional))
        : 0;
    }

    /** Called once per second. */
    sample(now) {
      const fresh = [];
      let wsum = 0;
      for (const [v, t] of Object.entries(this.venues)) {
        if (now - t.ts > CFG.STALE_TICK_MS) continue;
        const w = VENUE_WEIGHT[v] || 0.2;
        fresh.push({ v, price: t.price, w });
        wsum += w;
      }
      this.liveVenues = fresh.length;
      if (!fresh.length) return;

      const comp = fresh.reduce((a, f) => a + f.price * (f.w / wsum), 0);
      const hi = Math.max(...fresh.map(f => f.price));
      const lo = Math.min(...fresh.map(f => f.price));
      this.dispersionBps = comp > 0 ? ((hi - lo) / comp) * 10000 : 0;

      const prev = this.composite;
      this.composite = comp;

      // Emulate the index's own time-weighted smoothing.
      if (this.index == null) this.index = comp;
      else {
        const a = 1 - decay(CFG.INDEX_LAG_HALFLIFE_S, 1);
        this.index = this.index + a * (comp - this.index);
      }

      // Realised vol from 1s log returns, two horizons.
      if (prev > 0) {
        const r = Math.log(comp / prev);
        const r2 = r * r;
        const af = 1 - decay(HALF_LIFE_FAST, 1);
        const as = 1 - decay(HALF_LIFE_SLOW, 1);
        this.varFast = this.varFast === 0 ? r2 : this.varFast + af * (r2 - this.varFast);
        this.varSlow = this.varSlow === 0 ? r2 : this.varSlow + as * (r2 - this.varSlow);

        const blended = CFG.VOL_BLEND_FAST * this.varFast + (1 - CFG.VOL_BLEND_FAST) * this.varSlow;
        const floor = Math.pow(CFG.VOL_FLOOR_BPS_PER_ROOT_S / 10000, 2);
        this.sigma = Math.sqrt(Math.max(blended, floor));

        const ab = 1 - decay(6 * 3600, 1);
        this.sigmaBaseline = this.sigmaBaseline === 0
          ? this.sigma
          : this.sigmaBaseline + ab * (this.sigma - this.sigmaBaseline);
      }

      this.idxRing.push(this.index);
      if (this.idxRing.length > 120) this.idxRing.shift();

      this.ring[this.ringHead] = comp;
      this.ringTs[this.ringHead] = now;
      this.ringHead = (this.ringHead + 1) % RING_S;
      this.ringLen = Math.min(RING_S, this.ringLen + 1);
      this.lastSample = now;
    }

    /**
     * Empirical distribution of log returns over `h` seconds, from stored history.
     * Overlapping windows, subsampled. Returns a sorted array (may be short).
     */
    empiricalReturns(h, maxSamples = 900) {
      const h1 = Math.max(1, Math.round(h));
      // Overlapping windows are heavily autocorrelated: 300 windows carved out of
      // 20 minutes of tape is one draw wearing 300 hats. Demand enough history for
      // a meaningful number of INDEPENDENT draws before the bootstrap is allowed
      // to vote at all, otherwise it just shouts down the closed form.
      if (this.ringLen < h1 * CFG.EMPIRICAL_MIN_HISTORY_MULT) return null;
      const n = this.ringLen;
      const out = [];
      const usable = n - h1;
      const step = Math.max(1, Math.floor(usable / maxSamples));
      for (let i = 0; i < usable; i += step) {
        const iA = (this.ringHead - n + i + RING_S * 2) % RING_S;
        const iB = (iA + h1) % RING_S;
        const a = this.ring[iA];
        const b = this.ring[iB];
        if (a > 0 && b > 0) out.push(Math.log(b / a));
      }
      if (out.length < 30) return null;
      out.sort((x, y) => x - y);
      out.independent = this.ringLen / h1;   // ~how many non-overlapping draws
      return out;
    }

    /** Replicates Kalshi's settlement value: mean of the final 60 index prints. */
    settlementValue(window = CFG.SETTLE_WINDOW_S) {
      const tail = this.idxRing.slice(-window);
      if (!tail.length) return this.index ?? this.composite ?? null;
      return tail.reduce((a, b) => a + b, 0) / tail.length;
    }

    snapshot() {
      return {
        asset: this.asset,
        settlement: this.settlementValue(),
        composite: this.composite,
        index: this.index,
        lagBps: this.composite && this.index
          ? ((this.composite - this.index) / this.index) * 10000 : 0,
        dispersionBps: this.dispersionBps,
        liveVenues: this.liveVenues,
        venues: Object.fromEntries(
          Object.entries(this.venues).map(([v, t]) => [v, { price: t.price, ageMs: Date.now() - t.ts }])
        ),
        sigma: this.sigma,
        sigmaBaseline: this.sigmaBaseline,
        volRegime: this.sigmaBaseline > 0 ? this.sigma / this.sigmaBaseline : 1,
        sigma1mBps: this.sigma * Math.sqrt(60) * 10000,
        flow: this.flow,
        historySec: this.ringLen,
        healthy: this.liveVenues >= CFG.MIN_VENUES
          && this.dispersionBps <= CFG.MAX_VENUE_DISPERSION_BPS
          && this.composite > 0,
      };
    }
  }

  const state = Object.fromEntries(ASSETS.map(a => [a, new AssetState(a)]));

  // ---------------------------------------------------------------- venue feeds

  function connect(name, build) {
    let ws = null;
    let backoff = 1000;
    let alive = false;

    const open = () => {
      try { ws = build(); } catch (e) { log.warn(`${name} ws build failed`, e.message); return retry(); }
      if (!ws) return;
      ws.on('open', () => { alive = true; backoff = 1000; log.info(`oracle: ${name} connected`); });
      ws.on('close', () => { alive = false; retry(); });
      ws.on('error', e => { log.warn(`oracle: ${name} error ${e.message}`); });
    };

    const retry = () => {
      setTimeout(open, backoff);
      backoff = Math.min(30000, backoff * 1.8);
    };

    open();
    return { name, isAlive: () => alive };
  }

  function startCoinbase() {
    const products = Object.values(SYMBOLS.coinbase);
    const rev = Object.fromEntries(Object.entries(SYMBOLS.coinbase).map(([a, s]) => [s, a]));
    return connect('coinbase', () => {
      const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
      ws.on('open', () => ws.send(JSON.stringify({
        type: 'subscribe', product_ids: products, channels: ['ticker'],
      })));
      ws.on('message', buf => {
        let m; try { m = JSON.parse(buf); } catch { return; }
        if (m.type !== 'ticker' || !m.product_id) return;
        const asset = rev[m.product_id];
        if (!asset || !state[asset]) return;
        const px = Number(m.price);
        const sz = Number(m.last_size) || 0;
        // Coinbase's ticker `side` is the MAKER side, so the aggressor is the
        // opposite. Flip COINBASE_MAKER_SIDE=false if you'd rather read it raw.
        const raw = m.side === 'buy' ? 'buy' : m.side === 'sell' ? 'sell' : null;
        const side = raw == null ? null : (CFG.COINBASE_MAKER_SIDE ? (raw === 'buy' ? 'sell' : 'buy') : raw);
        state[asset].onTrade('coinbase', px, sz, side, Date.now());
      });
      return ws;
    });
  }

  function startKraken() {
    const symbols = Object.values(SYMBOLS.kraken);
    const rev = Object.fromEntries(Object.entries(SYMBOLS.kraken).map(([a, s]) => [s, a]));
    return connect('kraken', () => {
      const ws = new WebSocket('wss://ws.kraken.com/v2');
      ws.on('open', () => ws.send(JSON.stringify({
        method: 'subscribe', params: { channel: 'ticker', symbol: symbols },
      })));
      ws.on('message', buf => {
        let m; try { m = JSON.parse(buf); } catch { return; }
        if (m.channel !== 'ticker' || !Array.isArray(m.data)) return;
        for (const d of m.data) {
          const asset = rev[d.symbol];
          if (!asset || !state[asset]) continue;
          const px = Number(d.last ?? d.vwap);
          if (px > 0) state[asset].onTick('kraken', px, Date.now());
        }
      });
      return ws;
    });
  }

  function startBitstamp() {
    const rev = Object.fromEntries(Object.entries(SYMBOLS.bitstamp).map(([a, s]) => [s, a]));
    return connect('bitstamp', () => {
      const ws = new WebSocket('wss://ws.bitstamp.net');
      ws.on('open', () => {
        for (const s of Object.values(SYMBOLS.bitstamp)) {
          ws.send(JSON.stringify({ event: 'bts:subscribe', data: { channel: `live_trades_${s}` } }));
        }
      });
      ws.on('message', buf => {
        let m; try { m = JSON.parse(buf); } catch { return; }
        if (!m.channel || !m.channel.startsWith('live_trades_') || !m.data) return;
        const asset = rev[m.channel.replace('live_trades_', '')];
        if (!asset || !state[asset]) return;
        const px = Number(m.data.price);
        const sz = Number(m.data.amount) || 0;
        const side = m.data.type === 1 ? 'sell' : 'buy';
        state[asset].onTrade('bitstamp', px, sz, side, Date.now());
      });
      return ws;
    });
  }

  let feeds = [];
  let sampler = null;

  function start() {
    const starters = { coinbase: startCoinbase, kraken: startKraken, bitstamp: startBitstamp };
    feeds = CFG.ORACLE_VENUES.map(v => starters[v]).filter(Boolean).map(f => f());

    sampler = setInterval(() => {
      const now = Date.now();
      for (const a of ASSETS) state[a].sample(now);
    }, 1000);
    sampler.unref?.();
    log.info(`oracle: started with venues ${CFG.ORACLE_VENUES.join(', ')}`);
  }

  module.exports = {
    ASSETS,
    start,
    get: asset => state[asset] || null,
    snapshot: () => Object.fromEntries(ASSETS.map(a => [a, state[a].snapshot()])),
    feedStatus: () => feeds.map(f => ({ venue: f.name, alive: f.isAlive() })),
  };
});

// ═══ module: portfolio ════════════════════════════════════
__def('portfolio', (module, exports) => {
  const crypto = require('crypto');
  const CFG = __req('config');
  const store = __req('store');
  const log = __req('log');

  const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

  const P = {
    bankroll: CFG.START_BANKROLL_USD,
    realized: 0,
    positions: new Map(),   // ticker -> position
    trades: [],             // closed trades, newest first (capped)
    day: { key: dayKey(), pnl: 0, trades: 0, wins: 0, losses: 0 },
    equityCurve: [],        // { t, equity }
    calibration: {},        // bucket -> { n, predicted, actual }
  };

  // ------------------------------------------------------------------ lifecycle

  async function hydrate() {
    const saved = await store.get('state');
    if (saved) {
      P.bankroll = saved.bankroll ?? P.bankroll;
      P.realized = saved.realized ?? 0;
      P.day = saved.day?.key === dayKey() ? saved.day : { key: dayKey(), pnl: 0, trades: 0, wins: 0, losses: 0 };
      P.calibration = saved.calibration || {};
      P.equityCurve = saved.equityCurve || [];
    }
    const open = await store.hgetall('positions');
    for (const [t, pos] of Object.entries(open)) P.positions.set(t, pos);
    P.trades = await store.list('trades', 300);
    log.info(`portfolio: hydrated — bankroll $${P.bankroll.toFixed(2)}, ${P.positions.size} open`);
  }

  async function persistState() {
    await store.set('state', {
      bankroll: P.bankroll,
      realized: P.realized,
      day: P.day,
      calibration: P.calibration,
      equityCurve: P.equityCurve.slice(-720),
    });
  }

  function rollDay() {
    const k = dayKey();
    if (P.day.key !== k) P.day = { key: k, pnl: 0, trades: 0, wins: 0, losses: 0 };
  }

  // ------------------------------------------------------------------ positions

  async function open(entry) {
    rollDay();
    const pos = {
      id: crypto.randomUUID(),
      ticker: entry.ticker,
      asset: entry.asset,
      series: entry.series,
      side: entry.side,                 // 'yes' | 'no'
      contracts: entry.contracts,
      entryPrice: entry.price,          // cents
      costUsd: (entry.contracts * entry.price) / 100,
      feeUsd: entry.feeUsd,
      openedAt: Date.now(),
      closeTime: entry.closeTime,
      freq: entry.freq || 'hourly',
      freqLabel: entry.freqLabel || '1H',
      settleWindow: entry.settleWindow,
      floorStrike: entry.floorStrike,
      capStrike: entry.capStrike,
      // full decision record — this is what makes the ledger useful later
      modelP: entry.modelP,
      fv: entry.fv,
      edgeCents: entry.edgeCents,
      gates: entry.gates,
      orderId: entry.orderId || null,
      paper: entry.paper,
      status: 'open',
      markPrice: entry.price,
      unrealizedUsd: 0,
    };
    P.positions.set(pos.ticker, pos);
    P.bankroll -= pos.costUsd + (pos.feeUsd || 0);
    P.day.trades += 1;
    await store.hset('positions', pos.ticker, pos);
    await persistState();
    log.info(`OPEN ${pos.asset} [${pos.freqLabel}] ${pos.ticker} ${pos.side.toUpperCase()} x${pos.contracts} @ ${pos.entryPrice}¢ (edge ${pos.edgeCents.toFixed(1)}¢)`);
    return pos;
  }

  function mark(ticker, priceCents) {
    const pos = P.positions.get(ticker);
    if (!pos || priceCents == null) return;
    pos.markPrice = priceCents;
    pos.unrealizedUsd = ((priceCents - pos.entryPrice) * pos.contracts) / 100;
  }

  async function close(ticker, { exitPrice, reason, settled = false, won = null, exitFeeUsd = 0 }) {
    const pos = P.positions.get(ticker);
    if (!pos) return null;
    rollDay();

    let proceeds;
    if (settled) proceeds = won ? pos.contracts * 1.0 : 0;
    else proceeds = (pos.contracts * exitPrice) / 100;

    const pnl = proceeds - pos.costUsd - (pos.feeUsd || 0) - exitFeeUsd;
    P.bankroll += proceeds - exitFeeUsd;
    P.realized += pnl;
    P.day.pnl += pnl;
    if (pnl > 0) P.day.wins += 1; else P.day.losses += 1;

    const trade = {
      ...pos,
      status: settled ? 'settled' : 'closed',
      exitPrice: settled ? (won ? 100 : 0) : exitPrice,
      exitReason: reason,
      closedAt: Date.now(),
      holdSec: Math.round((Date.now() - pos.openedAt) / 1000),
      pnlUsd: pnl,
      roiPct: pos.costUsd > 0 ? (pnl / pos.costUsd) * 100 : 0,
      outcome: settled ? (won ? 'win' : 'loss') : (pnl > 0 ? 'win' : 'loss'),
    };

    // calibration: did the model's stated probability actually happen?
    if (settled) {
      const b = Math.min(9, Math.floor(pos.modelP * 10));
      const c = P.calibration[b] || { n: 0, predicted: 0, actual: 0 };
      c.n += 1; c.predicted += pos.modelP; c.actual += won ? 1 : 0;
      P.calibration[b] = c;
    }

    P.positions.delete(ticker);
    P.trades.unshift(trade);
    if (P.trades.length > 300) P.trades.pop();
    P.equityCurve.push({ t: Date.now(), equity: equity() });
    if (P.equityCurve.length > 720) P.equityCurve.shift();

    await store.hdel('positions', ticker);
    await store.push('trades', trade, 300);
    await persistState();
    log.info(`CLOSE ${pos.asset} ${ticker} ${reason} → ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`);
    return trade;
  }

  // ------------------------------------------------------------------ reporting

  const unrealized = () => [...P.positions.values()].reduce((a, p) => a + (p.unrealizedUsd || 0), 0);
  const deployed = () => [...P.positions.values()].reduce((a, p) => a + p.costUsd, 0);
  const equity = () => P.bankroll + deployed() + unrealized();

  function exposure() {
    const byAsset = {};
    for (const p of P.positions.values()) byAsset[p.asset] = (byAsset[p.asset] || 0) + 1;
    rollDay();
    return {
      open: P.positions.size,
      byAsset,
      tickers: new Set(P.positions.keys()),
      dayPnl: P.day.pnl,
      dayTrades: P.day.trades,
    };
  }

  function stats() {
    const settled = P.trades.filter(t => t.status === 'settled' || t.status === 'closed');
    const wins = settled.filter(t => t.pnlUsd > 0).length;
    const totalStaked = settled.reduce((a, t) => a + t.costUsd, 0);
    const byAsset = {};
    const byFreq = {};
    for (const t of settled) {
      const a = byAsset[t.asset] || { w: 0, l: 0, pnl: 0 };
      if (t.pnlUsd > 0) a.w += 1; else a.l += 1;
      a.pnl += t.pnlUsd;
      byAsset[t.asset] = a;

      const k = t.freqLabel || '1H';
      const f = byFreq[k] || { w: 0, l: 0, pnl: 0, staked: 0 };
      if (t.pnlUsd > 0) f.w += 1; else f.l += 1;
      f.pnl += t.pnlUsd; f.staked += t.costUsd;
      byFreq[k] = f;
    }
    for (const f of Object.values(byFreq)) f.roi = f.staked > 0 ? (f.pnl / f.staked) * 100 : 0;
    const calib = Object.entries(P.calibration).map(([b, c]) => ({
      bucket: `${b * 10}-${b * 10 + 10}%`,
      n: c.n,
      predicted: c.n ? (c.predicted / c.n) * 100 : 0,
      actual: c.n ? (c.actual / c.n) * 100 : 0,
    })).sort((x, y) => parseInt(x.bucket) - parseInt(y.bucket));

    return {
      bankroll: P.bankroll,
      deployed: deployed(),
      unrealized: unrealized(),
      equity: equity(),
      realized: P.realized,
      roiPct: totalStaked > 0 ? (P.realized / totalStaked) * 100 : 0,
      trades: settled.length,
      wins,
      losses: settled.length - wins,
      winRate: settled.length ? (wins / settled.length) * 100 : 0,
      avgHoldSec: settled.length ? settled.reduce((a, t) => a + (t.holdSec || 0), 0) / settled.length : 0,
      day: P.day,
      byAsset,
      byFreq,
      calibration: calib,
      equityCurve: P.equityCurve.slice(-240),
    };
  }

  module.exports = {
    P, hydrate, open, close, mark, exposure, stats, equity, persistState,
    positions: () => [...P.positions.values()],
    trades: (n = 60) => P.trades.slice(0, n),
  };
});

// ═══ module: strategy ════════════════════════════════════
__def('strategy', (module, exports) => {
  const CFG = __req('config');
  const { fairValue, feeCents } = __req('pricing');

  /**
   * Nine gates. A trade fires only when all of them pass. Every gate records its
   * measured value whether it passes or not, so the dashboard can show you exactly
   * why a candidate died — and so the calibration ledger can tell you later which
   * gate was actually earning its keep.
   */

  /** Per-frequency tuning. The model is identical; only the clock changes. */
  const FREQ = {
    hourly: {
      key: 'hourly', label: '1H',
      minSec: CFG.MIN_SECONDS_TO_CLOSE, maxSec: CFG.MAX_SECONDS_TO_CLOSE,
      minEdge: CFG.MIN_EDGE_CENTS, maxSpread: CFG.MAX_SPREAD_CENTS,
      settleWindow: CFG.SETTLE_WINDOW_S,
    },
    m15: {
      key: 'm15', label: '15M',
      minSec: CFG.MIN_SECONDS_15M, maxSec: CFG.MAX_SECONDS_15M,
      minEdge: CFG.MIN_EDGE_CENTS_15M, maxSpread: CFG.MAX_SPREAD_CENTS_15M,
      settleWindow: CFG.SETTLE_WINDOW_15M,
    },
  };

  function readBook(ob) {
    const yes = (ob?.orderbook?.yes || []).filter(l => Array.isArray(l) && l.length >= 2);
    const no = (ob?.orderbook?.no || []).filter(l => Array.isArray(l) && l.length >= 2);
    const bestYes = yes.length ? yes.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
    const bestNo = no.length ? no.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;

    const yesBid = bestYes ? bestYes[0] : null;
    const yesBidSize = bestYes ? bestYes[1] : 0;
    const noBid = bestNo ? bestNo[0] : null;
    const noBidSize = bestNo ? bestNo[1] : 0;

    const yesAsk = noBid != null ? 100 - noBid : null;
    const noAsk = yesBid != null ? 100 - yesBid : null;

    return {
      yesBid, yesBidSize, noBid, noBidSize, yesAsk, noAsk,
      yesAskSize: noBidSize, noAskSize: yesBidSize,
      mid: yesBid != null && yesAsk != null ? (yesBid + yesAsk) / 2 : null,
      spread: yesBid != null && yesAsk != null ? yesAsk - yesBid : null,
    };
  }

  function contractsFor(usd, priceCents, depth) {
    const n = Math.floor((usd * 100) / Math.max(1, priceCents));
    return Math.max(0, Math.min(n, depth || 0));
  }

  function sizeUsd(edgeCents, betUsd) {
    const base = clampBet(betUsd ?? CFG.BET_USD);
    if (!CFG.EDGE_SCALING) return base;
    // Scale from the slider value up toward the ceiling as edge improves.
    const t = Math.max(0, Math.min(1,
      (edgeCents - CFG.MIN_EDGE_CENTS) / Math.max(0.5, CFG.EDGE_SCALE_FULL_CENTS - CFG.MIN_EDGE_CENTS)));
    return clampBet(base + t * (CFG.BET_MAX_USD - base));
  }
  const clampBet = u => Math.max(CFG.BET_MIN_USD, Math.min(CFG.BET_MAX_USD, u));

  /**
   * @param {object} ctx { market, book, oracleState, betUsd, exposure }
   */
  function evaluate(ctx) {
    const { market, ob, o, betUsd, exposure } = ctx;
    const slots = Math.min(ctx.maxSlots ?? CFG.SLOTS, CFG.MAX_OPEN_POSITIONS);
    const F = ctx.freq || FREQ.hourly;
    const now = Date.now();
    const closeMs = Date.parse(market.close_time);
    const tau = (closeMs - now) / 1000;

    const book = readBook(ob);
    const fv = fairValue(o, {
      floorStrike: market.floor_strike ?? null,
      capStrike: market.cap_strike ?? null,
      settleWindow: F.settleWindow,
      tau,
    });

    const gates = [];
    const G = (name, pass, value, detail) => { gates.push({ name, pass: !!pass, value, detail }); return !!pass; };

    const okOracle = G('oracle',
      o.liveVenues >= CFG.MIN_VENUES && o.dispersionBps <= CFG.MAX_VENUE_DISPERSION_BPS,
      `${o.liveVenues} venues / ${o.dispersionBps.toFixed(1)}bps`,
      'index reconstruction must be quorate and tight');

    const okTime = G('time',
      tau >= F.minSec && tau <= F.maxSec,
      `${Math.round(tau)}s`,
      'skip the gamma lottery at the bell and the dead zone at the open');

    const okBook = G('liquidity',
      book.spread != null && book.spread <= F.maxSpread,
      book.spread == null ? 'no book' : `${book.spread}¢`,
      'crossing a wide book eats the edge you came for');

    const regime = o.sigmaBaseline > 0 ? o.sigma / o.sigmaBaseline : 1;
    const okRegime = G('vol regime',
      regime >= CFG.VOL_REGIME_LOW && regime <= CFG.VOL_REGIME_HIGH,
      `${regime.toFixed(2)}x`,
      'vol shocks break the Gaussian core; sit them out');

    if (!fv) {
      G('model', false, 'no fair value', 'oracle history too thin');
      return { skip: true, gates, tau, book, fv: null };
    }

    const okMoney = G('moneyness',
      Math.abs(fv.z) <= CFG.MAX_ABS_Z && Math.abs(fv.z) >= CFG.MIN_ABS_Z,
      `z=${fv.z.toFixed(2)}`,
      'deep wings are all fee and no edge');

    const okAgree = G('model agreement',
      fv.disagree <= CFG.MAX_MODEL_DISAGREE,
      fv.pEmp == null ? 'gaussian only' : `Δ${(fv.disagree * 100).toFixed(1)}pp`,
      'closed-form and bootstrap must tell the same story');

    // --- candidate sides ---
    const cands = [];
    if (book.yesAsk != null) {
      const px = book.yesAsk;
      const gross = fv.p * 100 - px;
      cands.push({ side: 'yes', price: px, depth: book.yesAskSize, gross, modelP: fv.p });
    }
    if (book.noAsk != null) {
      const px = book.noAsk;
      const gross = (1 - fv.p) * 100 - px;
      cands.push({ side: 'no', price: px, depth: book.noAskSize, gross, modelP: 1 - fv.p });
    }

    let best = null;
    for (const c of cands) {
      const usd = sizeUsd(c.gross, betUsd);
      const n = contractsFor(usd, c.price, c.depth);
      if (n < 1) { c.net = -99; continue; }
      const fee = feeCents(n, c.price / 100) / n;   // per-contract entry fee
      c.feeCents = fee;
      c.contracts = n;
      c.usd = (n * c.price) / 100;
      c.net = c.gross - fee - CFG.SLIPPAGE_CENTS;
      if (!best || c.net > best.net) best = c;
    }

    if (!best) {
      G('edge', false, 'no fillable side', 'book too thin for the configured bet size');
      return { skip: true, gates, tau, book, fv };
    }

    const okDepth = G('depth',
      best.depth >= Math.min(CFG.MIN_BOOK_DEPTH, best.contracts),
      `${best.depth} @ touch`,
      'need real size at the touch, not a one-lot');

    const okPrice = G('price band',
      best.price >= CFG.MIN_PRICE_CENTS && best.price <= CFG.MAX_PRICE_CENTS,
      `${best.price}¢`,
      'penny wings and 97¢ scraps are not worth the capital');

    // Don't buy YES into a wall of aggressive selling, or vice versa.
    const flowAgainst = best.side === 'yes' ? -o.flow : o.flow;
    const okFlow = G('flow',
      flowAgainst < CFG.FLOW_VETO,
      `${(o.flow * 100).toFixed(0)}%`,
      'never fade a one-sided tape');

    const okEdge = G('edge',
      best.net >= F.minEdge,
      `${best.net.toFixed(1)}¢ net`,
      'after fee and slippage, not before');

    const okExposure = G('exposure',
      exposure.open < slots
      && (exposure.byAsset[ctx.asset] || 0) < CFG.MAX_PER_ASSET
      && !exposure.tickers.has(market.ticker)
      && exposure.dayPnl > -CFG.DAILY_LOSS_LIMIT_USD
      && exposure.dayTrades < CFG.DAILY_TRADE_LIMIT,
      `${exposure.open}/${slots} slots`,
      'slot count, per-asset, daily loss and daily count caps');

    const pass = okOracle && okTime && okBook && okRegime && okMoney && okAgree
      && okDepth && okPrice && okFlow && okEdge && okExposure;

    return {
      skip: !pass,
      fire: pass,
      gates,
      tau,
      book,
      fv,
      candidate: best,
      betUsd: sizeUsd(best.net, betUsd),
    };
  }

  module.exports = { evaluate, readBook, contractsFor, sizeUsd, FREQ };
});

// ═══ module: engine ════════════════════════════════════
__def('engine', (module, exports) => {
  const CFG = __req('config');
  const log = __req('log');
  const kalshi = __req('kalshi');
  const oracle = __req('oracle');
  const pf = __req('portfolio');
  const { evaluate, readBook, FREQ } = __req('strategy');
  const { feeCents, fairValue } = __req('pricing');
  const store = __req('store');

  const runtime = {
    betUsd: CFG.BET_USD,
    slots: Math.max(CFG.SLOTS_MIN, Math.min(CFG.SLOTS_MAX, CFG.SLOTS)),
    running: false,
    paused: false,
    startedAt: Date.now(),
    scans: 0,
    candidatesSeen: 0,
    lastScanAt: 0,
    lastScanMs: 0,
    series: [],           // validated series
    markets: [],          // live candidate markets with last evaluation
    pending: new Map(),    // ticker -> pending live order
    errors: 0,
  };

  // KXBTCD -> BTC (hourly), KXBTC15M -> BTC (quarter-hour)
  const SUFFIX = /^KX([A-Z]+?)(?:D|15M)?$/;
  function assetFromSeries(series) {
    const m = SUFFIX.exec(series);
    if (m && oracle.ASSETS.includes(m[1])) return m[1];
    // longest match first so DOGE doesn't lose to a shorter substring
    const hit = [...oracle.ASSETS].sort((a, b) => b.length - a.length)
      .find(a => series.includes(a));
    return hit || null;
  }

  // ----------------------------------------------------------- market discovery

  let marketCache = [];
  let lastDiscovery = 0;

  async function discover() {
    const out = [];
    for (const series of runtime.series) {
      const asset = assetFromSeries(series.ticker);
      if (!asset) continue;
      try {
        const res = await kalshi.markets(series.ticker, 200);
        const F = series.freq;
        for (const m of res.markets || []) {
          const tau = (Date.parse(m.close_time) - Date.now()) / 1000;
          if (!(tau > 0) || tau > F.maxSec + 600) continue;
          if (m.status !== 'active' && m.status !== 'open') continue;
          out.push({ ...m, _asset: asset, _series: series.ticker, _freq: F });
        }
      } catch (e) {
        runtime.errors += 1;
        log.warn(`discover ${series.ticker}: ${e.message}`);
      }
    }
    marketCache = out;
    lastDiscovery = Date.now();
    log.debug(`discovery: ${out.length} open hourly markets`);
  }

  /**
   * A BTC hourly ladder can carry 20+ strikes. Pulling every book burns the rate
   * limit for nothing — everything more than ~3 sigma out is untradeable by
   * construction. Prefilter on modelled moneyness, then fetch only what's live.
   */
  function prefilter(markets) {
    const picked = [];
    for (const m of markets) {
      const o = oracle.get(m._asset);
      if (!o || !(o.composite > 0) || !(o.sigma > 0)) continue;
      const F = m._freq || FREQ.hourly;
      const tau = (Date.parse(m.close_time) - Date.now()) / 1000;
      if (tau < F.minSec || tau > F.maxSec) continue;
      const fv = fairValue(o, {
        floorStrike: m.floor_strike ?? null,
        capStrike: m.cap_strike ?? null,
        settleWindow: F.settleWindow,
        tau,
      });
      if (!fv) continue;
      if (Math.abs(fv.z) > CFG.MAX_ABS_Z + 0.8) continue;
      picked.push({ m, z: Math.abs(fv.z) });
    }
    picked.sort((a, b) => a.z - b.z);
    // at most 4 strikes per asset per close
    const perKey = {};
    const out = [];
    for (const p of picked) {
      const key = `${p.m._asset}|${p.m._freq.key}|${p.m.close_time}`;
      perKey[key] = (perKey[key] || 0) + 1;
      if (perKey[key] <= 4) out.push(p.m);
    }
    return out;
  }

  // --------------------------------------------------------------- order firing

  async function fire(m, decision) {
    const c = decision.candidate;
    const feeUsd = feeCents(c.contracts, c.price / 100) / 100;

    const base = {
      ticker: m.ticker,
      asset: m._asset,
      series: m._series,
      side: c.side,
      contracts: c.contracts,
      price: c.price,
      feeUsd,
      closeTime: m.close_time,
      freq: (m._freq || FREQ.hourly).key,
      freqLabel: (m._freq || FREQ.hourly).label,
      settleWindow: (m._freq || FREQ.hourly).settleWindow,
      floorStrike: m.floor_strike ?? null,
      capStrike: m.cap_strike ?? null,
      modelP: c.modelP,
      edgeCents: c.net,
      gates: decision.gates,
      fv: {
        p: decision.fv.p, pGauss: decision.fv.pGauss, pEmp: decision.fv.pEmp,
        z: decision.fv.z, sigmaEffBps: decision.fv.sigmaEffBps,
        lagBps: decision.fv.lagBps, driftBps: decision.fv.driftBps,
        tiltBps: decision.fv.tiltBps, centre: decision.fv.centre,
        spot: decision.fv.spot, index: decision.fv.index, empN: decision.fv.empN,
      },
    };

    if (CFG.PAPER_MODE) {
      return pf.open({ ...base, paper: true });
    }

    const limit = CFG.ORDER_STYLE === 'cross'
      ? c.price + CFG.LIMIT_OFFSET_CENTS
      : Math.max(1, c.price - 1 - CFG.LIMIT_OFFSET_CENTS);

    try {
      const res = await kalshi.createOrder({
        ticker: m.ticker,
        side: c.side,
        action: 'buy',
        count: c.contracts,
        priceCents: Math.max(1, Math.min(99, limit)),
        type: 'limit',
      });
      const order = res.order || res;
      runtime.pending.set(m.ticker, {
        orderId: order.order_id, placedAt: Date.now(), base, limit,
      });
      log.info(`ORDER ${m.ticker} ${c.side} x${c.contracts} @ ${limit}¢ (id ${order.order_id})`);
    } catch (e) {
      runtime.errors += 1;
      log.error(`order failed ${m.ticker}: ${e.message}`);
    }
    return null;
  }

  async function reconcilePending() {
    for (const [ticker, p] of [...runtime.pending.entries()]) {
      try {
        const res = await kalshi.order(p.orderId);
        const o = res.order || res;
        const filled = Number(o.filled_count ?? o.taker_fill_count ?? 0);
        if (filled > 0 && (o.status === 'executed' || o.remaining_count === 0)) {
          const px = Number(o.yes_price ?? o.no_price ?? p.limit);
          await pf.open({
            ...p.base,
            contracts: filled,
            price: px,
            feeUsd: feeCents(filled, px / 100) / 100,
            orderId: p.orderId,
            paper: false,
          });
          runtime.pending.delete(ticker);
        } else if (Date.now() - p.placedAt > CFG.ORDER_TTL_S * 1000) {
          await kalshi.cancelOrder(p.orderId).catch(() => {});
          runtime.pending.delete(ticker);
          log.info(`ORDER expired ${ticker} — cancelled`);
        }
      } catch (e) {
        log.warn(`reconcile ${ticker}: ${e.message}`);
        if (Date.now() - p.placedAt > CFG.ORDER_TTL_S * 3000) runtime.pending.delete(ticker);
      }
    }
  }

  // ------------------------------------------------------------------ exits

  function satisfies(pos, value) {
    if (value == null) return null;
    const aboveFloor = pos.floorStrike == null ? true : value > pos.floorStrike;
    const belowCap = pos.capStrike == null ? true : value < pos.capStrike;
    return aboveFloor && belowCap;
  }

  async function settlePosition(pos) {
    let yesWon = null;

    if (!CFG.PAPER_MODE) {
      try {
        const res = await kalshi.market(pos.ticker);
        const mk = res.market || res;
        if (mk.result === 'yes') yesWon = true;
        else if (mk.result === 'no') yesWon = false;
      } catch { /* fall through to oracle */ }
    }

    if (yesWon == null) {
      const o = oracle.get(pos.asset);
      yesWon = satisfies(pos, o ? o.settlementValue(pos.settleWindow) : null);
      if (yesWon == null) return false;  // retry next tick
    }

    const won = pos.side === 'yes' ? yesWon : !yesWon;
    await pf.close(pos.ticker, { reason: 'settled', settled: true, won });
    return true;
  }

  async function manage(booksByTicker) {
    for (const pos of pf.positions()) {
      const tau = (Date.parse(pos.closeTime) - Date.now()) / 1000;

      if (tau <= 2) {
        // give the index a few seconds past the bell to finish its window
        if (tau <= -8) await settlePosition(pos);
        continue;
      }

      const ob = booksByTicker[pos.ticker];
      if (!ob) continue;
      const book = readBook(ob);
      const bid = pos.side === 'yes' ? book.yesBid : book.noBid;
      const bidSize = pos.side === 'yes' ? book.yesBidSize : book.noBidSize;
      if (bid == null) continue;
      pf.mark(pos.ticker, bid);

      const o = oracle.get(pos.asset);
      const fv = o ? fairValue(o, {
        floorStrike: pos.floorStrike, capStrike: pos.capStrike,
        settleWindow: pos.settleWindow, tau,
      }) : null;
      const pSide = fv ? (pos.side === 'yes' ? fv.p : 1 - fv.p) : null;
      const liveEdge = pSide != null ? pSide * 100 - bid : null;

      let reason = null;
      if (CFG.FLATTEN_BEFORE_CLOSE_S > 0 && tau <= CFG.FLATTEN_BEFORE_CLOSE_S) reason = 'flatten';
      else if (bid - pos.entryPrice >= CFG.TAKE_PROFIT_CENTS) reason = 'take profit';
      else if (liveEdge != null && liveEdge <= CFG.STOP_EDGE_CENTS
               && !(fv && Math.abs(fv.z) >= CFG.HOLD_TO_SETTLE_Z && pSide > 0.5)) reason = 'edge lost';

      if (!reason) continue;
      if (bidSize < 1) continue;

      const n = Math.min(pos.contracts, bidSize);
      const exitFee = feeCents(n, bid / 100) / 100;

      if (CFG.PAPER_MODE) {
        await pf.close(pos.ticker, { exitPrice: bid, reason, exitFeeUsd: exitFee });
      } else {
        try {
          await kalshi.createOrder({
            ticker: pos.ticker, side: pos.side, action: 'sell',
            count: n, priceCents: bid, type: 'limit',
          });
          await pf.close(pos.ticker, { exitPrice: bid, reason, exitFeeUsd: exitFee });
        } catch (e) {
          log.error(`exit failed ${pos.ticker}: ${e.message}`);
        }
      }
    }
  }

  // ------------------------------------------------------------------ main loop

  async function tick() {
    if (runtime.paused) return;
    const t0 = Date.now();
    runtime.scans += 1;

    if (Date.now() - lastDiscovery > 45000) await discover();

    const candidates = prefilter(marketCache);
    const books = {};
    const openTickers = new Set(pf.positions().map(p => p.ticker));
    const need = new Set([...candidates.map(m => m.ticker), ...openTickers]);

    for (const ticker of need) {
      try { books[ticker] = await kalshi.orderbook(ticker, 5); }
      catch (e) { runtime.errors += 1; }
    }

    await manage(books);
    if (!CFG.PAPER_MODE) await reconcilePending();

    const view = [];
    for (const m of candidates) {
      const o = oracle.get(m._asset);
      const ob = books[m.ticker];
      if (!o || !ob) continue;
      runtime.candidatesSeen += 1;

      const decision = evaluate({
        market: m, ob, o, asset: m._asset, freq: m._freq,
        betUsd: runtime.betUsd,
        maxSlots: runtime.slots,
        exposure: pf.exposure(),
      });

      view.push({
        ticker: m.ticker,
        asset: m._asset,
        freq: (m._freq || FREQ.hourly).label,
        title: m.yes_sub_title || m.subtitle || m.title || m.ticker,
        floorStrike: m.floor_strike ?? null,
        capStrike: m.cap_strike ?? null,
        closeTime: m.close_time,
        tau: decision.tau,
        book: decision.book,
        fv: decision.fv,
        candidate: decision.candidate || null,
        gates: decision.gates,
        fire: !!decision.fire,
      });

      if (decision.fire && !runtime.pending.has(m.ticker) && !openTickers.has(m.ticker)) {
        await fire(m, decision);
        openTickers.add(m.ticker);
      }
    }

    view.sort((a, b) => (b.candidate?.net ?? -99) - (a.candidate?.net ?? -99));
    runtime.markets = view;
    runtime.lastScanAt = Date.now();
    runtime.lastScanMs = Date.now() - t0;
  }

  async function validateSeries() {
    const ok = [];
    const families = [
      ...CFG.SERIES.map(t => ({ t, freq: FREQ.hourly })),
      ...CFG.SERIES_15M.map(t => ({ t, freq: FREQ.m15 })),
    ];
    for (const { t, freq } of families) {
      try {
        const res = await kalshi.series(t);
        const s = res.series || res;
        const asset = assetFromSeries(t);
        ok.push({ ticker: t, title: s.title || t, asset, freq });
        log.info(`series ok: ${t} → ${asset} [${freq.label}]`);
      } catch (e) {
        log.warn(`series ${t} [${freq.label}] unavailable (${e.status || '?'}) — dropped`);
      }
    }
    runtime.series = ok;
    const n1 = ok.filter(s => s.freq.key === 'hourly').length;
    const n2 = ok.filter(s => s.freq.key === 'm15').length;
    log.info(`series: ${n1} hourly, ${n2} quarter-hour`);
  }

  let timer = null;

  async function start() {
    oracle.start();
    await pf.hydrate();

    if (!kalshi.configured()) {
      log.error('KALSHI_KEY_ID / KALSHI_PRIVATE_KEY missing — engine idle, oracle still live');
      return;
    }

    await validateSeries();
    if (!runtime.series.length) {
      log.error('no valid series — check SERIES env var against live Kalshi tickers');
      return;
    }

    runtime.running = true;
    log.info(`engine: running in ${CFG.PAPER_MODE ? 'PAPER' : 'LIVE'} mode, bet $${runtime.betUsd} × ${runtime.slots} slots`);

    const loop = async () => {
      try { await tick(); }
      catch (e) { runtime.errors += 1; log.error(`tick: ${e.message}`); }
      timer = setTimeout(loop, CFG.ENGINE_TICK_MS);
    };
    loop();
  }

  /**
   * Lowering the slot count never force-closes anything — it just stops new
   * entries until positions drain below the new line. Yanking capital out of a
   * live contract to satisfy a UI change would be the worst possible exit.
   */
  function setSlots(n) {
    const v = Math.max(CFG.SLOTS_MIN,
      Math.min(CFG.SLOTS_MAX, CFG.MAX_OPEN_POSITIONS, Math.round(Number(n))));
    runtime.slots = v;
    store.set('slots', v).catch(() => {});
    const openNow = pf.exposure().open;
    log.info(`slots set to ${v}${openNow > v ? ` — ${openNow} open, draining before new entries` : ''}`);
    return v;
  }

  function setBet(usd) {
    const v = Math.max(CFG.BET_MIN_USD, Math.min(CFG.BET_MAX_USD, Number(usd)));
    runtime.betUsd = v;
    store.set('betUsd', v).catch(() => {});
    log.info(`bet size set to $${v}`);
    return v;
  }

  module.exports = { start, runtime, setBet, setSlots, tick, discover };
});

// ═══ server ══════════════════════════════════════
const path = require('path');
const express = require('express');
const CFG = __req('config');
const log = __req('log');
const oracle = __req('oracle');
const engine = __req('engine');
const pf = __req('portfolio');
const kalshi = __req('kalshi');
const store = __req('store');

const app = express();
app.use(express.json());
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

function authed(req) {
  if (!CFG.DASH_TOKEN) return true;
  return req.get('x-dash-token') === CFG.DASH_TOKEN || req.query.token === CFG.DASH_TOKEN;
}

app.get('/api/state', (req, res) => {
  res.json({
    now: Date.now(),
    mode: CFG.PAPER_MODE ? 'PAPER' : 'LIVE',
    running: engine.runtime.running,
    paused: engine.runtime.paused,
    uptimeSec: Math.round((Date.now() - engine.runtime.startedAt) / 1000),
    scans: engine.runtime.scans,
    lastScanMs: engine.runtime.lastScanMs,
    lastScanAt: engine.runtime.lastScanAt,
    errors: engine.runtime.errors,
    apiCalls: kalshi.stats.calls,
    apiErrors: kalshi.stats.errors,
    lastApiError: kalshi.stats.lastError,
    redis: store.enabled,
    bet: {
      usd: engine.runtime.betUsd,
      min: CFG.BET_MIN_USD,
      max: CFG.BET_MAX_USD,
      edgeScaling: CFG.EDGE_SCALING,
    },
    slots: {
      value: engine.runtime.slots,
      min: CFG.SLOTS_MIN,
      max: Math.min(CFG.SLOTS_MAX, CFG.MAX_OPEN_POSITIONS),
      used: pf.positions().length,
      atRisk: pf.stats().deployed,
    },
    thresholds: {
      minEdge: CFG.MIN_EDGE_CENTS,
      maxSpread: CFG.MAX_SPREAD_CENTS,
      minSec: CFG.MIN_SECONDS_TO_CLOSE,
      maxSec: CFG.MAX_SECONDS_TO_CLOSE,
      maxZ: CFG.MAX_ABS_Z,
    },
    oracle: oracle.snapshot(),
    feeds: oracle.feedStatus(),
    series: engine.runtime.series,
    markets: engine.runtime.markets,
    positions: pf.positions(),
    trades: pf.trades(60),
    stats: pf.stats(),
    logs: log.tail(80),
  });
});

app.post('/api/bet', (req, res) => {
  if (!authed(req)) return res.status(403).json({ error: 'bad token' });
  const usd = Number(req.body?.usd);
  if (!(usd > 0)) return res.status(400).json({ error: 'usd must be a positive number' });
  res.json({ usd: engine.setBet(usd) });
});

app.post('/api/slots', (req, res) => {
  if (!authed(req)) return res.status(403).json({ error: 'bad token' });
  const n = Number(req.body?.slots);
  if (!(n >= 1)) return res.status(400).json({ error: 'slots must be 1 or more' });
  res.json({ slots: engine.setSlots(n) });
});

app.post('/api/pause', (req, res) => {
  if (!authed(req)) return res.status(403).json({ error: 'bad token' });
  engine.runtime.paused = Boolean(req.body?.paused);
  log.info(`engine ${engine.runtime.paused ? 'paused' : 'resumed'} from dashboard`);
  res.json({ paused: engine.runtime.paused });
});

app.get('/api/health', (_req, res) => {
  const snap = oracle.snapshot();
  const healthy = Object.values(snap).filter(s => s.healthy).length;
  res.json({ ok: true, mode: CFG.PAPER_MODE ? 'PAPER' : 'LIVE', assetsHealthy: healthy });
});

app.listen(CFG.PORT, () => {
  log.info(`dashboard on :${CFG.PORT}`);
  store.get('betUsd').then(v => { if (v) engine.setBet(v); }).catch(() => {});
  store.get('slots').then(v => { if (v) engine.setSlots(v); }).catch(() => {});
  engine.start().catch(e => log.error(`engine start failed: ${e.message}`));
});

process.on('unhandledRejection', e => log.error(`unhandledRejection: ${e?.message || e}`));
process.on('uncaughtException', e => log.error(`uncaughtException: ${e?.message || e}`));

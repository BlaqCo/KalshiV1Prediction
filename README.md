# 0XBLAQ · Kalshi Hourly Engine

Automated trading on Kalshi's hourly crypto binaries — BTC, ETH, SOL, XRP, DOGE, BNB, HYPE.
Node/Express on Railway, Upstash Redis for persistence, live terminal dashboard.
Ships in **paper mode by default**.

---

## The two ideas the whole thing rests on

Everything else here is plumbing. These two are the actual edge.

### 1. Kalshi settles on an average, not a price

Every Kalshi crypto contract resolves against a **60-second average of the CF
Benchmarks Real-Time Index**, sampled once per second over the final minute of
the window. Almost every model you'll see prices `P(S_T > K)` — the probability
at a single terminal instant. That is the wrong random variable.

The variance of an average is lower than the variance of an endpoint. τ seconds
out, with a 60s averaging window W:

```
τ > W :   Var = σ² · [ (τ − W) + W/3 ]
τ ≤ W :   Var = σ² · τ³ / (3W²)
```

The `W/3` term is the variance of the mean of a Brownian path across the window —
one third of the terminal variance. Pricing without it treats every contract as
roughly 40 seconds longer-dated than it is, which systematically overprices the
wings and underprices anything near the money late in the hour.

At 2 minutes out this model is **33% tighter** than a naive terminal-price model.
That gap is where the near-expiry mispricings live.

### 2. The settlement index lags spot, mechanically

The CF Benchmarks RTI is time-weighted, so it trails venue spot by roughly 8–14
seconds on a fast move. The bot therefore tracks two numbers per asset:

- **composite** — where price actually is right now, volume-weighted across the
  index's *own constituent venues* (Coinbase, Kraken, Bitstamp). Not Binance:
  Binance isn't a constituent, so using it answers a slightly different question
  than the one Kalshi resolves, and on a binary that residual flips outcomes.
- **index** — an EWMA emulation of the RTI itself, i.e. where the settlement
  source currently *thinks* price is.

The gap between them is a known, forward-looking drift. The index has to catch
up. The engine starts the distribution at the index and lets it converge toward
spot over the remaining horizon.

In testing, 90 seconds out with spot 10bp above the index, the lag-aware model
priced a near-the-money strike at 56.4% where an index-only model said 40.7%.
That 15.7pp is the trade.

The dashboard renders this as the **index lag meter** on every asset — violet bar
is the index, green tick is spot, and the width between them is the drift the
model is about to monetise.

---

## The strategy

Eleven gates. All must pass. Every gate records its measured value pass or fail,
so the board tells you exactly what killed each candidate and the ledger tells
you later which gates were actually earning their keep.

| Gate | What it protects against |
|---|---|
| `oracle` | quorum of venues, tight dispersion — no trading on a stale or wicked feed |
| `time` | 90s–45min window; skips the open's dead zone and the bell's gamma lottery |
| `liquidity` | spread ceiling — crossing a wide book eats the edge you came for |
| `vol regime` | current σ vs its 6h baseline; sits out vol shocks that break the Gaussian core |
| `moneyness` | \|z\| band — deep wings are all fee and no edge |
| `model agreement` | closed-form vs bootstrap must tell the same story |
| `depth` | real size at the touch, not a one-lot |
| `price band` | no penny wings, no 97¢ scraps |
| `flow` | never fade a one-sided tape |
| `edge` | net of fee **and** slippage, not before |
| `exposure` | position, per-asset, daily loss and daily count caps |

**Fair value** blends two independent estimates: the closed-form Gaussian above,
and a bootstrap of the asset's *actual* realised return distribution at the
matching horizon, drawn from 4 hours of stored 1Hz tape. The bootstrap catches
the fat tails the Gaussian misses — but it only gets a vote once there are enough
*independent* draws. Overlapping windows carved out of twenty minutes of tape are
one draw wearing three hundred hats, so until history is deep enough the model
reports `gaussian only` rather than letting a noisy estimate shout down the
closed form.

**Edge** is `fair − ask − fee − slippage`, using Kalshi's real fee formula
`ceil(0.07 × C × P × (1−P))` — which peaks at 1.75¢/contract at 50¢ and is the
single biggest reason naive "3¢ edge" bots lose money.

**Exits**: take profit at +14¢, stop when the modelled edge inverts past −6¢,
hold deep-ITM positions to settlement (free — Kalshi charges no settlement fee),
optional hard flatten before the bell.

---

## Setup

**1.** Four files, all at the repo root, no folders:

```
bot.js          the whole engine
index.html      the dashboard
package.json
README.md
```

On mobile: **Add file → Upload files**, multi-select all four, one commit. Railway
auto-detects Node and runs `npm start`.

`bot.js` is a single-file build — the ten modules are held in separate scopes by a
short inline registry at the top, so nothing leaks between them. Search for
`=== module: oracle ===` to jump to a section.

**2.** Kalshi API key: Kalshi account → Settings → API Keys → create one. You get
a **Key ID** and download an **RSA private key** once. Paste the whole PEM,
`-----BEGIN` line through `-----END` line, into `KALSHI_PRIVATE_KEY`.

**3.** Upstash: create a Redis database, copy the **REST URL** and **REST token**.
Optional — without it the bot runs fine but forgets everything on redeploy.

**4.** Set env vars from `.env.example`. Leave `PAPER_MODE=true`.

**5.** Open the Railway URL. The oracle lights up within seconds; the edge board
fills once markets fall inside the time gate.

Going live is `PAPER_MODE=false`. Don't do that until you've read the next
section.

---

## Before you go live — verify these four things

I built this from Kalshi's documented behaviour, but I could not run it against
the live API. Four things need your eyes on real responses first:

1. **Series tickers.** `KXBTCD` is the hourly BTC family. The others follow the
   same pattern but Kalshi rotates and renames series. The engine validates each
   ticker at boot and logs `series ok` or `series … unavailable — dropped`, so
   check the log and fix `SERIES` to match what's actually live.

2. **The Coinbase flow convention.** Coinbase's ticker `side` field is the *maker*
   side, so the aggressor is the opposite — that's what `COINBASE_MAKER_SIDE=true`
   assumes. If the flow readings on the dashboard look inverted against the tape,
   flip it to `false`. It's only a 6bp tilt so it won't wreck you either way, but
   an inverted signal is worse than no signal.

3. **Run demo first.** Point `KALSHI_BASE` at `https://demo-api.kalshi.co/trade-api/v2`
   with `PAPER_MODE=false` to exercise the real order path — signing, order
   placement, fills, cancels — against fake money before real money.

4. **Let paper mode run a full day.** The calibration panel is the point: it shows
   what the model *said* would happen against what *did*. If the 60–70% bucket
   settles at 45%, the model is overconfident and `MIN_EDGE_CENTS` needs to rise
   before a dollar goes in. That panel is the difference between a bot with an
   edge and a bot with a story.

Also worth knowing: `HYPE` and `BNB` aren't listed on all three oracle venues, so
they'll usually sit below the `MIN_VENUES` quorum and simply won't trade. That's
the gate working, not a bug — add a venue that carries them if you want coverage.

---

## Dashboard

- **Oracle rail** — per asset: composite price, 1-minute σ, vol regime, flow,
  venue count, and the index lag meter.
- **Edge board** — every live candidate with a **settlement distribution strip**:
  the modelled density of the settlement value with the strike cut in, shaded
  region equals the model's probability. Below it a probability rail with two
  markers, `MDL` and `MKT` — the bracket between them, drawn to scale, is your
  edge. Then all eleven gate readings.
- **Open** — live mark, unrealised, edge at entry, countdown. Tap a row for the
  full decision record: Gaussian vs bootstrap probabilities, z, σ effective,
  spot vs index vs modelled centre, index lag, drift used, flow tilt, fee.
- **Equity / by-asset / calibration**.
- **Trade log** — same expandable decision record on every closed trade.
- **Flat bet slider**, $10–$100, live, persisted to Redis. Flip `EDGE_SCALING=true`
  to let strong signals scale from the slider value up toward the ceiling.

`POST /api/pause` and the Pause button stop new entries; open positions still get
managed and settled.

---

## A caveat worth stating plainly

Hourly crypto binaries are a market makers' game and Kalshi's fee is real money
at every entry. The two structural edges above are genuine, but they're small,
they decay as others find them, and none of this is a prediction that the bot
will be profitable. Paper mode and that calibration panel exist so you can find
out cheaply rather than expensively.

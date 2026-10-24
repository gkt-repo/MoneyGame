# Cricket trading implementation plan

Date: 24 October 2026. Status: the test-credit CricTrade implementation is built across the backend, user web, Flutter user app and admin web. See [implementation and runbook](CRICTRADE.md) for the shipped behavior, verification and remaining live-cash prerequisites. The sections below retain the original specification; the runbook records implementation differences.

This document records the user's latest pooled-credit trading design. It supersedes the cricket-market suggestions in PRODUCT_IMPLEMENTATION_PLAN.md, while leaving that document's lobby, invitations, profiles and 29 work aside.

## 0. Readiness review after the live-feed test

The feature scope and accounting design have been implemented for test-credit operation. This does not establish that funded live trading is ready to launch. The table below records the pre-implementation readiness review; use the linked runbook for current completion status.

| Area | Readiness and next action |
| --- | --- |
| Trading screen, chart, positions and history | Specified; can implement |
| Credit conversion, netting and proportional payouts | Specified with exact units and worked examples; implement and test the new calculator |
| Existing sports backend | All 11 sports-pool tests and the types/server builds passed; this does not test the unimplemented CricTrade engine |
| Current ESPN connection | 32/32 sampled requests succeeded for live IND–NZ; changing scores and over notation were observed |
| Every-over/every-ball coverage | Not established; 5-second snapshots skipped intermediate ball states and provide no recovery history |
| Adaptive request schedule | Proposed below: 60-second normal polling, 5-second final-three-over polling; estimated 570 requests per four-hour match under stated assumptions |
| Win-probability model | Interface and development approach specified; a trained/calibrated implementation still needs to be built and evaluated |
| Exceptional settlement rules | Proposed defaults remain explicit in section 2; not previously confirmed as user requirements |
| Funded live release | Pending usable source freshness/completeness and settled product rules; not validated by the successful HTTP test |

Use the current ESPN adapter for labelled live score observation and test-credit execution during development; use replay data for deterministic ledger and UI checks. Keep real-wallet funding for this new feature disabled by default until its execution prerequisites pass. This is an implementation default, not a claim that the user requested only a demo.

The confirmed product still includes the full server, both user clients, chart, pricing, credit trading, refunds, settlement and admin controls. Live readiness is a separate acceptance stage. Reference: [live-feed report](CRICKET_FEED_TEST_REPORT.md) and [sampled evidence](CRICKET_FEED_TEST_EVIDENCE.json).

## 1. Product and agreed rules

Build a complete cricket trading experience for Flutter user-app and React user-web. Users choose a team, buy shares at a probability-based credit price, watch a price-versus-time chart with candlesticks, and sell their shares to close a position. MoneyGame supplies the virtual quotes; execution does not require another user or a bot.

Agreed accounting:

- ₹1 buys 10 match-specific credits; ₹1,000 buys 10,000 credits.
- Credits cannot move between matches.
- Losses deduct their full equivalent: 1,000 lost credits cost ₹100.
- Losses cannot exceed the user's funded match deposit.
- Remaining original funds are refunded at 10 credits = ₹1.
- Positive net trading credits determine a proportional share of the actual loss pool. They do not guarantee fixed rupee redemption.
- Selling shares realizes a credit result, not a guaranteed rupee profit.
- The example 10,000 starting credits → 12,000 closing credits means ₹1,000 principal returned plus a pool-dependent reward for 2,000 positive credits.
- Prices reflect estimated win probability. Time pressure and sensitivity to critical match events belong inside that model.

The system can execute with one participant, but cannot generate cash profit without another participant's funded loss. Total payouts must remain within the match's collected funds. This limits settlement obligations; it is not a guarantee that operating the business has no costs or risks.

## 2. Proposed v1 defaults and unresolved product choices

These defaults make implementation concrete. They have not all been separately approved by the user and must be visible in the rules before a cash launch.

| Topic | Proposed default |
| --- | --- |
| Match format | T20, one pool per match, two team outcomes |
| Trading | Buy and sell owned shares; no leverage, shorts, limit orders or order book |
| Quote | Same displayed probability-based credit price for buying and selling; no spread in v1 |
| Precision | Whole shares, prices in 0.1-credit steps |
| Match funding | Allow funding/top-ups while trading is open; record cumulative deposit |
| Reinvesting | Sale proceeds, including virtual gains, can be reused inside that match; gains remain non-withdrawable |
| Withdrawal timing | All match funds remain locked until settlement; unused original funds are refunded then |
| Fees | Zero in v1; do not inherit the existing sports-pool commission silently |
| Development execution | Separate test-credit accounts; no conversion of test credits into wallet money |
| Feed schedule | 60-second normal polling; 5-second polling when a valid current-innings snapshot shows 1–18 legal balls remaining |
| Snapshot presentation | Prices update from available validated snapshots; do not label them guaranteed per-ball/per-over prices |
| Profit allocation | Distribute the entire loss pool in proportion to positive net credit profit, even when it exceeds the nominal rupee equivalent of those gains |
| No positive participants | Refund all match deposits as an explicit exceptional rule; do not retain losses with no recipients |
| Positive participants but no losses | Return deposits; cash profit is zero |
| Match abandoned/no official winner | Void the entire match pool and return deposits |
| Tie/Super Over | Suspend at a tie; resolve from the official match winner after any applicable Super Over; otherwise void |
| Early withdrawal | Deferred; requires additional principal-reservation and settlement accounting |

In particular, the no-positive-participants refund is an exception to ordinary full-loss deductions. The alternative requires a separately chosen destination for those funds. It must not be silently decided in code.

Do not promise a fixed rupee redemption for the terminal winning-team credit price. The fixed 100-credit terminal value calculates the user's trading score; the pool determines cash profit.

## 3. Full user journey

1. Open Trading from the app navigation and choose a supported match.
2. See score, match stage, both team prices, data freshness and market status before funding.
3. Add an amount from the existing wallet. Preview ₹ amount, credits received and settlement rules before confirming.
4. Select IND or NZ. The chart, share price, position summary and order ticket switch to that team together.
5. Enter share quantity or choose an affordable quantity shortcut. Preview exact credit cost and current quote.
6. Confirm a buy. Server accepts at the valid quoted price or requests confirmation of a new quote; never silently fills at a worse price.
7. Inspect the candlestick chart, current position, entry price and unrealized credit result.
8. Sell some or all owned shares. Record a closed credit result and update available match credits.
9. Continue trading or leave the screen. Refresh/reconnect restores server state.
10. At match completion, resolve open shares, calculate each participant's final net credit result, distribute the funded loss pool and unlock wallet payouts.
11. Show a detailed settlement receipt and permanent trade history.

## 4. Original trading screen specification

Superseded by the user’s simplified two-page Home / My positions design. See [current runbook](CRICTRADE.md): header credits, automatic over/1m candles, axis-drag zoom and Exit position replace the controls and layout below.

### Desktop layout

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Trading / IND vs NZ        LIVE • OPEN       Score updated 2 seconds ago   │
│ IND 151/5 • 18.0 overs     Target 181        Need 30 from 12 balls          │
├────────────────────────────────────────────┬───────────────────────────────┤
│ [IND • 60.0 cr • 60.0%] [NZ • 40.0 cr]     │ Match credits: 10,000.0       │
│                                            │ Deposited: ₹1,000.00          │
│ IND 60.0 cr   +4.0 since previous update   │ [Add match credits]           │
│ [Candles | Line] [1m] [5m] [15m] [1 over]  ├───────────────────────────────┤
│                                            │ Selected team: IND            │
│       CANDLESTICK PRICE CHART               │ [Buy] [Sell]                  │
│       Y: credits per share                 │ Quantity: [100 shares]        │
│       X: local time                        │ [25%] [50%] [75%] [Max]       │
│       current price / entry / trade marks  │ Price: 60.0 cr per share      │
│                                            │ Total: 6,000.0 cr             │
│ [Optional actual traded-share volume]      │ [Buy 100 IND shares]          │
├────────────────────────────────────────────┴───────────────────────────────┤
│ [Positions] [Trade history] [Pool & payout] [Rules]                        │
│ IND: 100 shares | Avg 60.0 | Current 65.0 | Unrealized +500.0 cr          │
│ Remaining principal estimate | Net credit result | Cash reward estimate │
└────────────────────────────────────────────────────────────────────────────┘
```

All values in the mockup are illustrative, not a calculated probability for that score.

### Mobile layout

- Compact match header and score strip, then large IND/NZ selector cards.
- Selected-team price and probability, chart controls, then a chart approximately 260–320 logical pixels high, adapting to screen size and text scaling.
- Balance and selected-team position summary below the chart.
- Sticky Buy / Sell actions open a bottom sheet containing quantity, cost, available credits, rules summary and confirmation.
- Sell is disabled with a clear explanation when the user owns no shares. Suspension disables both actions while leaving balances/history readable.
- Positions, History, Pool and Rules tabs below; show settlement receipt in the same screen when completed.
- Optional landscape chart expansion; controls must not obscure the plot or prevent scrolling.

### Screen details and terminology

| Element | Required content |
| --- | --- |
| Match header | Teams, competition, innings, runs/wickets, legal overs, target, remaining runs/balls when applicable |
| Status | Scheduled, Open, Suspended, Awaiting result, Settling, Settled or Voided; include a user-readable reason |
| Team cards | Team, credit price, estimated win probability, selected state; never imply the model is certain |
| Price change | Signed credit change since previous published quote; use percentage points for probability change |
| Price timestamp | Time quote became available plus source freshness; avoid calling a delayed snapshot live |
| Match account | Deposited rupees, available trading credits, invested credit cost, position value, net trading credits |
| Order preview | Team, side, share quantity, executable quote, total credits, available balance or owned quantity |
| Positions | Quantity, average entry, current value, realized and unrealized credit results, Sell action |
| Pool | Participant count, funded deposits, provisional loss pool, provisional positive credits and estimated reward |
| Settlement | Original deposit, net loss or gain credits, principal returned, loss contribution, reward and total credited to wallet |

Always call financial previews estimates. The pool estimate must be calculated from current marked positions and closed trades, and must explain that future trading and final results can change it. If no positive credits exist, show “Not available yet” instead of dividing by zero.

Use colour plus signs/text for gain/loss, readable contrast, keyboard-accessible web controls, screen-reader labels and a textual chart summary. Avoid blinking prices and unnecessary sound. Loading, empty chart, disconnected, rejected quote, insufficient credits and cancelled-match states are part of the screen, not follow-up polish.

## 5. Candlestick and price-versus-time specification

### Data definition

These are candles of MoneyGame's published probability-based prices, not exchange transaction prices. Label the chart “Model price · credits per share.” It updates even when nobody trades. Actual user trading volume, if shown, is a separate series.

Each published quote stores market/outcome IDs, sequence, integer price, model version, source event ID, source timestamp if known, received timestamp and `publishedAt`. Build the executable-price chart by `publishedAt`: it records what users could see and trade at then. Store source event time separately; do not backdate executable quotes when delayed data arrives.

For a time bucket containing published quotes:

- Open = first published price in the bucket.
- High = maximum price in the bucket.
- Low = minimum price in the bucket.
- Close = last published price in the bucket.
- Quote count = count of published snapshots, not volume.
- Trade volume = sum of actually filled share quantities within the bucket, if enabled.

One new quote may update the current candle's close/high/low; finalize when the next bucket begins. Provide historical candles and incremental updates from the same server aggregation so Flutter and React cannot disagree.

### Controls and chart behaviour

- Candle/line toggle; intervals 1m, 5m and 15m. Add one-over candles as a separate grouping keyed by innings and over, with time ranges in tooltips.
- Time-based chart X-axis uses actual timestamps, rendered in the user's locale/timezone; default to Asia/Kolkata when none is available. Store UTC on the server.
- Credit-price Y-axis covers the selected data sensibly within 0–100. Allow auto-scale/reset; retain clear minimum and maximum values.
- Crosshair shows time, O/H/L/C, selected team and associated cricket event when available.
- Current-price line, owned-position average-entry line, and the user's buy/sell markers.
- Zoom/pan and a “Back to latest” action. Incoming quotes must not snap a user away from inspected history.
- Optional score-event markers for wickets, boundaries, innings changes and suspensions. Avoid crowding small screens.
- With no new quotes, leave a gap or carry the last value only as a clearly labelled last-known line. Never invent candles, wicks, volume or intra-over paths.
- If a feed supplies only end-of-over snapshots, over candles may be single-price marks. Do not fabricate delivery-level movement from an aggregate score.
- With the current snapshot feed, label over-grouped candles as sampled/incomplete where appropriate. A jump from 7.4 to 8.2 cannot establish an exact seventh-over closing price or the missing individual deliveries. One-minute candles can contain just one quote and have equal O/H/L/C; this is expected, not a reason to invent activity.
- Mark stale periods and terminal settlement points. Final 0/100 values appear as resolution markers, not executable post-result trades.
- Retain published quote history after a source correction; append a corrected quote/event. Never rewrite historical execution prices or the user's fills to match corrected data.
- During replay, use explicitly labelled replay time. If historical data lacks timestamps, use a disclosed simulation clock rather than claiming historical wall-clock times.

### Chart implementation

- React: use TradingView Lightweight Charts as the proposed renderer, supplying our own quote/candle data. Verify the selected release, license and required attribution during integration. It provides the chart, not cricket prices. See the [official repository](https://github.com/tradingview/lightweight-charts).
- Flutter: implement a native `CustomPainter` chart with a small visible-data window, gestures, crosshair and semantic/textual fallback. This avoids choosing an unverified financial-chart dependency and keeps the server candle contract identical. Treat gestures, accessibility and rendering performance as real implementation work.
- Target a rolling visible window rather than redrawing all history for every update. Paginate older candles and dispose listeners/renderers when changing markets.

## 6. Probability engine, time pressure and event sensitivity

Use a versioned server model with input validation. Never compute authoritative quotes in the client or infer them from recent user buys. Both outcomes are published atomically from one snapshot.

### Inputs

Format, innings, runs, wickets, legal balls bowled/remaining, target, revised target/overs, batting/bowling teams, team-strength priors and available contextual features. Distinguish legal deliveries from wides/no-balls; cricket over notation such as 18.4 is not a decimal number of overs.

For a resolved two-team outcome with defined tie/void rules:

```text
p_IND = estimated probability of IND ultimately winning
p_NZ  = 1 - p_IND
IND reference price = 100 × p_IND credits
NZ reference price  = 100 × p_NZ credits
```

Round the IND executable price once to the selected tick, derive NZ as its complement and disclose rounding. Before resolution, restrict executable prices to 0.1–99.9 credits; 0/100 are terminal valuation prices. Display the underlying estimated percentage separately where tick rounding or endpoint restrictions differ.

### Implementable model path

1. Create a model interface taking a normalized match snapshot and returning probabilities, version, diagnostics and counterfactual sensitivities.
2. Start development with fixed, explicitly simulated quote fixtures to build/test the screen. They are not a production probability model.
3. Build a reproducible historical baseline: estimate conditional run/wicket transitions from historical T20 deliveries, with smoothing for sparse states and team priors where supported.
4. Estimate chase success from those transitions, using dynamic programming or controlled Monte Carlo. During the first innings, model the remaining first innings and the opponent's chase; do not reuse a second-innings formula without a target model.
5. Fix/cache simulation randomness per state/model version so identical inputs do not cause arbitrary price jitter. Benchmark calculation latency; suspend quotes if computation fails or misses the configured deadline.
6. Validate calibration and error on held-out matches split by time/competition, with no future-match leakage. Compare to a simple baseline. Record expected limitations before selecting the production model.

Historical delivery data is available from [Cricsheet](https://cricsheet.org/downloads/); inspect its licensing, schema and available timestamps when preparing fixtures/training inputs. It is not a live feed.

### User-requested theta behaviour

Represent time pressure through remaining opportunities and target difficulty. Compare the same chase before/after one legal dot ball with runs and wickets fixed. The chasing side can lose probability while the defending side gains it. Do not subtract a holding fee or decay both team prices simply because wall-clock time passes.

Pause this progression for rain, drinks, reviews and other non-playing intervals. Recompute from official revised targets/overs after DLS changes. A displayed planned match-end time is informational, not an input that forces artificial losses.

### User-requested delta behaviour

Calculate counterfactual probability changes for a dot ball, boundary, six and wicket from the current state. Late close finishes can be more sensitive than early play, but not every late state is highly sensitive; a practically decided match may barely move.

For “30 needed from 12 legal balls, five wickets in hand,” generate each scenario through the same model, then publish only the quote for the event actually received. Never apply a second arbitrary multiplier after calculating probability.

Internally these may be called `timePressure` and `eventSensitivity`. If the UI uses “Theta” or “Delta,” explain that these are cricket-specific scenario measures with explicit units, not conventional option Greeks. Conventional meanings are described by [CME](https://www.cmegroup.com/content/dam/cmegroup/education/files/options-on-futures-brochure.pdf).

## 7. Credit ledger and exact settlement

### Units

Use integers throughout the new module:

- Money: integer paise.
- Credits: integer tenths of a credit (`creditTenths`).
- ₹1 = 100 paise = 10 credits = 100 creditTenths.
- Consequently, one creditTenth has a nominal value of one paise; only principal/loss conversion uses this directly. Positive gain redemption depends on the pool.
- A 60-credit share costs 600 creditTenths. One hundred shares cost 60,000 creditTenths = 6,000 credits.
- Quantities: positive whole shares. Reject fractional/negative quantities and unsafe integer bounds.

Use explicit field names and conversion helpers; do not pass raw monetary numbers as credits. Bound balances/quantities and use integer-safe multiplication for allocations. Keep compatibility with the existing wallet representation by converting only at its transaction boundary and validating exact paise. Update both SQLite and PostgreSQL migrations.

### Bookkeeping

Funding transfers wallet money into an explicit market escrow/accounting record and creates equal nominal credit units. A buy reduces available credits and increases shares; a sell does the reverse. Neither action moves rupees out of escrow.

Track cumulative funding, available credits, shares per outcome, cost basis and immutable executions. Use weighted-average entry for position displays and realized/unrealized credit results. Final net result is based on total closing equity minus total funding, not just winning trades or gross turnover.

At the final valid result, value remaining winning shares at 100 credits and losing shares at zero, then close positions. Define:

```text
D_i = participant i's deposit, in paise
B_i = participant i's final credit balance, in creditTenths
G_i = max(B_i - D_i, 0)       # positive net trading units
L_i = max(D_i - B_i, 0)       # nominal loss in paise
R_i = D_i - L_i              # returned principal in paise
G   = sum(G_i)
L   = sum(L_i)

If G > 0:
    reward_i = L × G_i / G   # allocated to integer paise
    payout_i = R_i + reward_i
If G = 0:
    proposed exceptional rule: payout_i = D_i for everyone
```

For G > 0, round each reward down to paise, then allocate remaining paise by largest fractional remainder with a stable account-ID tie break. Intermediate arithmetic must not overflow. Reward sums must equal L exactly.

With no fees, `sum(payout_i) = sum(D_i)`. Losses cannot exceed funded deposits because trading balances and owned shares cannot go negative. Treat nonzero user gains as weights, not rupee obligations.

### Worked examples

| Scenario | Deposits/results | Settlement |
| --- | --- | --- |
| Confirmed user example | ₹1,000 → 10,000 credits → 12,000 credits | Return ₹1,000; 2,000 positive credits earn a pool-dependent reward |
| Mixed pool | A/B/C deposit ₹1,000 each; close with 12,000 / 14,000 / 7,000 credits | G = 6,000 credits, L = ₹300; A receives ₹1,100, B ₹1,200, C ₹700; total ₹3,000 |
| Original haircut example | Positive credits total 20,000; loss pool ₹1,000 | A participant with 2,000 positive credits gets ₹100 reward plus principal |
| Unused funds | ₹1,000 funded, no trades | Refund ₹1,000 |
| Everyone profits | Positive credits exist; no losses | Return deposits; rewards zero |
| No positive participants | All results nonpositive | Proposed exception: refund all deposits |
| Losses exceed positive equivalent | G = 1,000 credits; L = ₹500 | Entire ₹500 goes to positive participants by weight; nominal profit redemption can exceed ₹0.10/credit |
| Abandoned match | Any trading history | Void and refund deposits; virtual profits do not become cash payouts |

Calculate an immutable settlement snapshot before wallet updates. Use one settlement identity per market and one payout identity per participant. Lock the market against new funding/trading first. A worker may batch payouts, but must resume safely after a crash without double-crediting or losing remaining obligations. Mark SETTLED only once all payouts reconcile.

Pre-settlement cash withdrawals are out of v1. “Remaining principal estimate” is not an immediately withdrawable balance, especially while open shares can still lose value.

## 8. Feed, market lifecycle and execution

Create a provider interface for fixtures, live match snapshots/deliveries and final results. Supply a replay adapter first, then a chosen live provider. Existing ESPN scoreboard discovery can help find matches, but the current 45-second cache/30-second polling is not evidence of adequate event-level trading data.

### Concrete polling schedule and request budget

The most recently discussed lower-request hybrid schedule is the proposed implementation baseline, not a provider-approved quota or a promise of delivery completeness:

| Situation | Proposed schedule |
| --- | --- |
| Trading screen opened | Subscribe to server state; return cached snapshot, without one new upstream request per user |
| Normal active innings | One upstream poll every 60 seconds |
| Final three overs of either innings | One poll every 5 seconds when supported match state shows 1–18 legal balls remaining |
| Innings interval / confirmed interruption | Leave fast mode; poll at the slower configured interval until play resumes |
| Innings completed or target reached | Leave fast mode immediately; check the innings/result state rather than treating zero balls as ongoing play |
| Source unavailable / rate limited | Back off with jitter, respect Retry-After when supplied, and suspend execution; no aggressive retry loop |
| Result seen | Stop ordinary play polling; use bounded result-confirmation work, then stop polling the finished market |

For a four-hour match, if normal play accounts for 210 minutes and the final-three-over portions together account for 30 minutes:

```text
Normal phase: 210 × 60 / 60 = 210 requests
Final phase:   30 × 60 / 5  = 360 requests
Total live polling        = 570 requests
```

This excludes discovery, startup, result confirmation and retries. The actual count depends on match duration, interruptions and detected phases. The general calculation is `normalSeconds / 60 + fastSeconds / 5`, with rounding for request scheduling. Polling every 60 seconds throughout a four-hour match instead uses about 240 requests, but does not guarantee 40 exact over-end snapshots.

Do not call `getAllMatches()` or the nine-request cricket discovery function on each fast tick. Add a dedicated ESPN scoreboard adapter making one request per polling cycle, then select the relevant supported fixtures from that response. Separate discovery caching from live snapshot caching; the existing 45-second cache must not mask the fast mode.

Share the poller across subscribers and matches returned by that same endpoint. If any tracked match needs fast mode, the shared endpoint runs at the fastest required cadence, not one loop per user/match. In a multi-process deployment, use one feed worker or a renewable database-backed ownership lease; add request coalescing, timeout and non-overlapping execution. The 570 estimate assumes one match; concurrent matches can lengthen the shared fast period even though they share requests.

Switch mode from validated remaining legal balls and innings identity, not an estimated wall-clock end time. For a standard T20 innings the threshold starts at 17 completed overs; reduced innings use their actual official length. A slow or delayed snapshot can detect that transition late. Do not claim that all final-18-ball states were captured merely because fast mode eventually activated.

### Adapter and execution requirements

Normalize the source's `6.6` → `7.0` equivalent notation without creating a fictitious extra delivery. Preserve source strings for diagnosis. Parse multi-innings, all-out, target and revised-over strings only where explicitly supported; missing/ambiguous state marks the fixture unsupported instead of substituting guessed values. Initially support only T20 fixtures with all inputs required by the chosen model.

For a snapshot-only source, a locally computed snapshot fingerprint/sequence detects duplicates and orders observations; it is not a provider delivery ID and cannot recover skipped balls. Keep provider-backed delivery IDs optional in the adapter contract and report source capabilities explicitly.

Never extend a quote's source freshness merely because another HTTP request returns the same snapshot. Distinguish request success, last observed state change and independently established event freshness. A quiet scoreboard can mean a break or an old feed; those cases cannot be distinguished by HTTP status alone.

The 60s/5s schedule is usable for observing the current source and developing test-credit trading. It is not by itself sufficient to hold funded executable quotes open between snapshots. Funded mode requires an established stale-quote/suspension policy backed by suitable source information; currently that prerequisite remains unmet.

### Market lifecycle and trade execution

States: SCHEDULED → OPEN ↔ SUSPENDED → AWAITING_RESULT → SETTLING → SETTLED. Cancellation goes through VOIDING → VOIDED with idempotent full refunds. Persist transition reason, operator/system actor and timestamps.

- Normalize and deduplicate provider event IDs; track source sequence, revision and legal-ball progression.
- Fetch centrally and fan out through Socket.IO; never have every client independently poll the provider.
- Publish quotes only from validated states. Suspend for stale feeds, contradictory score changes, lost ordering, result ambiguity or model failures.
- Freshness must include provider/event timestamps where available. A newly received HTTP response does not prove its score is fresh. If source age cannot be established, do not claim a validated live execution mode.
- Support delivery-based or over-based publishing using the same market engine. Over-based publication does not fix stale prices: production execution still needs timely suspension/invalidation information. Do not assume a delayed over-end update means the next over has not started.
- A pooled payout protects the escrow total, not fairness against users with faster information. Measure lag/corrections before enabling funded live execution.
- Store executable quotes with quote ID/version, expiry and market-state version. Validate them atomically with balance and share checks.
- A stale/changed quote returns a structured PRICE_CHANGED response and a new preview; the user reconfirms. No hidden worse-price fills.
- Each funding/trade request carries an idempotency key. A client timeout retries the same request ID and can fetch its result. A duplicate request returns the original outcome.
- Serialize competing actions for an account/market and order them against quote/market transitions. Reject overspending, overselling and orders after suspension or result finalization.
- Reconnect: obtain a snapshot and sequence, catch up subsequent events, deduplicate, and reload on a gap. Subscribe/snapshot handoff must not lose events.

For v1, a validated official winner is required before final payout. Freeze trading for result review, DLS changes and Super Overs until the model/outcome policy supports the new state. Corrections after cash payout require an explicit incident policy; never silently debit users to rewrite completed history.

## 9. Data model and service boundaries

Implement an independent `trading` module. The existing SPORTS_MATCH mode is a prediction pool; it should continue to behave as before. Reuse authentication, wallet conventions, notifications and socket infrastructure, but do not store the new ledger in Room.customConfig or reuse single-winner fields.

| Record | Responsibility |
| --- | --- |
| TradingMarket | Provider fixture, two outcomes, status, format, rules/model version, feed health, settlement identity |
| TradingOutcome | Team mapping, terminal outcome and market ownership |
| MatchFeedEvent | Source ID/version, raw reference, normalized state, timestamps and correction lineage |
| TradingQuote | Atomic two-team prices, sequence, source/model reference, publication/expiry times |
| TradingCandle | Outcome, interval/bucket, OHLC, quote count, optional execution volume, last sequence |
| TradingAccount | User/market, cumulative funding, available credit units, revision and account status |
| TradingPosition | User/market/outcome, owned shares, cost basis and realized credit result |
| TradingOrderRequest | Idempotency key, payload hash, requested quote, accepted/rejected result |
| TradingExecution | Immutable side/quantity/price/cost, quote/model/source references and execution timestamp |
| TradingLedgerEntry | Funding, buy, sell, terminal valuation and settlement movements with reconciliation links |
| TradingEscrowEntry | Actual money collection, reservation and payout movements linked to wallet transactions |
| TradingSettlement | Frozen pool totals, rule version, result, payout progress and reconciliation status |
| TradingPayout | Per-user principal, loss, gain weight, rounding allocation, reward and wallet transaction |

Add foreign keys and unique constraints for provider events, user/market accounts, account/outcome positions, quote sequences, candle bucket keys, request identities and payout identities. Enforce a single currency/conversion version per market. Public market events must not contain private balances, positions or individual profit results.

## 10. API and socket contracts

Proposed REST routes, mounted under the server's existing API base:

| Route | Purpose |
| --- | --- |
| GET /trading/markets | Discover supported markets and their status |
| GET /trading/markets/:id | Public match snapshot, prices, freshness and rules |
| GET /trading/markets/:id/candles | Outcome/interval/range and paginated candle history |
| GET /trading/markets/:id/account | Authenticated account, positions and estimated settlement |
| GET /trading/markets/:id/executions | Authenticated paginated trade history |
| GET /trading/markets/:id/pool | Aggregate provisional pool statistics |
| POST /trading/markets/:id/fund | Idempotent wallet-to-market funding |
| POST /trading/markets/:id/orders | Idempotent BUY/SELL with outcome, quantity and quote ID |
| GET /trading/markets/:id/orders/:requestId | Recover an uncertain request result |
| GET /trading/markets/:id/settlement | Final public totals plus this user's private receipt |

Server events: `trading_quote`, `trading_candle`, `trading_market_status`, `trading_score`, `trading_pool`, `trading_account_updated`, `trading_execution`, `trading_settlement`. Include market ID, sequence/version and server timestamp. Use authorized market subscriptions and authenticated private user channels. Treat pushed state as informational; all mutations go through server validation.

Add shared TypeScript DTOs in `trading.types.ts`, export them, extend socket types and mirror validated models in Flutter. Do not spread untyped quote/ledger objects through the existing `Record<string, any>` game configuration.

## 11. Repository implementation map

Proposed additions:

```text
packages/shared-types/src/trading.types.ts
apps/server/src/modules/trading/
  trading.service.ts            # account funding and trade execution
  market-lifecycle.service.ts   # transitions, suspension and result handling
  pricing.service.ts            # model interface and quote publication
  probability/                  # inputs, baseline model and diagnostics
  feed/                         # provider interface, replay and live adapters
  candle.service.ts             # shared aggregation and history
  settlement.service.ts         # netting, allocation and idempotent payouts
  trading.repository.ts         # transactional persistence
apps/server/src/routes/trading.routes.ts
apps/server/tests/trading/       # meaningful model/ledger/API integration tests
apps/user-web/src/views/trading/
  TradingMarketsView.tsx
  TradingMarketView.tsx
  components/                   # chart, ticket, positions, pool, receipt
apps/user-web/src/services/trading-api.ts
apps/user-app/lib/screens/trading/
  trading_markets_screen.dart
  trading_market_screen.dart
  widgets/                      # native chart, ticket, positions, receipt
apps/user-app/lib/core/models/trading_models.dart
apps/user-app/lib/core/network/trading_api.dart
```

Modify shared exports/socket contracts, server route/socket startup, both Prisma schemas and migration sets, wallet transaction references, React App/navbar/mobile navigation, Flutter home navigation/socket service and required admin market controls. Keep existing card games and sports-pool settlement isolated from these changes.

## 12. Delivery milestones

| Milestone | Concrete deliverable | Completion evidence |
| --- | --- | --- |
| 1. Contracts and accounting | Rules version, integer units, state machine, schema design and pure settlement calculator | Worked examples and conservation/rounding cases pass; unresolved defaults listed |
| 2. Trading backend first | Durable accounts, test funding, quotes, buy/sell, history, sockets and escrow boundary | Concurrent/retried requests cannot duplicate trades or overdraw funds/shares; test-credit/cash isolation verified |
| 3. Feed and probability | Replay and ESPN snapshot adapters, adaptive polling, versioned baseline, time/event sensitivity and candle generation | Replay is deterministic; polling budgets/coalescing and source gaps/corrections handled; model evaluation report |
| 4. Complete screens | React/Flutter layout, candles/line, team switching, ticket, positions and receipt connected to the tested backend | End-to-end walkthrough at mobile/desktop widths; all incomplete/stale data states visible |
| 5. Settlement and admin | Terminal valuation, pool allocation, refunds, wallet receipts, suspension/recovery controls | Interrupted settlement resumes and reconciles exactly |
| 6. Integrated release candidate | Both clients use the same server contracts; reconnect/error/empty states complete | Full replay and funded test-wallet lifecycle passes with existing features intact |
| 7. Live readiness | Provider trial, measured delays, accepted model/rules, production configuration | Feed suitability, data-use permissions and launch-jurisdiction feasibility established before enabling real-money live trading |

Replay development is a way to complete the requested feature without waiting for a live API; it does not add the deferred card-game practice mode or bots. No publishing, deployment or production-wallet activation is part of creating this plan.

## 13. Required verification

### Accounting and execution

- Deposit/credit conversion, exact price × quantity, weighted entry, partial sales, repeat funding and reused virtual profits.
- Final netting of both winning and losing trades, not distribution by gross winning trades or stake alone.
- Untouched funds, complete loss, both-team holdings, open-position resolution, no-loss/no-positive pools and loss pools larger than nominal gains.
- Randomized conservation checks: total cash payouts equal escrow, no negative balances, no reward outside the pool and deterministic residual-paise allocation.
- Concurrent buy/buy, sell/sell, buy/suspend and trade/settle races; retry after timeout; rejected idempotency-key reuse with a different payload.
- Crash/restart during quote publication, funding and payout batches; duplicate result notifications; failed wallet update recovery.
- Cross-user account access, unauthorized private subscriptions and tampered prices/quantities/outcome IDs rejected.

### Charts and model

- OHLC from known quote sequences, exact time boundaries, duplicate/out-of-order messages, sparse intervals, timezone display and innings/over boundaries.
- No fabricated candles from missing data; actual trade volume stays independent from quote count.
- Chart switching/zoom/reconnect does not mix teams/markets or leak old listeners.
- Probability bounds, complementary rounded prices, terminal values, wides/no-balls, rain pauses, revised targets and known end conditions.
- The 30-from-12 scenario has reproducible counterfactuals; no requirement that every late event produce a large move.
- Polling tests cover 60s→5s transitions for both innings, reduced-overs thresholds, interruption/resumption, duplicate snapshots, non-overlap, shared subscribers, retry backoff and stopping at completion. Assert upstream request count with a controlled clock instead of sending load to ESPN.
- Snapshot regression fixtures include the observed IND–NZ 7.0→7.2→7.4→8.0 sequence and 6.6→7.0 normalization. Missing deliveries stay missing, charts show observed quotes only, and funded execution cannot be enabled by an HTTP-200 response alone.
- Test credits and replay accounts cannot fund, cash out into or otherwise alter the real wallet.
- Performance on representative mobile hardware and sustained quote streams; accessibility checks and an equivalent text summary.

### End-to-end acceptance

Using a replay IND–NZ match, a user can fund ₹1,000, receive 10,000 credits, buy 100 IND shares at 60, inspect the time-based candles, sell at 80 and see 12,000 closing credits. The screen shows ₹1,000 principal plus a provisional reward weight of 2,000 credits. After other users' final results establish the pool, the exact reward is allocated once, the correct cash reaches the wallet and the receipt explains every component. A user who never trades receives their deposit back.

Run repository type builds/server tests, targeted React build and Flutter analyze/tests for changed apps, migration validation on both database variants, and wallet/sports-pool regression tests. Expand checks if changes reveal additional risks; do not mark a live release ready based only on a visual chart demo.

## 14. Decisions to resolve during implementation

- Confirm proposed exceptions, full-pool allocation when losses exceed nominal gains, zero-fee v1 and settlement-time refunds.
- Implement the documented ESPN snapshot adapter and 60s/5s schedule for development; establish a suitable provider/freshness policy before funded live mode. The current endpoint has no verified request allowance, and the budget estimate is not an allowance.
- Choose and evaluate the probability baseline for both innings; support Super Over/DLS states explicitly or suspend/void according to published rules.
- Set funding/position limits, integer bounds, request limits and event retention from expected load and accounting constraints.
- Pin chart package/version with attribution and confirm the Flutter chart interaction scope during the prototype.

These decisions do not block drafting the screen, contracts, settlement calculator or replay integration. They do block claiming a finalized cash-trading ruleset or a validated live-data launch.

# CricTrade implementation and runbook

Implemented 24 October 2026; extended to ODI and Test/first-class on 25 October 2026. Wallet-funded trading was enabled on 25 October 2026 at the owner’s request. New live matches use actual wallet money at **₹1 = 10 match credits** across the backend, React and Flutter clients. The ESPN feed and pricing models remain experimental; enabling conversion does not establish their accuracy. No production deployment or production database changes were performed.

## What is available

- A CricTrade navigation tab in both user clients and admin web. User clients replace the MoneyGame header with match credits, Withdraw and a + action. Withdraw sits to the left of the credit button.
- The Home match picker shows supported real T20, ODI/List A and Test/first-class matches currently available for trading, with CASH mode and a published quote. Unfinished matches remain visible when trading is suspended, a quote expires, or probability crosses 90%; their last chart stays available with an explicit reason. Simulations and settled/voided matches are excluded. A match awaiting a delayed final feed result may remain listed as paused until the result is confirmed. If none are available, it shows an empty state and refreshes automatically. My positions lists only the caller's funded real matches, retaining paused/finished matches and their settlement receipts.
- Three user pages: Home, My positions and History. Home has team selection, current prices, a candlestick chart and Buy. T20 candle intervals switch automatically from sampled overs to one minute at 18 legal balls remaining in either innings. ODI and Test candles remain per over throughout. No interval selector, chart-style selector or zoom slider.
- Players explicitly choose a match before funding or trading. Funding/conversion opens from the header credit button and names the selected match; switching matches loads that match's separate balance and positions. Team selection is a compact horizontal rate row (`IND 60.00 | NZ 40.00`), with no duplicate win-percentage label. Test/first-class adds a third compact Draw button. Prices retain the existing 0.1-credit precision, displayed with two decimal places; all outcomes sum to 100 credits.
- The + action shows available wallet money, the exact debit and credits received. Conversion deducts available wallet money and locks it in the selected match atomically. Insufficient funds are rejected; retrying a successful request does not debit twice. Wallet updates are sent privately after committed funding and settlement.
- Whole-share buys have an order ticket; owned shares are managed through Exit position, including partial exits. Tapping an active position opens Home with the same match and outcome chart selected, including Draw or a paused market. Exit position retains its separate action. There is no standalone sell/short action. Confirmation and changed/expired quote rejection are preserved.
- New buys and additional funding pause for **all outcomes whenever any published outcome probability exceeds 90%**, including Draw in a Test. Exactly 90% permits entry; entry resumes when every outcome returns to 90% or below. The server checks the latest quote inside the funding/order transaction, before changing any balances. Existing positions can still exit at valid quotes. At 85–90%, both clients warn that new buys/funding will pause above 90%. The threshold does not block exits. A suspended market or expired quote blocks both buys and exits and now shows the reason on both Home and My positions. There is no over-based entry cutoff or artificial time-decay charge.
- My positions shows average entry, last price, invested/current values and green/red credit P&L. History lists the user’s executed buys/exits across real matches, with team/outcome, match, quantity, execution price, credits and full local date/time. Load more fetches older trades in pages of 50, without the snapshot’s 100-execution limit. Settlement receipts remain in My positions. Market rules are behind an information action. Drag the price axis vertically to scale candle height, or the time axis horizontally to scale spacing; double-click/tap resets the axis.
- Persisted request IDs and retry recovery, authenticated ownership checks, integer accounting and serializable mutations.
- Admin simulation creation, pause/resume, result confirmation and void/refund with a recorded actor and reason.
- SQLite and PostgreSQL migrations. Existing card games and sports pools use their existing accounting paths.

## Accounting

All stored amounts use integer **credit tenths**. One unit equals 0.1 match credit and corresponds nominally to one paise. Thus ₹1,000 → 100,000 stored units → 10,000 displayed credits. A 60-credit share has a stored price of 600; 100 shares cost 60,000 units.

Final balance is available credits plus open winning shares valued at 100 credits each; open losing shares close at zero. In a confirmed Test draw, Draw shares win and both team shares lose. A tie is distinct from a draw and requires operator resolution; an abandoned/no-result match is refunded after confirmation. For each account:

```text
gain      = max(finalBalance - deposit, 0)
loss      = max(deposit - finalBalance, 0)
principal = min(deposit, finalBalance)
rewardPool = min(sum(all gains), sum(all losses))
reward    = gain / sum(all gains) * rewardPool
payout    = principal + reward
```

For new `pooled-capped-v2` matches, profit redemption is capped at **₹1 per 10 profit credits** (at most one paise per stored unit), and can be lower if losses are insufficient. Largest-remainder allocation distributes residual paise deterministically without exceeding that cap. `platformSurplus = totalDeposits - totalPayouts`; payouts plus surplus equal deposits. Surplus is persisted on the market and in its settlement audit, inside the same transaction as wallet payouts, and shown to administrators. It is retained platform revenue, not an automatic transfer to an administrator’s personal wallet. Test-mode surplus is only an equivalent value.

Example: one user gains 1,000 credits (₹100 maximum) and another loses 5,000 credits (₹500). The winner receives ₹100 profit plus principal; the platform retains ₹400. Existing `pooled-v1` matches keep their original uncapped proportional rules and completed receipts are never rewritten. A void, or a pool without any positive participants, refunds all deposits. Positive participants with no loss pool receive no reward. All unused principal returns at settlement; there is no early withdrawal. Both clients display these exceptions.

Settlement remains automatic **per match after its result is confirmed**, not a daily 5 PM batch. Every deposit, position and profit/loss allocation belongs to one match; another running match's credits cannot fund its payout. Settlement returns each wallet-funded match’s final payout to the wallet atomically. The header Withdraw action explains locks before settlement, then opens the existing wallet withdrawal flow after cash settlement without issuing another payout. Test credits cannot be withdrawn as money. The header shows zero spendable match credits after settlement; the final accounting remains in the receipt.

Example: deposit 10,000 credits, buy 100 India shares at 60 and sell at 80 → 12,000 final credits. Principal is ₹1,000; 2,000 positive credits determine the share of the loss pool. For capped matches, ₹200 is the maximum profit payout; the actual amount can be lower. Test-mode receipts express the equivalent amounts but never change the wallet.

Funding is capped at ₹100,000 equivalent per account per match; orders and each outcome holding are capped at 1,000,000 shares. Additional integer bounds prevent account value overflow. These are implementation limits, not approved cash-product limits.

## Feed and pricing

The worker requests the existing ESPN cricket scoreboard once per shared polling cycle, regardless of viewer count. A database lease elects one polling process. Normal cadence is 60 seconds. Only T20 accelerates to 5 seconds when an innings has 1–18 legal balls remaining. ODI and Test never trigger that acceleration; if another T20 is in fast cadence, the shared response can still contain updated ODI/Test scores. Their candles remain per over. Failures use exponential backoff and respect longer provider `Retry-After` values. `CRICTRADE_ESPN_ENABLED=false` disables external polling while simulations continue.

Prices recalculate on changed score snapshots, including changes within an over; per-over candles group those observed prices rather than limiting price updates to over ends. Simulation advances one delivery approximately every ten seconds. The probability cutoff does not change polling, chart intervals or pricing. Because it uses the published quote (0.1-percentage-point precision), it cannot detect a threshold crossing before the feed/model reports it.

For a four-hour match with 30 minutes in fast cadence, the estimate is `210 + 360 = 570` upstream calls, plus discovery/retries. This is a budget estimate, not a verified free allowance. Existing sports-score polling elsewhere in MoneyGame has its own requests. Client refreshes use this backend's persisted data rather than making ESPN calls themselves.

The adapter supports full-length T20 (120 balls), ODI/List A (300 balls), and Test/first-class (up to four innings, no fixed ball limit). Limited-overs chases require an explicit target. Test states require provider batting-team identity, both teams’ innings scores, match day/session and scheduled match duration. Follow-ons use batting identity rather than an assumed alternating order; declarations end an innings; fourth-innings targets derive from aggregate scores and must agree with any explicit target. Missing or inconsistent inputs suspend trading instead of inventing a score.

Unsupported/reduced-overs inputs, interruptions, terminal innings, score regressions and revised targets suspend execution. Corrections require operator review. A unique provider winner, explicit Test draw, or explicit no-result must appear in two matching final observations before automatic settlement/refund. Ambiguous results require admin resolution. T10, The Hundred, Super Over execution and DLS pricing are not implemented.

Identical snapshots update `feedReceivedAt` without renewing the quote. Quotes expire after 90 seconds for ESPN and 30 seconds for simulation. These limits stop execution on unchanged inputs; they do **not** prove source freshness. The earlier IND–NZ probe observed missing intermediate deliveries even at 5-second polling. See [feed evidence](CRICKET_FEED_TEST_REPORT.md).

`cricket-baseline-v1` remains the T20 model. `cricket-multiformat-baseline-v1` adds ODI scoring assumptions and an experimental three-outcome Test estimate. Limited-overs estimates use runs, wickets, target and legal balls remaining. Test team estimates use aggregate runs, innings remaining and wickets; the Draw estimate additionally uses source-provided match day/session and scheduled days. These are heuristic inputs, not calibrated odds. Test updates do not assume a fixed number of overs per innings. “Theta” is opportunity loss as balls run out; “delta” is sensitivity to changed match inputs. Neither is an arbitrary wall-clock charge or random price movement. The model is deliberately labelled experimental, not calibrated.

For the documented 30-from-12, five-wickets-left chase, the baseline's batting-team quotes are:

| State | Price / estimated chance |
| --- | --- |
| Before next delivery | 15.5 credits / 15.5% |
| Dot ball | 12.5 credits / 12.5% |
| Single | 14.0 credits / 14.0% |
| Six | 23.8 credits / 23.8% |
| Wicket, no run | 10.6 credits / 10.6% |

These are reproducible model diagnostics, not historical prediction accuracy. Calibration, historical evaluation and a verified live feed remain necessary before cash use.

## API and persistence

All routes require authenticated users or administrators. `/api/trading/markets/:id` combines the current market, caller's account/positions, recent executions, aggregate pool estimates and personal receipt in one consistent response. This consolidates the separate account/pool/settlement reads proposed in the original plan.

| Method | Route below `/api` | Purpose |
| --- | --- | --- |
| GET | `/trading/markets` | Up to 100 unfinished CASH real-feed markets with published quotes, including suspended/expired markets |
| GET | `/trading/history?cursor=...` | Caller’s real-match executions, newest first; 50 rows and nextCursor; cursor ownership validated |
| GET | `/trading/markets?view=positions` | Caller's funded real matches, including paused/settled matches; simulations excluded |
| GET | `/trading/markets/:id` | Account and market snapshot |
| GET | `/trading/markets/:id/candles?outcome=0&interval=auto` | Up to 3,000 observed quotes; `auto` selects over/1m from the latest state; optional `before` in epoch milliseconds |
| POST | `/trading/markets/:id/fund` | `{amount, requestId}`; amount in stored units |
| POST | `/trading/markets/:id/orders` | `{quoteId, outcome, side, quantity, requestId}` |
| GET | `/trading/markets/:id/orders/:requestId` | Recover the caller's persisted operation result |
| GET | `/admin/trading/markets` | Admin market state |
| POST | `/admin/trading/simulation` | Create a test chase |
| POST | `/admin/trading/markets/:id/pause` | `{paused, reason}`; resume waits for a changed score |
| POST | `/admin/trading/markets/:id/settle` | `{winner: 0 \| 1 \| 2 \| null, reason}`; 2 is Test-only Draw, null refunds |

Outcome IDs are `0` (first team), `1` (second team), and `2` (Draw, Test-only). Orders and candle endpoints reject Draw for other formats. Quotes persist `price0` and `priceDraw`; the second team price is `1000 - price0 - priceDraw` in stored units. Existing two-outcome quotes default to zero Draw price.

Socket events `trading_market_updated` and private `trading_account_updated` invalidate client snapshots. Clients also refresh every five seconds, so reconnecting clients obtain authoritative state. Candle OHLC comes from published quotes only; trade volume is separate from quote count. No skipped delivery prices are reconstructed.

Successful funding/trading requests store their payload and result atomically. Reusing the same ID and payload returns that result; a different payload conflicts. Clients persist uncertain requests and retry the same ID. No client-supplied price or user ID controls execution.

Settlement uses one serializable transaction for the market, all account receipts and any wallet movements. A failed transaction rolls back the entire settlement; the next worker/admin attempt retries it. This replaces the original plan's proposed batch settlement for the current small-user version. Large-pool batching and load qualification remain future work. Trade records remain persisted; the screens currently show the latest 100 executions.

Wallet conversion is enabled by default for CASH markets with ESPN or VERIFIED sources. The previous verified-source/model-version gate was removed for the requested live-money testing; model versions and experimental labels remain truthful. `CRICTRADE_CASH_ENABLED=false` pauses new cash funding and buys. Valid exits and settlement still work so disabling entries does not trap existing funds. Simulations cannot execute cash funding or trades.

New provider markets use IDs `espn-cash-<eventId>`. Old `espn-<eventId>` markets keep their original TEST mode, credits, positions and receipts; their balances are never relabelled or redeemed as cash. The worker follows both pools to the result using the same scoreboard request. Home lists only live CASH pools; My positions retains the user’s legacy test records. New funding and buys into legacy real-feed TEST pools are rejected, while owned positions can still exit with valid quotes. Existing simulation fixtures stay available to administrators and cannot cash out.

## Run locally

From the repository root:

```bash
npm install
npm run build:types
```

Before starting the server, apply the new migration to the intended **development** database, using the existing server environment configuration:

```bash
cd apps/server
npx prisma migrate deploy --schema prisma/schema.prisma
npx prisma generate --schema prisma/schema.prisma
cd ../..
npm run dev:server
```

In separate terminals, run `npm run dev:user-web` and `npm run dev:admin-web`, or `flutter run` from `apps/user-app`. Sign in with existing accounts and open CricTrade. Startup discovers supported live real matches without creating a simulation. New real matches use wallet-funded credits; no free balance is issued on selecting a match. Admin simulation fixtures remain available for development and existing records are preserved, but they are hidden from both user pickers. Existing simulations continue their ten-second replay so their accounts can settle.

The 25 October format extension was checked against a captured live New Zealand A v India A first-class snapshot: innings 3, New Zealand A 317, India A 113 & 92/2 (29.1 overs), day 2 session 3 of a four-day match. The adapter correctly retained batting identity and both innings aggregates, and produced three prices summing to 100 credits. This is parsing evidence, not model-accuracy or deployed-backend evidence. Availability changes with the provider feed.

The initial migration is `20261024000000_crictrade`; the required format-extension migration is `20261025000000_crictrade_draw` in both migration directories. Apply the Draw migration and regenerate Prisma before running the updated backend. It adds `TradingQuote.priceDraw` with a zero default and preserves existing quotes, balances and positions. PostgreSQL deployments must use the repository's PostgreSQL schema/migration selection in `docker-entrypoint.sh`; do not apply SQLite migrations to PostgreSQL. The redemption cap additionally requires `20261025010000_crictrade_redemption_cap`, adding `TradingMarket.platformSurplus` with a zero default. The database’s existing `pooled-v1` default is retained for old records; application creation explicitly assigns `pooled-capped-v2` to new pools. Verification used disposable databases; no existing user funds were moved.

## Verification

```bash
npm run build
npm --prefix apps/server test -- trading trading-http trading-formats trading-cash trading-redemption security sports
npm run test:migrations
npm run test:web-sessions
cd apps/user-app
flutter analyze
flutter test
```

Coverage includes ODI/Test parsing, follow-ons, declarations, fourth-innings targets, missing time metadata, three-outcome rounding/conservation, Draw trading and exit, the Draw probability cutoff, automatic/admin Draw settlement, and a legacy-quote migration regression; plus 500 randomized conservation cases; exact conversion/rounding; ownership; quote expiry; concurrent overspending; duplicate operations/results; void refunds; separate match balances and unchanged running-match accounts during settlement; corrected/duplicate feed states; shared polling ownership; fast cadence; provider backoff; cash-boundary escrow/payout rollback; HTTP permissions and private-operation isolation. Existing security/payment and sports-pool regressions pass.

SQLite migrations were exercised against fresh and upgraded temporary databases. The PostgreSQL schema validates, but its migration was not executed against a running PostgreSQL instance. Flutter analysis reports two pre-existing informational lint notices in unrelated screens.

Format-extension checks pass on 360px and 1280px web viewports and 360px Flutter layouts: a compact three-option Test row, Draw buy/exit, ODI per-over candles even in the final three overs, and T20 automatic one-minute candles.

Browser checks use mocked API responses against the real local React apps: desktop/mobile chart rendering, automatic interval transitions, axis gestures, replacement header, funding, buy/exit confirmation, profit/loss positions, and admin pause/resume/settle. Flutter tests cover independent axis gestures and funding/buy/exit interactions with a fake API. These complement backend integration tests; they do not establish live-feed accuracy or production performance.

The 25 October match-selection update additionally checks compact rates, disabled funding before choosing a match, independent balances when switching matches, locked running-match withdrawals, blocked test-credit cash-outs, and settled-cash navigation to the existing wallet withdrawal screen. This navigation does not create another settlement transaction.

Probability-cutoff checks cover both teams, exact 90% boundaries, reopening, existing and new account funding rejection, both BUY outcomes, recovery of successful pre-cutoff requests, unchanged cash balances on rejection, valid exits and expired/finished-market exit rejection. The API exposes `entryClosed` separately from market status so a cutoff does not imply that exits are paused.

Further production qualification: measure provider latency, calibrate the probability models, finalize published product rules and qualify settlement at the intended pool size. The other lobby/profile/invitation/29 plan remains deferred as requested.

The wallet-conversion checks cover real-mode discovery, fractional-rupee conversion, wallet locking, insufficient funds, duplicate and concurrent requests, separate legacy pools, private wallet notifications, disabled-entry exits, confirmed-result cash payouts, void refunds and total-pool conservation. Browser tests use mocked wallets; backend integration tests use isolated fixture accounts, not real users’ money.

The cap/visibility/History update verifies the ₹100/₹500/₹400 example, legacy rule preservation, capped rounding, payouts-plus-surplus conservation, and private history beyond 100 rows with no duplicates. Phone/browser tests cover expired quotes at 89.9%, visibility above 90%, valid exits above the cutoff, explicit disabled reasons, three adjacent tabs and older-history loading. These reproduce the screenshot scenario without claiming a production log diagnosis of the exact 19:41 event.

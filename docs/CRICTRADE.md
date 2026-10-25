# CricTrade implementation and runbook

Implemented 24 October 2026. The backend, React user screen, Flutter user screen and React admin controls support a complete **test-credit** trading lifecycle. The current ESPN source and experimental model are not approved for cash execution. No production deployment or production database changes were performed.

## What is available

- A CricTrade navigation tab in both user clients and admin web. User clients replace the MoneyGame header with match credits, Withdraw and a + action. Withdraw sits to the left of the credit button.
- The Home match picker shows supported real T20 matches currently available for trading, with fresh quotes and a recently observed feed. Simulations, finished matches, paused matches and stale quotes are excluded. If none are available, it shows an empty state and refreshes automatically. My positions lists only the caller's funded real matches, retaining paused/finished matches and their settlement receipts.
- Two user pages: Home and My positions. Home has team selection, current prices, a candlestick chart and Buy. Candle intervals switch automatically from sampled overs to one minute at 18 legal balls remaining in either innings. No interval selector, chart-style selector or zoom slider.
- Players explicitly choose a match before funding or trading. Funding/conversion opens from the header credit button and names the selected match; switching matches loads that match's separate balance and positions. Team selection is a compact horizontal rate row (`IND 60.00 | NZ 40.00`), with no duplicate win-percentage label. Prices retain the existing 0.1-credit precision, displayed with two decimal places.
- Whole-share buys have an order ticket; owned shares are managed through Exit position, including partial exits. There is no standalone sell/short action. Confirmation and changed/expired quote rejection are preserved.
- New buys and additional funding pause for **both teams whenever either team's published win probability exceeds 90%**, in either innings. Exactly 90% permits entry; entry resumes when both teams return to 90% or below. The server checks the latest quote inside the funding/order transaction, before changing any balances. Existing positions can still exit at valid quotes. There is no over-based entry cutoff or artificial time-decay charge.
- My positions shows average entry, last price, invested/current values and green/red credit P&L. Order history and settlement receipts are collapsed. Market rules are behind an information action. Drag the price axis vertically to scale candle height, or the time axis horizontally to scale spacing; double-click/tap resets the axis.
- Persisted request IDs and retry recovery, authenticated ownership checks, integer accounting and serializable mutations.
- Admin simulation creation, pause/resume, result confirmation and void/refund with a recorded actor and reason.
- SQLite and PostgreSQL migrations. Existing card games and sports pools use their existing accounting paths.

## Accounting

All stored amounts use integer **credit tenths**. One unit equals 0.1 match credit and corresponds nominally to one paise. Thus ₹1,000 → 100,000 stored units → 10,000 displayed credits. A 60-credit share has a stored price of 600; 100 shares cost 60,000 units.

Final balance is available credits plus open winning shares valued at 100 credits each; open losing shares close at zero. For each account:

```text
gain      = max(finalBalance - deposit, 0)
loss      = max(deposit - finalBalance, 0)
principal = min(deposit, finalBalance)
reward    = gain / sum(all gains) * sum(all losses)
payout    = principal + reward
```

Largest-remainder allocation distributes residual paise deterministically. Total payouts equal total deposits. No fees are charged. A void, or a pool without any positive participants, refunds all deposits. Positive participants with no loss pool receive no reward. All unused principal returns at settlement; there is no early withdrawal. Both clients display these exceptions.

Settlement remains automatic **per match after its result is confirmed**, not a daily 5 PM batch. Every deposit, position and profit/loss allocation belongs to one match; another running match's credits cannot fund its payout. In cash mode, settlement already returns the final payout to the wallet atomically. The header Withdraw action explains locks before settlement, then opens the existing wallet withdrawal flow after cash settlement without issuing another payout. Test credits cannot be withdrawn as money. The header shows zero spendable match credits after settlement; the final accounting remains in the receipt.

Example: deposit 10,000 credits, buy 100 India shares at 60 and sell at 80 → 12,000 final credits. Principal is ₹1,000; 2,000 positive credits determine the share of the loss pool. They do not guarantee ₹200 profit. Test-mode receipts express the equivalent amounts but never change the wallet.

Funding is capped at ₹100,000 equivalent per account per match; orders and each outcome holding are capped at 1,000,000 shares. Additional integer bounds prevent account value overflow. These are implementation limits, not approved cash-product limits.

## Feed and pricing

The worker requests the existing ESPN cricket scoreboard once per shared polling cycle, regardless of viewer count. A database lease elects one polling process. Normal cadence is 60 seconds, accelerating to 5 seconds when a supported innings has 1–18 legal balls remaining. Failures use exponential backoff and respect longer provider `Retry-After` values. `CRICTRADE_ESPN_ENABLED=false` disables external polling while simulations continue.

Prices recalculate on changed score snapshots, including changes within an over; per-over candles group those observed prices rather than limiting price updates to over ends. Simulation advances one delivery approximately every ten seconds. The probability cutoff does not change polling, chart intervals or pricing. Because it uses the published quote (0.1-percentage-point precision), it cannot detect a threshold crossing before the feed/model reports it.

For a four-hour match with 30 minutes in fast cadence, the estimate is `210 + 360 = 570` upstream calls, plus discovery/retries. This is a budget estimate, not a verified free allowance. Existing sports-score polling elsewhere in MoneyGame has its own requests. Client refreshes use this backend's persisted data rather than making ESPN calls themselves.

The adapter requires supported 20-over states and an explicit chase target. It suspends unsupported/reduced-overs inputs, interruptions, terminal innings, score regressions and revised targets. Corrections require operator review. A unique provider winner must appear twice before automatic test settlement; ambiguous results require admin resolution. Super Over execution and DLS pricing are not implemented.

Identical snapshots update `feedReceivedAt` without renewing the quote. Quotes expire after 90 seconds for ESPN and 30 seconds for simulation. These limits stop execution on unchanged inputs; they do **not** prove source freshness. The earlier IND–NZ probe observed missing intermediate deliveries even at 5-second polling. See [feed evidence](CRICKET_FEED_TEST_REPORT.md).

`cricket-baseline-v1` is a deterministic logistic estimate using runs, wickets, target and legal balls remaining. “Theta” is opportunity loss as balls run out; “delta” is sensitivity to changed match inputs. Neither is an arbitrary wall-clock charge or random price movement. The model is deliberately labelled experimental, not calibrated.

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
| GET | `/trading/markets` | Up to 100 real-feed markets with OPEN status, a valid quote and feed observation within two minutes |
| GET | `/trading/markets?view=positions` | Caller's funded real matches, including paused/settled matches; simulations excluded |
| GET | `/trading/markets/:id` | Account and market snapshot |
| GET | `/trading/markets/:id/candles?outcome=0&interval=auto` | Up to 3,000 observed quotes; `auto` selects over/1m from the latest state; optional `before` in epoch milliseconds |
| POST | `/trading/markets/:id/fund` | `{amount, requestId}`; amount in stored units |
| POST | `/trading/markets/:id/orders` | `{quoteId, outcome, side, quantity, requestId}` |
| GET | `/trading/markets/:id/orders/:requestId` | Recover the caller's persisted operation result |
| GET | `/admin/trading/markets` | Admin market state |
| POST | `/admin/trading/simulation` | Create a test chase |
| POST | `/admin/trading/markets/:id/pause` | `{paused, reason}`; resume waits for a changed score |
| POST | `/admin/trading/markets/:id/settle` | `{winner: 0 | 1 | null, reason}`; null refunds |

Socket events `trading_market_updated` and private `trading_account_updated` invalidate client snapshots. Clients also refresh every five seconds, so reconnecting clients obtain authoritative state. Candle OHLC comes from published quotes only; trade volume is separate from quote count. No skipped delivery prices are reconstructed.

Successful funding/trading requests store their payload and result atomically. Reusing the same ID and payload returns that result; a different payload conflicts. Clients persist uncertain requests and retry the same ID. No client-supplied price or user ID controls execution.

Settlement uses one serializable transaction for the market, all account receipts and any wallet movements. A failed transaction rolls back the entire settlement; the next worker/admin attempt retries it. This replaces the original plan's proposed batch settlement for the current small-user version. Large-pool batching and load qualification remain future work. Trade records remain persisted; the screens currently show the latest 100 executions.

The cash ledger boundary is implemented and tested on isolated fixture accounts, including payout rollback. It requires `CRICTRADE_CASH_ENABLED=true`, a `VERIFIED` market source and a non-baseline model version. There is no UI for activating cash and no verified provider adapter in this release. Merely changing metadata or the environment flag is not a cash-launch procedure; current client funding flows are explicitly test-only.

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

In separate terminals, run `npm run dev:user-web` and `npm run dev:admin-web`, or `flutter run` from `apps/user-app`. Sign in with existing accounts and open CricTrade. Startup discovers supported live real matches without creating a simulation. Real matches still use test credits. Admin simulation fixtures remain available for development and existing records are preserved, but they are hidden from both user pickers. Existing simulations continue their ten-second replay so their accounts can settle.

A read-only feed check on 25 October 2026 at 10:18 IST found no supported live T20 match. New Zealand A v India A was live but was a multi-innings match, outside the current adapter/model. Availability changes with the provider feed; that check does not establish a deployed backend's state.

The new migration is `20261024000000_crictrade` in both migration directories. PostgreSQL deployments must use the repository's PostgreSQL schema/migration selection in `docker-entrypoint.sh`; do not apply SQLite migrations to PostgreSQL. Database changes during development verification were restricted to disposable test databases.

## Verification

```bash
npm run build
npm --prefix apps/server test -- trading trading-http security sports
npm run test:migrations
npm run test:web-sessions
cd apps/user-app
flutter analyze
flutter test
```

Coverage includes 500 randomized conservation cases; exact conversion/rounding; ownership; quote expiry; concurrent overspending; duplicate operations/results; void refunds; separate match balances and unchanged running-match accounts during settlement; corrected/duplicate feed states; shared polling ownership; fast cadence; provider backoff; cash-boundary escrow/payout rollback; HTTP permissions and private-operation isolation. Existing security/payment and sports-pool regressions pass.

SQLite migrations were exercised against fresh and upgraded temporary databases. The PostgreSQL schema validates, but its migration was not executed against a running PostgreSQL instance. Flutter analysis reports two pre-existing informational lint notices in unrelated screens.

Browser checks use mocked API responses against the real local React apps: desktop/mobile chart rendering, automatic interval transitions, axis gestures, replacement header, funding, buy/exit confirmation, profit/loss positions, and admin pause/resume/settle. Flutter tests cover independent axis gestures and funding/buy/exit interactions with a fake API. These complement backend integration tests; they do not establish live-feed accuracy or production performance.

The 25 October match-selection update additionally checks compact rates, disabled funding before choosing a match, independent balances when switching matches, locked running-match withdrawals, blocked test-credit cash-outs, and settled-cash navigation to the existing wallet withdrawal screen. This navigation does not create another settlement transaction.

Probability-cutoff checks cover both teams, exact 90% boundaries, reopening, existing and new account funding rejection, both BUY outcomes, recovery of successful pre-cutoff requests, unchanged cash balances on rejection, valid exits and expired/finished-market exit rejection. The API exposes `entryClosed` separately from market status so a cutoff does not imply that exits are paused.

Before live cash release: integrate and measure a suitable provider, validate the probability model, finalize the published product rules, implement cash-specific client funding flows, and qualify settlement at the intended pool size. The other lobby/profile/invitation/29 plan remains deferred as requested.

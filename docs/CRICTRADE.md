# CricTrade implementation and runbook

Implemented 24 October 2026. The backend, React user screen, Flutter user screen and React admin controls support a complete **test-credit** trading lifecycle. The current ESPN source and experimental model are not approved for cash execution. No production deployment or production database changes were performed.

## What is available

- A CricTrade navigation tab in both user clients and admin web.
- Match discovery, a shared simulated IND–NZ chase, supported live T20 snapshots, score/target/overs, quote timestamps and market status.
- Complementary team prices, candlestick and line charts, 1m/5m/15m/sampled-over intervals, zoom, inspection, entry-price lines and personal trade markers.
- Test funding, whole-share buys and sells, affordable quantity shortcuts, explicit order confirmation and rejection of expired/changed quotes.
- Positions, weighted entry price, realized/unrealized results, recent trade history, provisional pool allocation, rules and settlement receipts.
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

Example: deposit 10,000 credits, buy 100 India shares at 60 and sell at 80 → 12,000 final credits. Principal is ₹1,000; 2,000 positive credits determine the share of the loss pool. They do not guarantee ₹200 profit. Test-mode receipts express the equivalent amounts but never change the wallet.

Funding is capped at ₹100,000 equivalent per account per match; orders and each outcome holding are capped at 1,000,000 shares. Additional integer bounds prevent account value overflow. These are implementation limits, not approved cash-product limits.

## Feed and pricing

The worker requests the existing ESPN cricket scoreboard once per shared polling cycle, regardless of viewer count. A database lease elects one polling process. Normal cadence is 60 seconds, accelerating to 5 seconds when a supported innings has 1–18 legal balls remaining. Failures use exponential backoff and respect longer provider `Retry-After` values. `CRICTRADE_ESPN_ENABLED=false` disables external polling while simulations continue.

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
| GET | `/trading/markets` | Latest 100 markets |
| GET | `/trading/markets/:id` | Account and market snapshot |
| GET | `/trading/markets/:id/candles?outcome=0&interval=1m` | Up to 3,000 observed quotes aggregated as candles; optional `before` in epoch milliseconds |
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

In separate terminals, run `npm run dev:user-web` and `npm run dev:admin-web`, or `flutter run` from `apps/user-app`. Sign in with existing accounts and open CricTrade. Startup creates a simulation if none is active; admin web can create another after it finishes. Simulated deliveries advance every ten seconds without bots or user price discovery.

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

Coverage includes 500 randomized conservation cases; exact conversion/rounding; ownership; quote expiry; concurrent overspending; duplicate operations/results; void refunds; corrected/duplicate feed states; shared polling ownership; fast cadence; provider backoff; cash-boundary escrow/payout rollback; HTTP permissions and private-operation isolation. Existing security/payment and sports-pool regressions pass.

SQLite migrations were exercised against fresh and upgraded temporary databases. The PostgreSQL schema validates, but its migration was not executed against a running PostgreSQL instance. Flutter analysis reports two pre-existing informational lint notices in unrelated screens.

Browser checks use mocked API responses against the real local React apps: desktop/mobile chart rendering, line/candle and interval switching, order confirmation, positions/pool/rules, and admin pause/resume/settle. Flutter tests cover the chart and complete funding/buy ticket interaction with a fake API. These complement backend integration tests; they do not establish live-feed accuracy or production performance.

Before live cash release: integrate and measure a suitable provider, validate the probability model, finalize the published product rules, implement cash-specific client funding flows, and qualify settlement at the intended pool size. The other lobby/profile/invitation/29 plan remains deferred as requested.

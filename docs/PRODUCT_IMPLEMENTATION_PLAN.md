# MoneyGame product implementation plan

Prepared 24 October 2026; implementation updated 26 October 2026. Lobby, profiles, invitations, and 29 are implemented in the workspace. The 26 October fixes add private recovery storage, serialized durable actions, retryable settlement, invitation expiry/revocation, and client integration corrections. See [the versioned 29 rules](TWENTY_NINE_RULES.md). CricTrade implementation and its 25 October ODI/Test/Draw extension are documented in [the implementation runbook](CRICTRADE.md); the research notes below preserve the original planning context.

## Agreed scope

- Clearer lobby.
- Complete four-player 29 card game.
- Player profiles.
- Easier room invitations.
- Defer practice mode and bots.
- Research the cricket trading market separately from this release.

Target both Flutter user-app and React user-web, with shared server behavior. Deliver in stages rather than making the entire release depend on 29.

## Current foundations and gaps

- Room creation, joining by code, authenticated sessions, Socket.IO updates, wallet locking and game registration already exist.
- The 29 engine implements bidding, hidden trump, eight tricks, partnership settlement, durable recovery, and deterministic timeouts. `product_regression.test.ts` exercises HTTP/socket privacy, restart, failure injection, invitations, and results.
- Shared 29 action/state types include room identity, action sequence, settlement phase, and participant-specific state.
- Flutter and React expose editable display names, curated avatars, restricted public profiles, and completed-game statistics.
- Room `winnerId` remains a compatibility field. Team settlement records both winners and individual payouts. The server-only `engineState`/`engineSequence` fields never enter room DTOs.
- The sports service polls every 30 seconds and caches match data for 45 seconds. It currently consumes ESPN scoreboard endpoints and settles prediction pools; it does not provide a trading engine or an independently verified low-latency delivery feed.

## Stage 1: lobby and invitation flow

### Lobby

Lead with Resume Game when a user has an active room, then Find a Table, Create Table and Play with Friends. Retain game filters and add useful filters for entry fee and available seats.

Each table card should show game name, entry fee, occupied/available seats, waiting/playing status and one clear action. Show the full cost before a chargeable join. Label counts accurately as tables or players; the current mobile header derives an “Online” count from room count.

Empty states should offer Create Table and Invite Friends. Keep unavailable games clearly marked until their implementation is complete. Avoid inventing player counts or waiting-time estimates.

### Invitations

Use a canonical HTTPS route such as `/join/<invitation-token>`. Resolve it to a room preview with host, game, seats, fee and availability. Preserve the invitation through login, then return to that preview. Joining requires the player's explicit action and a fresh availability check.

Add native sharing, copy link and copy code. Configure Android App Links and iOS Universal Links for the selected production domain, with a functional browser fallback. Domain association and signing configuration are deployment dependencies; basic web links can ship first.

Introduce explicit PUBLIC/PRIVATE room visibility. Private rooms must be excluded from lobby listings and general room broadcasts. Use an unguessable invitation token, expiry/revocation and server authorization; possession of an invitation does not expose hands or private account data. Room codes must obey the same access policy.

Handle full, started, cancelled, expired and missing rooms with useful explanations. Never reserve a paid seat merely because someone opens a link.

### Acceptance checks

- An invitation opened while logged out survives authentication and reaches the intended room.
- A stale preview cannot overfill a table or charge twice.
- A private room does not leak through room lists or socket broadcasts.
- Existing create/join-code flows continue to work on both clients.

## Stage 2: player profiles

Add a Profile destination with editable display name, a curated avatar, member-since date, per-game completed games/wins and recent results. Keep the existing login username stable initially. Use avatars from a fixed collection to avoid adding an upload service.

Separate public player fields from private account information. Wallet, email and phone remain private. Validate profile edits on the server. Derive statistics from completed results, excluding cancelled games and counting both winning teammates in 29.

Add shared profile DTOs, authenticated edit endpoints, a deliberately restricted public profile endpoint, and matching Flutter/React models and views. Update SQLite and PostgreSQL schemas and migrations consistently. Avoid storing duplicate counters unless there is a demonstrated need.

Acceptance: edits persist across clients; opponents see only public fields; refunds/cancellations do not appear as wins or losses; a team result produces two correct player histories.

## Stage 3: complete 29

### Proposed initial ruleset

Publish a named, versioned house ruleset on the room preview. 29 has regional variants; these are proposed defaults, not a claim of a universal ruleset.

- Four players, partners in opposite seats, 32-card deck.
- Rank order J, 9, A, 10, K, Q, 8, 7; points 3, 2, 1, 1, 0, 0, 0, 0.
- Four cards per player before bidding; remaining cards after trump selection.
- Proposed bidding range 16–28, with 28 total card points and no extra last-trick point.
- Hidden trump, following suit, legal reveal rules and trick resolution must be specified together before implementation.
- Initially omit marriage/pair adjustments, double/redouble and single-hand variants.
- Proposed MoneyGame room format: one deal/eight tricks settles the entry pool. The bidder's team wins by reaching its contract; otherwise the defending team wins. Label this “single deal,” since a traditional longer match is a separate format.

Specify all-pass redeals, dealer/first bidder, bid progression, reveal timing, compulsory trump use after revealing, abandoned games and timeouts in the rules document. Use deterministic fixtures to settle these details before writing UI logic.

Reference for variants: https://www.pagat.com/jass/29.html

### Server implementation

Create a server-authoritative state machine: initial deal → bidding → trump selection → final deal → trick play → result → settlement. Add typed actions for bidding, passing, selecting/revealing trump and playing cards.

Persist recoverable state, current actor, turn deadline and action sequence. Serialize actions per room and reject stale/duplicate/out-of-turn requests. Use secure shuffling. Send each participant a separately sanitized state; never broadcast a full hand or unrevealed trump through generic room updates.

Define reconnect and timeout behavior explicitly. A disconnected player gets a grace period; any subsequent automatic pass/legal play must follow published deterministic rules. Timeout handling is required for multiplayer reliability even though practice bots are deferred.

Represent winning team and both winning players explicitly. Settle once using the existing ledger and transaction patterns. Split the distributable pool according to a published rule, including deterministic allocation of any odd paise. Repeated finish events must never pay twice. Update cancellation/refund and admin room views for team results.

### Clients

Build dedicated Flutter and React 29 tables: four seats with partnership labels, local hand, auction panel, hidden/revealed trump indicator, trick centre, contract and team points, turn deadline, legal action controls and a result explanation.

Show only legal card choices, but enforce every rule again on the server. Preserve room state on refresh/reconnect. Keep other players' hands hidden in UI and network payloads.

### Required validation before enabling

- Deck uniqueness, rank/point evaluation, bidding and each trump/follow-suit edge case.
- Full deal from four joins through eight tricks and a correct team result.
- Hidden-card/trump isolation for every viewer and socket event.
- Concurrent/repeated actions, reconnects, timeout races and server restart recovery.
- Duplicate settlement, wallet conservation, team split rounding and cancellation refunds.
- Integration with lobby filters, invitations, profiles, both clients and admin reporting.

## Future cricket market: separate discovery and prototype

### Product contract

Start with a T20 match-winner contract, not a separate bet on every delivery. Example: an outcome share pays 100 credits if Team A wins and zero if it loses. State tie, Super Over, DLS, abandonment, correction and void rules before accepting orders. With voids possible, two team contracts are not automatically exhaustive binary outcomes without explicit rules.

Buying ten shares at 40 credits costs 400. Selling all ten at an executable 55 yields 550, or 150 profit before fees. A chart price does not guarantee an executable sell price or sufficient buyers.

Choose the execution model explicitly:

- Order book: users submit buy/sell limits; prices result from matched orders. Needs funded outcome issuance, locked funds/shares, price-time priority, partial fills, cancellations and sufficient participation. A separate probability model may be displayed, but must not silently reprice users' orders.
- Automated pricing: a model or automated market maker supplies quotes. Requires funded liquidity, inventory/exposure control and a precise pricing formula; changing a percentage after each over is insufficient to fund payouts or guarantee exits.

For the stock-market experience, an order book is the closer match. Prototype with non-cash credits first. This does not require card-playing bots.

### Feed limits and update cadence

An over-based interface is a reasonable simpler prototype, but does not solve delayed information. A wicket can be visible elsewhere while an old quote remains executable. Receiving an over-end update late does not prove the next over has not already started.

Do not continuously offer a fixed stale price between updates. Investigate scheduled batch auctions, quote expiry, event-driven suspension and reliable reopening signals; none removes latency risk by itself. Without a reliable timely feed, keep the prototype replay-based/non-cash rather than claiming live execution fairness.

Measure actual event delay, correction behavior, timestamp quality, coverage and outages during provider trials. Verify permitted commercial/betting use separately from technical access. Evaluate launch-jurisdiction requirements before any real-money release.

Fetch centrally on the server and fan out to clients via Socket.IO. One four-hour match requires 480 requests at 30-second polling, or 240 at one-minute polling, assuming one request per poll. Additional endpoints/matches consume more. Forty completed overs does not imply forty API calls when polling to discover boundaries.

### Provider observations, checked 24 October 2026

- CricketData advertises 100 free requests/day and paid plans from $5.99/month for 2,000/day. Its pricing page says data is a few minutes behind real time and that paid tiers primarily change request volume. Suitable to investigate for demos, not evidence of a timely trading feed: https://cricketdata.org/pricing/
- Sportmonks advertises cricket plans from €29/month, ball-by-ball coverage and a 14-day trial. Measure latency and confirm required competition coverage/use rights; advertised coverage is not a trading latency guarantee: https://www.sportmonks.com/cricket-api/plans-pricing/
- Cricsheet provides downloadable historical ball-by-ball records. Useful for replay testing and model development, not live updates: https://cricsheet.org/downloads/

### Suggested prototype sequence

1. Replay historical deliveries into a normalized event feed using virtual credits.
2. Build market chart, limit orders, holdings, trade history and settlement with deterministic ledger tests.
3. Keep estimated win probability distinct from traded price. If modelling probability, evaluate calibration on held-out matches; never interpret “six runs” as a fixed probability increment.
4. Trial a live provider and record latency/corrections before selecting ball-level or over-level execution.
5. Review liquidity, collateral, settlement rules, data rights and deployment feasibility before adding real-money exposure.

Do not bolt positions onto the current sports prediction pool. Introduce dedicated market, outcome, order, trade, position, collateral and market-event records while reusing authenticated sessions and established ledger conventions.

## Development deployment and verification

### Flutter home and personal profile, 27 October 2026

- Flutter home has a single profile action and two bottom destinations: Join Tables and Games. Tables are grouped by swipeable game categories, with stake and seat filters retained.
- Games uses an animated, mainly black-and-white layout with a vertical stack of pill-shaped selectors on the right and create/join actions on the left. CricTrade opens its existing market screen. The layout scrolls when larger accessibility text needs extra space.
- The personal profile contains account details, available and reserved balances, deposit/withdraw entry points, transaction history, profile editing, notifications, and game results.
- Both clients can load the complete wallet ledger in pages. The authenticated API uses stable date/ID ordering and rejects cursors belonging to another user. Existing transaction clients retain the default 50-row response.
- Website changes are limited to personal profile and transaction-history access; its existing home and navigation layout is retained.
- Verification: all 45 Flutter tests passed, including phone navigation, larger accessibility text, selected-game creation defaults, and paginated history. The isolated server product regression suite passed, including a 65-transaction same-timestamp pagination case and cross-account cursor rejection. Server and both web production builds passed; Flutter analysis reported informational lints only.
- This UI work is local source implementation; hosting deployment and device verification of installed-app links remain separate steps described below.

- Share `https://mgame-1.web.app/join/<room-code>`. The installed app or browser opens the join preview with the code supplied. Login preserves the pending invitation; a paid join still requires confirmation. See [app-link setup](APP_LINKS.md).
- Android App Links now have manifest and website association configuration for the available local certificates. Deploy the website and install the updated app to activate them. iOS Universal Links still require an Apple Team ID and association; the browser offers Open installed app using the registered custom URL scheme.
- Apply `20261026000000_room_recovery_invitation_lifecycle` using the schema for the selected database before running this server build. Both SQLite and PostgreSQL migration files are provided. Regenerate the Prisma client for that schema.
- Run `npm run build`, `npm --prefix apps/server test`, `npm run test:web-sessions`, `npm run test:migrations`, and Flutter tests. The product regression suite uses temporary databases and real local HTTP/socket connections; it never modifies a development or production wallet.
- Native iOS share presentation requires validation on an Apple simulator/device; verified domain association and release signing are deployment tasks, not prerequisites for the selected development browser/code flow.

### Verification completed 26 October 2026

- All 19 server suites passed across the regression runs. Sports settlement uses deterministic provider fixtures so an upstream feed outage cannot invalidate ledger tests.
- Product regressions cover private HTTP/socket authorization, hand/trump isolation, invitation lifecycle, serialized actions, failed-save rollback, first-deal retries, restart/offline recovery, settlement outages, exact team payouts, duplicate protection, and refunds.
- The 36 user-app tests and 8 admin-app tests passed. The 16 web-session/migration checks passed. Server and both web production builds passed; Android debug APK compilation passed.
- Flutter analysis reports informational lint findings only. iOS native sharing remains uncompiled on this Linux workstation. Tests do not certify a deployed service or eliminate every possible defect.
- No live database migration or hosting deployment was performed by this verification.
- Rechecked 27 October: production builds, the isolated HTTP/socket product regression suite, and the Flutter 29-screen/website-share tests passed again.
- Added installed-app invitations on 27 October: shared `/join/<code>` URLs, Android domain association for the available signing certificates, browser/app fallback, and code-prefilled join screens across cold start, warm start, and login. All 39 user-app tests, the Android debug APK build, and the web build passed. OS domain verification still requires deployment and device testing; see [activation steps](APP_LINKS.md).

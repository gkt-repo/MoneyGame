MoneyGame security and correctness review — 20 October 2026

Historical snapshot: see [SECURITY_RECHECK.md](/home/gulshan/Projects/MoneyGame/SECURITY_RECHECK.md) for the follow-up status after the working-tree fixes.

This review identifies **34 actionable findings** across the backend, web clients, Flutter clients, Android payment listener, shared contracts, and deployment configuration. Severity reflects impact in this application. “Reproduced” means exercised against synthetic accounts and an isolated temporary SQLite database; “source-confirmed” means established from the implementation without exercising a production system or physical Android device.

**Release blockers:** negative betting can create withdrawable money; notifications from untrusted sources can be treated as bank payments; unsigned JWTs reveal opponents’ cards; listener configuration sends the payment credential over HTTP.

No application fixes were made. The added diagnostic script and this report are review artifacts. A review cannot establish that every possible bug has been found.

**Verification**

| Check | Result |
| --- | --- |
| `npm run build` | Passed: shared types, server, admin web, user web |
| `npm --prefix apps/server test` | All five existing suites passed |
| Web session tests | Passed |
| Migration tests | All three passed when rerun outside sandbox restrictions |
| User Flutter analysis / tests | No analysis issues; 19 tests passed |
| Admin Flutter analysis / tests | No analysis issues; 8 tests passed |
| Additional diagnostic scenarios | 15 scenarios exercised; observations below |
| `npm audit --json` | 7 affected dependency entries, stemming from 2 advisories; development toolchain |

The original tests passing does not contradict the findings: the new scenarios exercise missing adversarial inputs, lifecycle transitions, and concurrent operations. Early socket and Flutter runs encountered sandbox restrictions; successful reruns are reflected above.

Run the isolated diagnostic reproductions with:

```sh
node scripts/security-review-repro.cjs
```

The script overrides its database URL, creates a fresh database under the OS temporary directory, applies local SQLite migrations, uses synthetic accounts, and removes the database afterward. It does not contact the deployed application. It prints observations rather than asserting that vulnerable behavior is desirable. It requires installed dependencies and a Prisma client generated for the repository’s SQLite schema.

**1. Critical — negative betting creates money and releases unrelated locked funds. Reproduced.**

Locations: [teen-patti.engine.ts:282](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:282), [wallet.service.ts:153](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/wallet/wallet.service.ts:153), [wallet.service.ts:200](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/wallet/wallet.service.ts:200).

`BLIND` and `CHAAL` trust `payload.amount`. `lockGameBet` never calls `money()` or checks that a stake is positive and satisfies the current betting requirement. A negative amount reverses the wallet movement. Settlement then raises the pot to the minimum entry pool while releasing the reduced player bet totals. With two ₹100 wallets, ₹10 boots, a `BLIND` amount of `-10`, and the other player folding, combined funds became **₹210 from ₹200** at 0% commission. The same input can also release funds locked for another room or withdrawal because locks are aggregated per user. Sub-paise and below-minimum positive bets are accepted by the same path.

Fix: derive legal stakes on the server, validate integer paise, persist room-specific liabilities, and verify that the payout plus commission equals the exact sum of released stakes. Reject a mismatched pool rather than increasing it.

**2. Critical — untrusted notifications become authenticated bank receipts. Source-confirmed; Android exploitation not exercised.**

Location: [UpiNotificationListenerService.kt:128](/home/gulshan/Projects/MoneyGame/apps/admin-app/android/app/src/main/kotlin/com/moneygame/admin/UpiNotificationListenerService.kt:128).

`isPotentialUpiCredit` returns `isKnownApp || hasCreditKeywords`. A notification from an arbitrary messaging app containing “received”, a rupee amount, and a 12-digit number passes. “Known” package matching is also based on substrings, and SMS notifications are accepted without authenticating the sender. The listener then signs the request with the real webhook secret. A crafted message delivered to the listener phone can therefore become an apparently verified deposit without a bank transfer.

Fix: use authenticated bank/payment-provider receipts as the source of credit authority. A package allowlist alone does not authenticate SMS or message contents; uncertain notifications must go to manual reconciliation.

**3. High — unsigned JWTs expose opponents’ cards. Reproduced.**

Location: [api.routes.ts:303](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:303).

The public room-details route uses `jwt.decode`, then passes the supplied `userId` to the private-state serializer. An unsigned token naming another participant returned all three of that player’s cards once that player had selected `SEE_CARDS`. Room and player IDs are available from the public room list. No valid login token is needed.

Fix: verify signature, algorithm, audience, expiry, and account status before granting personalized state. Anonymous requests must use spectator serialization.

**4. High — listener configuration downgrades HTTPS to HTTP and exposes the payment secret. Source-confirmed.**

Locations: [api.routes.ts:438](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:438), [listener_service.dart:175](/home/gulshan/Projects/MoneyGame/apps/admin-app/lib/core/services/listener_service.dart:175), [UpiNotificationListenerService.kt:217](/home/gulshan/Projects/MoneyGame/apps/admin-app/android/app/src/main/kotlin/com/moneygame/admin/UpiNotificationListenerService.kt:217).

Even when the admin app uses HTTPS, `/admin/listener-config` returns a fixed HTTP URL, and the app saves that URL in native listener preferences. Heartbeats and payment notifications then send `x-webhook-secret` in cleartext. The Android manifest explicitly permits cleartext traffic. An observer able to intercept that traffic can reuse the credential to fabricate payments. A deployment on another server also directs its listener to the wrong server.

Fix: use the configured authenticated HTTPS origin, reject insecure production listener URLs, and rotate any credential sent over HTTP. The APK also contains a hardcoded fallback credential; it did **not** match either inspected local environment’s webhook secret, so this review does not claim that fallback is currently a valid production credential.

**5. High — concurrent actions pass the same turn check. Reproduced.**

Location: [teen-patti.engine.ts:244](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:244).

Turn validation occurs before awaiting wallet operations. Two simultaneous `BLIND` requests from the current player both succeeded, both charged money, and advanced the turn twice, returning it to the original player without the opponent acting. Serializable wallet transactions do not serialize the in-memory game state. A timeout or `PACK` racing an outstanding bet can also settle a hand while that bet is still in flight.

Fix: serialize all actions and timeout transitions per room, reserve/validate the turn inside that serialized operation, and make actions idempotent.

**6. High — restart recovery permanently strands later Teen Patti bets. Reproduced.**

Locations: [wallet.service.ts:153](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/wallet/wallet.service.ts:153), [game.manager.ts:185](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:185).

Bet amounts exist only in the engine’s memory; `lockGameBet` does not persist the room association. Recovery refunds only `room.entryFee` and marks the room cancelled. A ₹100 wallet with a ₹10 entry and a subsequent ₹20 bet ended recovery with **₹80 available and ₹20 still locked**, in a cancelled room, with no transaction records explaining the remaining lock.

Fix: persist every room’s accumulated stakes atomically with the wallet movement, then settle or refund those exact obligations after restart. A compact user-facing passbook can still be generated from a complete internal ledger.

**7. High — settlement errors are swallowed and the recovery state is discarded. Reproduced with an injected database error.**

Location: [teen-patti.engine.ts:576](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:576).

`settleWinner` catches settlement failures, logs them, and unconditionally schedules deletion of the game after two minutes. The caller still reports success. The reproduction returned `success: true` while the engine remained `SETTLING` and the database room remained `PLAYING`. Timers are stopped and no retry is scheduled; later memory cleanup removes the bet totals needed to recover.

Fix: persist a recoverable settlement operation, retry idempotently, retain state on failure, and return an accurate pending/error result.

**8. High — unsupported and disabled games accept entry money and can never finish. Reproduced.**

Locations: [game.registry.ts:15](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.registry.ts:15), [game.manager.ts:29](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:29).

Unknown game types silently use the Guess Number engine, but the unknown string is stored on the room. On filling, that room becomes `PLAYING`; the Guess Number roll requires `COUNTDOWN`, so it cannot settle. `TWENTY_NINE` is advertised as disabled but is also accepted by creation and join endpoints; its game hooks are empty. Both cases lock funds, and full rooms cannot be cancelled by users.

Fix: reject unknown or disabled game types before any wallet movement and remove the fallback for explicit client input.

**9. High — banning a player does not stop their existing socket from betting. Reproduced through the socket handlers.**

Location: [socket.ts:46](/home/gulshan/Projects/MoneyGame/apps/server/src/socket.ts:46).

Account status is checked only at connection. `game_action` subsequently dispatches directly to the engine without checking the account or session. A socket authenticated before a ban successfully placed another bet after the database status became `BANNED`. Privileged socket subscriptions likewise retain their original authorization until disconnection.

Fix: invalidate active sockets when account permissions change and check current authorization before financial game actions.

**10. High — banned admins retain payment-webhook authority. Reproduced.**

Location: [api.routes.ts:337](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:337).

The webhook’s JWT fallback checks only a signed role claim. It does not verify the current user, status, role, or intended audience. A valid unexpired token belonging to a banned admin successfully approved a synthetic ₹987 deposit. This bypasses the checks on normal admin endpoints.

Fix: use the same current-account authorization as admin routes, with explicit audience and algorithm validation, or remove the general admin-token fallback in favor of revocable listener credentials.

**11. Medium — a password-reset OTP can be consumed twice concurrently. Reproduced.**

Location: [auth.service.ts:400](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/auth/auth.service.ts:400).

OTP lookup, consumption, password update, and session revocation are independent operations. Two requests using the same OTP and different passwords both succeeded. The last write determines the password. Failure between consuming the OTP and updating the password can also consume a valid recovery code without completing recovery.

Fix: atomically claim an unconsumed, unexpired OTP and update the password/session state in one transaction.

**12. Medium — older reset codes remain usable after a successful reset. Reproduced.**

Location: [auth.service.ts:425](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/auth/auth.service.ts:425).

Only the matching OTP is consumed. After issuing two codes and resetting with the newer one, the older code successfully reset the password again. Anyone holding an earlier still-valid code can undo the recovery until it expires.

Fix: invalidate all outstanding reset challenges for that user on successful recovery, and preferably supersede prior challenges when issuing a new one.

**13. High — an ordinary admin can ban the superadmin or lock out all administrators. Reproduced.**

Location: [admin.service.ts:426](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:426).

The status-change endpoint accepts any authenticated admin and does not enforce target-role hierarchy, self-ban protection, or preservation of an active superadmin. An `ADMIN` successfully changed a `SUPER_ADMIN` to `BANNED`. The deletion path explicitly protects superadmins, making status changes an inconsistent bypass of that protection.

Fix: enforce actor/target role rules and prevent removing the final active superadmin’s access, inside a transaction.

**14. High — deleting users destroys financial history and active liabilities. Reproduced.**

Locations: [admin.service.ts:492](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:492), [schema.prisma:73](/home/gulshan/Projects/MoneyGame/apps/server/prisma/schema.prisma:73).

`deleteUser` performs a hard delete without checking funds, withdrawals, deposits, or active games. Cascades remove the wallet, deposits, transactions, and room participation. A synthetic funded user was deleted together with all deposit and transaction history. Users with some audit/winner references instead fail deletion because of other foreign keys, so the behavior is also inconsistent. Deleting an active card player leaves an engine participant whose wallet no longer exists.

Fix: suspend or soft-delete financial accounts, preserve ledger records, and explicitly settle outstanding obligations before any permitted archival action.

**15. High — side-show results reveal a surviving player’s hand information to the whole table. Source-confirmed.**

Location: [teen-patti.engine.ts:408](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:408).

The room-wide `side_show_result.message` includes both evaluated hand descriptions, such as the exact sequence or pair rank. Other opponents and any subscribed spectators receive this while the winner of the side show remains in the hand. This bypasses the private-card serializer.

Fix: broadcast only the elimination/result publicly; send any comparison details solely to the permitted participants.

**16. Medium — folding skips the next player and jumps to the first active seat. Reproduced.**

Location: [teen-patti.engine.ts:492](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:492).

Turn advancement filters out packed players before locating the current player. After that player packs, `indexOf` returns `-1`, so the next index becomes zero. With seats A, B, C, A bet and B packed; the turn returned to A instead of C. The same occurs when the current requester loses a side show.

Fix: find the next eligible seat by walking the original turn order from the previous current seat.

**17. Medium — clients can choose negative or out-of-range seat indexes. Reproduced.**

Location: [wallet.service.ts:111](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/wallet/wallet.service.ts:111).

The server allocates a valid seat only when none is supplied. A supplied index is persisted without checking `0 <= seatIndex < maxPlayers`. Joining with `seatIndex: -5` succeeded. Because dealing and turn order sort by seat index, a client can force itself before the host.

Fix: validate integer range and availability against the locked room inside the join transaction.

**18. Medium — private game events from different tables overwrite each other. Source-confirmed.**

Locations: [teen-patti.engine.ts:593](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:593), [TeenPattiTableView.tsx:153](/home/gulshan/Projects/MoneyGame/apps/user-web/src/views/games/teen-patti/TeenPattiTableView.tsx:153).

The server allows a user to participate in multiple rooms, then emits private `teen_patti_state` and `cards_revealed` events to the global user channel without a room ID. Every open table receives them, and both clients apply them unconditionally. Playing two tables can replace one table’s cards, turn, and pot with the other table’s state.

Fix: include `roomId` in all game event envelopes and filter on clients, or use authorized per-user/per-room channels.

**19. Medium — web clients do not restore room subscriptions after reconnection. Source-confirmed.**

Locations: [ActiveRoomView.tsx:54](/home/gulshan/Projects/MoneyGame/apps/user-web/src/views/ActiveRoomView.tsx:54), [TeenPattiTableView.tsx:151](/home/gulshan/Projects/MoneyGame/apps/user-web/src/views/games/teen-patti/TeenPattiTableView.tsx:151), [socket.ts:28](/home/gulshan/Projects/MoneyGame/apps/user-web/src/services/socket.ts:28).

Room joining happens once when the component mounts. Token expiry causes a server disconnect and a fresh connection; a network reconnect does the same. The server restores only the user/admin channels. Room countdowns, turns, side-show messages, and finish events are then missed. Polling and user-channel events mask some of the failure but do not restore those subscriptions.

Fix: rejoin the active room on every `connect` and fetch a current snapshot.

**20. Medium — leaving a Flutter table removes unrelated wallet listeners. Source-confirmed.**

Locations: [teen_patti_table_screen.dart:90](/home/gulshan/Projects/MoneyGame/apps/user-app/lib/screens/game/teen_patti/teen_patti_table_screen.dart:90), [socket_service.dart:87](/home/gulshan/Projects/MoneyGame/apps/user-app/lib/core/network/socket_service.dart:87).

The app shares one socket. Table disposal calls `off(event)` without a handler for `balance_updated` and `wallet_updated`, removing the listeners installed by `HomeScreen` as well. After returning home, later bet, withdrawal, or adjustment updates no longer refresh the wallet through those listeners. The nested active-room screen and table also remove each other’s room listeners.

Fix: retain each callback reference and unsubscribe only the callbacks owned by the disposing widget.

**21. Medium — recovery started with a phone number cannot finish. Source-confirmed in both clients.**

Locations: [AuthModal.tsx:81](/home/gulshan/Projects/MoneyGame/apps/user-web/src/components/AuthModal.tsx:81), [auth_screen.dart:228](/home/gulshan/Projects/MoneyGame/apps/user-app/lib/screens/auth/auth_screen.dart:228), [auth.service.ts:392](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/auth/auth.service.ts:392).

The recovery form accepts a phone number or email and successfully requests an OTP with either. It then sends that same input as `email` to `resetPassword`, whose lookup accepts only an email address. A correct code for a phone-started flow is rejected.

Fix: return an opaque recovery challenge ID and bind reset verification to it, or explicitly collect the recovery email before submitting the reset.

**22. Medium — the default container admin portal has broken asset paths. Build-confirmed.**

Locations: [vite.config.ts:9](/home/gulshan/Projects/MoneyGame/apps/admin-web/vite.config.ts:9), [Dockerfile:43](/home/gulshan/Projects/MoneyGame/Dockerfile:43), [server.ts:55](/home/gulshan/Projects/MoneyGame/apps/server/src/server.ts:55).

The admin build defaults to base `/`, while Express serves it at `/admin`. Docker does not set `VITE_BASE_PATH=/admin/`. The built admin HTML requests `/assets/index-….js`; those requests go to the user app’s assets and fallback, rather than `/admin/assets`. The default deployment can therefore render a blank admin page with module/MIME errors.

Fix: explicitly build the container admin bundle for `/admin/`, retaining a separate root-base build for standalone Firebase hosting.

**23. Medium — production web builds silently point at a fixed external backend. Source-confirmed.**

Locations: [user vite.config.ts:6](/home/gulshan/Projects/MoneyGame/apps/user-web/vite.config.ts:6), [admin vite.config.ts:6](/home/gulshan/Projects/MoneyGame/apps/admin-web/vite.config.ts:6).

Both production builds fall back to the same hardcoded hosted backend instead of the deployment’s origin. Docker supplies no configurable build argument for this value. Deploying the stack to another machine can display local HTML while login credentials, payments, and gameplay requests still target that fixed server.

Fix: use same-origin APIs for the container deployment and require explicit configuration for separately hosted clients.

**24. Medium — Teen Patti accounting uses entry-only pots and excludes live games. Source-confirmed.**

Locations: [admin.service.ts:24](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:24), [admin.service.ts:37](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:37), [admin.service.ts:695](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:695).

Dashboard profit and solvency reconstruct every pot as `entryFee * maxPlayers`, ignoring later card-game bets. A ₹100 pot formed from two ₹10 entries plus ₹80 in bets, paying ₹90, should record ₹10 commission; the audit calculates `max(0, 20 - 90) = 0`. The dashboard also omits `PLAYING` from active rooms and uses a seeded database commission setting while settlement uses the current environment setting.

Fix: persist actual pot and commission values per settlement, aggregate those records, and use the shared active-status definition.

**25. Medium — reconciliation omits money credited through unmatched payments and adjustments. Source-confirmed.**

Locations: [payment.service.ts:210](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/payment/payment.service.ts:210), [admin.service.ts:679](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:679).

Assigning an unmatched bank payment creates a `DEPOSIT` transaction and credits a wallet but creates no approved `Deposit` row. Dashboard totals and solvency count only approved deposit rows, so this legitimate funding appears as unexplained liability. Manual balance adjustments also change liabilities without a corresponding adjustment in the audit’s expected funds.

Fix: reconcile all funding and adjustment entries from an explicit accounting ledger, distinguishing actual cash receipts from administrative credits.

**26. Medium — user profit/loss treats reserved money as a loss. Source-confirmed.**

Location: [admin.service.ts:329](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:329).

Net profit/loss includes available balance but excludes locked balance. Requesting a withdrawal, joining a waiting room, or placing a pending bet immediately appears as a loss even though the obligation is not settled. This distorts the admin’s user-risk and profit view.

Fix: calculate realized game profit from settled ledger entries, or include outstanding reserved funds explicitly when reporting net assets.

**27. Medium — logout does not revoke refresh sessions, and reset does not invalidate access tokens. Source-confirmed.**

Locations: [user api.ts:395](/home/gulshan/Projects/MoneyGame/apps/user-web/src/services/api.ts:395), [admin api.ts:466](/home/gulshan/Projects/MoneyGame/apps/admin-web/src/services/api.ts:466), [secure_storage_service.dart:36](/home/gulshan/Projects/MoneyGame/apps/user-app/lib/core/storage/secure_storage_service.dart:36), [auth.service.ts:437](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/auth/auth.service.ts:437).

Clients clear local tokens without calling the backend logout endpoint, so a copied refresh token remains usable after the user logs out, up to its 30-day expiry. Password reset revokes refresh rows but leaves already-issued access tokens accepted until expiry because authentication checks no session version/revocation state.

Fix: call server logout before clearing the refresh token, and use a revocable session/token version when reset or administrative termination must end access immediately.

**28. Medium — the listener permanently drops notifications on transient delivery failures. Source-confirmed.**

Location: [UpiNotificationListenerService.kt:217](/home/gulshan/Projects/MoneyGame/apps/admin-app/android/app/src/main/kotlin/com/moneygame/admin/UpiNotificationListenerService.kt:217).

Webhook dispatch makes a single request, logs the status/error, and discards the event. Deduplication is recorded before delivery, so repeated notifications within 45 seconds are suppressed even if the initial request failed. Network interruption, rate limiting, or a database-related 503 can leave a real payment uncredited indefinitely without manual intervention.

Fix: persist an outbox on the device, retry transient failures with backoff, and mark an event delivered only after server acknowledgement. Preserve UTR-based server idempotency.

**29. Medium — shared contracts do not describe the actual API and socket messages. Source-confirmed.**

Locations: [game.types.ts:40](/home/gulshan/Projects/MoneyGame/packages/shared-types/src/game.types.ts:40), [socket.events.ts:11](/home/gulshan/Projects/MoneyGame/packages/shared-types/src/socket.events.ts:11), [game.manager.ts:46](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:46).

`RoomDTO.customConfig` promises an object, but the manager stores JSON text and returns the raw Prisma room without decoding it. Socket contracts declare `game_completed` and `room_player_joined`, while runtime code uses `game_finished` and `room_updated`; `game_started` and admin event payload shapes also differ. A client following the shared package can compile while listening to events that never arrive or receiving the wrong data shape.

Fix: serialize API DTOs explicitly and apply the shared event maps to typed server/client sockets, then align the runtime event names and payloads.

**30. Medium — a restrictive CORS configuration is not actually enforced. Source-confirmed.**

Location: [server.ts:25](/home/gulshan/Projects/MoneyGame/apps/server/src/server.ts:25).

After testing the configured allowed origins, the code permits every Firebase Hosting and GitHub Pages subdomain plus localhost. A deployment explicitly restricted to its own domain still authorizes an attacker-controlled site on those hosting platforms. This is an origin-policy bypass, not proof of automatic token theft: this application generally uses explicit bearer tokens rather than ambient authentication cookies.

Fix: honor the configured allowlist and permit development exceptions only in development mode.

**31. Medium — reverse-proxied deployments share one authentication rate-limit bucket. Source-confirmed; deployment-dependent.**

Locations: [server.ts:16](/home/gulshan/Projects/MoneyGame/apps/server/src/server.ts:16), [api.routes.ts:22](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:22).

Express never configures trusted proxies, while the limiter uses the socket-derived request IP. Behind an HTTPS reverse proxy or tunnel, unrelated users can share the proxy IP. The same 30-request/15-minute limiter covers user/admin login, recovery, refresh, and `/me`, so ordinary traffic can prevent everyone behind the proxy from signing in or refreshing.

Fix: configure precisely trusted proxy hops/addresses and separate authentication, recovery, refresh, and authenticated-profile limits. Do not indiscriminately trust client-supplied forwarded headers.

**32. Medium — shutdown does not stop game timers. Source-confirmed.**

Location: [game.manager.ts:160](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:160).

`stopTimers()` iterates through engines without performing cleanup, then checks for a Guess Number `stopTimers` method that does not exist. Teen Patti turn timers and Guess Number countdowns continue while the server is closing. They can initiate wallet operations during shutdown; a forced exit can interrupt the hand and trigger the incomplete recovery described above.

Fix: give every engine an explicit shutdown method that stops scheduling work, await in-flight actions/settlements, and persist resumable state before disconnecting the database.

**33. Medium — older pending financial requests disappear from admin queues. Source-confirmed.**

Locations: [admin.service.ts:597](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:597), [admin.service.ts:610](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:610).

Deposit and withdrawal endpoints return only the newest 50 records across all statuses. Clients filter that truncated list locally. Once 50 newer records exist, an older still-pending withdrawal or claimed deposit cannot be found in its queue even though dashboard counts still include it.

Fix: filter status on the server before pagination, expose pagination/cursors, and ensure outstanding requests remain accessible.

**34. Medium application exposure — known vulnerable development dependencies. Registry-confirmed.**

Locations: [package-lock.json:1956](/home/gulshan/Projects/MoneyGame/package-lock.json:1956), [package-lock.json:3723](/home/gulshan/Projects/MoneyGame/package-lock.json:3723).

The dependency audit reports five high and two moderate affected package entries, all in the Tailwind 3 development dependency chain. These derive from two underlying advisories: stack exhaustion in `braces <=3.0.3` and quadratic selector parsing in `postcss-selector-parser <7.1.6`. The affected transitive packages are not seven independent exploitable application vulnerabilities. No production request path into these parsers was found. Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [selector parser advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

Fix: update the affected build dependency chain with a reviewed compatibility migration. The audit proposes a major Tailwind upgrade, so an automatic force upgrade would require checking both web apps’ styling.

**Observed diagnostic results**

| Scenario | Observed result |
| --- | --- |
| Negative stake and fold settlement | Combined ₹200 became ₹210 |
| Unsigned room identity | 3 opponent cards returned |
| Two simultaneous bets | Both accepted; opponent turn skipped |
| Middle-seat fold | Turn returned to first seat |
| Supplied negative seat | `-5` persisted |
| Disabled game creation | Accepted and ₹10 locked |
| Unknown game creation | Accepted and ₹10 locked |
| Restart with a later ₹20 bet | Room cancelled; ₹20 remained locked |
| Concurrent use of one reset code | Both password changes succeeded |
| Injected settlement failure | Action success, memory `SETTLING`, database `PLAYING` |
| Use of an older reset code | Accepted after a newer code completed reset |
| Socket action after ban | Bet accepted |
| Webhook from banned admin token | Deposit credited |
| Admin banning superadmin | Accepted |
| Funded account deletion | Wallet, deposits, and transactions removed |

**Limits and follow-up**

Live production endpoints were not probed or changed. PostgreSQL-specific deployment/concurrency behavior, physical-device notification handling, and real bank integrations were not executed. Browser and mobile end-to-end interaction was reviewed from source rather than manually driven. Exact game-rule choices such as showdown tie policy should be specified before adding rule-specific assertions.

Prioritize findings 1–10 and 13–15 before using the system for real-money play. Add regression tests that assert rejection of invalid bets and forged identities, money conservation, durable recovery, correct turn serialization, and authorization revocation; the current suites do not cover those guarantees.

MoneyGame follow-up security review — 20 October 2026

This review checks the current working-tree changes against the 34 findings in [the original report](/home/gulshan/Projects/MoneyGame/SECURITY_REVIEW.md). The original report is a historical snapshot, not the current status.

| Outcome | Count |
| --- | ---: |
| Original findings resolved for their reported behavior | **19** |
| Original findings partly fixed, with a remaining failure | **11** |
| Original findings still present without an effective fix | **4** |
| Additional regressions identified in the changes | **6** |
| **Total currently open findings** | **21** |

“Resolved” applies to the particular reported failure, not every possible behavior in that subsystem. Some formerly broken paths now work but have a separate new regression; those are counted separately and explained below. Physical Android behavior, live banking, and production infrastructure were not exercised.

**How to read this report**

There are **15 unfinished original issues plus 6 newly found issues**, giving 21 open findings. Original numbers such as **#14** match the first review; **N1–N6** identify the new findings. A partial fix means the change helped but a specific failure remains.

“Available balance” is money the user can spend. “Locked balance” is money reserved for a game or withdrawal. A “token” is the credential an app uses after login. A “socket” is the live connection carrying game and admin updates. The payment “listener” is the Android service that reads notifications and reports payment information to the server. Its “heartbeat” is an “I am online” message.

**Review files and what they contain**

- [SECURITY_RECHECK.md](/home/gulshan/Projects/MoneyGame/SECURITY_RECHECK.md), this file: the current status of all 34 original findings, detailed explanations of all 21 open findings, examples, suggested remedies, and verification limits.
- [scripts/security-recheck.cjs](/home/gulshan/Projects/MoneyGame/scripts/security-recheck.cjs): 27 diagnostic scenarios using temporary test accounts and a temporary database. These provide evidence for selected findings; they do not fix the application.
- [SECURITY_REVIEW.md](/home/gulshan/Projects/MoneyGame/SECURITY_REVIEW.md) and [scripts/security-review-repro.cjs](/home/gulshan/Projects/MoneyGame/scripts/security-review-repro.cjs): the original review and its diagnostics, retained for comparison. Their original descriptions are historical; use this report for current status.

This expanded explanation uses the completed recheck's evidence. It is a documentation update, not a new audit of subsequent code changes.

**What now works**

The negative-bet exploit is blocked; forged room tokens expose zero cards; simultaneous bets accept one action and reject the other; ordinary new bets are recovered after restart; unknown/disabled game types and invalid seats are rejected; reset OTPs cannot be reused concurrently or after another successful reset; phone-based recovery works; ordinary admins cannot ban superadmins; and the original middle-seat folding error is fixed.

**Status of every original finding**

| Original # | Finding | Current status | Evidence / remaining work |
| ---: | --- | --- | --- |
| 1 | Negative bets create money | **Resolved** | Negative and sub-minimum payload amounts rejected. Stakes are derived from the current betting requirement. Settlement checks the released-stake sum. |
| 2 | Fake notifications become payment evidence | **Partial** | Unrelated messaging apps are more restricted, but ordinary SMS text containing “UPI”/“bank” plus “received” still passes. Sender authenticity is not checked. Package trust still uses substrings. |
| 3 | Forged tokens expose cards | **Resolved** | Signature, algorithm, audience and current account status are checked. The unsigned-token reproduction returned zero cards. |
| 4 | Listener secret sent over HTTP | **Partial** | Fixed server address removed, but an HTTP request still returns an HTTP listener URL; HTTPS is not enforced. Native HTTP fallback and cleartext support remain. |
| 5 | Two actions accepted for one turn | **Resolved** | Per-room serialization produced `[true, false]` for simultaneous bets, with the opponent next. The new queue has a separate cleanup defect, N6. |
| 6 | Restart loses later bets | **Resolved for ordinary new bets** | A ₹10 entry plus ₹20 bet recovered to ₹100 available / ₹0 locked. Recovery data is now persisted. Its storage is client-editable, creating N1. Older pre-fix bets cannot be reconstructed from records that were never saved. |
| 7 | Settlement failure discarded/reported as success | **Partial** | Failure is returned and state retained, but the room remains `SETTLING` forever without retry. After the database recovers, further actions are rejected as already concluded. |
| 8 | Disabled/unknown games take money | **Resolved** | Both creation attempts now fail before wallet movement. Join also validates the registered/enabled engine. |
| 9 | Banned accounts retain socket authority | **Partial** | Player betting is rejected and that socket disconnected. Existing privileged subscriptions still use cached authorization; a banned admin can still join `admin_channel` through an existing connection. |
| 10 | Banned admin JWT approves webhook | **Resolved** | The payment webhook now checks audience and current admin role/status. Reproduction returned 401. Heartbeat authorization has a distinct new regression, N2. |
| 11 | Same OTP accepted concurrently | **Resolved** | A transactional claim permits one reset; the other request is rejected. |
| 12 | Older OTP works after reset | **Resolved** | All outstanding user OTPs are consumed after successful reset; older code rejected. |
| 13 | Admin can ban superadmin | **Resolved** | Actor/target hierarchy, self-deactivation and last-superadmin checks added inside the transaction. Original attempt rejected. |
| 14 | Account deletion removes financial obligations | **Partial** | Existing funds/history block deletion. Checks and deletion are still separate operations: a payment committed between them is erased. Reproduced with a controlled interleaving. |
| 15 | Side-show public message reveals hands | **Resolved** | Public message now contains only the result. Comparison details are sent to the two participating users. |
| 16 | Fold skips next seat | **Resolved** | Original seating order is used to find the next active player. A → B folds → C now works. |
| 17 | Invalid seats manipulate ordering | **Resolved** | Negative, out-of-range and occupied explicit seats are rejected. |
| 18 | Multiple tables mix private state | **Partial** | Regular broadcasts and card reveals include room IDs, but `startGame` still sends private `teen_patti_state` without one. Both clients accept missing IDs. Two initial private events in the diagnostic lacked IDs. |
| 19 | Web reconnect loses room events | **Partial** | Parent room screen and Teen Patti reconnect/rejoin. Dice Guess uses its own separate socket and still joins only once, so countdown/roll events remain lost after reconnect. |
| 20 | Mobile table removes home wallet handlers | **Resolved** | Screens retain callback references and remove only their own handlers. Flutter analysis and tests pass. |
| 21 | Phone-started recovery fails | **Resolved** | Backend reset resolves phone/email/username and accepts the existing clients’ `email` field as an identifier. Phone reset succeeded. |
| 22 | Container `/admin` assets broken | **Resolved** | Docker sets `/admin/`, and generated asset URLs now match Express’s mount. Changing the global default breaks standalone Firebase hosting: N4. |
| 23 | Builds silently use a fixed external backend | **Resolved** | Both builds default to same-origin, with explicit `VITE_API_URL` overrides. Standalone hosting must supply its API URL. |
| 24 | Wrong card-game accounting/activity totals | **Partial** | New settlements persist actual pot/commission and `PLAYING` is counted. Historical completed hands lacking stake metadata still use entry-only estimates; displayed commission still comes from a seeded database setting while gameplay uses current environment configuration. |
| 25 | Unmatched credits/adjustments omitted from audit | **Still present** | Solvency and deposit totals still use approved deposit rows, omitting assigned unmatched receipts and manual adjustments. |
| 26 | Reserved funds appear as a loss | **Resolved for the reported calculation** | Locked balance is now included. The separate unmatched-credit/manual-adjustment accounting gap remains under #25. |
| 27 | Logout/reset do not fully revoke access | **Still present** | Clients still clear local tokens without server logout. A token issued before password reset still passed authentication afterward. |
| 28 | Listener drops failed deliveries | **Still present** | Still a single delivery attempt, with no persistent retry queue. Deduplication is recorded before successful delivery. |
| 29 | Shared contracts differ from runtime | **Partial** | Room-detail `customConfig` is decoded, but lobby/list responses still return strings; shared socket names and payloads remain inconsistent. Diagnostic: detail=`object`, list=`string`. |
| 30 | Configured CORS allowlist bypassed | **Resolved in production** | Broad hosting/localhost exceptions are limited to non-production. A wildcard remains intentionally open if explicitly configured. |
| 31 | Proxy users share strict auth limit | **Resolved for a one-hop proxy** | Proxy handling added and refresh/profile requests separated from strict auth requests. Default trust of an arbitrary direct peer creates N3. Deployments with other proxy layouts still need explicit configuration. |
| 32 | Timers continue during shutdown | **Partial** | Existing scheduled timers are cleared, but ongoing actions/rolls are not drained or blocked. A paused bet completed after `stopTimers()` and created a new active turn timer. |
| 33 | Older pending requests disappear | **Partial** | API supports server filtering/pagination, but web/mobile admin clients still fetch the default first 50 and filter locally. An old pending withdrawal remained absent from that response. |
| 34 | Vulnerable development dependencies | **Still present** | Fresh npm audit still reports 7 affected entries: 5 high and 2 moderate, deriving from the same 2 Tailwind dependency-chain advisories. |

Resolved original IDs: **1, 3, 5, 6, 8, 10, 11, 12, 13, 15, 16, 17, 20, 21, 22, 23, 26, 30, 31**.

Open original IDs: **2, 4, 7, 9, 14, 18, 19, 24, 25, 27, 28, 29, 32, 33, 34**.

**N1 — High: client-controlled refund records release unrelated reservations and can prevent the server from starting. Reproduced.**

Locations: [game.manager.ts:52](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:52), [game.manager.ts:196](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:196), [wallet.service.ts:181](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/wallet/wallet.service.ts:181), [server.ts:114](/home/gulshan/Projects/MoneyGame/apps/server/src/server.ts:114).

The restart fix stores `playerStakes` in `Room.customConfig`, but room creation copies the client's entire `customConfig` into the same field. Refunds trust `customConfig.playerStakes` as money previously paid.

In the diagnostic, a user with ₹100 first requested an ₹80 withdrawal. They then created a ₹10 table with fabricated stakes of ₹80 and cancelled it. The wallet became **₹100 available / ₹0 locked**, while the ₹80 withdrawal remained **PENDING**. Rejecting the withdrawal then failed because its reservation was gone. This is not the old negative-bet exploit; it is a new trust-boundary failure in the refund fix.

A second fabricated stake exceeded the available locked balance. Both recovery attempts failed and left the room `WAITING`. Startup awaits recovery before listening and exits on that exception, so such a persisted room can prevent repeated restarts from succeeding.

Fix: keep authoritative monetary records outside user-supplied configuration; reject reserved internal keys; validate and atomically record each real stake; isolate room recovery failures so one corrupt room cannot take down startup. Existing poisoned data needs reconciliation.

**N2 — Medium: heartbeat authentication now accepts anonymous callers. Reproduced.**

Location: [api.routes.ts:383](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:383).

`isWebhookAuthorized` was changed to return a Promise. The payment endpoint correctly awaits it, but the heartbeat endpoint still uses `if (!isWebhookAuthorized(...))`. A Promise is truthy even if it later resolves to false.

A request with **no authentication header** received HTTP 200 and wrote a fabricated phone model into `listener_metadata`. An outsider can keep the listener appearing online when it is actually offline and overwrite its telemetry. This particular bug does not bypass the payment endpoint's corrected check.

Fix: await authorization at every call site and add an anonymous-heartbeat rejection test.

**N3 — High, deployment-dependent: direct clients can spoof the IP used for brute-force limits. Reproduced at Express's request-IP resolution.**

Locations: [config.ts:23](/home/gulshan/Projects/MoneyGame/apps/server/src/config.ts:23), [server.ts:19](/home/gulshan/Projects/MoneyGame/apps/server/src/server.ts:19), [docker-compose.yml:28](/home/gulshan/Projects/MoneyGame/docker-compose.yml:28).

Production now defaults to trusting one proxy hop. The supplied deployment exposes the application port directly, and the deployment instructions tell operators to open it. For a direct request, Express therefore trusts the caller's `X-Forwarded-For` value.

The diagnostic supplied peer `198.51.100.20` and header `203.0.113.44`; Express used **203.0.113.44** as the limiter IP. A direct client can change that header to obtain fresh authentication, recovery, deposit, and claim limit buckets.

Fix: trust known proxy addresses, and restrict backend ingress to those proxies; do not default to trusting arbitrary peers. Also parse boolean configuration explicitly: the string `TRUST_PROXY=false` is currently treated as a proxy address string rather than the boolean false. Neither `TRUST_PROXY` nor `PUBLIC_API_URL` is currently passed through the supplied Compose environment.

**N4 — Medium: the admin build fix breaks the configured standalone Firebase hosting layout. Build-confirmed.**

Locations: [admin vite.config.ts:9](/home/gulshan/Projects/MoneyGame/apps/admin-web/vite.config.ts:9), [firebase.json:32](/home/gulshan/Projects/MoneyGame/firebase.json:32).

The admin base path now defaults to `/admin/` for every build, not just the container. Firebase serves `apps/admin-web/dist` at the hosting site's root. The generated HTML requests `/admin/assets/index-….js`, but files are stored under `dist/assets`, not `dist/admin/assets`.

Verified from the build: the generated module URL exists under the Express `/admin` mount but **does not exist under Firebase's public-root mapping**. Firebase's catch-all rewrite returns HTML for that JavaScript request, preventing startup.

Fix: use explicit deployment profiles: `/admin/` for the container, `/` for standalone Firebase, with the appropriate API URL. Update the documented Firebase build command to set the base path.

**N5 — Medium: cancelled Teen Patti rooms now record false passbook profits. Reproduced.**

Locations: [game.manager.ts:207](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:207), [game.manager.ts:65](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts:65).

Teen Patti entry deliberately skips the initial passbook debit because its final settlement normally records a net result. The new refund code unconditionally adds a positive `REFUND` transaction.

Creating and cancelling a ₹10 table returned the wallet from ₹100 to ₹100, but the passbook contained a standalone **+₹10 REFUND**. Repeating this accumulates fictitious passbook gains without increasing the actual wallet.

Fix: separate a complete internal movement ledger from the net presentation ledger, or only record an offsetting passbook refund when a matching passbook debit exists. Durable room stakes must still be recorded independently.

**N6 — Low: completed action queues are never removed by their normal cleanup check. Reproduced.**

Location: [teen-patti.engine.ts:62](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:62).

The map stores `current.then(() => next, () => next)` but cleanup compares the stored object with `next`. These are different Promise objects, so the equality check never succeeds.

Room cleanup removes some entries, but an action submitted after a room was already cancelled/completed creates a queue entry with no future cleanup. The diagnostic showed **no in-memory game but a retained queue** after the action was rejected.

Fix: retain the exact Promise stored in the map and compare against that Promise before deleting. Keep serialization for concurrent actions.

**Detailed explanations of the 15 unfinished original issues**

**#2 — Fake payment messages can still be treated as payment evidence. Partial fix.**

The listener now rejects more unrelated notifications, but its SMS checks still look for words such as “bank,” “UPI,” and “received.” Those words do not prove that a bank sent the message or that money arrived.

For example, a fabricated payment-looking SMS could pass this first check and enter the payment-processing flow. That does not mean every such message automatically credits a wallet: later parsing and matching still apply. The problem is that unverified text remains an input trusted as payment evidence, exposing the platform to false credits.

Evidence: source review of the [notification filter](/home/gulshan/Projects/MoneyGame/apps/admin-app/android/app/src/main/kotlin/com/moneygame/admin/UpiNotificationListenerService.kt:166); physical Android exploitation was not tested.

Suggested remedy: verify payment against an authoritative bank/payment-provider record before crediting money. Sender/package checks can reduce noise but should not be the sole proof of payment.

**#4 — Payment credentials can still travel over an unencrypted connection. Partial fix.**

Removing the fixed server address helped deployment flexibility, but the generated listener address can still start with `http://`. HTTP does not encrypt the credential sent with the payment request. Someone able to observe or alter that network connection could obtain it and impersonate the listener.

For example, opening the configuration endpoint over HTTP still produced an HTTP listener URL in the diagnostic. The native fallback and Android cleartext support also remain.

Evidence: reproduced URL generation in [listener configuration](/home/gulshan/Projects/MoneyGame/apps/server/src/routes/api.routes.ts:430). No real credential interception was attempted.

Suggested remedy: require a validated HTTPS public address for production and remove insecure production fallbacks.

**#7 — A temporary payout failure can leave a game stuck. Partial fix.**

The server now reports settlement failure and retains the game state. However, the game remains in `SETTLING`, meaning it has started calculating/paying the result, and there is no automatic retry.

For example, if the database briefly fails during payout and then recovers, the player cannot finish the hand by retrying: the engine responds that the hand has already concluded. The payout remains unfinished until some separate recovery or intervention succeeds.

Evidence: an injected database failure followed by a retry reproduced this behavior in the [Teen Patti engine](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts:237).

Suggested remedy: persist unfinished settlements and retry them safely, ensuring the same hand can never charge or pay twice.

**#9 — Banning an admin does not fully remove an existing live connection's privileges. Partial fix.**

Player betting now checks the current account status. Some live admin subscriptions still rely on the permissions saved when the connection first opened.

For example, an admin connects, is later banned, and then requests access to the admin update channel through that same connection. The diagnostic showed the request still succeeded. This can preserve access to privileged updates despite the ban; it does not imply that every HTTP admin action also remains authorized.

Evidence: reproduced in the subscription handler in [socket.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/socket.ts:35).

Suggested remedy: disconnect affected connections when accounts are banned or permissions change, and recheck authorization for privileged subscriptions.

**#14 — Deleting an account can erase a payment that arrives during deletion. Partial fix.**

Deletion now rejects accounts that already have funds or financial history. The checks and the final deletion are separate operations, leaving a gap in which new money can arrive.

The diagnostic deliberately paused deletion after its checks, credited a legitimate ₹77 payment, and then resumed deletion. The wallet and payment record were removed. This demonstrates a scheduling race; it does not mean every account deletion loses money.

Evidence: controlled reproduction of the checks and deletion in [admin.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts:581).

Suggested remedy: coordinate deletion with every process that can credit the account. Prefer deactivation while retaining financial records; any physical deletion needs database guarantees that prevent a concurrent credit from being erased.

**#18 — The first private update from one table can appear in another table. Partial fix.**

Most game messages now identify their room. The initial private Teen Patti state still lacks that identifier, and clients accept messages without one.

For a user playing two tables, a new hand starting at one table can therefore update the wrong open table's display. Cards, turn information, or the pot shown on screen may belong to the other room. This finding concerns mixing that user's table state; it is not evidence that the fixed forged-token card leak has returned.

Evidence: both initial private events captured by the diagnostic lacked a room ID. Relevant code is in the [Teen Patti engine](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts) and [web table view](/home/gulshan/Projects/MoneyGame/apps/user-web/src/views/games/teen-patti/TeenPattiTableView.tsx).

Suggested remedy: include a room ID in every private game message and have clients reject messages missing or mismatching the active room.

**#19 — Dice Guess can stop receiving live game updates after reconnecting. Partial fix.**

The parent room screen and Teen Patti now restore their subscriptions after a connection drops. Dice Guess has a separate connection that still joins its room only when the component first mounts.

For example, a brief Wi-Fi interruption can reconnect the browser successfully while leaving that connection outside its game room. Countdown and roll messages are then missed, making the table look stalled or outdated.

Evidence: source review of [GuessNumberTableView.tsx](/home/gulshan/Projects/MoneyGame/apps/user-web/src/views/games/guess-number/GuessNumberTableView.tsx); browser disconnect/reconnect interaction was not manually exercised.

Suggested remedy: rejoin on every successful connection and fetch the current game state to recover anything missed during the interruption.

**#24 — Some accounting figures still use incomplete or inconsistent information. Partial fix.**

New hands now save their actual total stakes and commission, and live `PLAYING` rooms are counted. Older completed hands without those saved totals still fall back to estimates based only on entry fees. Separately, the displayed commission setting and the setting used for gameplay come from different sources.

As an illustration, two ₹10 entries plus ₹80 of later bets make a ₹100 pot. An entry-only estimate sees ₹20 and cannot reliably explain a ₹90 payout or the ₹10 commission. An admin can therefore see misleading historical profit or a commission rate that differs from the one actually applied.

Evidence: accounting fallbacks and configuration sources in [admin.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts); the diagnostic confirmed new settlement totals are saved correctly.

Suggested remedy: use one commission configuration source. Reconstruct historical figures only where reliable records exist, and mark unrecoverable totals as unknown rather than presenting estimates as exact.

**#25 — The financial audit does not count every legitimate way money enters a wallet. Still present.**

The audit totals approved deposit-request records. Assigning an unmatched bank receipt can credit a wallet through a different record path, and manual balance adjustments also change balances.

For example, assigning a real ₹500 receipt increases the user's wallet by ₹500, but the audit's deposit total can miss that receipt. The system can then appear to owe more money than it received. Administrative credits need separate treatment because they may not correspond to incoming cash.

Evidence: source review of [payment.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/payment/payment.service.ts) and [admin.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts).

Suggested remedy: reconcile all money movements through a complete ledger, distinguishing bank receipts, promotional/manual credits, withdrawals, and game results.

**#27 — Logout and password reset do not immediately end all existing access. Still present.**

Clients erase their local login credentials on logout without revoking the corresponding server refresh session. Password reset revokes refresh sessions, but already-issued access tokens remain accepted until they expire.

For example, someone holding a copied credential may retain access even after its owner logs out or resets their password. The diagnostic specifically confirmed that an access token issued before a password reset was still accepted afterward.

Evidence: [auth.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/auth/auth.service.ts) and logout implementations such as the [web API service](/home/gulshan/Projects/MoneyGame/apps/user-web/src/services/api.ts).

Suggested remedy: call server logout before discarding credentials and check revocable session state so a reset or forced logout can invalidate access immediately.

**#28 — A real payment notification can be lost when delivery fails. Still present.**

The Android listener sends a notification once. If the network or server is temporarily unavailable, it logs the failure without keeping a durable pending-delivery record. Duplicate suppression is also recorded before delivery succeeds.

For example, a genuine bank notification arrives during a brief network outage. Its request fails, and a repeated notification shortly afterward may be ignored as a duplicate. The money may have reached the bank while the app never receives the evidence needed to credit the user.

Evidence: source review of [UpiNotificationListenerService.kt](/home/gulshan/Projects/MoneyGame/apps/admin-app/android/app/src/main/kotlin/com/moneygame/admin/UpiNotificationListenerService.kt); device/network failure testing was not performed.

Suggested remedy: persist outgoing events, retry temporary failures, and mark delivery complete only after server acknowledgement. Keep server-side duplicate protection so retries cannot credit twice.

**#29 — The shared type definitions still disagree with some real responses and events. Partial fix.**

The shared package is the contract developers use to know what data the server sends. Room details now return configuration as an object, but room lists still return JSON text. Some declared socket event names and message shapes also differ from runtime behavior.

For example, a developer follows the type definition and reads `room.customConfig.someSetting`; this can work on a detail page but fail on a lobby response where the value is actually a string. A client listening for a declared event can also miss updates if the server emits another name.

Evidence: the diagnostic observed `object` for details and `string` for lists. See [game.types.ts](/home/gulshan/Projects/MoneyGame/packages/shared-types/src/game.types.ts), [socket.events.ts](/home/gulshan/Projects/MoneyGame/packages/shared-types/src/socket.events.ts), and [game.manager.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts).

Suggested remedy: serialize responses consistently and enforce the same typed event names and payloads on server and clients.

**#32 — Work already running can start new timers after shutdown begins. Partial fix.**

Shutdown now clears existing scheduled game timers. It does not first block new actions and wait for work already in progress to finish.

In the diagnostic, a bet was paused, the server's timer-stop method ran, and the bet then resumed. It created a new turn timer after the shutdown cleanup. During a deployment or restart, this can leave game work running while other services, such as the database, are closing.

Evidence: controlled reproduction involving [game.manager.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/game.manager.ts) and the [Teen Patti engine](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/game/engines/teen-patti/teen-patti.engine.ts).

Suggested remedy: enter a shutdown state that rejects new work, finish or safely persist active operations, prevent timer rearming, and only then close dependencies.

**#33 — Older pending deposits or withdrawals can remain hidden from admin queues. Partial fix.**

The backend can now filter and paginate requests. The admin clients still fetch the default latest 50 records and then filter that short list locally.

For example, a withdrawal remains pending while 50 newer rejected or completed requests arrive. It drops out of the fetched list, so selecting “pending” cannot display it. The request still exists and may still count in dashboard totals, making it easy for admins to overlook.

Evidence: the diagnostic's default list omitted an old pending withdrawal, while a server-filtered query found it. See [admin.service.ts](/home/gulshan/Projects/MoneyGame/apps/server/src/modules/admin/admin.service.ts) and the [admin web API service](/home/gulshan/Projects/MoneyGame/apps/admin-web/src/services/api.ts).

Suggested remedy: make clients request the desired status from the server and expose navigation through all matching results.

**#34 — Known vulnerable packages remain in the development toolchain. Still present.**

The dependency audit reports seven affected package entries, arising from two underlying advisories in the Tailwind build dependency chain. These concern parsers consuming excessive resources on specially constructed input.

This is primarily a build/development dependency concern in the reviewed project. No production request path into those parsers was found, so the result should not be described as seven demonstrated ways to attack the running game.

Evidence: the recheck's npm audit against [package-lock.json](/home/gulshan/Projects/MoneyGame/package-lock.json) reported five high and two moderate affected entries. Advisory references are retained in finding #34 of the original report.

Suggested remedy: update the affected dependency chain with compatibility checks for both web apps. Review styling and builds when taking a major Tailwind upgrade.

**Verification and reproducibility**

| Check | Result this review |
| --- | --- |
| Full TypeScript / web build | Passed |
| Existing server suites | All five passed |
| Web session tests | 10 passed |
| Migration checks | 3 passed |
| Modified Flutter user app analysis | No issues |
| Modified Flutter user app tests | 19 passed |
| Additional follow-up diagnostics | 27 scenarios, no unexpected execution errors |
| npm dependency audit | 7 affected development dependency entries remain |
| Admin Flutter / native Android build | Not rerun; listener changes reviewed from source, not executed on a device |

Run the new follow-up diagnostics:

```sh
node scripts/security-recheck.cjs
```

The script uses a freshly migrated temporary SQLite database, synthetic accounts, isolated credentials, and mocked socket/route contexts. The deletion and shutdown tests intentionally control the scheduling of operations so races are deterministic. The original diagnostic script is retained as historical evidence; expected rejections in fixed code can make its old assumptions produce error output.

The script prints observations rather than being a comprehensive regression suite. Successful execution means the scenarios ran, not that the application is secure. PostgreSQL-specific concurrency and live deployment behavior remain unverified.

No application fixes were made during this follow-up. Existing working-tree changes were reviewed and preserved. Added artifacts are this report and the follow-up diagnostic script.

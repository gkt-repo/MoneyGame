# Project bug review — 19 October 2026

**Status:** These original findings have now been addressed in source. See [PAYMENT_FIXES.md](PAYMENT_FIXES.md) for changes, verification, and required deployment/migration steps. The descriptions below preserve the original review evidence.

Reviewed the backend, Docker configuration, web clients, and Flutter clients. Application source was not changed. Existing work in the Flutter apps was left untouched.

Severity: **Critical** means unauthorized money movement or control; **High** means financial integrity, data loss, or disclosure; **Medium** means a broken user workflow.

## Critical

### 1. Payment webhook accepts requests without authentication

Location: `apps/server/src/routes/api.routes.ts:220–241`.

The secret check runs only when an authentication header exists. Omitting both supported headers bypasses verification entirely. An unauthenticated request containing a pending deposit's amount credits its wallet without a real payment.

**Reproduced:** HTTP 200 and ₹500 credited with no authentication headers. Require the configured secret on every request and reject missing credentials.

### 2. Withdrawal and game mutations allow user impersonation

Locations: `apps/server/src/routes/api.routes.ts:57`, `:125`, `:171`, and `:190`.

Deposit creation, withdrawal requests, room creation, and room joining have no authentication middleware. They accept `userId` from the request body. The optional `req.user` expression does not authenticate a request. Public room responses also expose player IDs.

**Reproduced:** An unauthenticated withdrawal request locked ₹50 from a different user's wallet and set the destination to a supplied UPI address. Payout still requires admin approval, but the unauthorized request enters the real payout queue. Require authentication and obtain the acting user exclusively from the verified session. Apply ownership checks to legacy wallet, withdrawal-history, and deposit-status reads as well.

### 3. UTR reconciliation ignores the amount actually received

Locations: `apps/server/src/modules/payment/payment.service.ts:159–168` and `:304–326`.

Both the unmatched-payment claim and the delayed-webhook fallback match a UTR without comparing the bank amount with the deposit amount. They then credit the user-selected `baseAmount`.

**Reproduced:** A ₹1 unmatched payment approved a ₹10,000 deposit. A ₹2 delayed notification approved a ₹20,000 claimed deposit. Verify the received amount against the expected payment before approval; mismatches need reconciliation rather than automatic credit.

## High

### 4. Concurrent duplicate notifications credit a deposit twice

Locations: `apps/server/src/modules/payment/payment.service.ts:135–155`, `:196–212`; `apps/server/src/modules/wallet/wallet.service.ts:72–94`.

The pending-state read, deposit approval, and wallet credit are separate operations. Two requests can both read the pending deposit and then independently credit it. The wallet ledger has no unique constraint on the deposit reference to prevent this.

**Reproduced:** Two concurrent notifications using the same UTR both succeeded, crediting ₹1,200 for one ₹600 deposit. Claim the deposit with a conditional state change and update its wallet and ledger within one transaction, with a unique payment identity.

### 5. Failed wallet credit permanently strands an approved deposit

Locations: `apps/server/src/modules/payment/payment.service.ts:196–212`, `:311–337`, and `:409–441`.

Approval is persisted before wallet credit. If credit fails, the deposit remains approved; a retry is rejected as already credited. The comment describing this sequence as atomic is inaccurate.

**Reproduced with an injected credit failure:** The deposit remained `APPROVED`, its wallet stayed at ₹0, and retrying the notification was refused. Commit approval, wallet credit, unmatched-payment resolution, and ledger recording together.

### 6. Production defaults permit known admin credentials and signing secrets

Locations: `apps/server/src/config.ts:10–24`, `apps/server/src/modules/auth/auth.service.ts:484–527`, and `docker-compose.yml:9–23`.

Production startup accepts hardcoded JWT/webhook secrets and seeds an admin with a known password. Compose does not pass `ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD`, or `ADMIN_INITIAL_PHONE`, so adding those to the host `.env` alone does not override the container defaults. Startup also logs the initial password.

**Confirmed by code/configuration inspection.** Require deployment-specific secrets and bootstrap credentials, pass the bootstrap variables through Compose, and remove credential logging.

### 7. Socket connections disclose financial events without authentication

Locations: `apps/server/src/server.ts:60–99`, `apps/server/src/modules/payment/payment.service.ts:184–185` and `:252–256`.

Any socket can subscribe to another user's or deposit's channel by supplying its ID. Administrative payment notifications, including the complete unmatched-payment record, are also broadcast globally using `io.emit`, bypassing the nominal admin channel.

**Confirmed by code inspection.** Authenticate socket connections, derive user subscriptions from the verified identity, authorize deposit subscriptions, and restrict administrative broadcasts to authorized admins.

### 8. Default Docker SQLite database has no persistent storage

Location: `docker-compose.yml:1–23`.

Compose defaults to `file:./dev.db` and declares no volume or bind mount. The SQLite database resides in the container's writable layer and disappears when that container is replaced, including a deployment that recreates it. This finding applies to the SQLite configuration; an external PostgreSQL database is separate.

**Confirmed by configuration inspection.** Mount a dedicated database directory and point SQLite at it, or require an external database for production.

### 9. Routine startup permits destructive schema changes

Location: `docker-entrypoint.sh:31`.

Every normal startup executes `prisma db push --accept-data-loss`, even when `PRISMA_FORCE_RESET=false`. A schema change requiring dropped or recreated data can therefore be accepted automatically during deployment.

**Confirmed by script inspection.** Use reviewed migrations for production; do not automatically accept destructive synchronization.

### 10. Concurrent joins overfill rooms and can start multiple countdowns

Location: `apps/server/src/modules/game/game.manager.ts:48–70`.

Capacity and status checks occur before the wallet/player transaction. Multiple join requests can all observe the last available seat. Each request can then start its own countdown because countdown creation has no conditional state transition.

**Reproduced:** Two simultaneous guests joined a room already containing its host: three players in a two-player room. Countdown scheduling was disabled in the reproduction to isolate the capacity check and avoid background settlement. Serialize seat reservation with the room's state transition, and schedule the countdown exactly once.

### 11. Server restarts strand games and their locked balances

Locations: `apps/server/src/modules/game/game.manager.ts:79–98`; `apps/server/src/server.ts:103–107`.

Countdown execution exists only in an in-memory timer. Bootstrap does not recover rooms left in `COUNTDOWN` or `ROLLING`. A process restart during a game loses its execution while keeping entry fees locked in the database. Waiting rooms also have no exposed cancellation/refund workflow.

**Confirmed by lifecycle inspection.** Persist resumable execution state and recover interrupted games on startup, or refund them transactionally.

### 12. Payment tests can erase the configured database's financial records

Location: `apps/server/tests/payment_system.test.ts:12–17`.

The payment suite unconditionally deletes every transaction, unmatched payment, withdrawal, deposit, and audit log in the active database. The test commands do not establish a separate test database or refuse a non-test database URL.

**Confirmed by test inspection.** Tests in this review explicitly used temporary SQLite databases. Make database isolation part of the test harness and scope cleanup to test-owned records.

## Medium

### 13. Expired deposit amount slots cannot actually be reused

Locations: `apps/server/prisma/schema.prisma:78–85`; `apps/server/prisma/schema.postgresql.prisma:78–85`; `apps/server/src/modules/payment/payment.service.ts:38–85`.

Allocation excludes historical deposits, but `totalAmount` is globally unique across all statuses. An offset selected from an expired or approved record still violates the database constraint. Requests can fail randomly long before all active offsets are used; after 99 historical offsets for an integer base amount, none remain reusable.

**Reproduced with a fixed offset selection:** Replacing an expired ₹800.01 request failed with Prisma `P2002`. Model uniqueness around active reservations and handle allocation collisions transactionally.

### 14. Failed room creation leaves an empty lobby room

Location: `apps/server/src/modules/game/game.manager.ts:25–35`.

The room is committed before checking and locking the host's funds. A failed entry leaves a `WAITING` room with no host. Repeated failures can fill the lobby's limited results with empty rooms.

**Reproduced:** A host with no funds received an insufficient-balance error, but the room count increased by one. Create the room and host entry in one transaction.

### 15. Clients discard sessions instead of refreshing access tokens

Locations: `apps/user-web/src/services/api.ts:148–152`, `apps/admin-web/src/services/api.ts:244–248`, `apps/user-app/lib/core/network/api_client.dart:227–231`, and `apps/admin-app/lib/core/network/admin_api_client.dart:185–189`.

Access tokens default to 15 minutes. All four clients store refresh tokens but clear the session on a 401 without invoking the refresh endpoints. A protected request after access-token expiration forces another login.

**Confirmed by client/server code inspection.** Refresh once on token expiration, coordinate concurrent refreshes, and retry the original request.

### 16. Mobile fallback cannot recognize a completed game

Locations: `apps/user-app/lib/screens/game/active_room_screen.dart:100`, `:347`, and `:619`; `apps/server/src/modules/wallet/wallet.service.ts:236`.

The Flutter game screen checks `FINISHED`; the backend persists `COMPLETED`. If the final socket event is missed, polling receives the completed room but does not render its result. The rolling flag also stays set if the event that clears it is missed.

**Confirmed by state comparison.** Use the backend's shared status vocabulary and derive the completed UI from polled room state.

### 17. Password reset reports success when email cannot be delivered

Locations: `apps/server/src/modules/auth/email.service.ts:43–76`; `apps/server/src/modules/auth/auth.service.ts:384–392`.

The mail service returns success with no SMTP configuration and after delivery errors. The API tells users an OTP was sent although they cannot receive it. OTPs are also printed to logs in production.

**Confirmed by code inspection; the no-SMTP path also ran in the existing auth tests.** Propagate delivery failures, validate production SMTP setup, and restrict OTP logging to an explicit local development mechanism.

## Verification and limits

- `npm run build`: passed for shared types, backend, admin web, and user web.
- `docker compose config --quiet`: passed. An image build or production deployment was not run.
- Backend auth, admin, and payment suites: passed, reporting 40 checks, against an isolated `/tmp` SQLite database with SMTP disabled. Several checks only print failure messages instead of asserting, so their success summary is not exhaustive validation.
- Both Flutter apps: `flutter analyze --no-pub` and `flutter test --no-pub` passed. Each app currently has one launch smoke test.
- Separate targeted reproductions confirmed nine failure scenarios covering findings 1–5, 10, 13, and 14; finding 3 was reproduced through both reconciliation paths.
- Reproductions used SQLite and a local-only HTTP server. PostgreSQL concurrency, real bank integration, device networking, and production credentials were not exercised.
- No real payments or email messages were sent, and the project's configured database was not used by the tests.

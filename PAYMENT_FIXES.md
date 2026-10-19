# Payment and project fixes

The 17 findings in `PROJECT_REVIEW.md` are addressed in source. The review describes the original behavior; this document describes the replacement behavior and deployment requirements.

## Payment behavior

- Every bank webhook requires `X-Webhook-Secret` (or a Bearer secret) and a bank UTR/reference. Missing/wrong secrets are rejected. Send an amount in rupees with at most two decimal places.
- A UTR is normalized by trimming whitespace and converting letters to uppercase. Accepted references contain 8–64 letters, digits, underscores, or hyphens. Numeric 12-digit UPI UTRs are supported.
- The amount received must equal the deposit's `totalAmount`, including its paise offset. Successful deposits credit `baseAmount`, preserving the existing offset policy.
- Approval, bank receipt assignment, wallet credit, ledger entry, and manual-approval audit commit in one serializable transaction. A failure rolls everything back. Retries and simultaneous callbacks cannot credit twice.
- All incoming bank payments are recorded in `UnmatchedPayment`, including payments immediately assigned to a deposit. The admin queue still defaults to `UNCLAIMED`; the `ALL` filter includes assigned receipts.
- An authenticated admin may manually attest to a payment absent from the listener. If a bank receipt already exists, its amount must match; manual approval cannot overwrite it. Rejected deposits cannot be revived by a user claim.
- Amount reservations are unique only while active. Reusing a historical amount is allowed, but an amount-only notification for it is ambiguous. Such payments remain in reconciliation until the payer supplies the matching UTR or an admin verifies them. This prevents a delayed old payment from crediting the next person using the amount.
- Withdrawals and other wallet changes use serializable transactions and paise arithmetic. Concurrent requests cannot overspend or produce duplicate pending withdrawals. Ledger operations reject negative available/locked balances.

## Findings addressed

| Review # | Change |
| --- | --- |
| 1 | Mandatory, constant-time webhook secret check. |
| 2 | Authenticated financial/game mutations use the session user; legacy financial reads enforce ownership. |
| 3 | Exact bank/deposit amount comparison in every reconciliation path. |
| 4 | Atomic receipt/deposit claims and a unique payment ledger key prevent duplicate credit. |
| 5 | Approval and credit roll back together; retry remains possible after failure. |
| 6 | Production rejects known/default secrets; bootstrap password is explicit; existing known default admin passwords block startup until rotated. |
| 7 | Socket JWT authentication, ownership checks, separate room namespaces, and restricted admin broadcasts. |
| 8 | Named SQLite data volume and an absolute persistent database path. |
| 9 | Reviewed migrations replace startup `db push`; migration failures stop startup; automatic resets are disabled. |
| 10 | Room seat reservation and countdown transition occur in one transaction. |
| 11 | Startup refunds unfinished games; waiting participants can cancel a table and refund all entries. |
| 12 | Every backend suite gets a fresh temporary database; direct unsafe suite execution is refused. |
| 13 | Nullable unique active-amount reservations replace global historical amount uniqueness. |
| 14 | Room creation and host entry commit together. |
| 15 | Both web and both Flutter clients refresh access tokens, coordinate concurrent refreshes within a client, and retry expired requests. |
| 16 | Mobile recognizes `COMPLETED`, clears stale rolling state, and displays the server's actual net payout. |
| 17 | Missing/failed SMTP delivery returns failure, removes the unusable OTP, and never prints OTPs to logs. |

## Deployment requirements

These changes have not been deployed and do not automatically repair historical overcredits or previously stranded deposits. Reconcile any existing financial discrepancies against bank records before applying manual corrections.

1. Set independent `JWT_SECRET` and `WEBHOOK_SECRET` values (at least 32 characters) in the deployment environment. Generate each separately with `openssl rand -hex 32`. Update the bank listener to send the new secret and a UTR. Changing the JWT secret invalidates old access tokens.
2. Set `ADMIN_INITIAL_PASSWORD` to a unique password of at least 12 characters when creating or rotating the initial admin. Compose now passes the initial admin email, password, and phone through. Initial passwords are no longer logged.
3. Configure SMTP if password reset is needed. Password reset now correctly fails when mail delivery is unavailable.
4. For SQLite in Docker, use `DATABASE_URL=file:/app/data/moneygame.db`; the `moneygame_data` volume persists it. Before replacing an old SQLite container, stop it and back up its actual database file, then restore the database into the new volume. Do not point an existing deployment at an empty volume and assume the old container's file will transfer automatically. Existing external PostgreSQL URLs remain supported.
5. Build the image with `docker compose build`. New databases receive the baseline and safety migrations automatically at startup.

### Existing databases created with `prisma db push`

Back up the database and stop application writes. Confirm that its schema matches the original baseline in `apps/server/prisma/migrations/20261019000000_baseline/migration.sql` (or `migrations-postgresql` for PostgreSQL). If it differs, reconcile that difference before marking the baseline applied.

The following explicit maintenance commands select the correct provider and migration set inside the container:

```sh
# Existing databases only: record that the original schema already exists.
docker compose run --rm money_game_app baseline

# Apply the safety migration without starting the server.
docker compose run --rm money_game_app migrate

# If an existing admin uses the old default password, set ADMIN_INITIAL_EMAIL
# and ADMIN_INITIAL_PASSWORD to the intended account/new password, then rotate it.
docker compose run --rm money_game_app rotate-admin

# Start the updated application after migration and credential preparation.
docker compose up -d
```

Do not run `baseline` on an empty database. The upgrade adds nullable fields/indexes, releases historical amount uniqueness, canonicalizes bank references, and restores historical payout display from existing ledger entries. It does not clear wallets or financial history. Existing UTRs that collide after normalization stop the migration for reconciliation rather than silently merging payments.

The current Compose deployment runs one game engine. Its startup refunds all unfinished rooms from the previous process. Do not run multiple game-engine instances against the same database without introducing distributed execution ownership.

## Verification

- `npm run build`: shared types, backend, admin web, user web.
- `npm test`: isolated backend suites, payment/security regressions, browser session regressions, migration/production-configuration tests, and both Flutter suites.
- `npm run analyze:flutter`: both Flutter analyzers.
- The payment/security suite covers unauthenticated requests, impersonation, amount mismatches in both arrival orders, concurrent duplicate callbacks, rollback after a simulated wallet failure, races across all approval paths, UTR replay, expired amount reuse, concurrent withdrawals, paise arithmetic, room overfill, refunds, socket channel authorization, and email failure.
- The migration test upgrades a populated temporary SQLite database and checks that wallet balances/history remain intact.
- Docker Compose configuration and shell syntax can be validated locally, but an image build and live PostgreSQL tests require a working Docker daemon or PostgreSQL instance. Neither is available in this environment.

# Moderator operations

The Android companion is `apps/moderator-app` (`com.moneygame.moderator`). The existing Flutter admin app manages the fleet under **More → Moderator Fleet / UPI Pool**, visible to SUPER_ADMIN only. There is no fixed moderator count.

## Start using it

1. Deploy the backend with the new migrations and regenerated Prisma client. Back up the database using the existing deployment procedure first. The Docker entrypoint already selects the PostgreSQL schema/migrations for PostgreSQL URLs; otherwise it uses SQLite. No production migration or deployment is performed by this change.
2. Install the updated admin app. In Moderator Fleet, create a username and password (minimum 12 characters), optionally with a UPI and receiver name. Use UPI Pool to edit assignment, order, enabled state and daily limit. The default is 15; global rotation batch size defaults to 2.
3. Build/install the moderator app:

   ```sh
   cd apps/moderator-app
   flutter pub get
   flutter build apk --release --dart-define=API_URL=https://YOUR_SERVER
   ```

   Configure your own release signing key using `android/key.properties` before distribution; without it the existing Android build setup uses the debug signing key. The default development endpoint is the Android emulator host (`http://10.0.2.2:4000`). A remote URL must use HTTPS. The login screen also accepts the server URL.
4. Sign in with the moderator credentials. Open the listener card, grant notification access, allow background operation and reconnect the listener. Install/configure the receiving bank or UPI app on the same phone. Unassigned moderators can still handle payouts and support.
5. Check that the fleet reports ONLINE and the correct UPI before issuing deposits. Test actual bank notifications on each device: app notification formats, notification permissions, battery settings and missing UTRs affect capture. This is notification-based reconciliation, not a bank API integration.

## Rotation and capacity

Rotation is serialized with deposit creation and uses a persistent cursor: A,A,B,B,C,C,A,A,… . Equal sort orders use account ID as a deterministic tie-breaker. Disabled, suspended, offline and exhausted channels are skipped. A configured pool with no eligible account pauses deposits; it never falls back to the old single UPI. Legacy installations with no pool retain their old receiving UPI behavior.

Quota is based on **issued payment slots**, not just credited deposits. Issuing a QR consumes one slot. Expired/rejected QRs retain their slot until the IST day ends because they can still be paid. The fleet shows issued slots and unique received reports separately. Unsolicited, ambiguous or previous-day payments conservatively consume additional capacity. This may pause an account before 15 successful wallet credits; it prevents unlimited unpaid QR requests bypassing the quota. It cannot prevent a user sending money to an old UPI address outside the platform.

Day keys are calculated in UTC+05:30 independently of server timezone. A new day reads fresh counters and resets the rotation cursor on the first allocation, including after downtime. Old usage remains for audit; counters are not destructively erased. Migration backfills already-issued pool deposits. Legacy `todayTxCount`, `batchCount`, and per-account `batchSize` columns remain for migration compatibility; the operational source is `UpiDailyUsage` plus the global rotation setting.

## Listener and matching

Each assigned moderator gets a random scoped listener credential. Only its SHA-256 hash is stored on the server. It authorizes reports for that receiving account, not admin API operations. Password changes, suspension, archival and logout revoke it. Config reconnect rotates the credential. Devices have independent heartbeat, battery and listener connectivity. Routing requires a fresh heartbeat (under 3 minutes), connected listener and valid credential. Disabling new routing does not prevent the still-assigned device from reporting already-issued payments.

Android retains an outbox in private app preferences and retries every minute while the listener is connected. Entries are tied to the UPI account and survive process restarts. Reports without an extracted 12-digit UTR are not sent for automatic credit; the latest detected notification is retained locally. Explicit logout clears device credentials/outbox. Changing an account assignment requires reconnecting. Reports for a previous account are never sent under the new account's credential.

The server checks UTR uniqueness, exact amount and receiving UPI. Repeated reports credit/count once. Wrong-account or ambiguous receipts remain unmatched for Super Admin reconciliation. Moderator manual approval is an audited operator attestation: operators must check the actual bank record before submitting the UTR. Moderators cannot directly adjust balances or assign unrelated unmatched receipts.

## Payouts and access

Moderators take a pending payout before sending money in their banking app. Only its claimant can complete/reject it; Super Admin can resolve a stuck payout from the admin queue after checking whether money was sent. There is deliberately no automatic timeout that could cause another operator to send the same payment again. Completion requires an actual bank reference, and completion/rejection records the operator. The app itself does not send bank transfers.

The backend allows moderators only deposit operations, withdrawal operations, support replies, their profile/status and listener setup. Sensitive APIs remain inaccessible even if called outside the UI. Moderator sockets do not join the broad admin broadcast room. Revocation disconnects the affected user socket; authenticated polling provides a fallback. Archiving retains operator and financial history and prevents login. Regular ADMIN accounts cannot manage moderator credentials or access SUPER_ADMIN-only pool/rotation/balance-adjustment/solvency operations.

Fleet and queues refresh periodically (30 seconds in the admin fleet, 15 seconds in the moderator workspace). Low battery and stale listener state are displayed in the fleet; these are in-app indicators, not push/SMS alerts.

## Validation

- `npm run build:server`
- `npm run test:moderator`
- `npm --prefix apps/server run test -- payment security auth admin`
- `npm run test:migrations`
- `cd apps/moderator-app && flutter analyze && flutter test && flutter build apk --debug`
- `cd apps/admin-app && flutter analyze && flutter test`

Device notification receipt, background survival and actual UPI settlement still require physical-device acceptance testing. PostgreSQL schema validation does not replace applying/testing migrations against a PostgreSQL staging database.

# CricTrade backend and live IND–NZ feed test

Test date: 24 October 2026. User-facing times below are Asia/Kolkata (IST).

## Decision

The existing sports backend tests pass, and the public ESPN cricket feed connects. It supplies changing live scores with over/ball notation and some completed-match results. It is not limited to match-end results.

However, the sampling did not capture every legal delivery, and this response contains no delivery history to recover omitted states. Over-end snapshots were observed, but complete per-over coverage and actual event latency were not established. The prerequisite for building funded live CricTrade on this feed has not passed. Full CricTrade implementation has therefore not been started.

This is a test of the workspace backend service and its upstream endpoint, not a verification of a deployed server. No production wallet or application database was used.

## Live match and endpoint

- ESPN match ID: `1539433`.
- Provider name: `New Zealand v India`, linked as the second T20I.
- Provider status during the test: `in`, summary `Live`.
- Endpoint: `https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket`.
- First run: 19 requests at a requested 10-second interval, inspecting the scoreboard and tracking this match.
- Follow-up: 13 requests at a requested 5-second interval, filtered to this match.
- These runs bypass the application's 45-second match cache to measure upstream snapshots directly. The follow-up briefly overlaps the first run.
- Selected-field evidence is saved in [CRICKET_FEED_TEST_EVIDENCE.json](CRICKET_FEED_TEST_EVIDENCE.json).

## Observed score changes

The times are when this client received a score, not when the real delivery happened. Duplicate unchanged samples are omitted from this table; they remain in the evidence file.

| First observed at (IST) | New Zealand score as returned |
| --- | --- |
| 13:08:52 | `50/3 (6.6/20 ov)` |
| 13:09:32 | `50/3 (7/20 ov)` |
| 13:10:43 | `52/3 (7.2/20 ov)` |
| 13:11:32 | `53/3 (7.4/20 ov)` |
| 13:11:51 | `54/3 (8/20 ov)` |

Observations:

- The 10-second run did not capture the `7.1` or `7.3` states.
- The focused 5-second run moved from `7.4` to `8` without capturing `7.5`.
- The source used both `6.6` and `7` for a completed-over boundary. A future parser must recognize the source's notation and avoid counting this normalization as a new delivery.
- These observations prove that our sampled snapshots are incomplete, not that every omitted state was never briefly available between requests. More frequent polling alone does not provide a delivery-recovery mechanism.
- HTTP response times/cache headers are not delivery latency. No independent ground-truth delivery timestamp was available, so no claim of “N seconds behind live” is justified.
- No final-three-over period of this match was observed in this short test. Its special late-innings behaviour remains untested.
- The live match did not finish during the test. Its own final-result transition and automatic settlement were not observed.

## What the response supports

| Capability | Result |
| --- | --- |
| Connect to the upstream scoreboard | Successful |
| Identify live IND–NZ | Successful |
| Obtain runs, wickets and overs inside a score string | Successful |
| Observe score changes during an innings | Successful |
| Observe a completed-over snapshot | Successful: 7 and 8 overs seen |
| Guarantee every over-end snapshot | Not established |
| Capture every delivery at 5/10-second polling | Not achieved in these samples |
| Recover missed deliveries from this response | No delivery list observed |
| Validate source event timestamps/freshness | Not established |
| Read a completed match and its winner | Observed for Tasmania–Victoria; Victoria had `winner: true` |
| Verify all matches have usable scores/results | Not established; several listed live fixtures had empty scores |
| Validate CricTrade probability/credit trading | Not implemented; existing sports tests cover a different game mode |

The selected IND–NZ event exposes score strings, match metadata and a period field. Its `playByPlayAvailable` and `commentaryAvailable` flags were false, and no delivery list or unique delivery identifier was present among the event/competitor fields examined. This is about this response and test window, not a claim about every ESPN product or endpoint.

The existing application also omits structured runs, wickets, legal balls, targets, source timestamps and delivery IDs from `SportsMatch`. It uses a 45-second cache and a 30-second background room/result checker. The current Flutter table's 4-second room refresh does not fetch a new match score each time; React fetches match data when the table mounts. Thus a successful upstream connection does not mean the UI already supports live trading updates.

No CricketData or Sportmonks key was configured in the inspected local environment files or process environment. No alternative authenticated provider was tested. This does not establish what is configured on a remote deployment.

## Backend checks performed

`npm --prefix apps/server test -- sports` passed all 11 existing sports-pool tests using the runner's isolated temporary SQLite database. The suite fetched real match listings, then used controlled outcomes for payout tests.

Coverage included room creation/joining, funded entry locking, winning-team distributions, refunds, room start restrictions, high-capacity rooms, startup recovery, cancellation authorization and fixture preservation. These tests do not validate CricTrade's proposed credit/profit pool, live result accuracy or ball-by-ball delivery completeness.

Also passed:

- `npm run build:types`
- `npm run build:server`
- Syntax check of the diagnostic script.

## Reproduce the read-only feed test

```bash
npm --prefix apps/server run probe:cricket-feed -- \
  --match-id 1539433 \
  --samples 19 \
  --interval-ms 10000 \
  --output /tmp/moneygame-ind-nz-feed-probe.json
```

Use the current scoreboard's match ID when this match is no longer listed. Omit `--match-id` to inspect all returned fixtures. The script makes read-only HTTPS requests, prints score changes, and saves public response fields. It loads no credentials, wallet code or database. Its exit code indicates HTTP/schema/target-presence success, not trading suitability.

## Next work needed before the conditional full implementation

1. Obtain and test a match-detail/delivery feed with sequence IDs and recoverable delivery history. A paid subscription is not itself evidence of adequate freshness.
2. Observe complete overs and final-three-over periods with source timestamps and a trusted reference, recording gaps and corrections.
3. Add a structured cricket-state adapter, explicit stale/unknown states, independent feed caching and socket score updates.
4. Only enable funded live execution after its data checks pass. The screen and accounting could separately be built against replay data, but that would not satisfy the user's requested live-feed gate.

The current evidence supports a score-display prototype and match-result integration work. It does not justify declaring the full live CricTrade backend ready.

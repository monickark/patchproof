# PatchProof A–D completion report

## Scope and inspection

Inspected the existing dashboard, local server, run script, config example, original classifier and API/CLI tests before editing. Verified the old report’s coupling bug in both sources: the browser used `demoUpdated ? config.approvedRelease : release`, and the local demo endpoint used the same relationship. The classifier’s fresh exact-match rule and green Priority 1 UI were retained.

No frameworks, authentication, cloud integrations, automatic deployment of monitored software, vulnerability scanning, arbitrary hosted URL input, or external notification delivery were added.

## Stage A — expected configuration versus running state

`dist/demo.mjs` owns an independent inventory of simulated running releases and availability. Approval is separate expected configuration. Check now and auto-check only observe running state. Only explicit simulated updates set running releases to approval; Reset restores the initial inventory and settings. Both browser and local demos use this module.

Added regressions before implementation. The first runs failed because the new implementation modules did not exist yet; after implementation the assertions passed. The regression now confirms that v1.4.0 running instances remain v1.4.0 after approval changes to v1.5.0, repeated checks stay mismatched, and explicit updates followed by fresh checks match.

## Stage B — evidence, history, and asynchronous correctness

`dist/verification.mjs` separates last usable evidence from the latest check attempt. Status, reason code, explanation, age, freshness limit, and next action are computed from those facts. Failed checks retain prior evidence, but it is labelled historical and never counts as a successful latest check. Invalid or rejected new report metadata is shown separately when available. Cached observations retain their source timestamp.

Reason precedence is documented and tested: known latest-attempt failure wins over the age of retained history. For a newly returned report, missing report, malformed shape/release, invalid timestamp, and future timestamp are checked before acceptance. Older source observations and conflicting equal timestamps are rejected; otherwise freshness is checked before comparing releases. Invalid timestamp includes missing/null, nonnumeric, nonfinite, negative, fractional, and out-of-range values. Mismatch includes newer releases.

Controlled promises and an injected clock test request ordering before the guard implementation. A monotonic epoch/sequence guard makes newest-started checks authoritative. Reset, configuration changes, simulation actions, and cancellation invalidate older work; stale completions cannot change evidence or clear a newer request’s loading flag. `dist/request-gate.mjs` applies the same principle to browser HTTP responses. Cancellation is best-effort at the transport layer, while the guard decides whether a result can be accepted.

`collector.mjs` performs read-only HTTP collection and returns structured timeout, HTTP/network, and malformed-JSON outcomes. The source’s observation timestamp is never replaced by fetch time. Configured mode uses the same evidence store and GET-only collector, with simulation endpoints rejected.

## Stage C — demonstration, guidance, and activity

The new stale action explicitly freezes demo source timestamps beyond the freshness limit. Repeated checks, including the auto-check path, continue reading that same expired source data. It does not update releases. Simulated updates unfreeze reporting; Reset restores deterministic initial approval v1.4.0, 60-second freshness, inventory, availability, source timestamps, view filters, and auto-check enabled. Simulation actions invalidate confirmation before fresh observations are collected.

The dashboard now shows precise evidence, historical labels, attempted/completed check times, explicit application/environment, and the assumption that all demo components share one approved release. The setup guide was checked against `run.sh`, `server.mjs`, and the sibling `config.example.json`; its actual command is:

```sh
./run.sh --config ../patchproof/config.example.json
```

The example config is fictional and credential-free. It explains direct instance URLs, expected inventory, `release`, numeric Unix-millisecond `checkedAtMs`, observation versus fetch time, clock synchronization, Unknown behavior, and persistence. The hosted app remains simulated; real requests run only through the loopback local dashboard.

Activity records approval changes, instance status/reason/release changes, confirmation changes, and explicit demo/reset/stale actions, with old/new context. Identical polling outcomes do not create events. Activity DOM and the polite announcement change only for new events, not for every timestamp tick. External delivery remains visibly unconnected.

## Stage D — tests actually run

Final successful automated runs:

```sh
# In patchproof-ui, using the bundled Node v24.22.1 runtime:
node --test test-verification.test.mjs test/*.test.mjs
# 29 tests passed; 0 failed; 0 TODO.

node test-api.mjs
# Existing local API integration script passed.

# In the sibling patchproof folder:
node --test test/*.test.mjs
# All 5 legacy CLI tests passed.
```

The CLI suite was initially invoked from the dashboard directory, causing its relative `dist/cli.mjs` lookup to fail. It was rerun from its documented project directory and all five tests passed; no application fix was needed.

Coverage includes exact/older/newer releases; exact/beyond age limits; missing/nonfinite/invalid/future timestamps; malformed reports; actual HTTP header/body timeouts and HTTP 503; retained historical evidence; missing expected replies; empty inventory; cached-read expiry with a controllable clock; approval without running-state mutation; delayed/out-of-order completions; approval/reset during checks; older source observations; cancellation and loading cleanup; filters independent of global results; quiet unchanged polls; failure-reason transitions; deterministic scenarios/reset; and configured-mode restrictions.

JavaScript module imports and `node --check` syntax checks succeeded. There is no existing type-check script or TypeScript compiler configuration in these projects. The original build uses Node’s TypeScript stripping; this is not a full type-check, and none is claimed.

Browser checks actually performed on the local static/hosted-demo preview and local configured fixture:

- Initial 3 Match / 2 Mismatch / 1 Unknown; Unknown evidence explains HTTP 503 and a next action.
- Recovery to six v1.4.0 matches; approval changed to v1.5.0 gives six v1.4.0 mismatches; repeated Check now leaves releases and activity unchanged. Explicit updates then give six v1.5.0 matches.
- Stale simulation gives six Unknowns while their historical reported releases still match approval. The dialog shows approximately 75.5 seconds of age versus a 60-second limit. Rechecking retains the exact observation timestamp.
- Polling paused and a 1-second limit used for a quick browser expiry check: confirmation disappeared and all six became Unknown. Boundary assertions use the controllable clock, not long sleeps. The default was restored by Reset.
- Cancel check settles to Unknown; Reset during a browser check restores initial state. Automated controlled-delay tests provide deterministic ordering coverage rather than relying on browser timing alone.
- Search with no results and an empty mismatch filter after recovery leave global verification unchanged.
- Setup guide opens with Enter and contains the verified command, report contract, and persistence explanation.
- Configured-mode UI hides/disables all simulation controls. A locally controlled endpoint first reported v1.4.0, then returned HTTP 503: the UI retained the original observation timestamp as historical and displayed a newer failed check attempt. Save & check produced a new local attempt and kept failed evidence Unknown.
- New simulation controls work with Enter. Evidence dialogs keep Tab/Shift+Tab within their controls; Escape restores focus to the evidence button. On mobile, a long dialog scrolls internally (810px client height, 1037px content height). The table is keyboard-scrollable.
- Real iframe layout viewports at 1440px and 390px. Page widths matched those viewports, without document-level horizontal overflow. The 1130px table scrolls within its labelled region (1118px desktop / 356px mobile). The expanded guide also stayed within the mobile document width.
- Computed normal-state text sizes were at least 12px, and inspected foreground/background ratios had no values below 4.5:1. This is a targeted check, not an accessibility certification or physical-device test. Actual assistive-technology speech was not audited; live-region DOM behavior was inspected.

Browser measurements and screenshots are saved in the sibling `patchproof-completion` output folder.

## Remaining limits

No known failure remains in the performed regression runs. This remains a prototype: hosted data is simulated, expected inventory is manual, state is memory-only, and browser polling stops while hidden or closed. Local settings and check activity persist only for the Node process; browser filters/auto-check preferences and view notices reset on reload. Restarting the local server requires reloading its dashboard. Activity retains at most 40 entries.

Production endpoints were not tested; fixtures were local. No physical-device, full screen-reader, full type-check, full security audit, independent digest attestation, or production-readiness claim is made. The standalone legacy CLI remains a simpler stateless checker; the richer evidence/history workflow belongs to this dashboard and its local server.

## Short manual checklist

1. Reset: expect 3 Match, 2 Mismatch, 1 Unknown. Inspect the HTTP 503 evidence.
2. Simulate updates & recheck: expect six Match.
3. Change approval to v1.5.0: expect six Mismatch reporting v1.4.0. Check again; releases stay unchanged.
4. Simulate updates & recheck: expect six fresh v1.5.0 Match.
5. Simulate stale evidence: expect six Unknown. Inspect age, limit, historical evidence, and latest attempt time. Check again; observation time stays frozen.
6. Simulate updates to recover, or Reset to return to the original demo.

## One small exercise

After recovering to v1.4.0, change only approval to v1.5.0. Before rechecking, write down the expected release and the last observed release as two separate values. Explain why changing one cannot change the other, and what fresh evidence is needed to confirm the deployment.

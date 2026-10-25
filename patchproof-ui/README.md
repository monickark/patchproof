# PatchProof dashboard

A weekend portfolio project for comparing the approved release with fresh reports from every expected instance. Node.js 24+, built-in modules, and buildless HTML/CSS/JavaScript; no framework or package installation.

## Run locally

Keep this folder (`patchproof-ui`) beside `patchproof`, then run:

```sh
./run.sh
```

Open the loopback URL printed by the script. Local demo mode uses six simulated HTTP endpoints. The hosted static dashboard uses the same demo state and evidence rules in the browser.

For your own instances, edit `../patchproof/config.example.json` and run:

```sh
./run.sh --config ../patchproof/config.example.json
```

The actual config structure, report contract, persistence boundaries, and expected-inventory rules are also documented in the dashboard’s **Try with your own instances** guide. Optional `application` and `environment` fields label one application/environment; all listed components share one approved release. Each endpoint returns `{ "release": "v1.4.0", "checkedAtMs": <numeric Unix milliseconds> }`. The source produces the observation timestamp when it observes its running process. Fetch time never replaces it.

The server binds to `127.0.0.1`. Do not expose the checker publicly. Configured endpoints are read-only GET requests; every simulation route is disabled in configured mode. The hosted demo has no URL-entry interface.

## State and evidence semantics

- Approval is expected configuration. Simulated running releases are separate state. Only explicit simulated updates change running releases; observations do not.
- Updates invalidate current confirmation, then fresh reports are collected. Reset restores deterministic demo settings and initial running state.
- Stale simulation freezes source timestamps 15 seconds beyond the freshness limit. Polling keeps seeing that same cached evidence. Simulate updates or reset to recover.
- Evidence and latest attempt are distinct. Failed attempts make the current result Unknown while retaining previous usable evidence, clearly historical.
- Reason precedence: latest attempt failure; missing report; malformed report/release; invalid timestamp; future timestamp; older/conflicting observation rejection at acceptance; expired evidence; mismatch; match. A known latest HTTP failure takes priority over the age of retained historical evidence. Malformed release takes priority over an invalid timestamp in the same new report.
- Newest-started check wins. Approval/settings changes, simulation actions, cancellation, and reset invalidate older requests. A browser request-generation guard also discards old HTTP responses. Source observations older than the last accepted timestamp are rejected; equal timestamps cannot claim different releases. Cached equal observations never gain a new source timestamp.
- Meaningful state transitions produce activity; polling timestamps alone do not. The feed updates and announces only when events change, not every second.

## Persistence and limits

Browser demo settings, reports, and activity are memory-only and clear on reload. Local settings and check activity live in the Node process and clear on restart; edit the config JSON for durable settings. Browser filters, auto-check preferences, and view-only notices reset on reload. Activity is bounded to 40 entries. Browser polling runs only while the page is visible and auto-check is on; this is not unattended monitoring. Endpoint inventory is explicit, with no dynamic discovery.

No authentication, external integrations, external notification delivery, patching, automatic deployment of monitored software, vulnerability scanning, durable database, or image-digest attestation. A release-name match is not proof of security, application health, or an independently verified digest.

## Verification

From this folder, with Node.js 24+:

```sh
node --test test-verification.test.mjs test/*.test.mjs
node test-api.mjs
```

The existing CLI tests can be run from the sibling `patchproof` folder with `node --test test/*.test.mjs`. `run.sh` builds the original TypeScript classifier with Node’s type stripping. There is no existing TypeScript type-check script; stripping and syntax checks are not a type-check.

- `dist/demo.mjs`: independent running inventory and deterministic scenarios.
- `dist/verification.mjs`: reasoned evidence, history, request generations, transitions, and controllable-clock evaluation.
- `dist/request-gate.mjs`: browser HTTP ordering/cancellation guard.
- `collector.mjs`: read-only HTTP outcomes.
- `server.mjs`: loopback dashboard/API and local demo.
- `dist/app.mjs`: existing dashboard wired to the shared model.

`REVIEW.md` records the earlier Priority 1 pass; `COMPLETION.md` records the later A–D pass and actual validation.

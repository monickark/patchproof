# PatchProof

A dependency-free Node.js command-line prototype. Requires Node.js 24+.

## Run

```sh
npm run build
npm test
npm run demo
```

The demo starts three local HTTP endpoints, detects an old release and an unavailable instance, simulates a developer updating them, then rechecks and confirms the deployment. It exits after both rounds.

For real instances, edit `config.example.json` and run:

```sh
npm start -- config.example.json
npm start -- config.example.json --watch
npm start -- config.example.json --watch --json
```

Watch mode repeats until Ctrl+C, without overlapping check rounds. Restart after changing configuration. Exit codes for one-shot checks: 0 confirmed, 2 unconfirmed, 1 configuration or application error.

## Endpoint contract

Each instance must expose JSON with a nonempty `release` string and numeric `checkedAtMs` timestamp in milliseconds. In a NestJS controller, return the deployed release identifier and `Date.now()` for the running process. Inject the release from your deployment pipeline. Use directly addressable instances, not a shared load balancer. Keep clocks synchronized.

Fresh exact matches are Match. Different releases are Mismatch. Failed requests, timeouts, malformed reports, stale data, and future timestamps are Unknown. Reports exactly at the freshness limit are stale. An empty inventory cannot confirm a deployment. All configured instances must match for confirmation.

## Notifications and scope

Console notifications appear initially and whenever a status or reported release changes. JSON output includes a notification field, null when unchanged. Team email, Slack, and webhook delivery are not configured or implemented. The app observes releases; developers update servers themselves.

The instance list is the expected inventory; omitted servers cannot be discovered. This is a local prototype for trusted endpoints, with no authentication, persistence, dynamic discovery, or large-fleet concurrency limit. Monitoring ends when the process exits.

## Design

The commented TypeScript classifier lives in `src/classify-instance.ts`. `monitor.mjs` collects HTTP reports and counts results; `cli.mjs` schedules checks. `build.mjs` uses Node's built-in TypeScript stripping to create JavaScript in `dist/`; this is a build step, not TypeScript type-checking. No dependencies are installed.

An alternative is a NestJS service and scheduler. The CLI keeps this version small and usable in a deployment script.

## Run on this computer

Your default Node is v16. `./run.sh` automatically uses a Node 24+ installation or the bundled Codex runtime:

```sh
./run.sh demo
./run.sh test
./run.sh config.example.json --watch
```

Every wrapper invocation builds first. The demo exits after its simulated recovery; use watch mode for continuous real monitoring.

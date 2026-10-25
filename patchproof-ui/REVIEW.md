> Historical Priority 1 report. The later evidence, demo-state, and ordering follow-ups are completed and reverified in [COMPLETION.md](COMPLETION.md).

# Priority 1 review and changes

Scope: a weekend portfolio project. Preserve the green identity, classifier, initial demo failures, recovery, search, filters, and expiry. No authentication, cloud integration, automatic deployment, or external notifications added.

## Findings inspected before editing

Confirmed in source:

- The headline asserted verification independently of deployment status.
- Table headings and activity details were 9px; several mobile rules further reduced supporting text. Pale foregrounds weakened readability.
- The demo banner disclosed simulation but did not explicitly connect Check now to simulated instances.
- Notification limits were in Help, rather than beside activity.
- There was no explanation that matching a reported release name is not proof of security, application health, or an independently verified image digest.
- The classifier already uses exact equality, rejects stale/future/nonfinite timestamps, and requires a nonempty inventory with every instance Match.
- Unknown evidence explanations combine stale and future timestamps. Failed checks discard the previous report. These remain Priority 2 concerns.

The supplied live-review observations were treated as observed behavior, not as permission to replace functioning features. Keyboard and layout behavior were retested after the edits.

## Implemented

- Neutral headline: Verify your deployment. Renamed the eyebrow to Release verification.
- Retained visible green demo banner; Check now is explicitly described as checking simulated instances. The button references that description for assistive technology. Local config mode retains its accurate endpoint wording.
- Visible explanation of match limits beside the release summary and in Help.
- In-app alerts only; external notifications not connected, beside activity.
- 14–15px principal content and at least 12px supporting text across desktop and mobile rules; darker green/olive foregrounds.
- Named native dialogs and retained Escape-to-close. A small Tab-boundary handler addresses the observed embedded-browser focus escape.
- Keyboard-focusable, labelled table scroll region; labelled column scopes. Mobile page does not overflow horizontally; the table scrolls inside its region.

Alternative: enlarging only the table would leave tiny mobile overrides and pale activity details intact. Shared minimum sizes and a small responsive layout adjustment cover the whole clarity problem without introducing a framework.

## Actually tested

- Six Node regression tests: fresh exact match; older/newer mismatch; exact/beyond freshness boundary; missing/invalid/future timestamps; failed/empty inventory; expiry without report refresh; approval recomputation against unchanged evidence. Some tests cover multiple cases.
- Existing local API integration: initial HTTP results, recovery, invalid origin rejection, settings, reset, configured real-endpoint code path using a local fixture, and disabled recovery controls in config mode.
- Browser layouts in same-origin iframes with real viewport widths of 1440px and 390px. Measured document width equals viewport width. At 390px, the 780px table scrolls within a 356px region. These are layout viewport checks, not physical-device testing.
- Browser-computed text sizes: no rendered text under 12px in the inspected normal dashboard states. Table headings 12px, instance names 14px, activity details 12px.
- Computed foreground/background contrast for rendered text in the inspected normal states: no values below 4.5:1 after adjusting the breadcrumb separator. Table headings 5.9:1; activity details 6.24:1. This is a targeted contrast check, not a full accessibility certification.
- Browser initial failure: 3 Match, 2 Mismatch, 1 Unknown; Unknown dialog reports HTTP 503.
- Search with no results retains the full inventory count and unconfirmed result. A mismatch filter with no results after recovery retains deployment confirmation.
- Recovery produces 6 Match. With auto-check paused and a 1-second configured limit for this test, all six become Unknown and confirmation expires. The 60-second value was restored afterward. The actual 60-second wait was not repeated.
- Changing approval in the initial scenario produces 0 Match, 5 Mismatch, 1 Unknown; reverting restores the initial state.
- An unchanged completed recheck keeps activity entries at 4 rather than adding a poll event.
- Keyboard: evidence dialog opens on its close control; Shift+Tab wraps to the last control, Tab wraps forward, Escape closes and restores focus to the evidence button. Settings and Help backward boundaries and Escape were checked too. ArrowRight scrolls the focused table region.

Not verified: full TypeScript type-checking, actual production server endpoints, physical mobile devices, screen-reader announcements, exhaustive accessibility audit, or older asynchronous-response ordering. The async-ordering case is explicitly a TODO test, not a pass.

## Short backlog

1. Priority 2: structured Unknown reasons with age/limit and next action; preserve historical report evidence; separate attempted-check and observed-evidence timestamps; test delayed/out-of-order requests before adding a generation guard if needed.
2. Priority 3: stale-evidence demo shortcut, explicit application/environment and shared-release assumption, and a short in-product setup guide based on the already existing local server/config/report contract.
3. Priority 3 confirmed demo limit: after recovery, browser demo reports are derived from `config.approvedRelease`. Changing approval to v1.5.0 then produces six v1.5.0 reports without another simulated update. Decouple simulated running releases from approval; preserve the initial and recovery flows. This was reproduced in the browser and deliberately left outside Priority 1.

The local setup path was checked in `run.sh`, `server.mjs`, and `../patchproof/config.example.json`: `./run.sh --config ../patchproof/config.example.json`, with per-instance JSON containing `release` and numeric `checkedAtMs`. The config-mode code path works against local test endpoints. Hosted browser mode remains simulated, with no external team delivery; this pass does not add the in-product guide.

## Exercises

- Rewrite What a match means in your own words, retaining all three limits: security, application health, and independently verified image digest.
- Open Help with the keyboard, cycle through controls with Tab/Shift+Tab, then Escape; verify focus returns to the opener.

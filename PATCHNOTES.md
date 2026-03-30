# Patch Notes

## v0.1.0 - 2026-03-30

This release consolidates the parallel agent work into one official baseline for `BOMBA`.

### Gameplay

- Locked the project onto the `v0.1.0` package version.
- Added Crocodilo Arcano as a new skill-enabled roster character.
- Kept the signature skill roster modular across per-character files.
- Preserved the bomb hit-window regression coverage so spent flames do not keep dealing damage.
- Expanded gameplay regression coverage for bomb chains, shields, sprite rendering, skill contracts, and roster sync.

### Online

- Stabilized lobby and quick-match behavior around explicit room/session state handling.
- Added dedicated matchmaking session-state helpers and tests.
- Kept the Worker as the authoritative match source for online flows.
- Preserved character-skill mapping and online reconcile checks for networked gameplay parity.

### Presentation And Content

- Refreshed Nico and Crocodilo animation assets in the approved character manifests.
- Added the arena theme library and documentation for future map creation.
- Included multiple arena theme variants alongside the cleaner `tournament-clean` default direction.
- Added `public/social-preview.png` for release/share surfaces.

### Developer Workflow

- Replaced the old single-process `npm run dev` entry with a local launcher that starts both Vite and Wrangler.
- Added new test scripts for matchmaking state.
- Added new test scripts for online character selection.
- Added new test scripts for skill contract coverage.
- Added new test scripts for bomb chain reactions.
- Added new test scripts for roster manifest sync.
- Added repo hygiene rules to ignore root-level temporary screenshots and exported remote HTML snapshots.

### Release Notes

- `main` is intended to be the trusted release line after this consolidation.
- Documentation for the codebase, release scope, and operating principles now lives in [README.md](C:\Users\user\Desktop\AutoWebGame\README.md).

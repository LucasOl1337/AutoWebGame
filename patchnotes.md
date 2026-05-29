# Patch Notes

<!-- safe-commit:generated:start -->
Generated: 2026-05-29T11:23:31.323Z
Repository: AutoWebGame
Path: C:\projetos\AutoWebGame
Branch: main
Remote: https://github.com/LucasOl1337/AutoWebGame.git
GitHub baseline: origin/main
State before safe commit: dirty
Ahead/behind before safe commit: ahead 0, behind 0
Recent local file changes detected: 7
Recent local commit detected: no
Last commit: 2026-04-16T09:32:56-03:00 - autosync(autowebgame) DESKTOP-8VOS3G1 2026-04-16T09:32:56-03:00

## Executive Summary

This safe-commit report records the current PC state for AutoWebGame before committing the local work. Fetch from origin completed successfully before this report.
The comparison target is origin/main. The local branch is main, with ahead 0 and behind 0 relative to GitHub after fetch.
No Git merge conflict entries were detected in the current status.
GitHub did not report remote-only commits for this branch, or the upstream comparison is unavailable.

## PC Versus GitHub

### Working Tree Compared To GitHub
```text
 PATCHNOTES.md | 100 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 game.html     |   4 +++
 index.html    |   4 +++
 3 files changed, 108 insertions(+)
```

### File-Level Delta Against GitHub
```text
M	PATCHNOTES.md
M	game.html
M	index.html
```

### Local-Only Commits
- None.

### GitHub-Only Commits
- None.

## Local Working Tree

### Current Status
```text
## main...origin/main
 M PATCHNOTES.md
 M game.html
 M index.html
?? brand/
?? changelog.md
?? public/apple-touch-icon.png
?? public/favicon-32.png
?? public/favicon.svg
?? public/icon-512.png
 M PATCHNOTES.md
 M game.html
 M index.html
?? brand/
?? changelog.md
?? public/apple-touch-icon.png
?? public/favicon-32.png
?? public/favicon.svg
?? public/icon-512.png
```

### Unstaged Diff Stat
```text
 PATCHNOTES.md | 100 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 game.html     |   4 +++
 index.html    |   4 +++
 3 files changed, 108 insertions(+)
```

### Unstaged File Changes
```text
M	PATCHNOTES.md
M	game.html
M	index.html
```

### Staged Diff Stat
None.

### Staged File Changes
None.

## Recent Files On This PC
- game.html (2026-05-29T11:02:58.669Z)
- index.html (2026-05-29T11:02:58.668Z)
- brand (2026-05-29T03:14:47.687Z, dir)
- public/apple-touch-icon.png (2026-05-29T03:14:46.951Z)
- public/favicon-32.png (2026-05-29T03:14:47.687Z)
- public/favicon.svg (2026-05-29T03:13:14.159Z)
- public/icon-512.png (2026-05-29T03:14:46.196Z)

## Operational Notes

- These notes were generated before the final staging step for this safe commit.
- Existing local notes, when present, are preserved below this generated block instead of being discarded.
- Untracked files are listed through Git status; ignored build/cache folders are not forced into the commit.
- The intended commit message format is date plus state plus "safe commit".
<!-- safe-commit:generated:end -->

## Previous Local Notes Preserved

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

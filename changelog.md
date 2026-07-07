# Changelog

## [2026-07-07] - v0.2.3 Official Patch (Danger, powerups e lobby solido)

**Project:** AutoWebGame / BOMBA  |  **Branch:** main  |  **State:** v0.2.3 release candidate

### PC vs GitHub at Release Time
- Remote latest release before patch: `v0.2.2`, published on 2026-07-07T02:29:41Z.
- `origin/main` before patch: `602b5d7e989a6c0238263b40252bee2853903694`.
- Local integration: `codex-swarm` through `eac1a60` plus i18n storage guard evidence from `1813b99`.
- Conflicts resolved locally in runtime, UI, docs and tests before release docs/art generation.

### Summary of Changes Being Released
- Danger adrenaline step gives vulnerable players a small burst when escaping imminent blast tiles.
- Bomb kick gameplay now includes hot fuse, crate crack and combo reward behavior.
- Short fuse, perfect start and shield breakaway add more readable tactical power-up feedback.
- Shield block and power-up collection gained richer SFX and anti-stack handling.
- Feedback dialog, username guidance, manual room-code entry and arena theme selection are clearer.
- UI/i18n/session storage and telemetry are guarded against blocked or partial browser APIs.
- Online input direction is sanitized at the authoritative latch boundary.
- Character roster loading rejects duplicated/truncated public manifests and falls back to the approved roster.
- Round-start and round-end overlays were preserved during integration and revalidated.

### Multi-Agent Session Audit
- CODEX/codex-swarm: tracked changes found across local `swarm/*` branches/worktrees and integrated.
- CODEX/i18n-storage-guard: dedicated test evidence integrated; runtime behavior covered by shared storage helper.
- Claude: no post-`v0.2.2` versioned repo changes found.
- ZCode: no post-`v0.2.2` versioned repo changes found.
- Wispr Flow: no post-`v0.2.2` versioned repo changes found.

See `DocsDev/releases/release-v0.2.3.md` and `patchnotes.md` for the release notes and validation list.

---

## [2026-07-06] - v0.2.2 Official Patch (Arena UX + lobby resilience)

**Project:** AutoWebGame / BOMBA  |  **Branch:** main  |  **State:** v0.2.2 release candidate

### PC vs GitHub at Release Time
- Local HEAD: 17 code commits ahead of `origin/main` before release docs/art generation.
- Remote latest release: `v0.2.1`, published on 2026-07-06T18:07:52Z.
- Local integration: post-`v0.2.1` `swarm/*` work was cherry-picked/combined into `main`; conflicts in overlays/scripts were resolved.

### Summary of Changes Being Released
- Local bot matches now support selectable 1/2/3 bot intensity.
- Round start cue, local result shortcuts and clearer next-action overlays improve match flow.
- Lobby setup actions now require a live socket, and invite copy/join handling is more resilient.
- Landing can show recent session context; local match chrome hides online-only controls.
- HUD now flags critical danger and recent power-up pickups.
- Input handling prevents browser scroll from game keys.
- Storage and telemetry tolerate blocked/partial localStorage.
- SFX rate limits prevent same-frame bomb/pickup stacking.
- Sprite arena theme runtime paths are fixed.

### Multi-Agent Session Audit
- CODEX/swarm: tracked changes found across local `swarm/*` branches/worktrees and integrated.
- Claude: no post-`v0.2.1` versioned repo changes found.
- ZCode: no post-`v0.2.1` versioned repo changes found.
- Wispr Flow: no post-`v0.2.1` versioned repo changes found.

See `DocsDev/releases/release-v0.2.2.md` and `patchnotes.md` for the release notes and validation list.

---

## [2026-07-06] - v0.2.1 Official Patch (Bot polish + utility drops)

**Project:** AutoWebGame / BOMBA  |  **Branch:** main  |  **State:** v0.2.1 release candidate

### PC vs GitHub at Release Time
- Local HEAD: 11 commits ahead of `origin/main` before push.
- Remote latest release: `v0.2.0`, published on 2026-06-22.
- Local integration: `codex-swarm` and `swarm/fix-stuck-input-on-hide-20260706-1700` fast-forwarded into `main` without conflicts.

### Summary of Changes Being Released
- Bots now target live active opponents, avoid spawn-protected targets, and make safer patrol decisions.
- Utility powerups (`shield-up`, `bomb-pass-up`, `kick-up`) now appear in crate drops and HUD/test coverage.
- Hidden-tab/blur input state is cleared so local controls do not stay latched.
- Character roster loading falls back to the approved TypeScript manifest if the public manifest fails.
- Server tick clock is monotonic across invalid or backward Worker time samples.
- Bomb explosion SFX now alternates variants.
- Landing page now includes local controls reference copy.
- CodeGraph inventory and swarm coordination docs were added.

### Multi-Agent Session Audit
- CODEX/codex-swarm: tracked changes found and integrated.
- Claude: no post-`v0.2.0` versioned repo changes found.
- ZCode: no post-`v0.2.0` versioned repo changes found.
- Wispr Flow: no post-`v0.2.0` versioned repo changes found.

See `DocsDev/releases/release-v0.2.1.md` and `patchnotes.md` for the release notes and validation list.

---

## [2026-06-07] - Safe Commit Sync (Multi-Agent + PC vs GitHub Research)

**Project:** AutoWebGame  |  **Branch:** main  |  **State:** grokassets-clean

### PC vs GitHub at Research Time
- Local HEAD: post 2026-06-02+clean safe
- Remote: matches
- Ahead/Behind: 0 committed; dirty = grokassets deletes + mds M
- 24h: no new commits, uncommitted cleanup + doc refresh

### Summary of Changes Being Committed
Global grokassets deduplication: removal of per-project brand/pitch-deck/social assets (28+ pitch bg svgs, guidelines, banners, youtube headers, illustrations). Updated patchnotes + changelog documenting the sweep and PC vs GH (synced).

Part of cross-project cleanup (see LojaSync, LUCA-AI, Kamui, Yume, ChessCam, cortex-pessoal, etc. for same pattern).

See patchnotes.md for details, research, multi-agent note.

### Files
- M changelog.md, patchnotes.md
- D grokassets/**/* (brand consolidation)

---
Prior entries (2026-06-02 safe and before) in git history.
<!-- 2026-06-07 safe sync -->

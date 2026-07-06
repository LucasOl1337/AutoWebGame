# Changelog

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

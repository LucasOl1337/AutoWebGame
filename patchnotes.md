# Patch Notes - 2026-07-06 v0.2.1 Official Patch

**Project:** AutoWebGame / BOMBA
**Path:** C:\Projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-07-06
**State:** release candidate for `v0.2.1`

## Executive Summary

Patch `v0.2.1` consolidates the local work done after the official `v0.2.0` release. The GitHub cloud state (`origin/main`) was 11 commits behind local `main` after merging the swarm branch. Integration was clean: no Git conflicts, no dirty working tree before release docs/art generation, and the critical test sweep passed.

Main themes:
- Bot behavior is fairer in 3/4-player matches.
- Utility powerups are now real crate drops.
- Hidden-tab input latching is fixed.
- Character roster loading has a reliable approved-manifest fallback.
- Server tick timing is protected from clock regressions.
- Release documentation and CodeGraph guidance are current.

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| Latest release before patch | `v0.2.0` | `v0.2.0` | GitHub release published 2026-06-22. |
| Branch state before push | `main` ahead 11 | `origin/main` behind local | Local included CodeGraph docs and swarm gameplay fixes. |
| Integration | Fast-forward from swarm branch | Not yet pushed at audit time | No conflicts found. |
| Working tree | Clean before release prep | Clean remote | Release docs/art are the final local additions. |

## Sessions Checked Since v0.2.0

| Session / agent | Evidence checked | Changes found |
|-----------------|------------------|---------------|
| CODEX / codex-swarm | `git branch -vv --all`, reflog, worktrees, `DocsDev/swarm-coordination.md` | Yes: all gameplay, input, UX, docs and test commits in this patch. |
| Claude | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Claude after `v0.2.0`. |
| ZCode | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to ZCode after `v0.2.0`. |
| Wispr Flow | Text search, reflog, local branches and worktrees | No versioned repo changes attributable to Wispr Flow after `v0.2.0`. |

If Claude, ZCode or Wispr Flow worked outside Git or outside the inspected worktrees, that work did not leave a local versioned trace in this repository.

## Patch Notes Candidate

### Novidades

- **Utility drops nas crates:** `shield-up`, `bomb-pass-up` e `kick-up` agora entram no pool real de drops.
- **Referencia de controles locais:** landing mostra movimento, bomba e ultimate antes de iniciar partida contra bots.

### Melhorias

- **Bots miram melhor:** bots ignoram oponentes derrotados, priorizam alvos vivos e evitam perseguir inimigos com spawn protection.
- **Patrulha mais segura:** bot evita tiles que ficariam perigosos dentro da janela estrategica de chegada.
- **Explosoes menos repetitivas:** som de explosao alterna variantes existentes sem repetir back-to-back quando ha alternativa.

### Correcoes

- **Input sem travar:** blur/aba oculta limpa teclas seguradas, presses acumulados e prioridade de movimento.
- **Roster resiliente:** falha no manifest publico nao derruba mais o roster para placeholders.
- **Tick autoritativo monotonic:** amostras invalidas ou regressivas do relogio nao fazem o Worker voltar `lastUpdateAtMs`.

### Sistemas e QA

- **CodeGraph documentado:** inventario, contexto e mapa visual entram como referencia operacional.
- **Swarm coordination atualizado:** claims e evidencias do trabalho de agentes ficam rastreaveis.
- **Cobertura focada:** novos checks cobrem bot target, input visibility, roster fallback, SFX variation e server tick.

## Validation

Passed:
- `npm run build`
- `npm run compile:esm`
- `node tests/server-tick-catchup-check.mjs`
- `node tests/sound-manager-variation-check.mjs`
- `node tests/powerup-drop-rate-check.mjs`
- `node tests/powerup-hud-slots-check.mjs`
- `node tests/shield-powerup-check.mjs`
- `node tests/bomb-push-check.mjs`
- `node tests/character-roster-manifest-fallback-check.mjs`
- `node tests/character-roster-manifest-sync-check.mjs`
- `node tests/player-sprite-render-check.mjs`
- `node tests/bot-target-selection-check.mjs`
- `node tests/bot-intel-check.mjs`
- `node tests/bot-remote-detonation-check.mjs`
- `node tests/bot-survival-10s-check.mjs`
- `node tests/bot-opening-discipline-check.mjs`
- `node tests/bot-powerup-priority-check.mjs`
- `node tests/bot-spawn-protection-check.mjs`
- `node tests/input-visibility-clear-check.mjs`
- `node tests/input-transition-check.mjs`
- `node tests/lobby-rules-check.mjs`
- `node tests/matchmaking-session-state-check.mjs`
- `node tests/online-four-player-check.mjs`
- `node tests/online-character-selection-index-check.mjs`
- `node tests/server-character-skill-mapping-check.mjs`
- `node tests/character-skill-contract-check.mjs`
- `node tests/online-skill-reconcile-check.mjs`
- `node tests/bomb-hit-window-check.mjs`
- `node tests/bomb-chain-reaction-check.mjs`

## Files For This Release Prep

- `DocsDev/releases/release-v0.2.1.md`
- `DocsDev/releases/release-v0.2.1.json`
- `release-assets/v0.2.1-card.png`
- `patchnotes.md`
- `changelog.md`

---

# Patch Notes - 2026-06-07 (grokassets-clean) Safe Sync (PC vs GitHub Research)

**Project:** AutoWebGame (browser-based auto web game with animations, SFX, public assets, grokimagine, tests, Vite/TS, launcher)
**Path:** C:\projetos\AutoWebGame
**Branch:** main
**Generated:** 2026-06-07
**State:** grokassets-clean + mds update (dirty from deletes + changelog/patch touches) | Synced on prior commits (last safe 2026-06-02+clean)

## Executive Summary
Research via git status (heavy D in grokassets/brand/pitch-deck/social + M changelog.md + patchnotes.md), git log (last: 2026-06-02+clean safe commit), fetch (ahead 0 on committed), diff --stat (deletes of duplicated brand assets + md updates).

PC vs GitHub: committed tree in sync (or was at last safe). Current mutations are the systematic removal of per-project grokassets (pitch decks, banners, social headers, brand guidelines — now centralized in desktop GrokAssets or central repo) + refresh of patch/changelog by agents. No new feature code in this window beyond the cleanup and doc maintenance.

This is part of the global grokassets deduplication sweep across 15+ projects on the PC (AutoWebGame, LojaSync, LUCA-AI, Kamui, Yume, ChessCam, cortex-pessoal, etc.).

## Local PC vs GitHub Comparison

| Aspect | PC (Local) | GitHub (origin) | Notes |
|--------|------------|-----------------|-------|
| HEAD | (post 2026-06-02 safe) | matches on committed | Synced |
| Working tree | dirty (deletes + mds) | clean | grokassets cleanup + doc refresh |
| 24h commits | 0 new | 0 | Activity is uncommitted deletes/mds |
| Divergence | grokassets D + patch/changelog M | none | PC has the cleanup state |

### Key changes
**Deletes (grokassets consolidation):**
- grokassets/BRAND-USAGE-GUIDELINES.md , README.md
- grokassets/banners/marketing/pitch-deck/ (bg-v1.svg through bg-v28.svg — 28 files)
- Other grokassets/banners/social , youtube-channel , etc. (common pattern)

**Modified:**
- changelog.md , patchnotes.md (agent-driven updates + this research)

No major source code changes reported in this 24h dirty tree beyond maintenance.

## Multi-Agent Parallel Work & Conflict Handling
Many agents/loops performed parallel cleanup of duplicated brand assets (grokassets/*) across all active projects while also touching patchnotes/changelog in each. This created consistent "dirty" state with D files + M mds.

No conflicts. Current tree (deletes + updated mds) is the canonical PC snapshot of the dedup + doc sync.

Reconciliation: stage the deletes (intentional cleanup), the mds (with research), commit as safe checkpoint. Other projects (LojaSync, LUCA-AI, Kamui, Yume, ChessCam, etc.) received analogous treatment.

## Files for This Safe Commit
- patchnotes.md , changelog.md (updated with 2026-06-07 research)
- All grokassets/* deletes (brand centralization)
- Any other M from status

## Conclusion & Next
PC version researched vs GitHub (synced on code; local has grokassets cleanup + refreshed docs). Safe commit captures the ecosystem cleanup state.

**Commit message target:** `2026-06-07 (grokassets-clean) safe commit`

Push main. Next: verify no broken references to deleted assets (update any remaining docs/images if needed), continue game features/animations/tests as per prior roadmap.

See changelog.md. Prior 2026-06-02 content in history.

---
Prior patch (2026-06-02): clean safe state before this cleanup sweep. See git or previous file version.
(End of 2026-06-07.)

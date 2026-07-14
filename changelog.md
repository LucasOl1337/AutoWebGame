# Changelog

## [2026-07-14] — v0.4.3

- Bots passaram a avaliar melhor saturação, retorno e segurança de powerups, chutes e detonação remota.
- Combate ganhou feedback de bomba, pickup, chama, HUD, início e resultado de rodada.
- Online/Worker receberam correções de portal, jitter, reconnect, late join, deep routes e tick.
- Launcher, responsividade, acessibilidade, idioma e Como Jogar foram refinados.
- Telemetria, temas e lifecycle tiveram contratos corrigidos; 176/176 checks e audit com 0 vulnerabilidades.
- Lab local do TRAE foi arquivado e excluído por não estar pronto para produção.

Relatório: `DocsDev/releases/release-v0.4.3.md`.

---

## [2026-07-13] — v0.4.1

- Corrigida a prioridade de direção durante key repeat e ignoradas repetições órfãs.
- Restauradas limpeza de listeners e nova tentativa de playback no gerenciador de áudio.
- Reforçados retry/UUID de telemetria, fallback de sprites e testes de onboarding/Worker.
- Excluídos o protótipo Agent API revertido e o diretório interno `.swarm`.
- Release preparada localmente sem arte, push ou deploy.

Relatório: `DocsDev/releases/release-v0.4.1.md`.

---

## [2026-07-12] — v0.4.0

- Consolidadas 20 rodadas Trae de gameplay/bots sobre `v0.3.0`.
- Recuperadas correções órfãs e snapshots úteis de input, áudio, convite, mobile e Worker.
- Melhorados telegraph, pickup/HUD, drop pool, Sudden Death e prioridades dos bots.
- Corrigida a landing para 9 arenas/4 jogadores; adicionados safe areas, robots e sitemap.
- Worker ganhou cache de erro correto, arena ativa em memória e admin analytics sem leitura duplicada.
- Agent-First foi preservado como protótipo e adiado por riscos arquiteturais comprovados.
- Validação: 136/136 checks, build, audit, Wrangler dry-run e Chrome desktop/mobile.

Estado: publicado em produção nos dois domínios e validado por smoke test e paridade SHA-256 amostrada dos assets.

Relatório: `DocsDev/releases/release-v0.4.0.md`.

---

## [2026-07-10] - v0.3.0 Official Minor Release (Arenas, retomada online e combate mais legivel)

**Project:** AutoWebGame / BOMBA PvP  |  **Branch:** main  |  **State:** approved release

- Duas novas arenas: `tidal-foundry` e `ember-kiln`.
- Retomada segura de lobby/partida, cards de sala cheia/em andamento e lembretes de pronto.
- Personagem surpresa, pickup-chain guard, speed sparks, fuse curto visivel e bot revenge pressure.
- Landing/Como jogar mais acessiveis, copy comercial e recuperacao de bootstrap.
- Admin fail-closed, `ws` 8.21.0 e melhorias invisiveis de performance/qualidade.
- Validacao: build, audit de dependencias e 47/47 contratos focados.

Relatorio completo: `DocsDev/releases/release-v0.3.0.md`.

---

## [2026-07-08] - v0.2.5 Official Patch (Onboarding, QA e APIs mais rapidas)

**Project:** AutoWebGame / BOMBA  |  **Branch:** main  |  **State:** v0.2.5 release candidate

### PC vs GitHub at Release Time
- Remote latest release before patch: `v0.2.4`, published on 2026-07-08T18:42:01Z.
- `origin/main` before patch: `82222707698fbf6bbcc86ea869540e36c37d641d`.
- Local integration: selected clean post-`v0.2.4` Codex work from detached worktrees.
- Left out: direct `codex-swarm` merge and dirty worktrees `4f9a`/`58f1`.

### Summary of Changes Being Released
- Public `how-to-play.html` explains objective, controls, arena reading and first-match plan.
- Landing now links to the how-to-play guide.
- Commercial release smoke validates public promise, game route, legal pages, quick account, checkout, webhook-paid access, purchase copy and conversion telemetry.
- Worker public API routing now uses a precompiled dispatch table and has dedicated route-contract coverage.
- Release notes, JSON metadata and patch-card art were generated for the GitHub release.

### Multi-Agent Session Audit
- Codex / Ship commercial QA: tracked and integrated from detached worktree `7459d65`.
- Codex / How-to-play page: tracked and integrated from detached commits `72996ff` and `db07b4a`.
- Codex / Performance round 8: tracked and integrated from detached commits `5f9cec8` and `fcfa975`.
- Codex / codex-swarm: not integrated as a direct merge because it conflicts with current `main`.
- Claude, ZCode, Wispr Flow, OpenCode and Trae Work: no post-`v0.2.4` versioned AutoWebGame changes found in the inspected repo, branches, worktrees or `C:\Projetos\LucasOl`.

See `DocsDev/releases/release-v0.2.5.md` and `patchnotes.md` for the release notes and validation list.

---

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

# Mapa de audio

Atualizado em 2026-07-07 pelo loop `audio-variant-powerup-pickup`.

Fontes varridas: `src/Engine/sound-manager.ts`, disparos locais em `src/Engine/game-app.ts`,
ponte online em `src/NetCode/online-sync.ts` e assets em `public/Assets/SoundEffects`.

| Evento | Quando toca | Arquivo(s) | Status | Observacao |
|--------|-------------|------------|--------|------------|
| `bombPlace` | Jogador coloca bomba localmente; convidado online recebe bomba nova no snapshot | `bomb_place.mp3` | unico | Bom candidato futuro para 2-3 variantes curtas. |
| `bombExplode` | Bomba some/explode e cria flames | `bomb_explode_default.mp3`, `bomb_explode_main.mp3` | ok | Ja usa variantes e evita repetir a mesma quando ha alternativa. |
| `flames` | Novas flames aparecem na arena ou Crocodilo Arcano dispara surge | `flames.mp3` | unico | Bom candidato futuro para variantes secas de ignicao. |
| `matchStart` | Inicio/reinicio de partida local ou online | `match_start.mp3` | unico | Hoje e propositalmente baixo no manifesto. |
| `roundEnd` | Round resolve com vencedor ou double KO | `round_end.wav` | unico | Pode virar voz/anuncio PT/EN em sessao futura. |
| `matchWin` | Vitoria de partida completa | `match_win.mp3` | unico | Pode virar fanfarra com variantes ou anuncio localizado. |
| `powerCollect` | Jogador coleta qualquer powerup localmente; convidado online observa powerup coletado | `powerup_collect.mp3`, `powerup_collect_bright.mp3`, `powerup_collect_crystal.mp3` | ok | Esta sessao integrou variantes com volumes compensados por clip. |
| `suddenDeathAlarm` | Sudden death fica ativo | `sudden_death_alarm.wav` | unico | Intervalo minimo alto para nao martelar o jogador. |
| Quebra de crate | Crate e destruida e animacao `crateBreakAnimations` aparece | nenhum | mudo | Evento perceptivel, mas sem `SfxKey` dedicado hoje. |
| Jogador derrotado | `killPlayer` inicia animacao de morte | nenhum dedicado | mudo | O round pode tocar `roundEnd`, mas a derrota individual nao tem som proprio. |
| Escudo bloqueia dano | `shieldCharges` absorve hit antes de matar o jogador | nenhum | mudo | Candidato forte para SFX curto de bloqueio/deflexao. |

# Airtest Assets Toolkit

This folder is a curated extraction of the Airtest repository's `aircv` layer, narrowed to image matching workflows that fit this repo's game-asset pipeline.

What is included:
- Template matching for exact or near-exact sprite lookup
- Multi-scale template matching for resized assets or screenshots
- Image similarity scoring for asset diffs and validation
- A JSON CLI designed for agent use against `public/assets`

What is intentionally excluded:
- Android, iOS, Windows device drivers
- Airtest report generation
- Full mobile/app automation runtime

## Layout

- `agent_cli.py`: JSON-first command line entrypoint
- `src/autowebgame_airtest/`: extracted and adapted Airtest image modules
- `requirements.txt`: minimal runtime dependencies for this subset
- `NOTICE` and `LICENSE.Airtest`: attribution for the extracted code

## Bootstrap

From the repo root on Windows:

```powershell
py -3 -m venv .venv-airtest-assets
.\.venv-airtest-assets\Scripts\python.exe -m pip install --upgrade pip
.\.venv-airtest-assets\Scripts\python.exe -m pip install -r tools\airtest-assets\requirements.txt
```

## Commands

Health check:

```powershell
npm run airtest:doctor
```

Find one asset inside another image:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\airtest-assets.ps1 match `
  --source public\assets\characters\03a976fb-7313-4064-a477-5bb9b0760034\south.png `
  --search public\assets\characters\03a976fb-7313-4064-a477-5bb9b0760034\south.png `
  --algorithm template `
  --output output\airtest-self-match.png
```

Scan the asset tree for the best matches to one sprite:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\airtest-assets.ps1 scan-dir `
  --search public\assets\sprites\player1-south.png `
  --root public\assets `
  --limit 5
```

Compare two assets directly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\airtest-assets.ps1 compare `
  --source public\assets\sprites\player1-south.png `
  --search public\assets\sprites\player1-south.png `
  --rgb
```

## Agent-Facing Notes

- Commands emit JSON to stdout so agents can parse them directly.
- `scan-dir` defaults to this repo's `public/assets` when `--root` is omitted.
- `match` can optionally emit an annotated preview image with the detected rectangle.
- If dependencies are missing, `doctor` reports them without crashing.

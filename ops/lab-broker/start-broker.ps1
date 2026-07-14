$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtimeDir = Join-Path $env:LOCALAPPDATA "BombaPVP\lab-broker"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$secret = [Environment]::GetEnvironmentVariable("BOMBA_LAB_BROKER_SECRET", "User")
$nineRouterKey = [Environment]::GetEnvironmentVariable("BOMBA_LAB_NINE_ROUTER_KEY", "User")
if ([string]::IsNullOrWhiteSpace($secret) -or [string]::IsNullOrWhiteSpace($nineRouterKey)) {
  throw "BombaPVP Lab backend variables are not configured for this user."
}

$env:BROKER_HOST = "127.0.0.1"
$env:BROKER_PORT = "8766"
$env:BROKER_CORS_ORIGINS = "https://bombapvp.com"
$env:BROKER_INTERNAL_SECRET = $secret
$env:NINE_ROUTER_BASE_URL = "http://127.0.0.1:20128/v1"
$env:NINE_ROUTER_API_KEY = $nineRouterKey
$env:NINE_ROUTER_MODEL = "cx/gpt-5.6-sol"
$env:PYTHONUNBUFFERED = "1"
$env:PYTHONIOENCODING = "utf-8"

Set-Location $repo
python "auto-improvements\game_broker.py"

$ErrorActionPreference = "Stop"

$stableUrl = "https://lab-broker.bombapvp.com"
$secret = [Environment]::GetEnvironmentVariable("BOMBA_LAB_BROKER_SECRET", "User")
if ([string]::IsNullOrWhiteSpace($secret)) {
  exit 1
}

try {
  $health = Invoke-RestMethod -Uri "$stableUrl/health" -TimeoutSec 10
  $models = Invoke-RestMethod -Uri "$stableUrl/lab/models" -Headers @{
    "x-bomba-lab-secret" = $secret
  } -TimeoutSec 20
} catch {
  # DNS is not ready yet. The scheduled task will retry.
  exit 0
}

if (-not $health.ok -or -not $models.ok -or $models.source -ne "9router") {
  exit 0
}

$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repo
try {
  $stableUrl | npx wrangler secret put LAB_BROKER_URL
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

Unregister-ScheduledTask -TaskName "BombaPVP Lab DNS Cutover" -Confirm:$false -ErrorAction SilentlyContinue

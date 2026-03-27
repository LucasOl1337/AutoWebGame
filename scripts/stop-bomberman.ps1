Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$statePath = Join-Path $projectRoot ".bomberman-launcher.json"

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Host "Nenhum launcher ativo encontrado."
  exit 0
}

try {
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
} catch {
  Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  Write-Host "Estado antigo removido."
  exit 0
}

if ($state.pid) {
  try {
    Stop-Process -Id ([int]$state.pid) -Force -ErrorAction Stop
    Write-Host "Servidor do Bomberman encerrado."
  } catch {
    Write-Host "O servidor ja nao estava em execucao."
  }
}

Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue

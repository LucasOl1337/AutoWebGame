Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$distRoot = Join-Path $projectRoot "dist"
$statePath = Join-Path $projectRoot ".bomberman-launcher.json"
$serveScript = Join-Path $PSScriptRoot "serve-dist.ps1"

function Test-UrlReady([string]$url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-LauncherState {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }

  try {
    return Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
  } catch {
    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
    return $null
  }
}

function Save-LauncherState([int]$processId, [int]$port, [string]$url) {
  $payload = @{
    pid = $processId
    port = $port
    url = $url
    updatedAt = (Get-Date).ToString("o")
  } | ConvertTo-Json
  Set-Content -LiteralPath $statePath -Value $payload -Encoding UTF8
}

function Test-ProcessAlive([int]$processId) {
  try {
    $null = Get-Process -Id $processId -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Get-FreePort([int]$preferredPort) {
  for ($candidate = $preferredPort; $candidate -lt $preferredPort + 20; $candidate++) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $candidate)
    try {
      $listener.Start()
      return $candidate
    } catch {
    } finally {
      try {
        $listener.Stop()
      } catch {
      }
    }
  }

  throw "Could not reserve a free local port."
}

Push-Location $projectRoot
try {
  $existingState = Get-LauncherState
  if ($existingState -and $existingState.pid -and $existingState.url) {
    if ((Test-ProcessAlive ([int]$existingState.pid)) -and (Test-UrlReady $existingState.url)) {
      Start-Process $existingState.url | Out-Null
      Write-Host "Bomberman ja estava aberto em $($existingState.url)"
      exit 0
    }

    Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
  }

  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm nao foi encontrado. Instale o Node.js para usar o launcher."
  }

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    Write-Host "Instalando dependencias..."
    npm install
    if ($LASTEXITCODE -ne 0) {
      throw "Falha ao instalar dependencias."
    }
  }

  Write-Host "Preparando o Bomberman..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar a build do jogo."
  }

  if (-not (Test-Path -LiteralPath $distRoot)) {
    throw "A pasta dist nao foi gerada."
  }

  $port = Get-FreePort 4173
  $url = "http://127.0.0.1:$port/"
  $arguments = @(
    "-NoProfile"
    "-ExecutionPolicy"
    "Bypass"
    "-File"
    $serveScript
    "-Port"
    $port
    "-Root"
    $distRoot
  )

  $serverProcess = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru

  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-UrlReady $url) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    try {
      Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    } catch {
    }
    throw "O launcher nao conseguiu subir o servidor local."
  }

  Save-LauncherState $serverProcess.Id $port $url
  Start-Process $url | Out-Null
  Write-Host "Bomberman aberto em $url"
} finally {
  Pop-Location
}

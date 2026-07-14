$ErrorActionPreference = "Stop"

$tunnelId = [Environment]::GetEnvironmentVariable("BOMBA_LAB_TUNNEL_ID", "User")
if ([string]::IsNullOrWhiteSpace($tunnelId)) {
  throw "BOMBA_LAB_TUNNEL_ID is not configured for this user."
}

$credentials = Join-Path $env:USERPROFILE ".cloudflared\$tunnelId.json"
if (-not (Test-Path -LiteralPath $credentials)) {
  throw "Dedicated BombaPVP Lab tunnel credentials were not found."
}

$runtimeDir = Join-Path $env:LOCALAPPDATA "BombaPVP\lab-broker"
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$config = Join-Path $runtimeDir "named-tunnel.yml"
@"
tunnel: $tunnelId
credentials-file: $credentials
no-autoupdate: true

ingress:
  - hostname: lab-broker.bombapvp.com
    service: http://127.0.0.1:8766
  - service: http_status:404
"@ | Set-Content -LiteralPath $config -Encoding utf8
cloudflared tunnel --config $config run $tunnelId

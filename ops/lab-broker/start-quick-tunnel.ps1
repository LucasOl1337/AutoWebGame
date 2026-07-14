$ErrorActionPreference = "Stop"

# Temporary validation path used only while the dedicated hostname awaits its
# DNS CNAME. The generated trycloudflare.com URL changes after a restart. An
# explicit config prevents the machine-wide tunnel ingress from taking over.
$config = Join-Path $PSScriptRoot "quick-tunnel.yml"
cloudflared tunnel --config $config

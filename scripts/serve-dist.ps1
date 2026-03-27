param(
  [Parameter(Mandatory = $true)]
  [int]$Port,

  [Parameter(Mandatory = $true)]
  [string]$Root
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
if (-not (Test-Path -LiteralPath $resolvedRoot)) {
  throw "Static root not found: $resolvedRoot"
}

$mimeTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".ico" = "image/x-icon"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".svg" = "image/svg+xml"
  ".txt" = "text/plain; charset=utf-8"
  ".webp" = "image/webp"
}

function Get-ContentType([string]$path) {
  $extension = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
  if ($mimeTypes.ContainsKey($extension)) {
    return $mimeTypes[$extension]
  }
  return "application/octet-stream"
}

function Resolve-RequestPath([string]$rawPath) {
  $decoded = [System.Uri]::UnescapeDataString($rawPath)
  if ([string]::IsNullOrWhiteSpace($decoded) -or $decoded -eq "/") {
    $decoded = "/index.html"
  }

  $trimmed = $decoded.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $resolvedRoot $trimmed))
  if (-not $candidate.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $candidate = Join-Path $candidate "index.html"
  }

  return $candidate
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $requestPath = Resolve-RequestPath $context.Request.Url.AbsolutePath
      if (-not $requestPath) {
        $context.Response.StatusCode = 403
        continue
      }

      if (-not (Test-Path -LiteralPath $requestPath -PathType Leaf)) {
        $context.Response.StatusCode = 404
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($requestPath)
      $context.Response.StatusCode = 200
      $context.Response.ContentType = Get-ContentType $requestPath
      $context.Response.ContentLength64 = $bytes.LongLength
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $context.Response.StatusCode = 500
      $message = [System.Text.Encoding]::UTF8.GetBytes("Server error")
      $context.Response.OutputStream.Write($message, 0, $message.Length)
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}

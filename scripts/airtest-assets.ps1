param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CliArgs
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $repoRoot "tools\airtest-assets"
$cliPath = Join-Path $toolRoot "agent_cli.py"
$venvPython = Join-Path $repoRoot ".venv-airtest-assets\Scripts\python.exe"

if (Test-Path $venvPython) {
  & $venvPython $cliPath @CliArgs
  exit $LASTEXITCODE
}

$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
  & py -3 $cliPath @CliArgs
  exit $LASTEXITCODE
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
  & python $cliPath @CliArgs
  exit $LASTEXITCODE
}

Write-Error "Python was not found. Create .venv-airtest-assets or install Python 3 first."
exit 1

$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'
$accessPath = Join-Path $PSScriptRoot '.access-key.txt'

if (-not (Test-Path $envPath)) {
    Copy-Item (Join-Path $PSScriptRoot '.env.example') $envPath
}
$lines = @(Get-Content -LiteralPath $envPath)
$keyLine = $lines | Where-Object { $_ -match '^RESONANCE_ACCESS_KEY=(.+)$' } | Select-Object -Last 1
$key = ''
if ($keyLine) { $key = ($keyLine -replace '^RESONANCE_ACCESS_KEY=', '').Trim() }

if ([string]::IsNullOrWhiteSpace($key) -or $key -eq 'GENERATED_ON_FIRST_START') {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $lines = @($lines | Where-Object { $_ -notmatch '^RESONANCE_ACCESS_KEY=' })
    $lines += "RESONANCE_ACCESS_KEY=$key"
    Set-Content -LiteralPath $envPath -Value $lines -Encoding ASCII
}
Set-Content -LiteralPath $accessPath -Value $key -Encoding ASCII -NoNewline
Write-Host 'Resonance access key is ready.'

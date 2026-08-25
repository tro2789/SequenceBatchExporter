# Builds a signed, installable .zxp of the Sequence Batch Exporter panel.
# First run downloads ZXPSignCmd and generates a self-signed cert
# (Trevor O'Hare Productions); both are kept out of git.
# Output: dist\SequenceBatchExporter-v<version>.zxp
$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$tools = "$root\tools"
$cert  = "$root\cert\cert.p12"
$passFile = "$root\cert\cert-password.txt"
$signCmd  = "$tools\ZXPSignCmd.exe"

# 1. ZXPSignCmd (Adobe CEP-Resources, 4.1.3 x64)
if (-not (Test-Path $signCmd)) {
    New-Item -ItemType Directory -Force $tools | Out-Null
    Write-Host "Downloading ZXPSignCmd 4.1.3..."
    Invoke-WebRequest 'https://raw.githubusercontent.com/Adobe-CEP/CEP-Resources/master/ZXPSignCMD/4.1.3/x64/ZXPSignCmd.exe' -OutFile $signCmd
}

# 2. Self-signed certificate
if (-not (Test-Path $cert)) {
    New-Item -ItemType Directory -Force "$root\cert" | Out-Null
    $pass = [Guid]::NewGuid().ToString('N')
    Set-Content $passFile $pass -NoNewline
    Write-Host "Generating self-signed cert (Trevor O'Hare Productions)..."
    & $signCmd -selfSignedCert US MI "Trevor O'Hare Productions" "Trevor O'Hare Productions" $pass $cert
    if ($LASTEXITCODE -ne 0) { throw "cert generation failed" }
}
$pass = (Get-Content $passFile -Raw).Trim()

# 3. Version from manifest
[xml]$manifest = Get-Content "$root\CSXS\manifest.xml"
$version = $manifest.ExtensionManifest.ExtensionBundleVersion
if (-not $version) { throw "could not read ExtensionBundleVersion from manifest" }

# 4. Stage runtime files only (signature covers every file in the package)
$stage = "$root\dist\stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item "$root\CSXS" "$stage\" -Recurse
Copy-Item "$root\jsx"  "$stage\" -Recurse
Copy-Item "$root\js"   "$stage\" -Recurse
Copy-Item "$root\index.html" "$stage\"

# 5. Sign with timestamp
$zxp = "$root\dist\SequenceBatchExporter-v$version.zxp"
if (Test-Path $zxp) { Remove-Item -Force $zxp }
& $signCmd -sign $stage $zxp $cert $pass -tsa 'http://timestamp.digicert.com'
if ($LASTEXITCODE -ne 0) { throw "signing failed" }

# 6. Verify
& $signCmd -verify $zxp
if ($LASTEXITCODE -ne 0) { throw "verification failed" }

Remove-Item -Recurse -Force $stage
Write-Host "Built $zxp"
Write-Host "Users install it with ZXPInstaller (zxpinstaller.com) - no debug mode needed."

param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot ('artifacts/motiv-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip') }
$archivePath = [System.IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $archivePath) { throw 'Archive already exists; choose a new OutputPath.' }
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($archivePath)) | Out-Null
$files = [System.Collections.Generic.List[string]]::new()
$rootFiles = @('.env.example','.gitignore','.dockerignore','Caddyfile','Dockerfile','docker-compose.yml','README.md','next-env.d.ts','next.config.ts','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','postcss.config.mjs','tsconfig.json')
foreach ($name in $rootFiles) { $files.Add((Join-Path $projectRoot $name)) }
foreach ($folder in @('src','scripts','migrations','tests','public','docs')) {
  Get-ChildItem -LiteralPath (Join-Path $projectRoot $folder) -Recurse -File | ForEach-Object { $files.Add($_.FullName) }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $fullPath = [System.IO.Path]::GetFullPath($file)
    if (-not $fullPath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'File outside project root.' }
    $relative = $fullPath.Substring($projectRoot.Length + 1).Replace('\','/')
    if ($relative -match '(^|/)\.env($|\.)' -and $relative -ne '.env.example') { throw 'Refusing to include an environment secret file.' }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $fullPath, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
Write-Output $archivePath

# 把仓库里的 <YOU> / <YOUR NAME> 占位符替换成你自己的信息
#
#   ./scripts/set-owner.ps1 -Owner your-github-name -Name "Your Real Name"
#
# 会改写：README.md、README.en.md、LICENSE、packages/*/package.json
# 幂等：重复执行只替换仍存在的占位符。

[CmdletBinding()]
param(
    [string]$Owner,
    [string]$Name = ''
)

$ErrorActionPreference = 'Stop'

# 不传 -Owner 时退回 git 全局 user.name（很多人的 GitHub 用户名与它一致）
if (-not $Owner -or $Owner.Trim().Length -eq 0) {
    $detected = ''
    try { $detected = (git config --global user.name) } catch { $detected = '' }
    if ($detected -and $detected -match '^[A-Za-z0-9-]+$') {
        $Owner = $detected.Trim()
        Write-Host "未指定 -Owner，使用 git 配置里的用户名：$Owner" -ForegroundColor Yellow
    }
}

if (-not $Owner -or $Owner.Trim().Length -eq 0) {
    throw "缺少 -Owner。用法：./scripts/set-owner.ps1 -Owner 你的GitHub用户名"
}
$Owner = $Owner.Trim()
if ($Owner -match '[^A-Za-z0-9-]') {
    Write-Host "GitHub 用户名只能包含字母、数字和连字符，收到的是：$Owner" -ForegroundColor Red
    Write-Host "把命令里的占位符换成真实用户名再执行，例如：" -ForegroundColor Yellow
    Write-Host "  ./scripts/set-owner.ps1 -Owner Moqianying -Name `"Moqianying`"" -ForegroundColor Yellow
    throw "非法的 -Owner：$Owner"
}
if (-not $Name -or $Name.Trim().Length -eq 0) { $Name = $Owner }

$repo = Split-Path -Parent $PSScriptRoot
$encoding = New-Object System.Text.UTF8Encoding($false)
$targets = @(
    (Join-Path $repo 'README.md'),
    (Join-Path $repo 'README.en.md'),
    (Join-Path $repo 'LICENSE')
)
$targets += (Get-ChildItem -Path (Join-Path $repo 'packages') -Recurse -Filter 'package.json' | ForEach-Object { $_.FullName })

$changed = 0
foreach ($file in $targets) {
    if (-not (Test-Path $file)) { continue }
    $text = [System.IO.File]::ReadAllText($file, $encoding)
    $before = $text
    $text = $text.Replace('<YOU>', $Owner).Replace('<YOUR NAME>', $Name)
    if ($text -ne $before) {
        [System.IO.File]::WriteAllText($file, $text, $encoding)
        Write-Host "  updated $($file.Substring($repo.Length + 1))"
        $changed++
    }
}

Write-Host ''
if ($changed -eq 0) {
    Write-Host '没有需要替换的占位符（可能已经执行过）。' -ForegroundColor Yellow
} else {
    Write-Host "已替换 $changed 个文件：owner=$Owner name=$Name" -ForegroundColor Green
}
Write-Host '下一步：git init -b main && git add . && git commit -m "feat: init" && git push'

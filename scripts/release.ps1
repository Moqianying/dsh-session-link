# 打 tag 并（可选）建 GitHub Release（第 3 项：版本与发布）
#
#   ./scripts/release.ps1 -DryRun              # 只打印将要执行什么
#   ./scripts/release.ps1 -Version 0.1.0       # 跑测试 → 打注释 tag → push tag
#   ./scripts/release.ps1 -Version 0.1.0 -CreateRelease   # 再用 gh 建 Release
#
# 前置：工作区干净、当前分支 main、已配置 origin。
# 会先跑一遍 verify（等同 CI）；失败就中止，不会留下 tag。

[CmdletBinding()]
param(
    [string]$Version = '0.1.0',
    [switch]$CreateRelease,
    [switch]$SkipTests,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$tag = "v$Version"
$notesFile = Join-Path (Join-Path $repo 'docs') 'RELEASE-SUMMARY.md'

function Get-Command-Or-Empty([string]$name) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return ''
}

Write-Host "目标 tag : $tag"

# ---- 前置检查 ----
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "当前分支 : $branch"
if ($branch -ne 'main') { throw "请在 main 上发版（当前 $branch）" }

$dirty = git status --porcelain
if ($dirty) {
    if ($DryRun) {
        Write-Host '（dry-run）注意：工作区不干净，真实发版会被拒绝：' -ForegroundColor Yellow
        Write-Host $dirty
        Write-Host ''
    } else {
        Write-Host $dirty
        throw '工作区不干净：先 commit 或 stash 再发版'
    }
}

$remotes = git remote
if (-not $remotes) { throw '没有配置 origin：先 git remote add origin <url>' }

$existing = git tag --list $tag
if ($existing) {
    if ($DryRun) { Write-Host "（dry-run）注意：tag $tag 已存在，真实发版会被拒绝" -ForegroundColor Yellow }
    else { throw "tag $tag 已存在" }
}

# ---- 测试 ----
if (-not $SkipTests) {
    Write-Host ''
    Write-Host '先跑 verify.ps1（等同 CI）…' -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host '[dry-run] powershell -File scripts/verify.ps1' -ForegroundColor Yellow
    } else {
        & (Join-Path $PSScriptRoot 'verify.ps1')
        if ($LASTEXITCODE -ne 0) { throw 'verify 失败，已中止发版' }
    }
}

# ---- tag ----
$message = "dsh-session-link $tag"
if ($DryRun) {
    Write-Host "[dry-run] git tag -a $tag -m `"$message`"" -ForegroundColor Yellow
    Write-Host "[dry-run] git push origin $tag" -ForegroundColor Yellow
    if ($CreateRelease) {
        Write-Host "[dry-run] gh release create $tag --title `"$tag`" --notes-file docs/RELEASE-SUMMARY.md" -ForegroundColor Yellow
    }
    exit 0
}

git tag -a $tag -m $message
if ($LASTEXITCODE -ne 0) { throw 'git tag 失败' }
Write-Host "  已创建 tag $tag" -ForegroundColor Green

git push origin $tag
if ($LASTEXITCODE -ne 0) { throw "git push origin $tag 失败（tag 已建在本地，可稍后重推）" }
Write-Host '  已推送 tag' -ForegroundColor Green

# ---- Release ----
if ($CreateRelease) {
    $gh = Get-Command-Or-Empty 'gh'
    if (-not $gh) {
        Write-Host '没有 gh：去网页 Releases → Draft a new release → 选 tag 粘贴说明。' -ForegroundColor Yellow
        Write-Host "  说明文件：$notesFile"
        exit 0
    }
    if (-not (Test-Path $notesFile)) {
        Write-Host "缺少 $notesFile，跳过自动创建 Release（可在网页手填）" -ForegroundColor Yellow
        exit 0
    }
    & gh release create $tag --title $tag --notes-file $notesFile
    if ($LASTEXITCODE -ne 0) { throw 'gh release create 失败' }
    Write-Host '  已创建 Release' -ForegroundColor Green
}

Write-Host ''
Write-Host "完成：$tag 已发布。别人的固定版本装法：" -ForegroundColor Green
Write-Host "  git clone --branch $tag https://github.com/$(($remotes | Select-Object -First 1))/...  (或网页 Download ZIP)"

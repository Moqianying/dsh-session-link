# 填仓库的 About 描述与 Topics（免 token：走 gh 的浏览器登录）
#
#   ./scripts/set-repo-meta.ps1            # gh 已登录 → 直接写入
#   ./scripts/set-repo-meta.ps1 -Login     # gh 未登录 → 先启动浏览器登录再写入
#   ./scripts/set-repo-meta.ps1 -DryRun    # 只打印将要做什么
#
# 需要手工 PAT 的旧路径仍然保留为兜底：-Token ghp_xxx（不推荐，会把 token 留在历史里）。
#
# 一次性准备（只需做一次）：
#   winget install --id GitHub.cli -e
#   gh auth login --hostname github.com --git-protocol https --web

[CmdletBinding()]
param(
    [string]$Owner = 'Moqianying',
    [string]$Repo = 'dsh-session-link',
    [string]$Description = 'Link any set of dsh sessions into groups so they share memory.',
    [string[]]$Topics = @('deepseek-harness', 'dsh-plugin', 'cordis', 'session-memory', 'llm'),
    [string]$Token = '',
    [switch]$Login,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib-gh.ps1')

$slug = "$Owner/$Repo"

Write-Host "仓库     : $slug"
Write-Host "描述     : $Description"
Write-Host "Topics   : $($Topics -join ', ')"
Write-Host ''

if ($DryRun) {
    Write-Host ("[dry-run] gh repo edit {0} --description `"{1}`" --add-topic {2}" -f $slug, $Description, ($Topics -join ' --add-topic ')) -ForegroundColor Yellow
    $gh = Get-GhPath
    if ($gh) {
        Write-Host "gh: $gh"
        Write-Host ("gh 已登录: {0}" -f (Test-GhAuth -GhPath $gh))
    } else {
        Write-Host 'gh 未安装（真实执行时会提示 winget install --id GitHub.cli -e）'
    }
    exit 0
}

# ---------- 首选：gh（浏览器登录，无需 PAT） ----------
if (-not $Token) {
    $gh = Resolve-Gh -Login:$Login
    if (-not $gh) {
        Write-Host ''
        Write-Host '也可以直接用网页完成（30 秒）：' -ForegroundColor Yellow
        Write-Host "  1. 打开 https://github.com/$slug"
        Write-Host '  2. 右侧 About 旁的齿轮 → Description 粘贴上面那段 → Topics 逐个粘贴'
        Write-Host '  3. Save changes'
        exit 2
    }

    Write-Host '用 gh 写入…' -ForegroundColor Cyan
    $arguments = @('repo', 'edit', $slug, '--description', $Description)
    foreach ($topic in $Topics) { $arguments += @('--add-topic', $topic) }
    & $gh @arguments
    if ($LASTEXITCODE -ne 0) { throw 'gh repo edit 失败（检查 gh auth status 与仓库权限）' }

    $json = & $gh repo view $slug --json description,repositoryTopics,homepageUrl 2>$null
    Write-Host ''
    Write-Host '完成 ✅' -ForegroundColor Green
    Write-Host $json
    exit 0
}

# ---------- 兜底：REST + PAT ----------
Write-Host '用 REST 写入（PATCH description + PUT topics）…' -ForegroundColor Cyan
$headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = 'application/vnd.github+json'
    'User-Agent'           = 'dsh-session-link-meta'
    'X-GitHub-Api-Version' = '2022-11-28'
}
$body = @{ description = $Description; homepage = "https://github.com/$slug" } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "https://api.github.com/repos/$slug" -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
Write-Host '  description ok'
$topicsBody = @{ names = $Topics } | ConvertTo-Json
Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$slug/topics" -Headers $headers -Body $topicsBody -ContentType 'application/json' | Out-Null
Write-Host '  topics ok'

$check = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$slug" -Headers $headers
Write-Host ''
Write-Host "完成：description=[$($check.description)]" -ForegroundColor Green
Write-Host "      topics=$($check.topics -join ', ')" -ForegroundColor Green

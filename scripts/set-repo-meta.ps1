# 填仓库的 About 描述与 Topics（第 2 项：仓库元信息）
#
# 优先用已登录的 gh CLI；没有 gh 就用 -Token 走 REST。
#
#   ./scripts/set-repo-meta.ps1 -DryRun                 # 只打印将要做什么
#   ./scripts/set-repo-meta.ps1                        # 用 gh（gh auth login 之后）
#   ./scripts/set-repo-meta.ps1 -Token ghp_xxx         # 没有 gh 时用 PAT（需要 repo 权限）
#
# 注意：-Token 会留在 PowerShell 历史里，建议改用 gh，或 $env:GITHUB_TOKEN。

[CmdletBinding()]
param(
    [string]$Owner = 'Moqianying',
    [string]$Repo = 'dsh-session-link',
    [string]$Description = 'Link any set of dsh sessions into groups so they share memory.',
    [string[]]$Topics = @('deepseek-harness', 'dsh-plugin', 'cordis', 'session-memory', 'llm'),
    [string]$Token = $env:GITHUB_TOKEN,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$slug = "$Owner/$Repo"

Write-Host "仓库     : $slug"
Write-Host "描述     : $Description"
Write-Host "Topics   : $($Topics -join ', ')"
Write-Host ''

if ($DryRun) {
    Write-Host ("[dry-run] gh repo edit {0} --description `"{1}`" --add-topic {2}" -f $slug, $Description, ($Topics -join ' --add-topic ')) -ForegroundColor Yellow
    Write-Host ("[dry-run] PATCH https://api.github.com/repos/{0}  body={1}" -f $slug, (@{ description = $Description; homepage = "https://github.com/$slug" } | ConvertTo-Json -Compress)) -ForegroundColor Yellow
    Write-Host ("[dry-run] PUT   https://api.github.com/repos/{0}/topics  body={1}" -f $slug, (@{ names = $Topics } | ConvertTo-Json -Compress)) -ForegroundColor Yellow
    exit 0
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh -and -not $Token) {
    Write-Host '用 gh CLI 写入…' -ForegroundColor Cyan
    $args = @('repo', 'edit', $slug, '--description', $Description)
    foreach ($topic in $Topics) { $args += @('--add-topic', $topic) }
    & gh @args
    if ($LASTEXITCODE -ne 0) { throw "gh repo edit 失败（先 gh auth login）" }
    Write-Host '完成（gh）。' -ForegroundColor Green
    exit 0
}

if (-not $Token) {
    Write-Host '既没有 gh 也没有 -Token，改用网页最快：' -ForegroundColor Yellow
    Write-Host "  1. 打开 https://github.com/$slug"
    Write-Host '  2. 右侧 About 旁齿轮 → Description 粘贴上面那段 → Topics 逐个粘贴'
    Write-Host '  3. Save changes'
    exit 2
}

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

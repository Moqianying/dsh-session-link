# 截图采集助手（第 4 项）
#
#   ./scripts/capture.ps1            # 打印采集清单并打开需要的两个页面
#   ./scripts/capture.ps1 -NoOpen    # 只打印清单
#
# 采完把文件命名成 docs/preview/settings.png 与 docs/preview/preview.png，
# 再按 docs/preview/README.md 里的片段把图嵌进根 README。

[CmdletBinding()]
param(
    [switch]$NoOpen,
    [string]$BaseUrl = 'http://127.0.0.1:3080'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path (Join-Path $repo 'docs') 'preview'

Write-Host '把截图放到：' -NoNewline
Write-Host $outDir -ForegroundColor Cyan
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

Write-Host ''
Write-Host '建议尺寸：1280×800（或 1600×1000），深色主题，浏览器缩放 100%。' -ForegroundColor Yellow
Write-Host ''
Write-Host '=== 图 1：设置页（docs/preview/settings.png）===' -ForegroundColor Cyan
Write-Host '  1. 打开设置 → 会话互联'
Write-Host '  2. 建一个组（例如「研究线」），勾 3 个会话，其中 1 个不勾'
Write-Host '  3. 点其中一个会话的 👁 让预览展开，停在「它收到的记忆」页签'
Write-Host '  4. 截图范围：设置面板整体（含左侧导航高亮项），别截到桌面'
Write-Host '  5. 隐私：若会话标题里有真实项目名/人名，先改成本地名或截图后打码'
Write-Host ''
Write-Host '=== 图 2：双视角对比（docs/preview/preview.png）===' -ForegroundColor Cyan
Write-Host '  1. 同一个会话点 👁 展开预览'
Write-Host '  2. 先截「它收到的记忆」，再切到「它会提供的内容」截一张'
Write-Host '  3. 两张可以竖向拼接，或各存一张：preview-receive.png / preview-provide.png'
Write-Host ''
Write-Host '=== 可选：独立选择页（docs/preview/ui.png）===' -ForegroundColor Cyan
Write-Host "  $BaseUrl/api/session-link/ui"
Write-Host ''

if (-not $NoOpen) {
    Write-Host '正在打开需要的页面…' -ForegroundColor Green
    try { Start-Process $BaseUrl } catch { Write-Host "  打不开 $BaseUrl（dsh web 没在跑？）" -ForegroundColor Yellow }
    try { Start-Process "$BaseUrl/api/session-link/ui" } catch { Write-Host "  打不开 $BaseUrl/api/session-link/ui" -ForegroundColor Yellow }
}

Write-Host ''
Write-Host '截完检查：' -ForegroundColor Green
$images = Get-ChildItem $outDir -File -Include *.png,*.jpg,*.jpeg,*.webp -ErrorAction SilentlyContinue
if ($images) {
    $images | ForEach-Object { "  + $($_.Name)  $([math]::Round($_.Length/1KB,1)) KB" }
} else {
    Write-Host '  （还没有图片；docs/preview/README.md 里有嵌入 README 的片段）' -ForegroundColor Yellow
}

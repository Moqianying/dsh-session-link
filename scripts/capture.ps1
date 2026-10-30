# 截图采集助手
#
#   ./scripts/capture.ps1            # 打印采集清单并打开需要的两个页面
#   ./scripts/capture.ps1 -NoOpen    # 只打印清单
#
# 采完把文件命名成 docs/preview/settings.png 与 docs/preview/preview.png，
# 再按 docs/preview/README.md 里的片段把图嵌进根 README（先提交图片，再改 markdown）。

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
Write-Host '=== 硬性要求 ===' -ForegroundColor Yellow
Write-Host '  尺寸     : 1200-1600 px 宽，16:10 左右，PNG，单张 < 500 KB'
Write-Host '  缩放     : Windows 显示缩放 100%，浏览器缩放 100%（否则字发虚）'
Write-Host '  主题     : 深色（与 README 一致）'
Write-Host '  裁剪     : 只截应用窗口，不含桌面壁纸 / 任务栏 / 其它标签页'
Write-Host ''
Write-Host '=== 截图前请清理 ===' -ForegroundColor Yellow
Write-Host '  - 关掉个人化皮肤与右下角桌面挂件（别让人以为是插件自带）'
Write-Host '  - 会话标题里的真实项目名/人名 → 改成本地示例或打码'
Write-Host '  - 用户名、邮箱、头像、token、内网 URL 不要进画面'
Write-Host ''

Write-Host '=== 图 1：设置页 → docs/preview/settings.png ===' -ForegroundColor Cyan
Write-Host '  1. 打开 设置 → 会话互联（让左侧导航高亮停在它上面）'
Write-Host '  2. 建一个组（例如「研究线」），勾 3 个会话，留 1 个不勾'
Write-Host '  3. 点其中一个会话的 👁，让预览面板展开，停在「它收到的记忆」页签'
Write-Host '  4. 必须可见：链环图标、组标签（含人数）、副标题「共 N 个会话 · M 个链接组」'
Write-Host ''
Write-Host '=== 图 2：双视角对比 → docs/preview/preview.png ===' -ForegroundColor Cyan
Write-Host '  1. 同一个会话点 👁 展开预览'
Write-Host '  2. 先截「它收到的记忆」，再切到「它会提供的内容」截一张'
Write-Host '  3. 两张竖向拼接，或分别存 preview-receive.png / preview-provide.png 后并排'
Write-Host ''
Write-Host '=== 图 3（可选）：独立选择页 → docs/preview/ui.png ===' -ForegroundColor Cyan
Write-Host "  $BaseUrl/api/session-link/ui"
Write-Host ''
Write-Host '=== 采集动作 ===' -ForegroundColor Cyan
Write-Host '  Win + Shift + S 框选窗口区域；或 Alt + PrtScn 截当前窗口'
Write-Host ''

if (-not $NoOpen) {
    Write-Host '正在打开需要的页面…' -ForegroundColor Green
    try { Start-Process $BaseUrl } catch { Write-Host "  打不开 $BaseUrl（dsh web 没在跑？）" -ForegroundColor Yellow }
    try { Start-Process "$BaseUrl/api/session-link/ui" } catch { Write-Host "  打不开 $BaseUrl/api/session-link/ui" -ForegroundColor Yellow }
}

Write-Host ''
Write-Host '截完检查（单张应 < 500 KB）：' -ForegroundColor Green
$images = Get-ChildItem $outDir -File -Include *.png,*.jpg,*.jpeg,*.webp -ErrorAction SilentlyContinue
if ($images) {
    foreach ($image in $images) {
        $kb = [math]::Round($image.Length / 1KB, 1)
        $flag = if ($kb -gt 500) { '  ← 偏大，建议压缩' } else { '' }
        "  + $($image.Name)  $kb KB$flag"
    }
} else {
    Write-Host '  （还没有图片；docs/preview/README.md 里有嵌入 README 的片段）' -ForegroundColor Yellow
}
Write-Host ''
Write-Host '最后两步：' -ForegroundColor Green
Write-Host '  1. git add docs/preview/*.png && git commit -m "docs: add UI screenshots" && git push'
Write-Host '  2. 再把 docs/preview/README.md 里的 markdown 片段贴到 README（先图后 markdown，否则碎图标）'

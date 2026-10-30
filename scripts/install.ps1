# 把 dsh-session-link 装进一个 dsh profile（Windows PowerShell）
#
#   ./scripts/install.ps1                        # 装到 $env:DSH_HOME 或 ~\.dsh 的 web profile
#   ./scripts/install.ps1 -DshHome D:\dsh -Profile web -WithDiag
#
# 做两件事（幂等，可重复执行）：
#   1. 复制 packages/* 到 <profile>\node_modules\
#   2. 在 <profile>\cordis.patch.yml 里维护一段标记块
#
# 卸载：删掉 node_modules 里那三个目录 + 删掉 patch 里的标记块。

[CmdletBinding()]
param(
    [string]$DshHome,
    [string]$Profile = 'web',
    [switch]$WithDiag
)

$ErrorActionPreference = 'Stop'

if (-not $DshHome -or $DshHome.Trim().Length -eq 0) {
    $DshHome = if ($env:DSH_HOME -and $env:DSH_HOME.Trim().Length -gt 0) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
}
$repo = Split-Path -Parent $PSScriptRoot
$profileDir = Join-Path (Join-Path $DshHome 'profiles') $Profile
if (-not (Test-Path $profileDir)) {
    throw "找不到 profile 目录：$profileDir`n先用 dsh 启动过一次 '$Profile' profile（dsh --profile $Profile）。"
}

$nodeModules = Join-Path $profileDir 'node_modules'
New-Item -ItemType Directory -Force -Path $nodeModules | Out-Null

$packages = @('dsh-session-link', 'dsh-session-link-client', 'dsh-session-link-preview')
if ($WithDiag) { $packages += 'dsh-session-link-diag' }

Write-Host "[1/2] 复制包到 $nodeModules"
foreach ($name in $packages) {
    $src = Join-Path (Join-Path $repo 'packages') $name
    if (-not (Test-Path $src)) { throw "仓库里缺少 packages\$name" }
    $dst = Join-Path $nodeModules $name
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $src $dst -Recurse -Force
    Write-Host "      + $name"
}

Write-Host "[2/2] 更新 $profileDir\cordis.patch.yml"
$begin = '# >>> dsh-session-link (managed block; 由 scripts/install 维护，删除即卸载) >>>'
$end = '# <<< dsh-session-link <<<'

$rows = @(
    '- insert:',
    '    - id: session-link',
    '      name: dsh-session-link',
    '      config:',
    '        enabled: true',
    '        autoInject: true',
    '    - id: session-link-client',
    '      name: dsh-session-link-client',
    '    - id: session-link-preview',
    '      name: dsh-session-link-preview'
)
if ($WithDiag) {
    $rows += @(
        '    - id: session-link-diag',
        '      name: dsh-session-link-diag'
    )
}
$block = ($begin, ($rows -join "`n"), $end) -join "`n"

$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$encoding = New-Object System.Text.UTF8Encoding($false)
$text = if (Test-Path $patchPath) { [System.IO.File]::ReadAllText($patchPath, $encoding) } else { "# dsh profile patch layer`n[]`n" }

$pattern = [regex]::Escape($begin) + '[\s\S]*?' + [regex]::Escape($end)
if ([regex]::IsMatch($text, $pattern)) {
    $text = [regex]::Replace($text, $pattern, $block)
    Write-Host '      已更新既有标记块'
} elseif ($text -match '(?m)^\s*name:\s*dsh-session-link\s*$') {
    # 已经有手工挂载行：不要重复插入同一 id，只提示
    Write-Host '      检测到已存在手工的 dsh-session-link 挂载行，跳过 patch 写入（避免重复 id）' -ForegroundColor Yellow
} else {
    if (-not $text.EndsWith("`n")) { $text += "`n" }
    $text += "`n$block`n"
    Write-Host '      已追加标记块'
}
[System.IO.File]::WriteAllText($patchPath, $text, $encoding)

Write-Host ''
Write-Host '完成。下一步：' -ForegroundColor Green
Write-Host '  1. 刷新浏览器页面（Ctrl+R）：设置面板应出现「会话互联」'
Write-Host '  2. 打开 /api/session-link/diag 可确认浏览器 bundle 已被收录（装 diag 时）'
Write-Host '  3. dsh 的 patchReload: live 会热加载；若没有生效，重启 dsh web'

# 本地跑一遍"等同 CI"的检查（GitHub Actions 队列卡住时用它兜底）
#
#   ./scripts/verify.ps1                 # 语法 + JSON + 客户端测试（+ 有会话就跑宿主测试）
#   ./scripts/verify.ps1 -Offline        # 额外强制跑宿主离线测试（没有会话会失败）
#
# 退出码 0 = 全绿；非 0 = 有检查失败，可直接当提交前钩子用。

[CmdletBinding()]
param(
    [switch]$Offline,
    [string]$SessionsDir
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

$failures = New-Object System.Collections.Generic.List[string]

function Step([string]$name, [scriptblock]$body) {
    Write-Host ''
    Write-Host "== $name ==" -ForegroundColor Cyan
    try {
        & $body
        Write-Host "   ok" -ForegroundColor Green
    } catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $script:failures.Add($name)
    }
}

Step 'node --version' {
    node --version
    if ($LASTEXITCODE -ne 0) { throw 'node 不可用' }
}

Step '语法检查（5 个入口文件）' {
    $files = @(
        'packages/dsh-session-link/index.js',
        'packages/dsh-session-link-preview/index.js',
        'packages/dsh-session-link-preview/lib/impl.js',
        'packages/dsh-session-link-client/client.js',
        'packages/dsh-session-link-client/index.js'
    )
    foreach ($file in $files) {
        node --check $file
        if ($LASTEXITCODE -ne 0) { throw "语法错误：$file" }
        Write-Host "   ok  $file"
    }
}

Step 'package.json 合法性' {
    node scripts/check-package-json.cjs
    if ($LASTEXITCODE -ne 0) { throw 'JSON 校验失败' }
}

Step '客户端冒烟测试（迷你 React，无需浏览器）' {
    node test/client-smoke.cjs
    if ($LASTEXITCODE -ne 0) { throw 'client-smoke 失败' }
}

Step '宿主离线测试（需要真实会话文件）' {
    if ($SessionsDir) { $env:DSH_SESSIONS_DIR = $SessionsDir }
    if (-not $env:DSH_SESSIONS_DIR -and -not $Offline) {
        Write-Host '   跳过：未指定 -SessionsDir / DSH_SESSIONS_DIR（用 -Offline 可强制）' -ForegroundColor Yellow
        return
    }
    node test/offline-test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'offline-test 失败' }
}

Write-Host ''
if ($failures.Count -eq 0) {
    Write-Host '全部检查通过 ✅' -ForegroundColor Green
    exit 0
}
Write-Host ("失败项：" + ($failures -join ' / ')) -ForegroundColor Red
exit 1

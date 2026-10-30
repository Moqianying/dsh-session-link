# gh（GitHub CLI）相关的共用小工具，被 set-repo-meta.ps1 / release.ps1 dot-source。
# 目标：走浏览器登录，全程不需要手工创建 PAT。

function Get-GhPath {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        (Join-Path $env:ProgramFiles 'GitHub CLI\gh.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'GitHub CLI\gh.exe'),
        (Join-Path $env:LOCALAPPDATA 'GitHubCLI\gh.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

function Test-GhAuth {
    param([string]$GhPath)
    if (-not $GhPath) { return $false }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $GhPath auth status *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Write-GhSetupHint {
    Write-Host '需要 GitHub CLI 并登录一次（浏览器流程，不需要建 PAT）：' -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  1) 安装（已装可跳过）：'
    Write-Host '       winget install --id GitHub.cli -e'
    Write-Host '  2) 登录（会弹出浏览器，点一次 Authorize）：'
    Write-Host '       gh auth login --hostname github.com --git-protocol https --web'
    Write-Host ''
    Write-Host '  登录后确认：gh auth status'
    Write-Host ''
    Write-Host '说明：装完 gh 后当前终端可能还找不到命令，重开一个终端即可。'
}

function Invoke-GhLogin {
    param([string]$GhPath)
    if (-not $GhPath) { return $false }
    Write-Host '正在启动 gh 的浏览器登录流程…' -ForegroundColor Cyan
    & $GhPath auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) {
        Write-Host '登录未完成。' -ForegroundColor Red
        return $false
    }
    return (Test-GhAuth -GhPath $GhPath)
}

<#
.SYNOPSIS
解析 gh 并确保已登录。

.DESCRIPTION
带 -Login 时若未登录会就地启动浏览器流程；否则只打印指引并返回 $null，
避免在没有交互的终端里挂死。
#>
function Resolve-Gh {
    param([switch]$Login)

    $gh = Get-GhPath
    if (-not $gh) {
        Write-GhSetupHint
        return $null
    }
    Write-Host "gh: $gh" -ForegroundColor DarkGray

    if (Test-GhAuth -GhPath $gh) {
        Write-Host 'gh 已登录 ✅' -ForegroundColor Green
        return $gh
    }

    if ($Login) {
        if (Invoke-GhLogin -GhPath $gh) {
            Write-Host 'gh 登录成功 ✅' -ForegroundColor Green
            return $gh
        }
        return $null
    }

    Write-Host 'gh 已安装但尚未登录。执行下面这条即可（会弹浏览器）：' -ForegroundColor Yellow
    Write-Host '  gh auth login --hostname github.com --git-protocol https --web'
    Write-Host '也可以给本脚本加 -Login 参数，让它直接帮你启动登录流程。'
    return $null
}

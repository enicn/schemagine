<#
.SYNOPSIS
  Schema 引擎 E2E 测试运行脚本
.DESCRIPTION
  运行 Playwright E2E 测试并将完整输出保存到文件，避免终端编码问题导致结果不可读。
  同时支持 P0 / P1 / 全部 三种模式。
.PARAMETER Suite
  测试套件: "p0" (仅 P0), "p1" (仅 P1), "all" (全部), 或指定文件路径
.PARAMETER Project
  Playwright 项目名, 默认 chromium
.EXAMPLE
  .\scripts\run-e2e-tests.ps1 -Suite p0
  .\scripts\run-e2e-tests.ps1 -Suite p1
  .\scripts\run-e2e-tests.ps1 -Suite all
  .\scripts\run-e2e-tests.ps1 -Suite "e2e/p1-engine.spec.ts" -Project chromium
#>

param(
  [Parameter(Mandatory = $false)]
  [string]$Suite = "all",

  [Parameter(Mandatory = $false)]
  [string]$Project = "chromium"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ReportDir = Join-Path $ProjectRoot "e2e-results"

# 覆盖系统环境变量，确保 Playwright 可自动检测 / 下载浏览器
$env:PLAYWRIGHT_IGNORE_BROWSER_DOWNLOAD = "0"

if (-not (Test-Path $ReportDir)) {
  New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
}

# 确定测试文件
switch ($Suite.ToLower()) {
  "p0"   { $TestFile = "e2e/p0-engine.spec.ts" }
  "p1"   { $TestFile = "e2e/p1-engine.spec.ts" }
  "p2"   { $TestFile = "e2e/p2-engine.spec.ts" }
  "all"  { $TestFile = "e2e/" }
  default { $TestFile = $Suite }
}

$OutputFile = Join-Path $ReportDir "e2e-report-${Suite}-${Timestamp}.txt"
$SummaryFile = Join-Path $ReportDir "e2e-summary-${Suite}-${Timestamp}.txt"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Schema 引擎 E2E 测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  套件:    $Suite"
Write-Host "  文件:    $TestFile"
Write-Host "  项目:    $Project"
Write-Host "  输出:    $OutputFile"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 运行测试，输出同时写入文件和控制台
$testOutput = & pnpm exec playwright test $TestFile --project=$Project --reporter=list 2>&1
$exitCode = $LASTEXITCODE

# 写入完整输出到文件
$testOutput | Out-File -FilePath $OutputFile -Encoding UTF8

# 提取摘要（通过/失败行）
$summary = $testOutput | Select-String -Pattern "passed|failed|Pending"
$summary | Out-File -FilePath $SummaryFile -Encoding UTF8

# 显示结果
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($exitCode -eq 0) {
  Write-Host "  结果: 全部通过" -ForegroundColor Green
} else {
  Write-Host "  结果: 有失败项 ($exitCode)" -ForegroundColor Red
}
Write-Host "  完整日志: $OutputFile" -ForegroundColor Gray
Write-Host "  摘要:     $SummaryFile" -ForegroundColor Gray
Write-Host "========================================" -ForegroundColor Cyan

# 输出摘要
Write-Host ""
Write-Host "--- 测试摘要 ---" -ForegroundColor Yellow
$summary | ForEach-Object { Write-Host $_ }

exit $exitCode

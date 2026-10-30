#!/usr/bin/env node
/**
 * 校验仓库里所有 package.json 是合法 JSON。
 *
 * 抽成独立脚本的原因：原来这段逻辑写在 CI 的 `run: |` 里用 `node -e "多行"` 内联，
 * YAML 块标量 + shell 引号 + 多行 JS 三层叠在一起，本地能跑、跑在 runner 上却
 * 报 `Process completed with exit code 1`（错误信息看不出原因）。文件化之后
 * 本地 `node scripts/check-package-json.cjs` 与 CI 跑的是**同一份代码**。
 *
 * 用 .cjs 且只用 require：仓库根 package.json 是 "type": "module"，
 * 若写成 .js + import 会被当作 ESM 处理，在 CI 的 node 版本上容易出意外。
 *
 * 用法：node scripts/check-package-json.cjs
 * 退出码：0 = 全部合法；1 = 有文件不是合法 JSON
 */

const { readFileSync, existsSync } = require('node:fs')
const { dirname, join } = require('node:path')

const repoRoot = dirname(__dirname)

const targets = [
  'package.json',
  'packages/dsh-session-link/package.json',
  'packages/dsh-session-link-client/package.json',
  'packages/dsh-session-link-preview/package.json',
  'packages/dsh-session-link-diag/package.json'
]

let failed = 0
for (const relative of targets) {
  const file = join(repoRoot, relative)
  if (!existsSync(file)) {
    console.error(`MISSING  ${relative}`)
    failed++
    continue
  }
  try {
    const raw = readFileSync(file, 'utf8')
    // JSON.parse 遇到 BOM 会抛 "Unexpected token"，这里给一条更好懂的提示
    if (raw.charCodeAt(0) === 0xfeff) throw new Error('文件带 UTF-8 BOM，JSON.parse 会失败；请去掉 BOM')
    const parsed = JSON.parse(raw)
    console.log(`ok       ${relative}  (${parsed.name || '?'}@${parsed.version || '?'})`)
  } catch (error) {
    console.error(`INVALID  ${relative}  ${error.message}`)
    failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed} 个文件不合格`)
  process.exit(1)
}
console.log('\n全部 package.json 合法')

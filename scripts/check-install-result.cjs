#!/usr/bin/env node
/**
 * 校验 install 脚本的落地结果（CI 与本地共用）。
 *
 * 原来这段断言写在 CI 的 `run: |` 里用 `node -e "多行"` 内联——那层嵌套已经害过我们一次
 * （错误信息只剩 "exit code 1"）。文件化之后出问题能一眼看出是哪个包/哪一段缺。
 *
 * 用法：node scripts/check-install-result.cjs <fakeDshHome>
 * 退出码：0 = 全部到位；1 = 有缺失
 */

const { existsSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const dshHome = process.argv[2]
if (!dshHome) {
  console.error('用法：node scripts/check-install-result.cjs <fakeDshHome>')
  process.exit(2)
}

const profileDir = join(resolve(dshHome), 'profiles', 'web')
const nodeModules = join(profileDir, 'node_modules')
const patchFile = join(profileDir, 'cordis.patch.yml')

let failed = 0

for (const name of ['dsh-session-link', 'dsh-session-link-client', 'dsh-session-link-preview']) {
  const dir = join(nodeModules, name)
  if (existsSync(join(dir, 'package.json'))) {
    console.log(`ok       node_modules/${name}`)
  } else {
    console.error(`MISSING  node_modules/${name}`)
    failed++
  }
}

if (!existsSync(patchFile)) {
  console.error(`MISSING  ${patchFile}`)
  failed++
} else {
  const text = readFileSync(patchFile, 'utf8')
  if (text.includes('dsh-session-link (managed block')) {
    console.log('ok       cordis.patch.yml 含 managed block')
  } else {
    console.error('INVALID  cordis.patch.yml 缺少 managed block')
    failed++
  }
  for (const id of ['session-link', 'session-link-client', 'session-link-preview']) {
    if (text.includes(`id: ${id}`)) console.log(`ok       patch 行 ${id}`)
    else {
      console.error(`MISSING  patch 行 ${id}`)
      failed++
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} 项不合格`)
  process.exit(1)
}
console.log('\ninstall 结果校验通过')

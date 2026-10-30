#!/usr/bin/env bash
# 把 dsh-session-link 装进一个 dsh profile（macOS / Linux）
#
#   ./scripts/install.sh                    # 装到 $DSH_HOME 或 ~/.dsh 的 web profile
#   DSH_HOME=/opt/dsh PROFILE=web ./scripts/install.sh
#   WITH_DIAG=1 ./scripts/install.sh
#
# 幂等：重复执行只替换自己那段标记块。

set -euo pipefail

DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE="${PROFILE:-web}"
WITH_DIAG="${WITH_DIAG:-0}"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
NODE_MODULES="$PROFILE_DIR/node_modules"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "找不到 profile 目录：$PROFILE_DIR" >&2
  echo "先用 dsh 启动过一次 '$PROFILE' profile（dsh --profile $PROFILE）。" >&2
  exit 1
fi

PACKAGES=(dsh-session-link dsh-session-link-client dsh-session-link-preview)
if [ "$WITH_DIAG" = "1" ]; then PACKAGES+=(dsh-session-link-diag); fi

echo "[1/2] 复制包到 $NODE_MODULES"
mkdir -p "$NODE_MODULES"
for name in "${PACKAGES[@]}"; do
  src="$REPO/packages/$name"
  dst="$NODE_MODULES/$name"
  [ -d "$src" ] || { echo "仓库里缺少 packages/$name" >&2; exit 1; }
  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "      + $name"
done

echo "[2/2] 更新 $PROFILE_DIR/cordis.patch.yml"
BEGIN='# >>> dsh-session-link (managed block; 由 scripts/install 维护，删除即卸载) >>>'
END='# <<< dsh-session-link <<<'
with_diag_row=""
if [ "$WITH_DIAG" = "1" ]; then
  with_diag_row=$'\n    - id: session-link-diag\n      name: dsh-session-link-diag'
fi

node - "$PROFILE_DIR/cordis.patch.yml" "$BEGIN" "$END" "$with_diag_row" <<'NODE'
const fs = require('node:fs')
const [file, begin, end, diagRow] = process.argv.slice(2)
const rows = [
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
].join('\n') + (diagRow || '')
const block = `${begin}\n${rows}\n${end}`
let text = '# dsh profile patch layer\n[]\n'
try { text = fs.readFileSync(file, 'utf8') } catch {}
const pattern = new RegExp(
  begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
)
if (pattern.test(text)) {
  text = text.replace(pattern, block)
  console.log('      已更新既有标记块')
} else if (/^\s*name:\s*dsh-session-link\s*$/m.test(text)) {
  console.log('      检测到已存在手工的 dsh-session-link 挂载行，跳过 patch 写入（避免重复 id）')
} else {
  if (!text.endsWith('\n')) text += '\n'
  text += `\n${block}\n`
  console.log('      已追加标记块')
}
fs.writeFileSync(file, text, 'utf8')
NODE

echo ""
echo "完成。下一步："
echo "  1. 刷新浏览器页面（Ctrl+R）：设置面板应出现「会话互联」"
echo "  2. 打开 /api/session-link/diag 可确认浏览器 bundle 已被收录（WITH_DIAG=1 时）"
echo "  3. dsh 的 patchReload: live 会热加载；若没有生效，重启 dsh web"

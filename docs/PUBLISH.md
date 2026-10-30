# 发布到 GitHub 的详细步骤

> 仓库已经整理好在仓库目录（下文用 `<仓库目录>` 表示该路径）。
> 本机 `git 2.55` 已装、全局 `user.name` / `user.email` 都已配置，`gh` 未安装（可选）。
> 下面每一步都给了**命令**和**该看到的输出**；出问题直接跳到最后的排错表。

---

## 第 0 步：先看清"已完成 / 待办"

| 事项 | 状态 |
| --- | --- |
| 仓库结构（4 个包 + docs + scripts + test + CI） | ✅ 已完成 |
| 中英 README、LICENSE、.gitignore、.gitattributes | ✅ 已完成 |
| 一键安装脚本（PS1 已验证 UTF-8 BOM + 幂等；sh 已在 Git Bash 验证） | ✅ 已完成 |
| 两个测试在仓库目录里跑通（客户端 7 条交互断言 / 宿主全套断言） | ✅ 已完成 |
| 隐私体检（本机路径、真实会话 id、账号名） | ✅ 已清理（原本漏在旧 README 与测试头注释里） |
| `<YOU>` / `<YOUR NAME>` 占位符 | ⬜ 你来填（第 1 步，一条命令） |
| `git init` / commit / 建远程 / push | ⬜ 你来执行（第 3–6 步，我没动 git） |

---

## 第 1 步：填掉占位符（30 秒）

用我加的脚本，一次改完 6 个文件：

```powershell
cd <仓库目录>
powershell -ExecutionPolicy Bypass -File scripts/set-owner.ps1 -Owner 你的GitHub用户名 -Name "你的名字"
```

该看到：

```
  updated README.en.md
  updated LICENSE
  updated packages\dsh-session-link\package.json
  updated packages\dsh-session-link-client\package.json
  updated packages\dsh-session-link-preview\package.json
已替换 6 个文件：owner=xxx name=xxx
```

- 用户名只允许字母/数字/连字符，脚本会校验。
- 重复执行无害：第二次会打印"没有需要替换的占位符"。
- 只剩 `scripts/set-owner.ps1` 自己文件里的占位符字样，那是它的用法说明，正常。

顺手检查 LICENSE 的年份（现在是 2026）和署名是否合适。

---

## 第 2 步：本地体检（2 分钟，别跳过）

```powershell
cd <仓库目录>

# 1) 语法 + JSON 校验
npm run check

# 2) 客户端渲染测试（无需浏览器、无需 dsh）
node test/client-smoke.cjs

# 3) 宿主逻辑测试（用本机的真实会话；没有会话目录会自动跳过）
$env:DSH_SESSIONS_DIR='<DSH_HOME>\sessions\<项目目录名>'   # 例如 --E-AAAWork--
node test/offline-test.cjs

# 4) 隐私再扫一遍（必须为空）
Select-String -Path (Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch '\\node_modules\\' }).FullName `
  -Pattern '<你的用户名>|C:\\Users\\|D:\\|E:\\|session-[0-9a-f]{8}-' | Select-Object Path,Line
```

前 3 条都应看到「全部断言通过 ✅ / 客户端冒烟测试全部通过 ✅」；第 4 条必须**没有输出**。
如果第 4 条有输出，先把那行的路径/账号改成 `C:\path\to\...` / `<you>` 再继续。

---

## 第 3 步：本地建仓并首次提交

```powershell
cd <仓库目录>
git init -b main
git add .
git status --short          # 确认只有仓库内文件，没有 node_modules
git commit -m "feat: cross-session memory linking for DeepSeek Harness"
```

要点：

- **不要**在这之前 `git add` 任何 `node_modules`——`.gitignore` 已经挡住，`git status` 里出现它就说明有人在别处建了索引。
- `.gitattributes` 里写了 `* text=auto eol=lf`，Windows 上不会把 `.sh` 存成 CRLF。
- 你的 `core.autocrlf` 是空值（未设置），配合 `.gitattributes` 正好，不用改。

该看到：`27 files changed, 4000+ insertions(+)` 之类，末尾一行 `create mode 100644 ...`。

---

## 第 4 步：在 GitHub 上建空仓库

**方式 A：网页（推荐，最直观）**

1. 打开 <https://github.com/new>
2. Repository name：`dsh-session-link`
3. 可见性：Public（要分享就公开；私有也能装，只是别人 clone 需要授权）
4. **不要**勾 "Add a README file"、**不要**选 .gitignore、**不要**选 license——这三样仓库里已经有了，勾了会造成 push 冲突
5. 点 Create repository

**方式 B：命令行（装了 gh 才可用）**

```powershell
winget install --id GitHub.cli        # 没装的话
gh auth login                         # 选 GitHub.com → HTTPS → 浏览器授权
cd <仓库目录>
gh repo create dsh-session-link --public --source=. --remote=origin --push
```

`gh` 这条路会在最后一步直接 push（等价于第 5 步）。

---

## 第 5 步：绑定远程并 push

```powershell
cd <仓库目录>
git remote add origin https://github.com/你的用户名/dsh-session-link.git
git remote -v                      # 确认 origin 指向正确
git push -u origin main
```

首次 push 会弹认证。两种方式选一：

- **HTTPS + PAT**：GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  → 勾 `repo` → 生成 → 复制。push 时用户名填 GitHub 用户名，密码粘贴 token（**不是账户密码**）。
  想记住：`git config --global credential.helper manager`（Windows 会存进凭据管理器）。
- **SSH**：`ssh-keygen -t ed25519 -C "你的邮箱"` → 把 `~/.ssh/id_ed25519.pub` 内容贴到
  GitHub → Settings → SSH and GPG keys → 然后把 remote 换成 `git@github.com:你的用户名/dsh-session-link.git`。

该看到：`main -> main` 与 `branch 'main' set up to track 'origin/main'`。

---

## 第 6 步：验证"别人拿到会怎样"（关键一步，别省）

这一步是模拟陌生人：

```powershell
$tmp = Join-Path $env:TEMP 'verify-clone'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
git clone https://github.com/你的用户名/dsh-session-link.git $tmp
cd $tmp
node test/client-smoke.cjs                  # 不装 dsh 也能过
powershell -ExecutionPolicy Bypass -File scripts/install.ps1
```

然后：

1. 刷新浏览器里的 dsh GUI（Ctrl+R）。
2. 设置 → 应出现 **会话互联**（链环图标，在「会话回收站」下面）。
3. 打开 <http://127.0.0.1:3080/api/session-link/diag> → 应看到 `"hasClient": true` 和一个非零的 `bundle.bytes`。
4. 随便勾两个会话 → 回到对话问一句"我刚链接的两个会话里聊了什么" → 模型应能答上来。

验证完把临时克隆删掉：

```powershell
Remove-Item $tmp -Recurse -Force
```

> 注意：装的是**同一份代码**到同一个 profile，所以这一步不会改变你现有的行为，只是验证脚本可用。

---

## 第 7 步（可选）：发布一个版本，让"装某个固定版本"成为可能

```powershell
cd <仓库目录>
git tag -a v0.1.0 -m "dsh-session-link v0.1.0"
git push origin v0.1.0
```

然后 GitHub → Releases → Draft a new release → 选 `v0.1.0` → 发布。
之后别人可以钉住版本：

```bash
pnpm add https://github.com/你的用户名/dsh-session-link/tarball/v0.1.0
```

**注意**：这种 tarball 装法给的是**整个 monorepo**，`pnpm` 只会把仓库根当成一个包，
所以三个子包仍需 `install` 脚本或手动复制。想真正"一条命令装"，就得把三个包分别发到 npm
（或拆成三个仓库）。README 里已经写清了这一点，不必改代码。

---

## 第 8 步（可选）：让仓库更好用

- **截图**：设置页一张、预览面板一张，放到 `docs/preview/`，在 README 顶部引用。插件类仓库有图差别很大。
- **Topics**（仓库首页右上齿轮）：`deepseek-harness`、`dsh-plugin`、`cordis`、`session-memory`、`llm`。
- **CI 徽章**：第一次 Actions 跑通后，在 README 顶部加
  `![ci](https://github.com/你的用户名/dsh-session-link/actions/workflows/ci.yml/badge.svg)`。
- **About 描述**：`Link any set of dsh sessions into groups so they share memory.`
- **兼容性表**：如果有人反馈"设置里没有"，先在 issue 里要 `dsh --version` 与 `/api/session-link/diag` 输出。

---

## 排错表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `git push` 403 / `Authentication failed` | 用了账户密码，或 token 没有 `repo` 权限 | 用 PAT（classic 勾 `repo`，fine-grained 给 Contents: Read and write） |
| `failed to push some refs (fetch first)` | 建仓时勾了 README/license，远程已有提交 | `git pull --rebase origin main` 后再 push |
| `src refspec main does not match any` | 还没提交，或分支叫 `master` | `git log --oneline` 确认有提交；`git branch -M main` |
| push 很慢 / `RPC failed` | 网络；仓库很小所以不是体积问题 | `git config --global http.postBuffer 524288000`，或改用 SSH |
| 别人装完设置里没有「会话互联」 | 页面没刷新；或 dsh 版本过旧 | 先 Ctrl+R；再看 `/api/session-link/diag` 的 `hasClient` |
| `install.ps1` 报 `Missing closing '}'` | **脚本被存成了 UTF-8 无 BOM**，PowerShell 5.1 按 GBK 解析中文 | 用 `pwsh` 跑，或重新保存为 UTF-8 with BOM（仓库里那份已经是） |
| `install.ps1` 提示"检测到已存在手工挂载行" | patch 里已有同名 `name: dsh-session-link` | 正常，脚本故意不重复插 id，避免 loader 冲突 |
| `offline-test` 报 `ERR_MODULE_NOT_FOUND: @deepseek-ai/dsh-llm` | 在仓库里直接跑，缺 dsh 的 peer 依赖 | 先 `scripts/install` 装进 profile，或 `DSH_HOME` 指向已安装环境 |
| `git status` 里有 `test/links.json` | 测试产物 | 已被 `.gitignore` 忽略；如果被 add 过：`git rm --cached test/links.json` |

---

## 卸载 / 回滚

```powershell
# 只卸插件（保留仓库）
$profile = "$env:DSH_HOME\profiles\web"      # 或 ~\.dsh\profiles\web
Remove-Item "$profile\node_modules\dsh-session-link","$profile\node_modules\dsh-session-link-client","$profile\node_modules\dsh-session-link-preview" -Recurse -Force
# 再删掉 cordis.patch.yml 里 # >>> dsh-session-link >>> … # <<< dsh-session-link <<< 之间那段
```

链接关系文件 `<DSH_HOME>/session-links.json` 不会被删，重装后继续可用。

---

## 一句话总结顺序

**填 owner → 本地体检 → git init/commit → 建空仓库 → push → 临时克隆验证 → （可选）打 tag/加截图**。
前两步我建议一定做，第 6 步（临时克隆验证）是"分享出去不翻车"的唯一保险。

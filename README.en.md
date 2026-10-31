# dsh-session-link · cross-session memory for DeepSeek Harness

[![ci](https://github.com/Moqianying/dsh-session-link/actions/workflows/diagnose.yml/badge.svg)](https://github.com/Moqianying/dsh-session-link/actions/workflows/diagnose.yml)
[![release](https://img.shields.io/github/v/release/Moqianying/dsh-session-link?label=release)](https://github.com/Moqianying/dsh-session-link/releases)

**Latest [v0.1.1](https://github.com/Moqianying/dsh-session-link/releases/tag/v0.1.1)** ·
[All releases](https://github.com/Moqianying/dsh-session-link/releases) ·
[Changelog](CHANGELOG.md) ·
[Architecture](docs/ARCHITECTURE.zh.md)

> Link any set of historical dsh sessions into groups so they **share memory**: every step in one
> linked session carries a digest of the others. Ships a settings page with its own icon, two model
> tools, and a two-perspective preview (what a session *receives* / what it *provides*).
> Chinese docs: [README.md](README.md)

> [!NOTE]
> `v0.1.0` has a cold-start defect (the Settings → Session Link page returns 404 after a dsh web
> restart). Use **v0.1.1**.

## Features

- Live mounting — no process restart (`patchReload: live`), the running conversation is untouched.
- Settings page at **Settings → Session Link**, chained-link icon, search / sort / groups / cards.
- Click anywhere on a session card to link or unlink it (keyboard `Enter` / `Space` too).
- Two-perspective preview: *what it receives* and *what it provides* (works for unlinked sessions).
- Model tools: `session_link` (list / link / unlink / delete group / status) and `session_recall`
  (digest, cross-session keyword search).
- Read-only history: `sessionPersistence.open(id, 'read')` — never claims write ownership.
- Hard budgets per message / per session / per injection; deterministic truncation.
- No memory feedback loop: only `source.kind === 'user'` prompts and assistant text are extracted.

## Packages

| Package | Role |
| --- | --- |
| `dsh-session-link` | Host half: `agent/pre-step` injection, tools, HTTP API, standalone picker page |
| `dsh-session-link-client` | Browser half: the settings page + nav icon (hand-written `__ModuleLoader__` bundle, no build step) |
| `dsh-session-link-preview` | `receive` / `contribute` preview endpoint |
| `dsh-session-link-diag` | Optional read-only diagnostic route |

## Install

```powershell
git clone https://github.com/Moqianying/dsh-session-link.git
cd dsh-session-link
./scripts/install.ps1        # Windows; ./scripts/install.sh on macOS/Linux
```

The script copies `packages/*` into `<DSH_HOME>/profiles/web/node_modules/` and maintains one
marker-delimited block in `cordis.patch.yml` (idempotent). Then refresh the GUI page (Ctrl+R).

Alternatively add the repo as a profile dependency (`pnpm add <github tarball>`) and list the three
packages in `dsh.profile.bundles`, or paste the mount rows by hand — see the Chinese README.

## Usage

1. Settings → Session Link → new group → tick the sessions to link.
2. Keep chatting: each step now carries the other sessions' recent digest (re-injected only when it changes).
3. Click 👁 on any session to expand its preview in place, with a tab for each perspective.

Links live in `<DSH_HOME>/session-links.json` (hot-read, hand-editable).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/session-link/state` | sessions + groups |
| POST | `/api/session-link/state` | replace groups |
| GET | `/api/session-link/preview?sessionId=…&mode=receive\|contribute` | two-perspective preview |
| GET | `/api/session-link/memory?sessionId=…` | legacy alias of `mode=receive` |
| GET | `/api/session-link/ui` | standalone picker page |

## Tests

```bash
node test/offline-test.cjs    # host logic (fake ctx + real session files)
node test/client-smoke.cjs    # browser half (mini React + mini DOM, no browser needed)
```

## License

MIT — see [LICENSE](LICENSE).

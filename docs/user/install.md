# Install KCA

KCA runs coding agents on your computer and lets you control them from its
desktop, web, or mobile app. Set up the machine where the agents will work first.
KCA is a fork of T3 Code; see [remote access](./remote-access.md#kca-vs-t3-code-what-is-shared)
for what the two share.

## Requirements

Command-line use and SSH hosts need Node.js 22.16+ (22.x), 23.11+
(23.x), or 24.10 and later. The native desktop app includes its server runtime.

You need an installed, authenticated provider before starting a thread. You can
launch KCA and configure providers afterwards.

## From source

KCA is not published to npm, so there is no `npx` one-liner. Clone the repo,
install the toolchain, and link the CLI:

```bash
git clone https://github.com/krevoit/kca && cd kca
curl -fsSL https://vite.plus | bash   # provides `vp`
vp i
vp run --filter @t3tools/web build
node apps/server/scripts/cli.ts build
sudo ln -sf "$PWD/apps/server/dist/bin.mjs" /usr/local/bin/kca
```

This starts the server and opens the local web app. Run
`kca --help` for command-line options.

Prefer Docker? One container runs the server with the web client bundled —
see the [README](../../README.md).

## Desktop app

Download a release from [GitHub Releases](https://github.com/krevoit/kca/releases):

| Platform              | Install                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| macOS (Apple Silicon) | `KCA-<version>-arm64.dmg` (unsigned — right-click → Open on first launch)   |
| Debian / Ubuntu       | `sudo apt install ./KCA-<version>-amd64.deb` (an AppImage is published too) |

macOS builds are unsigned, so in-place auto-update cannot install: the app
offers the release download instead. Windows is not shipped.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
kca app
```

This opens a new thread for the current directory, adding the project if needed.
Pass a path, such as `kca app ../my-project`, to open another directory. It requires
the desktop app, so a standalone server or an SSH session is not enough. If the
command cannot reach the app, start or update the desktop app and try again.

## Mobile app

No KCA mobile build is published. The upstream T3 Code app from the
[App Store](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824) or
[Google Play](https://play.google.com/store/apps/details?id=com.t3tools.t3code)
works as a client: the phone connects to a KCA server on another machine. Follow
[remote access](./remote-access.md) to link it through T3 Connect or a pairing URL.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| Codex       | Install [Codex CLI](https://developers.openai.com/codex/cli), then run `codex login`.        |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`. |
| Cursor      | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                        |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                           |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                     |
| Antigravity | Install and sign in with Google from KCA's provider settings.                                |

Provider CLIs must be on the server's `PATH`. If KCA cannot find one, set its
**Binary path** in provider settings, especially when using a version manager.
Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Antigravity can use its managed runtime without a `PATH` entry.

When a provider CLI is behind its latest release, its provider card shows the
available version. **Update now** appears only when KCA can tell which
installer owns the CLI (its own update command, Homebrew, or a global npm, pnpm,
bun, or Vite+ install) and runs that installer. Otherwise update the CLI the same
way you installed it. Homebrew installs compare against the version Homebrew
offers, which can trail the npm release by a few hours.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive; after saving, KCA does not display
their original values.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md), and
[Antigravity](./providers-antigravity.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating KCA](./updating.md): update the app and connected servers.

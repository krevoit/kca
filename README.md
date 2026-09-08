# KCA

KCA is a control surface for the coding agents on your machines — drive your
Claude Code, Codex, Cursor, Grok Build, OpenCode, and Google Antigravity
subscriptions from a web UI, a desktop app, and a mobile app. If a provider is
set up on a machine, KCA can control it there, locally or remotely.

KCA is a fork of [T3 Code](https://github.com/pingdotgg/t3code), which remains
MIT-licensed © T3 Tools Inc (see [LICENSE](./LICENSE)). This fork keeps the
upstream T3 Connect relay, so remote access, pairing, and mobile push keep
working with no self-hosting required.

What the fork changes:

- **Usage tab counts everything.** Every configured Codex home (all
  `CODEX_HOME` instances, including `archived_sessions`) is scanned, and usage
  is merged across all connected environments — including runs made outside KCA.
- **Familiar defaults.** Legacy per-project sidebar and the composer context
  meter are on by default, and the starry sidebar art shows on every channel.
- **Binaries from this repo.** Linux AppImage + `.deb` and Apple Silicon DMG
  are built by this repo's Release workflow, and the desktop app auto-updates
  from `krevoit/kca` releases.

## 0. Providers first

KCA drives your existing provider CLIs. Install and log in to at least one
*where the KCA server will run*:

- Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
- Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
- Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
- Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
- OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
- Antigravity: enable it in Settings, then use **Install Antigravity** and **Sign in with Google**. No CLI is required.

## 1. WebUI (Docker — any host, including headless Linux)

The container runs the KCA server with the web client bundled. No Node.js or
checkout needed on the host.

```bash
docker run -d --name kca --restart unless-stopped \
  -p 8080:8080 \
  -v kca-data:/data \
  ghcr.io/krevoit/kca:latest
```

Then open `http://<host>:8080`.

- State (sessions, settings, pairing tokens) lives in the `kca-data` volume
  via `T3CODE_HOME=/data`. Back it up; delete it for a factory reset.
- Update: `docker pull ghcr.io/krevoit/kca:latest && docker rm -f kca`, then
  re-run the same `docker run` command.
- With docker compose:

  ```yaml
  services:
    kca:
      image: ghcr.io/krevoit/kca:latest
      restart: unless-stopped
      ports:
        - "8080:8080"
      volumes:
        - kca-data:/data
  volumes:
    kca-data:
  ```

- Mint a pairing link from inside a running container:

  ```bash
  docker exec -it kca node dist/bin.mjs pair
  ```

Provider CLIs must be installed *where the server runs*. For a Docker host
without them, either `docker exec` in and install/log in your CLIs, or run KCA
natively on the machine that has them (§2) and use the container purely as an
always-on WebUI attached to that environment via pairing (§2.3).

Tagged releases also publish versioned images
(`ghcr.io/krevoit/kca:v0.0.40`); `latest` tracks the newest stable release and
`edge` tracks `main`.

## 2. Linux (headless Debian server)

### 2.1 Run it

Pick one:

**A. Docker (recommended for headless).** Same as §1. The container exposes
the full WebUI on port 8080; put it behind Caddy/Nginx with TLS if you expose
it beyond your LAN/Tailnet.

**B. From source.** Requires Node.js 24+ and the `vp` toolchain:

```bash
curl -fsSL https://vite.plus | bash   # provides `vp`
git clone https://github.com/krevoit/kca && cd kca
vp i
vp run --filter @t3tools/web build
node apps/server/scripts/cli.ts build
```

Then run it under systemd (`/etc/systemd/system/kca.service`):

```ini
[Unit]
Description=KCA server
After=network-online.target
Wants=network-online.target

[Service]
User=kca
Environment=T3CODE_HOME=/var/lib/kca
Environment=T3CODE_HOST=127.0.0.1
Environment=T3CODE_PORT=8080
Environment=T3CODE_NO_BROWSER=true
ExecStart=/usr/bin/node /opt/kca/apps/server/dist/bin.mjs serve
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now kca
```

**C. Debian desktop (GUI).** Grab the `.deb` from the
[releases page](https://github.com/krevoit/kca/releases) (an AppImage is
published too):

```bash
sudo apt install ./T3-Code-<version>-amd64.deb
```

### 2.2 Pair it with T3 Connect (remote access without open ports)

KCA keeps upstream's T3 Connect relay, so this works out of the box — no
server-side setup on your side.

On the headless machine, with the server installed (B) or its checkout handy:

```bash
# Log the server environment in via the relay (headless-friendly).
t3 connect login --headless
# Check link + tunnel status any time.
t3 connect status
```

For a direct (no-relay) link instead — same LAN, Tailscale, or SSH-forwarded
port — mint a one-time pairing URL and open it on the other device:

```bash
t3 serve --host 0.0.0.0 --port 8080
t3 pair
```

Over Tailscale, serve through it so the phone/browser gets HTTPS:

```bash
t3 serve --tailscale-serve
t3 pair --tailscale
```

Full matrix (LAN, Tailscale, SSH, hosted web): [`docs/user/remote-access.md`](./docs/user/remote-access.md).

### 2.3 Attach more machines

Each machine runs its own KCA server (§2.1) holding its providers and
filesystem. They all show up as environments in the WebUI/desktop/mobile
clients, and the Usage tab merges spend across every connected one. Offline
machines simply contribute nothing until they reconnect.

## 3. macOS (Apple Silicon)

1. Download `T3-Code-<version>-arm64.dmg` from the
   [releases page](https://github.com/krevoit/kca/releases).
2. Open it, drag the app into Applications.
3. These builds are **unsigned** (no Apple Developer certificate in the fork),
   so the first launch is blocked by Gatekeeper. Right-click the app →
   **Open** → **Open**, or clear the quarantine flag:

   ```bash
   xattr -cr "/Applications/KCA (Alpha).app"
   ```

4. Updates install themselves from `krevoit/kca` releases — nothing to do.

Intel Macs are not shipped (no CI runners for them); the Linux AppImage/`.deb`
and the Docker image cover the rest.

## Docs & development

- Full user docs: [`docs/`](./docs) — start with
  [install & first run](./docs/user/install.md),
  [remote access](./docs/user/remote-access.md), and
  [running as a background service](./docs/user/background-service.md).
- Releases (desktop, Docker) are cut from tags: `git tag v0.0.40 && git push origin v0.0.40`.
  The Release workflow builds macOS arm64 DMG + Linux AppImage/`.deb` on
  standard GitHub runners; npm/Vercel/AUR/Discord steps are opt-in via
  `KCA_PUBLISH_NPM` / `KCA_DEPLOY_WEB` / `KCA_PUBLISH_AUR` repo variables.
- Building from source: install `vp` (`curl -fsSL https://vite.plus | bash`),
  then `vp i`. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR.

## License

MIT, © T3 Tools Inc — see [LICENSE](./LICENSE). Fork maintained at
[github.com/krevoit/kca](https://github.com/krevoit/kca).

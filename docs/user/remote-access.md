# Remote access

Connect a phone, browser, or another desktop app to KCA running on a different
machine. That machine must stay running and reachable while you work.

## KCA vs T3 Code: what is shared

KCA is a fork of T3 Code. A few names are deliberately unchanged — here is what
each one means so nothing surprises you:

- **KCA** is the app and the command: the desktop app, the mobile app, and the
  `kca` server binary (including its `.deb`, AppImage, and DMG installables).
- **T3 Connect** is the upstream remote-access service, which KCA keeps using
  as-is. Screens, buttons, and CLI output still say "T3 Connect" on purpose.
- **`~/.t3`** still holds server state (`~/.t3/userdata`), and `T3CODE_*`
  environment variables, the `t3code://` link scheme, and app IDs are unchanged
  so existing installs, pairings, and OAuth callbacks keep working.
- Run **one app at a time** per machine: KCA and upstream T3 Code share the
  same state database, and two servers writing to it at once will wedge each
  other. Quit T3 Code fully (including any background service) before opening
  KCA, and vice versa.

## Getting the `kca` command

Install it from npm (requires Node.js 22.16+, 23.11+, or 24.10 and later):

```bash
npm install -g kca-code
```

Or run it without installing: `npx kca-code serve`. The package is published
with each release.

On a machine built from this repository, the CLI is
`apps/server/dist/bin.mjs` after
`node apps/server/scripts/cli.ts build`. Put it on your `PATH` once:

```bash
sudo ln -sf "$PWD/apps/server/dist/bin.mjs" /usr/local/bin/kca
```

All `kca ...` commands below assume that link (or the Docker equivalents in the
[README](../../README.md)). Run `kca --help` for the full reference.

## T3 Connect

T3 Connect makes an environment available to your other devices without setting
up router forwarding. In the desktop app on the host, open **Settings →
Connections**, sign in, and enable **T3 Connect** for that environment.

For a command-line host, run:

```bash
kca connect
```

Follow the sign-in instructions. On a headless machine add `--headless` and
approve in a browser. Setup offers a
[background service](./background-service.md); if you decline it, start the
server with `kca serve`. Saving your sign-in alone does not make the machine
reachable.

On your other device, sign in to the same T3 Connect account and choose the
environment. Over SSH, the CLI prints a browser link and accepts the returned
authorization code, so you do not need to forward an OAuth callback port.

If T3 Connect is enabled but its tunnel cannot connect, KCA shows a warning with
a link to **Settings → Connections**. Change **Tunnel transport** to **HTTP/2**
when a firewall or VPN interferes with QUIC. **Auto** restores automatic selection;
**QUIC** explicitly uses UDP. The choice is saved on the environment and changing
it briefly restarts its tunnel, without restarting agents. For a launch-only override,
set `TUNNEL_TRANSPORT_PROTOCOL=http2` in the server’s environment; a saved preference
takes precedence.

T3 Connect renews access credentials when needed without disconnecting a healthy
connection. Pull request diffs and provider settings keep working after the
previous credential expires. A failed renewal affects that request; it does not
disconnect an otherwise healthy conversation.

In Docker, run the connect commands inside the container (state persists in the
mounted `/data` volume):

```bash
docker exec -it kca node dist/bin.mjs connect
```

## Pair over a LAN or private network

Use direct pairing when the other device can reach the host's network address.

On a desktop host, open **Settings → Connections**, enable **Network access**,
then create a pairing link using an address the other device can reach. Changing
network access restarts the desktop app. You can turn it off in the same place.

For a command-line host, replace `<private-ip>` with the host's LAN or tailnet
address:

```bash
kca serve --host <private-ip>
```

If a server is already running, generate a fresh link without restarting it:

```bash
kca pair
```

Scan the QR code on your phone or paste the pairing URL into **Add environment**
in the receiving app. Connection settings are under **Settings → Connections**
on web and desktop and **Settings → Environments** on mobile. A loopback address
such as `127.0.0.1` reaches only the device opening the link.

Pairing authorizes that device for future connections. Use a fresh one-time link
for each new device; you do not need the original token to reconnect. Links
created in Settings can only be copied from the client that created them while
its Connections page stays open. If you leave or reload that page, create
another link to share.

### Balance new threads across machines

Auto balance is off by default. On web and desktop, enable it in
**Settings → Connections → Load balancing** to automatically choose a machine for
new threads in projects grouped across connected environments.
Each machine starts at **Normal**. Choose **Prefer** to favor it when it has CPU and
memory available, **Less often** to reduce its share, or **Manual only** to exclude
it from automatic selection. These are preferences, not fixed traffic percentages.
Preferences are saved separately in each client.

The composer checks eligible machines when choosing a draft's environment, then keeps
that choice stable. Choose **Auto balance** again to check current resources, or choose
a specific machine to override it. Choosing a branch or worktree also keeps the draft
on that machine. Existing threads stay where they started. If resource checks are
unavailable or all eligible machines are full, choose a machine manually to continue.
Mobile keeps its manual environment selection.

### Tailscale HTTPS

Join both devices to the same tailnet. In the desktop app, enable **Tailscale
HTTPS** in **Settings → Connections**. Turn it off there to remove that route.

To start a command-line server with Tailscale HTTPS:

```bash
kca serve --tailscale-serve
```

For an already-running server:

```bash
kca pair --tailscale
```

The pairing link uses an address such as `https://machine.tailnet.ts.net/`.
The mapping created by `pair --tailscale` persists across restarts. Remove its
default-port mapping with:

```bash
tailscale serve --https=443 off
```

If that port is already in use, choose another with
`--tailscale-serve-port`. See `kca pair --help` for other pairing options.

### Hosted web app

[app.t3.codes](https://app.t3.codes) needs an HTTPS endpoint. It connects directly
to your server; a hosted pairing link does not make an unreachable backend
reachable or convert HTTP to HTTPS. The hosted app is only a client — it works
unchanged with KCA servers.

For a plain HTTP LAN endpoint, use the direct pairing URL in a browser that can
open it, or pair from the desktop app. On mobile, an IP address entered without a
scheme uses HTTP, so include `https://` when your server uses HTTPS.

## Desktop-managed SSH

In the desktop app, open **Settings → Connections → Add environment**, choose
**SSH**, and enter a host or SSH alias such as `user@example.com`. KCA starts
or reuses a server there and opens the port forward for you. Projects, provider
credentials, and agent work stay on the remote machine.

Note: a remote with no KCA checkout gets the matching `kca-code` package from
npm for its server process. Prefer checking out this repository (or the Docker
image) on hosts you control so both ends run the same KCA build.

The remote host needs a compatible [Node.js installation](./install.md#requirements)
and [provider setup](./install.md#providers). If launch cannot find Node or reports
an incompatible version, check it through a non-interactive SSH session:

```bash
ssh user@example.com 'sh -lc "command -v node && node --version"'
```

Configure your version manager for non-interactive shells if this differs from
your normal terminal. With nvm, setting a compatible default, such as
`nvm alias default 24`, can resolve the problem.

If SSH reconnecting fails after an app update, retry the launch once. Removing
the connection stops a server that KCA launched; a server that was already
running is left alone.

For Antigravity's Google callback on a remote host, see
[remote sign-in](./providers-antigravity.md#sign-in-from-a-remote-device).

## Manage or revoke access

On the host, **Settings → Connections** lets authorized administrators create
pairing links and revoke client sessions. Revoking an unused link prevents new
pairings; revoke a device's session to remove its existing access. Command-line
management is available through `kca auth --help`.

A session with an open connection stays listed after its access credential
expires.

To remove an environment from T3 Connect, open your account menu's **T3 Connect**
page, or **Settings → T3 Connect** on mobile, and choose **Deregister**. This
revokes its cloud access and frees its host space even when the environment is
offline or has been wiped.

On a command-line host, `kca connect unlink` disables exposure while retaining
your login; `kca connect logout` also clears that login. Background-service
[removal](./background-service.md#manage-the-service) is separate.

Treat pairing URLs and authorization codes as passwords. Do not include them in
screenshots, logs, or bug reports.

## T3 Connect troubleshooting

Run `kca connect status` on the host to inspect saved authorization and link
configuration. It is not a live reachability check. If the environment appears
offline, run `kca service status` and read the displayed log. If it disappears
when SSH closes, see [background-service troubleshooting](./background-service.md#troubleshooting).

| Error                                                     | Recovery                                                                                                                                       |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment_link_limit_exceeded` or managed tunnel limit | Deregister an unused environment, then restart KCA on the host.                                                                                |
| `auth_invalid` or `invalid_bearer`                        | Run `kca connect login`. If credentials were revoked, run `kca connect logout`, then `kca connect` again. Restart the server after signing in. |
| Expired or invalid link proof                             | Check the host's date and time, update KCA, then restart it.                                                                                   |
| HTTP 403 without a recognized error                       | Check relay access, proxies, and firewall rules. Keep any Cloudflare Ray ID for a bug report.                                                  |
| HTTP 408, 429, or 5xx                                     | Check network and relay availability. Startup retries temporary failures for up to ten minutes.                                                |

After fixing a permanent rejection, restart the host's server. On Linux, use
`systemctl --user restart kca.service` for the background service. For a
foreground server, stop it and run `kca serve` again with your usual options.
Include the diagnostic message and trace ID when reporting a persistent failure.

For a connection that still fails after linking, check the date and time on both
devices. For server version warnings, follow [Updating KCA](./updating.md).

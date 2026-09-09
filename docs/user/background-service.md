# Running KCA in the background

On Linux and macOS, KCA can run as a service for your user so you do not need
to keep a terminal open.

## Manage the service

Run these commands on the machine that will host KCA (see
[remote access](./remote-access.md#getting-the-kca-command) for getting the
`kca` command):

| Task                            | Command                 |
| ------------------------------- | ----------------------- |
| Install and start               | `kca service install`   |
| Inspect status and log location | `kca service status`    |
| Update or repair                | `kca service update`    |
| Stop and remove from startup    | `kca service uninstall` |

Uninstalling the service leaves your projects, threads, and settings intact.

Install and update use the version of the CLI you invoke, so update your
checkout (or reinstall the package) first when you want a newer server. An
older CLI refuses to replace a newer service unless you explicitly add
`--allow-downgrade`.

Service install and repair download the pinned `kca-code` package from npm,
which is unpublished until the one-time publish described in the
[README](../../README.md#docs--development) happens. Until then, run the
server from your checkout (or Docker) instead of the background service.

Updating restarts the server. Finish active work first, and wait for any remote
update already in progress. To match a remote client's version, follow
[Updating KCA](./updating.md).

## Platform support

Linux needs systemd user services (unit `kca.service`). Setup enables lingering
so KCA starts at boot and keeps running after logout. If this needs
administrator permission, setup prints a recovery command before changing the
service.

macOS starts the service when you log in and stops it when you log out. Keep the
Mac logged in and awake for unattended remote access. Installing over SSH while
nobody is logged in at the Mac's screen can fail at the final start step; the
service is still installed and will start at the next login.

Windows background services are not supported.

T3 Connect can offer service installation during setup, but the two are managed
separately. Signing out of T3 Connect does not stop or uninstall the service.

If you previously ran upstream T3 Code as a service, disable its unit first so
the two servers never share the state database: `systemctl --user disable --now
t3code.service` (Linux) or `launchctl bootout gui/$UID/com.t3tools.t3code.service`
(macOS). Only one app's server may run at a time.

## Troubleshooting

Start with `kca service status` on the host. It prints the log path and, on Linux,
checks whether the installed service is running, enabled, and allowed to survive
logout.

If it stops when your SSH session closes, check for `linger-disabled`. An
administrator can enable lingering with:

```sh
sudo loginctl enable-linger "$(id -un)"
```

Over SSH, allow sudo to prompt:

```sh
ssh -t your-server 'sudo loginctl enable-linger "$(id -un)"'
```

Then retry service setup as your normal user. Run only the `loginctl` command
with sudo; running KCA as root creates a separate installation and Connect
identity. Without administrator access, run `kca serve` in a terminal and keep
that session open.

| Status problem                          | Next step                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `linger-unavailable`                    | Run `loginctl show-user "$(id -un)" --property=Linger` and check that systemd-logind is available.                             |
| `user-manager-unavailable`              | Run `systemctl --user status` in a login session for the service user; check your distribution's systemd user-session support. |
| `service-disabled` or `service-stopped` | Read the log and `systemctl --user status kca.service`, then use the repair command printed by KCA.                            |

On macOS, check **System Settings → General → Login Items** if the service no
longer starts at login. If agent work cannot access Desktop, Documents, or
Downloads, it may need Full Disk Access for the Node executable listed in
`ProgramArguments` in
`~/Library/LaunchAgents/com.t3tools.kca.service.plist`.

For failures after signing in to T3 Connect, see
[connection troubleshooting](./remote-access.md#t3-connect-troubleshooting).

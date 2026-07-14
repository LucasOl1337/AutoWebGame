# BombaPVP Lab broker operations

The production Worker proxies the public `/api/lab/*` allowlist to a dedicated
broker tunnel. The broker binds only to `127.0.0.1:8766`; the 9Router key and
the Worker-to-broker secret stay in user-scoped environment variables and are
never stored in the repository.

## Start and recovery

- `start-broker.ps1` starts the authenticated Python broker against the local
  9Router at `127.0.0.1:20128`.
- `start-named-tunnel.ps1` starts the dedicated Cloudflare Tunnel. It becomes
  the stable production path after `lab-broker.bombapvp.com` is created as a
  proxied CNAME to the tunnel target shown in the Cloudflare dashboard. Its
  identifier is read from the user-scoped `BOMBA_LAB_TUNNEL_ID` variable;
  neither the identifier nor the credential path is stored in Git.
- `start-quick-tunnel.ps1` is only a temporary validation fallback. Its URL is
  intentionally not stable across restarts.

The scheduled tasks `BombaPVP Lab Broker` and `BombaPVP Lab Tunnel` run the
first two scripts at user logon. They do not modify or reuse any staging tunnel.
`BombaPVP Lab DNS Cutover` checks the stable hostname every five minutes; after
the DNS record exists and passes authenticated model discovery, it atomically
updates the Worker broker URL and removes itself.

## VM migration

Copy only the broker/agent Python sources and prompts to the VM, provision the
same environment variable names in a protected systemd `EnvironmentFile`, and
run the broker on VM loopback. The 9Router must also be reachable from that VM;
`127.0.0.1:20128` on this PC is not reachable from the VM. Install a dedicated
Cloudflare Tunnel service on the VM, then update only the Worker
`LAB_BROKER_URL` secret. Keep `LAB_BROKER_SECRET` identical on both ends during
cutover, validate `/api/lab/status`, and retire the Windows tasks afterward.

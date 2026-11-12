# Verdano landing page and local hosting

The public landing page remains `index.html`, unchanged from the original
repository. `CNAME` remains `verdano.com.br` for the current GitHub Pages setup.
The deployment files do not change or publish GitHub Pages.

## Workspace layout

Keep these sibling directories under `E:\projeto_raizes_vivas`:

- `verdano_site`: this static landing-page repository and shared Caddy routing.
- `plantcatcher_gestor`: Next.js manager and public catalog API.
- `raizes_vivas`: Flutter visitor app.
- `tools/caddy/caddy.exe`: local reverse-proxy binary, outside the repositories.

The existing VS Code workspace file in the Flutter repository includes all three
repositories. Each repository keeps its own Git history and remote. Other developers' pushes
do not update this local checkout automatically: pull/review their latest changes
before cutover. Serving is directly from the local checkout; no unattended pulls
or automatic deployments are configured.

## Routes

| Path | Behavior |
| --- | --- |
| `/` and `/index.html` | Existing Verdano landing page; no redirect or link to Gestor |
| `/teste/gestor` | Gestor entrance, redirected to its login when signed out |
| `/teste/gestor/admin/...` | Authenticated management pages/actions and QR downloads |
| `/teste/gestor/api/attractions` | Anonymous published catalog for Flutter |
| `/teste/gestor/api/attractions/{slug}` | Anonymous published attraction details |
| `/teste/gestor/api/plants` | Anonymous published plant records |
| `/.git/...`, `/CNAME`, `/deploy/...`, `/README.md` | 404; repository metadata is not public |

The existing `vagalumen/` landing-page link is a future page in the original
HTML. It remains 404 until that page is created; it is not an alias for Gestor.
Static assets may be added under `assets/`, `images/`, `css/` or `js/`.
Never place private files in those public asset directories.

## Local combined preview

Start the existing PostgreSQL cluster only when requesting Gestor. Its Windows
service remains Manual; nothing here installs a service or an automatic task.
The existing `tools/postgres/bin/pg_ctl.exe` command can start the cluster outside
the agent sandbox. Do not initialize, reset or seed it as part of startup.

Start Gestor from its directory (one server on port 3000 at a time):

```powershell
npm.cmd run build
npm.cmd run start -- --hostname 127.0.0.1
```

In another terminal, from the parent workspace:

```powershell
.\verdano_site\deploy\start-preview.cmd
```

Open <http://127.0.0.1:8080> for the landing page and
<http://127.0.0.1:8080/teste/gestor> for the manager. This preview binds only to
loopback: it does not use the router's forwarded ports or change DNS/firewall.
Stop the proxy with Ctrl+C. Stop Gestor and PostgreSQL separately when finished.
The scripts do not start them implicitly or register automatic startup.

Run the integration check while both servers and the database are running:

```powershell
node .\verdano_site\deploy\check-preview.cjs
```

For the optional real login/logout check, supply `GESTOR_TEST_USERNAME` and
`GESTOR_TEST_PASSWORD` through the process environment. No passwords belong in
this repository. The check validates proxy redirects and revokes its session.

## Caddy installation

This workspace uses the official Caddy 2.11.7 Windows amd64 archive from
<https://github.com/caddyserver/caddy/releases/tag/v2.11.7>. Its checksum was
verified against the release's published **SHA-512** checksums before extracting
it to `tools/caddy`. The executable, downloads and runtime storage stay outside
this repository. Caddy can be upgraded independently using the same official
release/checksum procedure.

## Temporary public-IP HTTP test

After router port forwarding and the program-specific Windows Firewall rule are
configured, start the IP-only test manually from the parent workspace:

```powershell
.\verdano_site\deploy\start-ip-test.cmd
```

This listens on port 80 on all interfaces, without DNS changes or HTTPS. It
serves the landing page at the connection's current public IP and Gestor under
`/teste/gestor`. Gestor must already be running on 127.0.0.1:3000. Do not run
this listener and the production Caddy configuration together: both need port 80.
Use mobile data to test inbound internet access; a test inside the LAN does not
prove the ISP permits incoming connections. Avoid remote manager login over
plain HTTP; enable HTTPS for that use. Stop with Ctrl+C when launched in a
terminal; no automatic startup is installed.

The narrow firewall rule created for this test is `Verdano-Caddy-HTTP-Test`:
inbound TCP 80, restricted to this workspace's `tools/caddy/caddy.exe`.
When launched by the agent as manual background processes, process IDs and logs
are under `tools/caddy/runtime` (outside this repository). Stop those specific
recorded processes when finished. A stopped Caddy process no longer serves port
80; the firewall rule can also be disabled separately by an administrator.

## Public cutover (not performed by this integration)

1. Coordinate with the other developer and save the current DNS records.
2. Point the apex `verdano.com.br` and `www.verdano.com.br` to the connection's
   public IPv4 with A records. Replace the existing `www` CNAME; do not use the
   private address `192.168.1.69` in public DNS. Remove conflicting/stale AAAA
   records unless IPv6 routing is also intentionally configured. Preserve MX,
   TXT and other unrelated records. Both names in the production configuration
   need working DNS for their HTTPS certificates.
3. Keep router TCP forwarding 80 -> 192.168.1.69:80 and
   443 -> 192.168.1.69:443. Keep router remote administration disabled.
4. Allow inbound TCP 80 and 443 for the exact `tools/caddy/caddy.exe` program in
   Windows Firewall (one-time administrator action). Do not expose ports 3000
   or 55432. Direct internet access still requires a reachable public IP.
5. Confirm the production Gestor build is listening on 127.0.0.1:3000, and start
   the public proxy manually from the parent workspace:

   ```powershell
   .\verdano_site\deploy\start-public.cmd
   ```

Caddy obtains/renews HTTPS certificates automatically while running and sends
HTTP requests to the same path over HTTPS. Neither domain root redirects to
Gestor. The proxy preserves `/teste/gestor` and the browser Host; it supplies
forwarded headers to the loopback-only Next.js server for correct cookies,
redirects and form origin checks. Both apex and www serve the same landing page.

Certificate state is in `tools/caddy/data`; Caddy runtime/config state is also
kept under `tools/caddy` instead of the Windows user profile. Back up certificate
state securely; do not commit it. There is no Windows auto-start configuration.

After cutover, test over mobile data, then launch Flutter with
`--dart-define=VAGALUMEN_API_BASE_URL=https://www.verdano.com.br/teste/gestor`.
The catalog remains anonymous and does not use the manager's login cookie.

## Temporary port 443 test

`deploy/start-tls-test.cmd` manually starts a separate HTTPS listener on TCP 443
using an internal test certificate for the current public IP. Set
`VERDANO_TEST_IP` if the IP changes. `skip_install_trust` keeps this test CA out
of Windows trust stores. A browser certificate warning is expected on other
devices; reaching that warning proves TLS reachability without requiring login.
This is not a publicly trusted production certificate. The narrow firewall rule
is `Verdano-Caddy-HTTPS-Test`. State and logs are in `tools/caddy/runtime`.
Do not run this listener concurrently with the production HTTPS configuration.
DNS and Windows automatic startup are unaffected.

## Promotional event

The independent password hunt service, game API contract, operator instructions,
and printable branded QR generator are documented in [event-server/README.md](event-server/README.md).
Run it manually with `npm start` or `deploy/start-event.cmd`. Caddy forwards only
`/evento/*` to loopback port 3100. It does not use the Gestor database.

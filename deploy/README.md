# Docker deployment

Docker Compose is the default production runtime. `compose.yaml` includes the application and Caddy HTTPS proxy; `compose.lan.yaml` remains an empty compatibility overlay for older commands. See the root [quick start](../README.md#quick-start--docker-default) for first-time setup.

The server `.env` needs `LAN_IP`, `APP_ORIGIN=https://<LAN_IP>`, and a unique 64-character hex `ENCRYPTION_KEY`. Keep this file mode 0600 and back up the key separately. Preserve existing configuration and Docker volumes during updates. Never copy demo data into production.

```sh
docker compose up -d --build --wait
docker compose ps
docker compose logs --tail=100 app proxy
```

Caddy binds ports 80/443 on the specified private host IP. HTTP redirects to HTTPS; the application remains behind the proxy with secure cookies. Both services restart automatically. App data, encrypted backups and Caddy certificates use persistent Docker volumes. Keep the Compose project name `budget-gremlin` stable, including when moving the checkout. No public domain or inbound GitHub access is required.

## Trust the private certificate

Export Caddy's public root certificate:

```sh
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./budget-gremlin-root.crt
```

Trust it on each device accessing the app. Never distribute private keys. The certificate is git-ignored. See [Caddy TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls).

```sh
curl --cacert budget-gremlin-root.crt https://<LAN_IP>/api/v1/health
```

## Automatic updates from GitHub

This follows [kanban-calendar's systemd polling approach](https://github.com/HauptSec/kanban-calendar#auto-deploy-from-github-optional), with additional checks for a financial-data service. Install the checkout at `~/budget-gremlin`. The user running the timer needs Docker access without interactive sudo. Docker access grants privileged host control; use the same trusted deployment account as your other containers. Requires Bash, Git, curl, Python 3, flock (util-linux), Docker Compose with `--wait`, and user systemd.

```sh
mkdir -p ~/.config/systemd/user
cp deploy/budget-gremlin-deploy.service deploy/budget-gremlin-deploy.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now budget-gremlin-deploy.timer
sudo loginctl enable-linger "$USER"
systemctl --user start budget-gremlin-deploy.service
```

Every two minutes (plus up to 15 seconds of jitter) the timer fetches `origin/main`. Before deploying a changed commit, it requires a successful push run of `.github/workflows/ci.yml` for that exact commit. GitHub API outages, rate limits, pending checks and failed CI leave the current service unchanged. This public repository needs no GitHub credentials on the server.

The deployer locks against overlapping runs, resets tracked files to `origin/main`, validates Compose, builds while the old service stays up, creates an encrypted database backup, and restarts containers with health checks. It records a successful revision only after those checks pass, so build/start failures retry. The `.env`, ignored local files and persistent volumes are retained. Tracked local edits are deliberately discarded; develop and push from your workstation.

There is a short interruption when the application container is replaced. A failed build leaves the old container running. A failed container startup is logged and retried; there is no automatic database rollback. Use the encrypted backup and recovery instructions if a migration needs manual recovery. No global Docker image pruning is performed, so other applications' images are unaffected; monitor disk use periodically.

```sh
# View status and recent deployments
systemctl --user list-timers budget-gremlin-deploy.timer
journalctl --user -u budget-gremlin-deploy.service -n 50 --no-pager
# Rebuild even if the successful revision is unchanged (still requires passing CI)
bash ~/budget-gremlin/deploy/auto-deploy.sh --force
# Pause automatic deployment
systemctl --user disable --now budget-gremlin-deploy.timer
```

Disabling the timer does not interrupt a deployment already running. The script updates with the checkout; changes to systemd unit files require copying them again and running `systemctl --user daemon-reload`.

## Backups and recovery

```sh
docker compose exec -T app npm run backup
```

Backups live in the persistent backup volume and require the original encryption key. Copy them off the host periodically; a backup on the same disk does not protect against disk loss. See [recovery instructions](../README.md) for restore steps. Do not use `docker compose down -v` or remove data volumes during normal deployment.

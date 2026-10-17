# Private LAN deployment

Use the LAN overlay with the base Compose file:

```sh
sudo docker compose -f compose.yaml -f compose.lan.yaml up -d --build
```

The server `.env` needs `LAN_IP`, `APP_ORIGIN=https://<LAN_IP>`, and a unique 64-character hex `ENCRYPTION_KEY`. Keep this file mode 0600 and back up the key separately. Do not copy a demo database into production.

Caddy binds ports 80/443 on the specified host IP. HTTP redirects to HTTPS; the application remains behind the proxy with secure cookies. Both services restart automatically. App data, encrypted backups and Caddy certificates use persistent Docker volumes.

Caddy uses its internal certificate authority for private IP HTTPS. Export the public root certificate:

```sh
sudo docker compose -f compose.yaml -f compose.lan.yaml cp proxy:/data/caddy/pki/authorities/local/root.crt ./budget-gremlin-root.crt
```

Trust this public certificate on each device that will access the app. Never distribute Caddy's private keys. See [Caddy TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls).

For checks and logs:

```sh
sudo docker compose -f compose.yaml -f compose.lan.yaml ps
sudo docker compose -f compose.yaml -f compose.lan.yaml logs --tail=100 app proxy
curl --cacert budget-gremlin-root.crt https://<LAN_IP>/api/v1/health
```

Create the initial household owner using the setup instructions in the main README. Change the generated initial password in Settings after signing in. Preserve volumes when updating; do not use `down -v`.

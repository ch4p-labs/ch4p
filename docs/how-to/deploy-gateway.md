# How to Deploy the Gateway

This guide covers deploying the ch4p gateway with a tunnel so external messaging channels (Telegram, Discord, Slack, etc.) can reach your agent.

---

## Prerequisites

- A working ch4p installation with at least one channel configured
- A machine with persistent uptime (server, VM, or always-on workstation)
- For webhook-based channels: a publicly accessible URL or a tunneling tool

---

## Start the Gateway in Production Mode

Run the gateway with the `--production` flag:

```bash
ch4p gateway --production
```

Production mode enables:
- Automatic reconnection on channel disconnects
- Structured JSON logging to `~/.ch4p/logs/gateway.log`
- Process supervision (restarts on crash)
- Graceful shutdown on SIGTERM

---

## Configure a Tunnel

Webhook-based channels (Slack, some Telegram modes) require a publicly accessible URL. Use a tunnel to expose your local gateway.

### Option A: Built-in Tunnel

ch4p includes a built-in tunnel powered by a lightweight relay:

```bash
ch4p gateway --tunnel
```

Output:

```
[gateway] Starting gateway...
[gateway] Tunnel established: https://abc123.ch4p.dev
[gateway] Webhook URL: https://abc123.ch4p.dev/webhooks
[gateway] Channels: telegram, slack
[gateway] Ready.
```

The tunnel URL is stable for the lifetime of the process. Configure it as your webhook URL in each platform's settings.

### Option B: Cloudflare Tunnel

For persistent deployments, use Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3847
```

Then set the webhook base URL in config:

```json
{
  "gateway": {
    "port": 3847,
    "webhookBaseUrl": "https://your-tunnel.trycloudflare.com"
  }
}
```

### Option C: Reverse Proxy

If your machine has a public IP and domain, use a reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name ch4p.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3847;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set the corresponding config:

```json
{
  "gateway": {
    "port": 3847,
    "webhookBaseUrl": "https://ch4p.yourdomain.com"
  }
}
```

---

## Configure Gateway Settings

Full gateway configuration in `config.json`:

```json
{
  "gateway": {
    "port": 3847,
    "host": "127.0.0.1",
    "webhookBaseUrl": null,
    "maxConcurrentMessages": 10,
    "messageTimeout": 30000,
    "healthCheck": {
      "enabled": true,
      "path": "/health",
      "interval": 60000
    },
    "logging": {
      "level": "info",
      "file": "~/.ch4p/logs/gateway.log",
      "maxSize": "10mb",
      "maxFiles": 5
    }
  }
}
```

---

## Run as a System Service

### Using systemd (Linux)

Create `/etc/systemd/system/ch4p-gateway.service`:

```ini
[Unit]
Description=ch4p Gateway
After=network.target

[Service]
Type=simple
User=youruser
ExecStart=/usr/local/bin/ch4p gateway --production
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ch4p-gateway
sudo systemctl start ch4p-gateway
```

### Using launchd (macOS)

Create `~/Library/LaunchAgents/com.ch4p.gateway.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ch4p.gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/ch4p</string>
        <string>gateway</string>
        <string>--production</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Load:

```bash
launchctl load ~/Library/LaunchAgents/com.ch4p.gateway.plist
```

---

## Verify the Deployment

Check gateway status:

```bash
ch4p status
```

Expected output:

```
Gateway: running (pid 12345)
Uptime: 2h 15m
Channels:
  telegram  connected  latency=45ms
  slack     connected  latency=120ms
Health: https://abc123.ch4p.dev/health (200 OK)
```

---

## Common Pitfalls

- **Firewall**: Ensure port 3847 (or your configured port) is accessible if not using a tunnel.
- **Webhook registration**: After changing the tunnel URL, re-register webhooks with each platform.
- **Memory**: The gateway holds message queues in memory. Monitor RSS on long-running instances.
- **TLS**: Always use HTTPS for webhook URLs. Most platforms reject plain HTTP.

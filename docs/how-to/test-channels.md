# How to Test Channels

This guide covers verifying that messaging channels work correctly with your ch4p gateway.

---

## Quick Smoke Test

Start the gateway and verify basic health:

```bash
ch4p gateway
curl http://localhost:18789/health
```

Expected output:

```json
{ "status": "ok", "sessions": 0, "timestamp": "..." }
```

---

## Testing Individual Channels

### Telegram

1. Configure the bot token in `~/.ch4p/.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-token
   ```

2. Add the channel to `~/.ch4p/config.json`:
   ```json
   { "channels": { "telegram": { "token": "${TELEGRAM_BOT_TOKEN}" } } }
   ```

3. Start the gateway (`ch4p gateway`) and send a message to your bot in Telegram.

4. Verify the session was created:
   ```bash
   curl http://localhost:18789/sessions
   ```

### Discord

1. Set `DISCORD_BOT_TOKEN` in `~/.ch4p/.env`.

2. Add to config:
   ```json
   { "channels": { "discord": { "token": "${DISCORD_BOT_TOKEN}" } } }
   ```

3. Start the gateway and mention your bot in a Discord server.

### Slack

1. Set `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` in `~/.ch4p/.env`.

2. Add to config:
   ```json
   { "channels": { "slack": { "botToken": "${SLACK_BOT_TOKEN}", "appToken": "${SLACK_APP_TOKEN}" } } }
   ```

3. Start the gateway and message your bot in Slack.

### CLI Channel (Local Testing)

The CLI channel provides a built-in local test surface without any external service:

```json
{ "channels": { "cli": {} } }
```

Start the gateway — a local terminal prompt appears alongside the HTTP server.

---

## Verifying Multi-Session Isolation

When multiple users message your bot, each channel+user pair gets its own session:

1. Start the gateway with at least one channel.
2. Send a message as User A.
3. Send a message as User B (different account).
4. Check sessions:
   ```bash
   curl http://localhost:18789/sessions | jq '.sessions | length'
   ```
   Should return `2`.

5. Verify isolation by asking each user to recall something the other said — they should not share context.

---

## Verifying Session Persistence

Within the same channel+user pair, conversation history persists:

1. Send "My name is Alice" from User A on Telegram.
2. Send "What's my name?" from User A on Telegram.
3. The agent should respond "Alice" — the session maintains context across messages.

---

## Testing Tunnel Exposure

If you need webhook-based channels to reach your gateway:

```json
{ "tunnel": { "provider": "cloudflare" } }
```

Start the gateway — it auto-starts the tunnel and exposes the public URL:

```bash
curl http://localhost:18789/health | jq '.tunnel'
```

Use the tunnel URL as the webhook base for platforms like Slack.

---

## Testing Voice Wake in the Agent REPL

```bash
ch4p agent --voice
```

Verify the session banner shows `Voice: wake`. Speak the wake word (if configured) and confirm the transcription appears as a user message.

---

## Common Issues

- **Channel not starting**: Check that the token/API key is set in `~/.ch4p/.env` and referenced correctly in config.
- **No sessions created**: Verify the channel is listed under `channels` in config and the gateway log shows it as "started".
- **Messages not routing**: Check `curl /sessions` to see if sessions are being created. If the session count stays at 0, the channel adapter may not be receiving messages (check bot permissions, webhook URLs).
- **Session cross-talk**: If users share context, check that each channel adapter provides unique `userId` values in its `InboundMessage`.

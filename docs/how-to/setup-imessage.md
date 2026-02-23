# How-To: Set Up the iMessage Channel

Connect ch4p to Apple iMessage on macOS. The adapter polls `chat.db` for new inbound messages and drives `Messages.app` via JXA (JavaScript for Automation) to send replies.

**Time required:** About 10 minutes.

**Prerequisites:** A working ch4p installation. macOS with Messages.app signed in to iMessage via an Apple ID.

---

## Overview

The iMessage channel uses two macOS-specific mechanisms:

- **Receiving** — polls `~/Library/Messages/chat.db` (SQLite) via the `sqlite3` CLI every 2 seconds (configurable). On startup it records the current maximum ROWID and only processes messages that arrive after that point, so it never replays old message history.
- **Sending** — runs `osascript -l JavaScript` (JXA) to tell `Messages.app` to send a message to a buddy (DM) or a named group chat.

No npm dependencies are required. The adapter uses only Node.js built-ins.

---

## Requirements

| Requirement | Notes |
|---|---|
| macOS | This channel is macOS-only. Linux and Windows are not supported. |
| `sqlite3` CLI | Ships with macOS by default. Run `which sqlite3` to verify. |
| Messages.app | Must be signed in to iMessage via an Apple ID. |
| Full Disk Access | Required so the process can read `chat.db`. |
| Automation permission | Required so `osascript` can drive `Messages.app`. |

---

## Step 1: Grant Full Disk Access

The `chat.db` database is protected by macOS privacy controls. The process running ch4p must have Full Disk Access.

1. Open **System Settings** (macOS Ventura and later) or **System Preferences** (earlier).
2. Go to **Privacy & Security** > **Full Disk Access**.
3. Click the lock icon to allow changes (enter your password).
4. Click **+** and add your terminal application:
   - Terminal.app: navigate to `/Applications/Utilities/Terminal.app`
   - iTerm2: navigate to `/Applications/iTerm.app`
   - If running via a custom Node.js binary: add the `node` executable directly.
5. Ensure the toggle next to your terminal is enabled (blue).
6. Restart your terminal.

If ch4p is running as a background service (e.g., via launchd), add the Node.js binary that runs it, not the terminal.

**Verify it works:**

```bash
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;"
```

If this returns a number, Full Disk Access is working. If it returns an error like "unable to open database", Full Disk Access was not granted correctly.

---

## Step 2: Grant Automation Permission

The first time ch4p sends a message, macOS will display a prompt:

> `"Terminal" wants access to control "Messages". Allowing control will provide access to documents and data in "Messages", and to perform actions within that app.`

Click **OK** to allow it.

If you dismissed the prompt accidentally, or want to pre-grant it:

1. Open **System Settings** > **Privacy & Security** > **Automation**.
2. Find your terminal application in the list.
3. Enable the toggle next to **Messages**.

---

## Step 3: Configure ch4p

Edit `~/.ch4p/config.json` and add an `imessage` entry to the `channels` section:

```json
{
  "engines": {
    "default": "claude-cli"
  },
  "channels": {
    "imessage": {
      "allowedHandles": ["+15551234567", "alice@example.com"],
      "pollInterval": 2000
    }
  }
}
```

Setting `allowedHandles` to a non-empty array means only messages from those handles will be processed. Remove the field (or set it to `[]`) to allow all contacts.

No API tokens or secrets are required for iMessage.

---

## Step 4: Start the Gateway

```bash
ch4p gateway
```

You will see output like:

```
  ch4p Gateway
  ==================================================

  Server listening on 127.0.0.1:18789
  Engine        claude-cli

  Channels:
    imessage    polling     started

  ch4p gateway ready — 1 channel active.
```

The gateway is now running and polling `chat.db` every 2 seconds (or your configured `pollInterval`).

---

## Step 5: Test It

Send an iMessage to yourself from another device (iPhone, iPad, another Mac), or have a contact send you a message.

Within a few seconds you should see the message arrive in your terminal log and the agent reply in the conversation thread.

---

## Configuration Reference

| Field | Type | Default | Description |
|---|---|---|---|
| `allowedHandles` | `string[]` | `[]` (all) | Whitelist of phone numbers or email addresses to accept messages from. Empty or omitted means accept all. |
| `pollInterval` | `number` | `2000` | Polling interval in milliseconds. Lower values are more responsive but consume more CPU. |
| `dbPath` | `string` | `~/Library/Messages/chat.db` | Path to the chat.db file. Override for testing or non-standard setups. |

---

## What Works / What Doesn't

| Feature | Status |
|---|---|
| Receive text messages | Supported |
| Send text replies | Supported |
| Group chats | Supported — detected via `chat_identifier` prefix |
| Thread replies | Supported — thread context via `thread_originator_guid` |
| Receive tapback reactions | Supported — parsed from `associated_message_type` in DB |
| Send tapback reactions | Not supported — JXA limitation (fragile, macOS-version-dependent) |
| Receive attachments | Supported — image, audio, video, and file types |
| Send attachments | Not yet implemented |
| Typing indicators | Not available — not stored in `chat.db` |
| Streaming (edit-in-place responses) | Not available — iMessage protocol limitation |

---

## Troubleshooting

**"Cannot read iMessage database. Grant Full Disk Access..."**

Full Disk Access has not been granted, or was granted to the wrong application. Re-read Step 1 and verify with:

```bash
sqlite3 ~/Library/Messages/chat.db "SELECT 1;"
```

**"Automation permission denied. Allow your terminal to control Messages.app..."**

The osascript automation permission was not granted. Go to System Settings > Privacy & Security > Automation and enable Messages for your terminal. You may need to restart ch4p after granting it.

**"sqlite3 CLI not found on PATH"**

The `sqlite3` binary is missing or not on your PATH. Try:

```bash
xcode-select --install
```

This installs the Xcode Command Line Tools, which include `sqlite3`. After installation, restart your terminal and try again.

**Agent replies with "buddy not found" or similar osascript error**

The phone number or email address format is incorrect. iMessage buddies must be specified exactly as they appear in Messages.app — typically in E.164 format for phone numbers (e.g., `+15551234567` with country code).

**Messages arrive in the DB but the agent never responds**

Check `allowedHandles` in your config. If it contains any entries, only messages from those exact handles will be processed. The sender's handle must match exactly (including `+1` country code prefix for US numbers).

**The channel keeps restarting or `isHealthy` fails**

This usually means `chat.db` has become locked or inaccessible. Check that no other process is holding an exclusive lock on the file, and that Full Disk Access is still granted.

---

## Security Note

`chat.db` contains your complete iMessage history. The adapter establishes a ROWID offset at startup and only processes messages with a higher ROWID, so it never sends old messages to the agent. However, the `sqlite3` process has read access to the entire database file, including all historical messages and attachments.

If you are concerned about privacy, review the `dbPath` option — you can point it at a copy of `chat.db` that you control. The adapter only reads from the database; it never writes to it.

---

## Next Steps

- Restrict which contacts can reach the agent: set `allowedHandles` in your config.
- Combine with other channels: [Add a Channel](add-channel.md)
- See all channel configuration options: [Configuration Reference](../reference/configuration.md)

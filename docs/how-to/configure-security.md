# How to Configure Security

This guide covers configuring ch4p's security subsystem: filesystem scoping, command allowlists, autonomy levels, and running an audit.

---

## Prerequisites

- A working ch4p installation with `~/.ch4p/config.json`
- Understanding of what your agent needs access to

---

## Configure Filesystem Scoping

Filesystem scoping restricts which directories the agent can read from and write to.

Edit `~/.ch4p/config.json`:

```json
{
  "security": {
    "filesystem": {
      "enabled": true,
      "allowedPaths": [
        "~/projects",
        "~/Documents/notes"
      ],
      "blockedPaths": [
        "~/.ssh",
        "~/.gnupg",
        "~/.ch4p/config.json",
        "/etc",
        "/var"
      ],
      "followSymlinks": false
    }
  }
}
```

**Key fields:**

- `allowedPaths`: Directories the agent can access. Paths outside this list are rejected.
- `blockedPaths`: Explicit denials. These override `allowedPaths` if there is overlap.
- `followSymlinks`: When `false` (default), symlinks pointing outside allowed paths are blocked.

To test a path without executing anything:

```bash
ch4p audit --check-path ~/projects/myapp/src
# Output: ALLOWED

ch4p audit --check-path ~/.ssh/id_rsa
# Output: BLOCKED (explicit deny list)
```

---

## Configure the Command Allowlist

The command allowlist controls which shell commands the agent can execute.

```json
{
  "security": {
    "commands": {
      "enabled": true,
      "mode": "allowlist",
      "allowed": [
        "ls", "cat", "head", "tail", "wc",
        "grep", "find", "git",
        "node", "npm", "npx",
        "python3", "pip3"
      ],
      "blocked": [
        "rm -rf",
        "sudo",
        "chmod",
        "chown",
        "curl",
        "wget"
      ],
      "maxExecutionTime": 30000
    }
  }
}
```

**Modes:**

| Mode | Behavior |
|------|----------|
| `allowlist` | Only commands in `allowed` can run. Everything else is rejected. |
| `blocklist` | Everything is allowed except commands in `blocked`. |
| `disabled` | No command execution permitted. |

`maxExecutionTime` is in milliseconds. Commands exceeding this limit are killed.

---

## Set the Autonomy Level

The autonomy level controls how much the agent can do without asking permission.

```json
{
  "security": {
    "autonomy": "supervised"
  }
}
```

**Levels:**

| Level | Read tools | Write tools | System tools |
|-------|-----------|-------------|--------------|
| `locked` | Blocked | Blocked | Blocked |
| `supervised` | Auto-approved | Manual approval | Manual approval |
| `autonomous` | Auto-approved | Auto-approved | Auto-approved |

Start with `supervised`. Move to `autonomous` only after you have verified your filesystem scoping and command allowlist are properly configured.

---

## Configure Output Sanitization

Output sanitization strips sensitive patterns from agent responses before they reach channels.

```json
{
  "security": {
    "sanitization": {
      "enabled": true,
      "patterns": [
        { "regex": "sk-[a-zA-Z0-9]{20,}", "replacement": "[REDACTED_API_KEY]" },
        { "regex": "ghp_[a-zA-Z0-9]{36}", "replacement": "[REDACTED_TOKEN]" },
        { "regex": "\\b\\d{3}-\\d{2}-\\d{4}\\b", "replacement": "[REDACTED_SSN]" }
      ]
    }
  }
}
```

Default patterns are included for common secret formats. Add custom patterns for your environment.

---

## Configure Input Validation

Input validation filters incoming messages before they reach the agent.

```json
{
  "security": {
    "inputValidation": {
      "maxMessageLength": 10000,
      "stripNullBytes": true,
      "stripControlChars": true,
      "rejectPatterns": [
        "ignore previous instructions",
        "you are now"
      ]
    }
  }
}
```

---

## Run a Security Audit

The audit command checks your configuration for weaknesses:

```bash
ch4p audit
```

Sample output:

```
ch4p Security Audit
====================

[PASS] Filesystem scoping enabled
[PASS] Symlink following disabled
[PASS] Command allowlist active (12 commands)
[WARN] Autonomy level is "autonomous" - consider "supervised"
[PASS] Output sanitization enabled (3 patterns)
[PASS] Input validation enabled
[PASS] Null byte stripping enabled
[FAIL] blockedPaths does not include ~/.env
[PASS] Config file is not readable by agent

Summary: 7 passed, 1 warning, 1 failure
```

Fix any failures and re-run until clean.

---

## Run a Full Audit with Report

Generate a detailed report file:

```bash
ch4p audit --full --output audit-report.json
```

This produces a JSON report with every check, its result, and remediation advice.

---

## Common Configurations

**Minimal access (for testing):**

```json
{
  "security": {
    "autonomy": "locked",
    "filesystem": { "enabled": true, "allowedPaths": [] },
    "commands": { "enabled": true, "mode": "disabled" }
  }
}
```

**Developer workstation:**

```json
{
  "security": {
    "autonomy": "supervised",
    "filesystem": { "enabled": true, "allowedPaths": ["~/projects"] },
    "commands": { "enabled": true, "mode": "allowlist", "allowed": ["git", "node", "npm"] }
  }
}
```

# Explanation: Security Model

This document explains the security philosophy behind ch4p. It covers why security defaults are on, how the layered defense model works, and why this matters for a platform connected to messaging surfaces.

---

## The Core Principle: On by Default

Most developer tools treat security as opt-in. You install the tool, everything is open, and you progressively lock things down. ch4p inverts this. Everything is locked down from the first run, and you progressively open up what you need.

This is not a philosophical preference. It is a response to a specific risk profile.

An AI assistant that can read files, execute commands, and broadcast to messaging channels is, by construction, a remote code execution engine with a natural language interface. If the defaults are permissive, a single prompt injection through any of 14+ messaging channels could read your SSH keys, execute arbitrary commands, and exfiltrate the results through the same channel. The attack surface is the union of every connected messaging platform's attack surface.

Starting locked and opening selectively means the blast radius of any single failure is bounded by what you have explicitly allowed.

---

## Layered Defense

ch4p's security is not a single gate. It is a series of layers, each operating independently. A failure in one layer does not compromise the system because the next layer catches it.

### Layer 1: Input Validation

Before a message reaches the agent, it passes through input validation. This layer strips null bytes, removes control characters, enforces length limits, and rejects messages matching known injection patterns.

This is the first line of defense against prompt injection. It does not attempt to detect all possible injections -- that is impossible. Instead, it removes the low-hanging fruit: messages that are obviously crafted to manipulate the agent, messages that use control characters to escape formatting, and messages that are absurdly long (a common resource exhaustion vector).

### Layer 2: Channel-Level Access Control

Each channel has an `allowedUsers` list. Messages from users not on this list are dropped before they reach the agent. This limits who can interact with the system at all.

When `allowedUsers` is empty, all users are allowed. This is explicitly called out during onboarding and flagged by the audit system as a warning. It exists for convenience during development, not as a production configuration.

### Layer 3: Autonomy Gating

When the agent decides to use a tool, the autonomy level determines whether it needs permission. In `supervised` mode (the default), write and system tools require explicit approval from the user. In `locked` mode, no tools execute at all.

This layer defends against the agent being manipulated into taking unwanted actions. Even if a prompt injection convinces the agent that it should delete a file, the security layer independently evaluates whether the agent is allowed to do that, and in supervised mode, asks the user first.

The autonomy system does not trust the agent's judgment. It treats the agent as an untrusted intermediary between the user's intent and the system's capabilities. This is the correct trust model for a system where the agent's behavior is influenced by natural language input from external sources.

### Layer 4: Filesystem Scoping

File operations are constrained to declared paths. This is enforced at the security boundary, not at the tool level. The tool calls `context.security.isPathAllowed()`, and the security system evaluates the path against the allow/block lists with symlink resolution.

This matters because LLMs are creative. Given a file read tool, an LLM might attempt to read `/etc/passwd`, `~/.ssh/id_rsa`, or `../../sensitive-file`. Filesystem scoping makes these attempts fail regardless of how cleverly the path is constructed.

### Layer 5: Command Controls

Shell command execution is gated by an allowlist (by default). Only explicitly permitted commands can run. The command string is parsed to extract the binary name, and piped commands are evaluated segment by segment.

This is perhaps the most critical layer. Shell command execution is the highest-impact capability an agent can have. An unconstrained command execution tool turns the agent into a full remote shell accessible through Telegram. The allowlist ensures that even if the agent is manipulated, it can only run the commands you have explicitly approved.

### Layer 6: Output Sanitization

Before any response reaches a channel, it passes through output sanitization. Regex patterns scan for API keys, tokens, private keys, and other sensitive patterns, replacing them with redaction markers.

This is the last line of defense. If all other layers fail and the agent somehow reads a file containing an API key, output sanitization prevents that key from being broadcast to a messaging channel. It is a catch-all for information leakage.

---

## The ZeroClaw Discipline

ZeroClaw, one of ch4p's predecessor projects, established the principle that security is not a feature you add -- it is a property of the architecture.

In ZeroClaw, every I/O operation passed through a security boundary. There was no way to read a file without the path being checked. There was no way to run a command without the command being evaluated. This was enforced structurally: the tool implementations did not have direct access to the filesystem or shell. They could only act through the security-mediated API.

ch4p preserves this discipline. The `ToolContext` object that tools receive does not include raw `fs` or `child_process` access. It includes `context.security`, which provides mediated access. A tool author who wants to bypass security must deliberately circumvent the interface, which is visible in code review.

---

## The Bagman I/O Boundary

Bagman, another predecessor, contributed the concept of explicit I/O boundaries. The principle: every point where data crosses a trust boundary must be identified and guarded.

ch4p has five trust boundaries, each with a specific guard:

| Boundary | Direction | Guard |
|----------|-----------|-------|
| Channel to Gateway | Inbound | Input validation, user access control |
| Agent to Engine | Outbound | System prompt isolation, context filtering |
| Agent to Tools | Outbound | Autonomy gating, filesystem scoping, command control |
| Tools to Agent | Inbound | Output size limits, result sanitization |
| Agent to Channel | Outbound | Output sanitization |

No data moves between trust domains without passing through a guard. This is not enforced by convention alone -- it is enforced by the architecture. The agent does not have a direct reference to any channel. It returns a response, and the gateway delivers it after sanitization.

---

## Why This Matters for Messaging Surfaces

A traditional CLI tool has one input surface: the terminal. The user is the only person who can send input. There is inherent trust in a single-user, single-input system.

ch4p is fundamentally different. It has 14+ input surfaces, each accessible by different people, each with different authentication models, each operated by a different platform with its own vulnerabilities. A Telegram bot is accessible to anyone who discovers its username. A Discord bot is accessible to anyone in the server. A Slack bot is accessible to anyone in the workspace.

Each of these surfaces is a potential entry point for:

- **Prompt injection**: Crafted messages that manipulate the agent into unwanted actions.
- **Data exfiltration**: Manipulating the agent into reading and relaying sensitive information.
- **Command injection**: Tricking the agent into executing malicious shell commands.
- **Social engineering**: Impersonating a trusted user to bypass access controls.

The multi-surface attack model is what makes ch4p's security posture necessary. A single vulnerability in any one channel could be exploited through that channel to affect the agent's behavior on all channels. The layered defense model ensures that compromising one layer is not sufficient to cause harm.

---

## The Audit System

Security configuration is only useful if you can verify it is correct. ch4p's audit command exists because security settings are complex and misconfiguration is the most common vulnerability.

The audit checks 20 items (see [Security Reference](../reference/security.md)). Some are hard failures (filesystem scoping disabled), some are warnings (autonomy set to autonomous). The audit produces a clear pass/warn/fail report that answers the question: "Is my security configuration actually protecting me?"

The audit is not a one-time setup check. It is designed to be run regularly -- after configuration changes, after updates, before deploying to a new environment. Security is not a state you achieve. It is a property you maintain.

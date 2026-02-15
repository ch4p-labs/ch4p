# Tutorial: Getting Started

This tutorial takes you from zero to a working ch4p agent. By the end you will have installed ch4p, run the onboard wizard, sent a message to your agent, and watched it execute a tool.

**Time required:** About 10 minutes.

**Prerequisites:** Node.js 20 or later. A terminal. An API key for at least one LLM provider (Anthropic, OpenAI, or a local Ollama instance).

---

## Step 1: Install ch4p

Install globally from npm:

```bash
npm install -g ch4p
```

Verify the installation:

```bash
ch4p --version
```

You should see output like:

```
ch4p v0.1.0
```

---

## Step 2: Run the Onboard Wizard

The onboard wizard creates your configuration file and sets up defaults.

```bash
ch4p agent --onboard
```

The wizard asks a series of questions. For this tutorial, use these answers:

```
? Agent name: ch4p
? Primary LLM provider: anthropic
? API key: sk-ant-xxxxx (paste your real key)
? Autonomy level: supervised
? Enable memory: yes
? Memory location: (press Enter for default)
```

When the wizard finishes, it writes `~/.ch4p/config.json` and prints:

```
Onboarding complete. Run `ch4p agent` to start.
```

---

## Step 3: Start the Agent

Launch the agent in interactive mode:

```bash
ch4p agent
```

You will see the agent boot sequence:

```
[ch4p] Loading config from ~/.ch4p/config.json
[ch4p] Engine: anthropic (claude-sonnet-4-20250514)
[ch4p] Memory: sqlite @ ~/.ch4p/memory.db
[ch4p] Security: filesystem scoping ON, command allowlist ON
[ch4p] Agent "ch4p" ready.

ch4p>
```

The `ch4p>` prompt means the agent is running and waiting for input.

---

## Step 4: Send Your First Message

Type a simple message and press Enter:

```
ch4p> Hello, what can you do?
```

The agent responds through the configured LLM engine:

```
ch4p: I'm your personal AI assistant. I can read and write files,
         run commands, search the web, manage your schedule, and more.
         What would you like help with?
```

You have just completed a round-trip through the ch4p message pipeline: your input went through the agent, to the engine, and the response came back through the agent to your terminal.

---

## Step 5: Execute a Tool

Now ask the agent to do something that requires a tool. We will use the file read tool, which is available by default.

```
ch4p> Read the file ~/.ch4p/config.json and tell me what provider I'm using.
```

Because you set the autonomy level to `supervised`, the agent asks for confirmation before executing:

```
ch4p: I'd like to read the file ~/.ch4p/config.json. Approve? [y/n]
```

Type `y` and press Enter:

```
y
```

The agent reads the file and responds:

```
ch4p: Your config shows you're using the "anthropic" provider with
         the model "claude-sonnet-4-20250514".
```

In the terminal, you can see the tool execution logged:

```
[tool] file.read ~/.ch4p/config.json (approved)
[tool] result: 847 bytes read
```

---

## Step 6: Stop the Agent

Press `Ctrl+C` or type `.exit`:

```
ch4p> .exit
[ch4p] Agent stopped.
```

---

## What You Learned

1. **Install** — ch4p installs as a single global npm package.
2. **Onboard** — The wizard creates your configuration with sensible defaults.
3. **Agent** — `ch4p agent` starts an interactive agent session.
4. **Messaging** — You send messages at the prompt and get LLM-powered responses.
5. **Tools** — The agent can use tools (like file read) with your approval.

---

## Next Steps

- Connect an external messaging channel: [First Channel tutorial](first-channel.md)
- Learn about the security settings you saw during boot: [Configure Security](../how-to/configure-security.md)
- Explore all available CLI commands: [CLI Reference](../reference/cli.md)

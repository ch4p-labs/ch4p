# Tutorial: Getting Started

This tutorial takes you from zero to a working ch4p agent. By the end you will have installed ch4p, run the onboard wizard, sent a message to your agent, and watched it execute a tool.

**Time required:** About 10 minutes.

**Prerequisites:** Node.js 20 or later. A terminal. An API key for at least one LLM provider (Anthropic, OpenAI, Google, or a local Ollama instance).

---

## Step 1: Install ch4p

Clone the repository and install dependencies:

```bash
git clone https://github.com/vxcozy/ch4p.git && cd ch4p
corepack pnpm install
corepack pnpm -r build
```

> **Note:** pnpm is managed via corepack — always use `corepack pnpm` instead of bare `pnpm`.

Verify the installation:

```bash
node apps/cli/dist/index.js --version
```

You should see output like:

```
ch4p v0.1.0
```

---

## Step 2: Run the Onboard Wizard

The onboard wizard creates your configuration file and sets up defaults.

```bash
node apps/cli/dist/index.js onboard
```

You'll see the ch4p ASCII banner, then the wizard walks you through five steps:

```
Step 1/5  Anthropic API Key
> API key: ********

Step 2/5  OpenAI API Key (optional)
> API key: (press Enter to skip)

Step 3/5  Preferred Model
1. Claude Sonnet 4 (recommended)
2. Claude Opus 4
3. GPT-4o
4. GPT-4o Mini
> Choice [1]:

Step 4/5  Autonomy Level
1. Read-only
2. Supervised (recommended)
3. Full
> Choice [2]:

Step 5/5  Saving configuration
Config written to ~/.ch4p/config.json
```

When the wizard finishes, it runs a security audit and then plays a Chappie boot-up animation — your robot assistant waking up for the first time.

---

## Step 3: Start the Agent

Launch the agent in interactive mode:

```bash
node apps/cli/dist/index.js agent
```

You'll see the Chappie splash followed by the REPL status:

```
  ch4p v0.1.0 ready.

  Interactive mode. Type /help for commands, /exit to quit.
  Engine: Native Engine | Model: claude-sonnet-4-20250514 | Autonomy: supervised
  Tools: bash, file_read, file_write, file_edit, grep, glob, web_fetch, delegate, memory_store, memory_recall, mcp_client

>
```

The `>` prompt means the agent is running and waiting for input.

---

## Step 4: Send Your First Message

Type a simple message and press Enter:

```
> Hello, what can you do?
```

The agent responds through the configured LLM engine, streaming the response in real time.

You have just completed a round-trip through the ch4p message pipeline: your input went through the agent, to the engine, and the response came back through the agent to your terminal.

---

## Step 5: Execute a Tool

Now ask the agent to do something that requires a tool:

```
> Read the file ~/.ch4p/config.json and tell me what provider I'm using.
```

You'll see tool execution logged in the terminal:

```
  [tool] file_read({"path":"~/.ch4p/config.json"})
  [done] {"content": "..."}
```

The agent reads the file and tells you which provider you're configured to use.

---

## Step 6: Stop the Agent

Type `/exit` or press `Ctrl+C`:

```
> /exit

  Goodbye!
```

---

## What You Learned

1. **Install** — ch4p is a pnpm monorepo built with `corepack pnpm -r build`.
2. **Onboard** — The wizard creates `~/.ch4p/config.json` with sensible defaults.
3. **Agent** — `ch4p agent` starts an interactive agent session with the Chappie splash.
4. **Messaging** — You send messages at the `>` prompt and get LLM-powered responses.
5. **Tools** — The agent can use tools (like file read) to interact with your system.

---

## Next Steps

- Connect an external messaging channel: [First Channel tutorial](first-channel.md)
- Learn about the security settings you saw during boot: [Configure Security](../how-to/configure-security.md)
- Explore all available CLI commands: [CLI Reference](../reference/cli.md)

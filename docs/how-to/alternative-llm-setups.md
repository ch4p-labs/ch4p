# How to Use Alternative LLM Setups

This guide covers three alternative LLM setups: local models via Ollama, the LiteLLM proxy for unified access, and CLI passthrough via the SubprocessEngine.

---

## Option 1: Ollama (Local Models)

Run open-source models locally with zero API keys. Best for privacy-conscious setups or offline use.

### Prerequisites

- [Ollama](https://ollama.ai) installed and running
- A model pulled (e.g., `ollama pull llama3.1`)

### Configuration

```json
{
  "agent": {
    "provider": "ollama",
    "model": "llama3.1"
  },
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

No API key needed. ch4p's Ollama provider talks directly to the local server.

### Available Models

Any model Ollama supports works. Popular choices:

| Model | Size | Good For |
|-------|------|----------|
| `llama3.1` | 8B | General assistant tasks |
| `llama3.1:70b` | 70B | Complex reasoning (needs ~40GB RAM) |
| `mistral` | 7B | Fast, good at code |
| `qwen2.5-coder` | 7B | Code-focused tasks |
| `deepseek-coder-v2` | 16B | Code generation and review |

### Trade-offs

- **Free and private** — nothing leaves your machine
- **No tool use** — most local models don't support function calling well
- **Slower** — depends on your hardware (GPU recommended)
- **Lower quality** — smaller models can't match Claude or GPT-4o on complex tasks

---

## Option 2: LiteLLM Proxy

[LiteLLM](https://github.com/BerriAI/litellm) is an open-source proxy that exposes 100+ LLM providers behind a single OpenAI-compatible API. Useful when you have credentials for various services and want a unified interface.

### Prerequisites

- Python 3.8+ installed
- LiteLLM installed: `pip install litellm[proxy]`

### Start the Proxy

```bash
# Simple: single model
litellm --model claude-sonnet-4-20250514 --port 4000

# Advanced: config file with multiple models and fallbacks
litellm --config litellm_config.yaml --port 4000
```

Example `litellm_config.yaml`:

```yaml
model_list:
  - model_name: default
    litellm_params:
      model: claude-sonnet-4-20250514
      api_key: sk-ant-...
  - model_name: fallback
    litellm_params:
      model: gpt-4o
      api_key: sk-...
```

### ch4p Configuration

Since LiteLLM exposes an OpenAI-compatible endpoint, use the `openai` provider with a custom `baseUrl`:

```json
{
  "agent": {
    "provider": "openai",
    "model": "default"
  },
  "providers": {
    "openai": {
      "apiKey": "sk-litellm",
      "baseUrl": "http://localhost:4000"
    }
  }
}
```

The `apiKey` can be any non-empty string (LiteLLM accepts anything by default) or a real key if you've configured LiteLLM authentication.

### What LiteLLM Gives You

- **Unified API** — one endpoint for Anthropic, OpenAI, Google, Azure, Cohere, Replicate, and 100+ more
- **Fallbacks** — automatically retry on a different model/provider if one fails
- **Load balancing** — distribute requests across multiple API keys or providers
- **Spend tracking** — built-in budget management and usage logging
- **Caching** — optional response caching to reduce costs

### Trade-offs

- **Extra dependency** — Python process running alongside ch4p
- **Still needs API keys** — you configure them in LiteLLM, not ch4p
- **Added latency** — one extra network hop (localhost, so minimal)

---

## Option 3: CLI Passthrough (SubprocessEngine)

Route through any CLI tool that accepts prompts. If you have Claude Code, Codex CLI, or any other LLM CLI installed, ch4p can wrap it.

### Prerequisites

- A CLI tool that accepts text input and produces text output
- The tool must be installed and on your PATH

### Built-in CLI Wrappers

ch4p ships with pre-configured engine IDs for popular CLI tools. Just set `engines.default` — the factory functions handle flags and prompt modes automatically.

**Claude CLI** (requires Claude Code installed):

> **Personal use only:** This setup is intended for personal, local use — ch4p running on your own machine, calling the `claude` binary you installed. Do not use it in a commercial product or multi-user service where ch4p routes your subscription credentials on behalf of other users. For production or shared deployments, use an API key instead (see [console.anthropic.com](https://console.anthropic.com)).

```json
{
  "engines": {
    "default": "claude-cli"
  }
}
```

This spawns `claude --print "<prompt>"` under the hood using your existing Claude Code authentication.

> **Headless permissions:** The gateway passes `--dangerously-skip-permissions` to the `claude` subprocess because Claude Code's interactive permission prompts require a terminal. ch4p's own security layers (filesystem scoping, command allowlist, SSRF guards, output sanitization) provide defense-in-depth above the subprocess. See [Security Reference: Subprocess Engine Security](../reference/security.md#subprocess-engine-security) for details.

**Codex CLI** (requires OpenAI subscription):

```json
{
  "engines": {
    "default": "codex-cli"
  }
}
```

You can override the command path or timeout in the `available` section:

```json
{
  "engines": {
    "default": "claude-cli",
    "available": {
      "claude-cli": {
        "command": "/usr/local/bin/claude",
        "timeout": 120000
      }
    }
  }
}
```

### Custom CLI Tool

Wrap any CLI that reads a prompt and writes a response using a generic subprocess engine:

```json
{
  "engines": {
    "default": "my-tool",
    "available": {
      "my-tool": {
        "type": "subprocess",
        "command": "my-llm-tool",
        "args": [],
        "promptMode": "stdin"
      }
    }
  }
}
```

Prompt modes:
- `"arg"` — prompt passed as the last command-line argument (default)
- `"stdin"` — prompt piped to stdin
- `"flag"` — prompt passed via a flag (e.g., `--prompt "..."`)

### Trade-offs

- **Personal use only (Claude CLI)** — intended for local personal use; do not use in a commercial product or shared service
- **Limited streaming** — output arrives when the subprocess finishes (no real-time token streaming)
- **Depends on external CLI** — if the CLI tool updates or breaks, ch4p is affected

---

## Which Should I Use?

| Situation | Recommendation |
|-----------|---------------|
| Want free + private | Ollama with a local model |
| Have multiple API keys, want fallbacks | LiteLLM proxy |
| Have Claude Max / Pro subscription | CLI passthrough with `claude` (personal use only) |
| Want the best quality | Direct API provider (Anthropic, OpenAI) — the default |
| Offline / air-gapped | Ollama |

All three options work alongside ch4p's full feature set: security, memory, channels, skills, and observability. The main limitation is that local models and CLI passthrough generally don't support tool use, so the agent operates in a simpler ask-and-answer mode.

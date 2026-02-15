# How to Use Alternative LLM Setups

This guide covers three ways to use ch4p without paying for a separate API key: local models via Ollama, the LiteLLM proxy for unified access, and CLI passthrough via the SubprocessEngine.

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

ch4p ships with pre-configured wrappers for popular CLI tools:

**Claude CLI** (requires Claude Code / Max subscription):

```json
{
  "agent": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  },
  "engines": {
    "default": "subprocess",
    "available": {
      "subprocess": {
        "command": "claude",
        "args": ["--print", "--no-input"],
        "promptMode": "arg"
      }
    }
  }
}
```

**Codex CLI** (requires OpenAI subscription):

```json
{
  "engines": {
    "default": "subprocess",
    "available": {
      "subprocess": {
        "command": "codex",
        "args": ["--quiet"],
        "promptMode": "stdin"
      }
    }
  }
}
```

### Custom CLI Tool

Wrap any CLI that reads a prompt and writes a response:

```json
{
  "engines": {
    "default": "subprocess",
    "available": {
      "subprocess": {
        "command": "my-llm-tool",
        "args": [],
        "promptMode": "stdin"
      }
    }
  }
}
```

Prompt modes:
- `"arg"` — prompt passed as the last command-line argument
- `"stdin"` — prompt piped to stdin
- `"flag"` — prompt passed via a flag (e.g., `--prompt "..."`)

### Trade-offs

- **Uses existing subscriptions** — no separate API key needed
- **Limited streaming** — output arrives when the subprocess finishes (no real-time token streaming)
- **No tool use** — the subprocess engine can't do multi-turn tool calling
- **Depends on external CLI** — if the CLI tool updates or breaks, ch4p is affected

---

## Which Should I Use?

| Situation | Recommendation |
|-----------|---------------|
| Want free + private | Ollama with a local model |
| Have multiple API keys, want fallbacks | LiteLLM proxy |
| Have Claude Max / Code subscription | CLI passthrough with `claude` |
| Want the best quality | Direct API provider (Anthropic, OpenAI) — the default |
| Offline / air-gapped | Ollama |

All three options work alongside ch4p's full feature set: security, memory, channels, skills, and observability. The main limitation is that local models and CLI passthrough generally don't support tool use, so the agent operates in a simpler ask-and-answer mode.

# Explanation: Concurrency

This document explains why ch4p uses BEAM-inspired concurrency patterns, what problems they solve, and how supervision trees, worker threads, live steering, and backpressure fit together.

---

## The Problem

A personal AI assistant connected to 14+ messaging channels has a concurrency problem that most Node.js applications do not face.

Consider what happens when messages arrive from Telegram, Discord, and Slack simultaneously. Each message triggers a conversation with an LLM that may involve multiple tool calls. Each tool call may read files, run commands, or query memory. Some of these operations are fast (memory lookup), some are slow (LLM completion), and some are unpredictable (shell commands).

A naive implementation processes messages sequentially. This means a slow LLM response on one channel blocks responses on all other channels. Users on Telegram wait because someone on Discord asked a question that triggered a long tool chain.

The other naive approach is unbounded parallelism: process every message concurrently. This works until three users ask the agent to run expensive operations simultaneously, exhausting system resources or hitting rate limits.

ch4p needs something in between: structured concurrency with supervision, resource awareness, and the ability to intervene in running work.

---

## Why BEAM

The BEAM virtual machine (Erlang/Elixir) solved this class of problem decades ago for telecom systems. Its key insights are:

1. **Lightweight processes** — Thousands of concurrent tasks, each isolated.
2. **Supervision trees** — If a task crashes, a supervisor decides what to do (restart, ignore, escalate).
3. **Message passing** — Tasks communicate through messages, not shared state.
4. **Let it crash** — Rather than defensive error handling everywhere, let failing tasks crash and be restarted by their supervisor.

These ideas translate well to Node.js through worker threads and structured async patterns. ch4p does not reimplement BEAM -- it applies BEAM's architectural patterns using Node.js primitives.

---

## Supervision Trees

ch4p organizes concurrent work into a supervision tree:

```
RootSupervisor
  |
  +-- GatewaySupervisor
  |     +-- TelegramWorker
  |     +-- DiscordWorker
  |     +-- SlackWorker
  |
  +-- AgentSupervisor
  |     +-- MessageProcessor (pool)
  |     +-- ToolExecutor (pool)
  |
  +-- MemorySupervisor
        +-- EmbeddingWorker
        +-- CompactionWorker
```

Each supervisor monitors its children. When a child crashes, the supervisor applies a restart strategy:

| Strategy | Behavior |
|----------|----------|
| `one_for_one` | Restart only the crashed child. |
| `one_for_all` | Restart all children when one crashes. |
| `rest_for_one` | Restart the crashed child and all children started after it. |

Channel workers use `one_for_one`: a Telegram crash should not affect Discord. The agent supervisor uses `one_for_one` as well: a failed tool execution should not kill the message processor.

The restart strategy also includes rate limiting. If a child crashes more than N times in M seconds, the supervisor escalates to its parent rather than restart-looping forever.

---

## Worker Threads

Node.js has a single event loop, which is excellent for I/O but problematic for CPU work. ch4p offloads three categories of work to worker threads:

**Embedding generation.** Computing vector embeddings for memory storage is CPU-intensive. The EmbeddingWorker runs the ONNX runtime in a separate thread so embedding computation does not block the event loop.

**Tool execution.** Some tools run shell commands or perform file operations that could block. The ToolExecutor pool runs these in worker threads with timeouts.

**Message processing.** When multiple messages arrive simultaneously, the MessageProcessor pool distributes them across workers. Each worker handles one message at a time, maintaining isolation.

Workers communicate with the main thread through structured message passing (Node.js `parentPort` / `workerData`). They do not share state. This isolation means a crash in one worker cannot corrupt another worker's data.

---

## Live Steering

Live steering is the ability to influence a running operation without waiting for it to complete. In ch4p, this manifests in two ways:

**Cancellation.** When a user sends a follow-up message while the agent is still processing their previous one, ch4p can cancel the in-progress operation. The AbortController pattern propagates cancellation through the LLM request, tool executions, and any pending I/O.

**Priority adjustment.** Messages from different channels or with different urgency can be reprioritized while queued. A message marked urgent jumps ahead of messages still waiting for a worker.

Live steering matters because LLM completions can take 10-30 seconds. Without cancellation, a user who changes their mind must wait for the full completion before the agent can respond to their correction. With live steering, the abort propagates immediately.

---

## Backpressure

Backpressure prevents the system from accepting more work than it can handle. Without it, a burst of messages fills memory with queued work and eventually crashes the process.

ch4p implements backpressure at three levels:

**Channel level.** Each channel has a queue with a configurable maximum depth (`maxConcurrentMessages` in gateway config). When the queue is full, the channel stops accepting new messages. For polling-based channels, polling pauses. For webhook-based channels, the gateway returns HTTP 429 (Too Many Requests), and the platform retries later.

**Agent level.** The message processor pool has a fixed size. When all workers are busy, new messages wait in a bounded queue. If the queue reaches capacity, the gateway receives backpressure and propagates it to channels.

**Engine level.** LLM API calls are rate-limited per provider. ch4p tracks the rate limit headers from API responses and throttles requests to stay within limits. When approaching a rate limit, the agent slows down rather than hitting the limit and receiving errors.

The backpressure chain works like this:

```
LLM rate limit reached
  -> Agent throttles new completions
  -> Message queue fills up
  -> Gateway receives backpressure
  -> Channels pause message ingestion
  -> Platforms buffer or retry
```

Every component in the chain responds to pressure from the component below it. No component drops messages silently. The user either receives a delayed response or a message indicating the system is busy.

---

## Trade-offs

This concurrency model has costs:

**Complexity.** Supervision trees and worker thread pools are more complex than a simple sequential loop. The codebase has more moving parts, and debugging concurrent issues is harder.

**Memory overhead.** Each worker thread has its own V8 isolate, consuming 5-15 MB of RAM. A system with many workers uses more memory than a single-threaded design.

**Latency for single users.** If you only ever use ch4p from one channel with one message at a time, the concurrency machinery adds no benefit and a small amount of overhead. The design optimizes for the multi-channel, multi-user case.

These trade-offs are acceptable because the alternative -- a system that blocks, drops messages, or crashes under load -- is worse for a platform that is always connected to external messaging surfaces. A Telegram bot that stops responding for 30 seconds because someone on Discord triggered a long tool chain is a broken product, not a slow one.

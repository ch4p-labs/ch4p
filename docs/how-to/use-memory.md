# How to Use the Memory System

This guide covers storing, recalling, and forgetting information in ch4p's persistent memory. It also covers configuring hybrid search weights.

---

## Prerequisites

- A working ch4p installation with memory enabled in `config.json`
- Memory uses SQLite and requires no external services

---

## Store a Memory

### Through the Agent

Ask the agent to remember something:

```
ch4p> Remember that the project deadline is March 15th.
```

The agent stores this as a memory entry with automatic metadata extraction.

### Programmatically via the IMemory Interface

```typescript
await memory.store({
  content: 'Project deadline is March 15th.',
  metadata: {
    source: 'user',
    category: 'deadlines',
    tags: ['project', 'deadline'],
  },
});
```

### Via the CLI

```bash
ch4p message --tool memory.store --input '{
  "content": "Project deadline is March 15th.",
  "tags": ["project", "deadline"]
}'
```

---

## Recall Memories

### Through the Agent

Ask the agent to recall:

```
ch4p> What do you remember about the project deadline?
```

The agent searches memory using hybrid search and includes relevant results in its response.

### Programmatically

```typescript
const results = await memory.recall({
  query: 'project deadline',
  limit: 5,
  threshold: 0.3,
});

for (const result of results) {
  console.log(result.content);    // The stored text
  console.log(result.score);      // Combined relevance score (0-1)
  console.log(result.metadata);   // Tags, source, timestamps
}
```

### Via the CLI

```bash
ch4p message --tool memory.recall --input '{"query": "project deadline"}'
```

---

## Forget Memories

### Through the Agent

```
ch4p> Forget everything about the old project deadline.
```

### Programmatically

Forget by ID:

```typescript
await memory.forget({ id: 'mem_abc123' });
```

Forget by query (removes all matching entries):

```typescript
await memory.forget({
  query: 'old project deadline',
  confirmAll: true,
});
```

### Via the CLI

```bash
ch4p message --tool memory.forget --input '{"id": "mem_abc123"}'
```

---

## Configure Hybrid Search Weights

ch4p memory uses two search strategies simultaneously:

1. **FTS5 (Full-Text Search)** — BM25-based keyword matching
2. **Vector search** — Cosine similarity on embeddings

The combined score is a weighted blend of both. Configure the weights in `config.json`:

```json
{
  "memory": {
    "enabled": true,
    "path": "~/.ch4p/memory.db",
    "search": {
      "ftsWeight": 0.4,
      "vectorWeight": 0.6,
      "minScore": 0.2,
      "maxResults": 20
    }
  }
}
```

**Fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `ftsWeight` | number | `0.4` | Weight for FTS5/BM25 score (0-1). |
| `vectorWeight` | number | `0.6` | Weight for vector cosine similarity (0-1). |
| `minScore` | number | `0.2` | Minimum combined score to include in results. |
| `maxResults` | number | `20` | Maximum number of results returned. |

Weights must sum to 1.0.

**Tuning guidance:**

- Increase `ftsWeight` when exact keyword matches matter (names, IDs, technical terms).
- Increase `vectorWeight` when semantic similarity matters (concepts, paraphrased questions).
- Lower `minScore` to get more results at the cost of relevance.

---

## Configure Embedding

Vector search requires an embedding model. Configure it in the memory section:

```json
{
  "memory": {
    "embedding": {
      "provider": "local",
      "model": "all-MiniLM-L6-v2",
      "dimensions": 384
    }
  }
}
```

**Providers:**

| Provider | Description | Requires API key |
|----------|-------------|-----------------|
| `local` | Runs the model locally via ONNX runtime. No network calls. | No |
| `openai` | Uses OpenAI's embedding API. | Yes |
| `anthropic` | Uses Anthropic's embedding API (if available). | Yes |

The `local` provider is the default and requires no configuration beyond what the onboard wizard sets up.

---

## Inspect Memory State

View memory statistics:

```bash
ch4p status --memory
```

Output:

```
Memory: ~/.ch4p/memory.db
  Entries: 247
  Database size: 3.2 MB
  FTS index: healthy
  Vector index: healthy (384 dimensions)
  Last compaction: 2 days ago
```

---

## Export and Import

Export all memories to JSON:

```bash
ch4p tools --run memory.export --input '{"path": "./memories-backup.json"}'
```

Import from a JSON file:

```bash
ch4p tools --run memory.import --input '{"path": "./memories-backup.json"}'
```

---

## Common Pitfalls

- **Duplicate entries**: The agent may store duplicate memories for repeated conversations. Use tags and metadata to deduplicate.
- **Large content**: Very long content strings are truncated at embedding time. Store a concise summary rather than raw dumps.
- **Score interpretation**: A combined score of 0.8+ is a strong match. Scores below 0.3 are often noise.
- **Compaction**: SQLite databases grow over time. Run `ch4p doctor --compact-memory` periodically.

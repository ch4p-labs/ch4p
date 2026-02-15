# Explanation: Memory

This document explains why ch4p uses hybrid search combining FTS5 and vector similarity in SQLite, what trade-offs this involves compared to external services, and how BM25 and cosine similarity complement each other.

---

## The Problem Memory Solves

An AI assistant without persistent memory forgets everything between conversations. Each interaction starts from zero. The user must re-explain their preferences, their project context, their ongoing tasks.

Persistent memory transforms the assistant from a stateless tool into something closer to a collaborator. It remembers that your project deadline is March 15th, that you prefer TypeScript over JavaScript, that the database migration failed last Tuesday. This context makes the assistant's responses more useful without the user repeating themselves.

The challenge is retrieval. Storing information is trivial -- any database can do it. Retrieving the right information at the right time, from potentially thousands of stored memories, in response to a natural language query, is the hard problem.

---

## Why Hybrid Search

There are two dominant approaches to search over unstructured text:

**Keyword search (BM25)** — Finds documents that contain the query terms. Scores them by term frequency and inverse document frequency. Fast, precise, well-understood. Fails when the user and the stored text use different words for the same concept.

**Semantic search (vector similarity)** — Encodes both the query and the stored text as vectors (embeddings). Finds the most similar vectors by cosine distance. Handles paraphrasing and conceptual similarity well. Fails when exact matches matter (names, IDs, specific technical terms) because the embedding blurs specifics into a general meaning space.

Neither approach alone is sufficient. Consider these examples:

| Query | Best approach | Why |
|-------|---------------|-----|
| "project deadline" | BM25 | Exact keyword match on "deadline" |
| "when is the project due?" | Vector | No shared keywords with "deadline is March 15th" |
| "JIRA-1234" | BM25 | Ticket IDs have no semantic meaning to embeddings |
| "that auth bug we discussed" | Vector | Conversational reference, no exact keyword match |

Hybrid search runs both approaches on every query and combines their scores. The user does not need to know which approach will work better -- the system tries both and merges the results.

---

## How BM25 and Cosine Similarity Complement Each Other

BM25 and cosine similarity have complementary failure modes, which is exactly what you want in a combined system.

### BM25 (FTS5)

BM25 scores a document based on:

- **Term frequency (TF):** How often the query terms appear in the document.
- **Inverse document frequency (IDF):** How rare the query terms are across all documents. Rare terms score higher.
- **Document length normalization:** Shorter documents with the same term frequency score higher.

**Strengths:** Precise keyword matching, no computational overhead for index updates, handles technical jargon and identifiers well, scores are interpretable.

**Weaknesses:** Cannot handle synonyms or paraphrases, word order is mostly ignored, no understanding of meaning.

### Cosine Similarity (Vector Search)

Cosine similarity computes the angle between two vectors in embedding space:

```
similarity = dot(A, B) / (||A|| * ||B||)
```

The embedding model maps text into a dense vector where semantically similar texts are nearby.

**Strengths:** Handles paraphrasing, understands conceptual similarity, works across different phrasings of the same idea.

**Weaknesses:** Blurs specifics (IDs, names, exact phrases), requires embedding computation on store and query, scores are less interpretable, the quality ceiling is set by the embedding model.

### Combined Scoring

ch4p combines the two scores with configurable weights:

```
combined = (ftsWeight * bm25Score) + (vectorWeight * cosineScore)
```

Both scores are normalized to [0, 1] before combining. The default weights (0.4 FTS, 0.6 vector) slightly favor semantic similarity because most natural language queries benefit from it. But the FTS component ensures that exact matches always surface.

---

## Why SQLite

Most AI assistant platforms use external services for memory: Pinecone for vector search, Elasticsearch for full-text search, Redis for caching. ch4p uses SQLite for everything.

This is a deliberate architectural choice with specific trade-offs.

### Arguments for SQLite

**Zero dependencies.** ch4p's memory system requires no external services, no running databases, no API keys, no network connections. You install ch4p and memory works. This matters for a personal assistant -- the user should not need to operate a database cluster to remember their preferences.

**Single-file portability.** The entire memory database is one file (`memory.db`). You can back it up by copying a file. You can move it between machines. You can inspect it with any SQLite client. There is no migration, no schema versioning, no cluster coordination.

**FTS5 is built in.** SQLite's FTS5 extension provides production-quality full-text search with BM25 scoring out of the box. No external search engine needed.

**Transactional consistency.** Stores and recalls happen within SQLite transactions. There is no possibility of a partial write or an inconsistent read. External service architectures must handle eventual consistency, network failures, and partial updates.

**Performance at personal scale.** A personal assistant stores hundreds to low thousands of memories. SQLite handles this volume trivially. Read queries return in under a millisecond. The performance ceiling of SQLite (millions of rows, gigabytes of data) is far above what a personal assistant will ever need.

### Arguments Against SQLite (and Why We Accept Them)

**No built-in vector index.** SQLite does not have a native vector search index. ch4p stores embeddings as BLOBs and computes cosine similarity in application code. For large datasets, this is a brute-force scan. At personal scale (thousands of entries), this completes in milliseconds. At enterprise scale (millions of entries), it would not work. ch4p is not designed for enterprise scale.

**Single-writer limitation.** SQLite allows one writer at a time. In ch4p, this means concurrent memory stores are serialized. Since memory stores happen far less frequently than reads, and each store takes microseconds, this is not a practical bottleneck.

**No distributed access.** The memory database is a local file. It cannot be shared across machines without file synchronization. For a personal assistant running on one machine, this is not a limitation. For a multi-node deployment, it would be.

---

## The Embedding Pipeline

When a memory is stored:

1. The content string is passed to the embedding model.
2. The embedding model returns a dense vector (384 dimensions by default with all-MiniLM-L6-v2).
3. The vector is stored as a BLOB alongside the text content.
4. The text content is also indexed in the FTS5 table.

When a memory is recalled:

1. The query string is embedded using the same model.
2. The FTS5 table is queried for BM25 matches.
3. The vector table is scanned for cosine similarity matches.
4. Results from both are merged, deduplicated, and scored with the configured weights.
5. Results below `minScore` are filtered out.

The embedding model runs locally by default (ONNX runtime in a worker thread). This means memory operations never leave the machine. No API calls, no data sent to external services. For users who prefer higher-quality embeddings, the configuration supports external embedding APIs (OpenAI, etc.), but this is opt-in.

---

## Compaction

Over time, the SQLite database accumulates deleted entries, fragmented pages, and orphaned FTS index entries. The `compact()` operation runs SQLite's VACUUM command, which rebuilds the database file from scratch, reclaiming space and defragmenting storage.

Compaction is not automatic. It is triggered manually (`ch4p doctor --compact-memory`) or programmatically. This is deliberate: VACUUM rewrites the entire database file, which takes time proportional to database size and temporarily doubles disk usage. Running it automatically could surprise users with unexpected disk usage spikes.

The recommended cadence is to compact after deleting a significant number of memories, or when the database file size seems disproportionate to the number of entries.

---

## Why Not a Vector Database?

Dedicated vector databases (Pinecone, Weaviate, Qdrant, ChromaDB) offer purpose-built vector indexing with approximate nearest neighbor algorithms (HNSW, IVF) that scale to millions of vectors.

ch4p does not use them because:

1. **Dependency burden.** Each external service is a dependency to install, configure, monitor, and pay for. A personal assistant should not require operating infrastructure.
2. **Scale mismatch.** ANN algorithms shine at millions to billions of vectors. At thousands of vectors, brute-force cosine similarity is faster than the overhead of maintaining an ANN index.
3. **Data residency.** Personal memories (preferences, habits, conversations) are sensitive. Storing them in a cloud vector database means trusting that service with personal data. Local SQLite keeps everything on the user's machine.
4. **Hybrid search.** Most vector databases do not provide full-text search. You would need a second system (Elasticsearch, Meilisearch) for keyword search. ch4p's SQLite approach provides both in one file.

The trade-off is that ch4p's memory will not scale to millions of entries. For a personal assistant, this is not a limitation you will encounter.

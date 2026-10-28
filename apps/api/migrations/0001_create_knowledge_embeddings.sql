
CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding_json TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    CHECK (embedding_dimensions > 0),
    CHECK (length(embedding_json) > 0)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_embeddings_model
ON knowledge_embeddings (embedding_model);

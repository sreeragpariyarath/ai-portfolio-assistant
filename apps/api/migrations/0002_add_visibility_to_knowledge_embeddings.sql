
ALTER TABLE knowledge_embeddings
ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
CHECK (visibility = 'public');

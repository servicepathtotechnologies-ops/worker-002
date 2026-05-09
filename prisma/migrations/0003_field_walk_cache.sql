-- field_walk_cache: persists per-field AI explanations generated during the
-- "Walk Me Through All Fields" wizard walk-through, keyed by workflow/node/field.
-- Rows expire after 7 days (handled by the backend; no cron needed for MVP).

CREATE TABLE IF NOT EXISTS field_walk_cache (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id TEXT        NOT NULL,
  node_id     TEXT        NOT NULL,
  field_name  TEXT        NOT NULL,
  description JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  CONSTRAINT field_walk_cache_unique UNIQUE (workflow_id, node_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_field_walk_cache_lookup
  ON field_walk_cache (workflow_id, node_id);

CREATE INDEX IF NOT EXISTS idx_field_walk_cache_expires
  ON field_walk_cache (expires_at);

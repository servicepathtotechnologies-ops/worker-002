-- ============================================================
-- 020 — Identity Links Type Alignment + Backfill
--
-- WHY: identity_links was created with TEXT columns for canonical_user_id and
-- linked_user_id, but public.users.id is UUID.  The type mismatch prevents
-- adding a proper FK and causes implicit casts on every lookup query.
-- All existing values are valid UUIDs (verified before this migration ran).
--
-- Also backfills identity_links for any new duplicate users (same email,
-- different IDs) created after migration 018 ran.
-- ============================================================

-- ── 1. Cast identity_links columns from TEXT → UUID ───────────────────────────
-- The index on linked_user_id is recreated automatically after the type change.

ALTER TABLE public.identity_links
  ALTER COLUMN canonical_user_id TYPE UUID USING canonical_user_id::uuid,
  ALTER COLUMN linked_user_id    TYPE UUID USING linked_user_id::uuid;


-- ── 2. Add FK from identity_links.canonical_user_id → public.users(id) ────────
-- linked_user_id intentionally has no FK: it can hold Cognito subs that arrive
-- before ensureUserRows has created their public.users row.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'identity_links_canonical_fkey'
  ) THEN
    ALTER TABLE public.identity_links
      ADD CONSTRAINT identity_links_canonical_fkey
      FOREIGN KEY (canonical_user_id) REFERENCES public.users(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END;
$$;


-- ── 3. Backfill identity_links for post-018 duplicates ────────────────────────
-- Finds all email groups with >1 user row, picks the oldest as canonical,
-- and inserts links for the newer duplicates.
-- ON CONFLICT DO NOTHING makes this idempotent.

INSERT INTO identity_links (canonical_user_id, linked_user_id)
SELECT
  oldest.id::uuid  AS canonical_user_id,
  newer.id::uuid   AS linked_user_id
FROM public.users newer
JOIN (
  SELECT DISTINCT ON (LOWER(email)) id, LOWER(email) AS norm_email
  FROM public.users
  WHERE email NOT LIKE '%@cognito.local'
    AND email IS NOT NULL
    AND email <> ''
  ORDER BY LOWER(email), created_at ASC
) oldest ON LOWER(newer.email) = oldest.norm_email
         AND newer.id <> oldest.id
WHERE newer.email NOT LIKE '%@cognito.local'
  AND newer.email IS NOT NULL
ON CONFLICT (linked_user_id) DO NOTHING;

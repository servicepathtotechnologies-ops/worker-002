-- ============================================================
-- 018 — Identity Links + Duplicate User Merge
--
-- WHY: Users who registered with email/password and later signed
-- in with Google/Facebook/GitHub OAuth end up with two separate
-- Cognito sub IDs in the DB.  This migration:
--
--   1. Creates an identity_links table to track sub → canonical_id mapping.
--   2. Merges ALL data (workflows, executions, credentials, tokens, roles,
--      subscriptions) from newer duplicate users into the oldest (canonical)
--      user for each email address.
--   3. Deletes the now-empty duplicate user rows.
-- ============================================================

-- 1. Identity links table -------------------------------------------------------

CREATE TABLE IF NOT EXISTS identity_links (
  id               BIGSERIAL PRIMARY KEY,
  canonical_user_id TEXT NOT NULL,
  linked_user_id    TEXT NOT NULL,
  provider          TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT identity_links_linked_key UNIQUE (linked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_links_canonical ON identity_links (canonical_user_id);
CREATE INDEX IF NOT EXISTS idx_identity_links_linked    ON identity_links (linked_user_id);


-- 2. Merge duplicate users (same email, different IDs) -------------------------

DO $$
DECLARE
  rec          RECORD;
  canonical_id TEXT;
  dup_ids      TEXT[];
BEGIN
  FOR rec IN
    SELECT
      LOWER(email) AS norm_email,
      array_agg(id ORDER BY created_at ASC) AS all_ids
    FROM users
    WHERE email NOT LIKE '%@cognito.local'
      AND email IS NOT NULL
      AND email <> ''
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  LOOP
    canonical_id := rec.all_ids[1];
    dup_ids      := rec.all_ids[2:];   -- everything after the oldest

    RAISE NOTICE '[018] Merging % duplicate(s) for % → canonical %',
      array_length(dup_ids, 1), rec.norm_email, canonical_id;

    -- workflows
    UPDATE workflows
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND id NOT IN (SELECT id FROM workflows WHERE user_id = canonical_id);

    DELETE FROM workflows WHERE user_id = ANY(dup_ids);

    -- executions
    UPDATE executions
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND id NOT IN (SELECT id FROM executions WHERE user_id = canonical_id);

    DELETE FROM executions WHERE user_id = ANY(dup_ids);

    -- user_credentials
    UPDATE user_credentials
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND (canonical_id, service) NOT IN (
         SELECT user_id, service FROM user_credentials WHERE user_id = canonical_id
       );
    DELETE FROM user_credentials WHERE user_id = ANY(dup_ids);

    -- credential_vault
    UPDATE credential_vault
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND (canonical_id, key) NOT IN (
         SELECT user_id, key FROM credential_vault WHERE user_id = canonical_id
       );
    DELETE FROM credential_vault WHERE user_id = ANY(dup_ids);

    -- google_oauth_tokens
    UPDATE google_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM google_oauth_tokens);
    DELETE FROM google_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- social_tokens
    UPDATE social_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND (canonical_id, provider) NOT IN (
         SELECT user_id, provider FROM social_tokens WHERE user_id = canonical_id
       );
    DELETE FROM social_tokens WHERE user_id = ANY(dup_ids);

    -- linkedin_oauth_tokens
    UPDATE linkedin_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM linkedin_oauth_tokens);
    DELETE FROM linkedin_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- notion_oauth_tokens
    UPDATE notion_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM notion_oauth_tokens);
    DELETE FROM notion_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- twitter_oauth_tokens
    UPDATE twitter_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM twitter_oauth_tokens);
    DELETE FROM twitter_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- instagram_oauth_tokens
    UPDATE instagram_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM instagram_oauth_tokens);
    DELETE FROM instagram_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- whatsapp_oauth_tokens (social_tokens table — already handled above)

    -- salesforce_oauth_tokens
    UPDATE salesforce_oauth_tokens
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM salesforce_oauth_tokens);
    DELETE FROM salesforce_oauth_tokens WHERE user_id = ANY(dup_ids);

    -- user_roles
    UPDATE user_roles
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND (canonical_id, role) NOT IN (
         SELECT user_id, role FROM user_roles WHERE user_id = canonical_id
       );
    DELETE FROM user_roles WHERE user_id = ANY(dup_ids);

    -- subscriptions
    UPDATE subscriptions
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM subscriptions WHERE user_id = canonical_id);
    DELETE FROM subscriptions WHERE user_id = ANY(dup_ids);

    -- profiles
    UPDATE profiles
       SET user_id = canonical_id
     WHERE user_id = ANY(dup_ids)
       AND canonical_id NOT IN (SELECT user_id FROM profiles);
    DELETE FROM profiles WHERE user_id = ANY(dup_ids);

    -- record the links so the identity-resolver can cache them
    INSERT INTO identity_links (canonical_user_id, linked_user_id)
    SELECT canonical_id, unnest(dup_ids)
    ON CONFLICT (linked_user_id) DO NOTHING;

    -- remove the now-empty duplicate user rows
    DELETE FROM users WHERE id = ANY(dup_ids);

  END LOOP;
END;
$$;

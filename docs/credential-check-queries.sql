-- ============================================
-- CREDENTIAL CHECK QUERIES
-- Use these queries to check if your HubSpot credentials are stored
-- ============================================

-- ============================================
-- 1. CHECK ALL YOUR CREDENTIALS
-- ============================================
-- Shows all credentials stored for your user account
-- Option A: Use auth.uid() (automatically gets current user)
SELECT 
  id,
  user_id,
  service,
  credentials,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()  -- Automatically uses current logged-in user
ORDER BY service, updated_at DESC;

-- Option B: Use specific user ID (if you know it)
-- SELECT 
--   id,
--   user_id,
--   service,
--   credentials,
--   created_at,
--   updated_at
-- FROM user_credentials
-- WHERE user_id = 'b4edf5df-b307-489e-86af-ba370772a636'::uuid  -- Your specific user ID
-- ORDER BY service, updated_at DESC;

-- ============================================
-- 2. CHECK HUBSPOT CREDENTIALS SPECIFICALLY
-- ============================================
-- Check if HubSpot API key is stored
-- Option A: Use auth.uid() (current user)
SELECT 
  id,
  user_id,
  service,
  credentials->>'apiKey' as api_key,  -- Extract API key (if stored)
  credentials->>'api_key' as api_key_alt,  -- Alternative field name
  credentials,  -- Full credentials object
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()
  AND service = 'hubspot';

-- Option B: Use specific user ID
-- SELECT 
--   id,
--   user_id,
--   service,
--   credentials->>'apiKey' as api_key,
--   credentials->>'api_key' as api_key_alt,
--   credentials,
--   created_at,
--   updated_at
-- FROM user_credentials
-- WHERE user_id = 'b4edf5df-b307-489e-86af-ba370772a636'::uuid
--   AND service = 'hubspot';

-- ============================================
-- 3. CHECK HUBSPOT CREDENTIALS (DETAILED)
-- ============================================
-- More detailed view of HubSpot credentials
SELECT 
  id,
  user_id,
  service,
  jsonb_pretty(credentials) as credentials_formatted,  -- Pretty print JSON
  created_at,
  updated_at,
  CASE 
    WHEN credentials ? 'apiKey' THEN 'API Key found'
    WHEN credentials ? 'api_key' THEN 'API Key found (alt)'
    WHEN credentials ? 'accessToken' THEN 'OAuth Token found'
    ELSE 'Unknown format'
  END as credential_type
FROM user_credentials
WHERE user_id = auth.uid()
  AND service = 'hubspot';

-- ============================================
-- 4. CHECK ALL CRM CREDENTIALS
-- ============================================
-- Check all CRM-related credentials (HubSpot, Zoho, Pipedrive, etc.)
SELECT 
  id,
  user_id,
  service,
  credentials,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()
  AND service IN ('hubspot', 'zoho', 'pipedrive', 'salesforce', 'notion', 'airtable', 'clickup')
ORDER BY service;

-- ============================================
-- 5. CHECK IF HUBSPOT CREDENTIAL EXISTS
-- ============================================
-- Simple boolean check - returns true/false
SELECT EXISTS(
  SELECT 1 
  FROM user_credentials
  WHERE user_id = auth.uid()
    AND service = 'hubspot'
    AND (
      credentials ? 'apiKey' OR 
      credentials ? 'api_key' OR 
      credentials ? 'accessToken'
    )
) as hubspot_credential_exists;

-- ============================================
-- 6. COUNT YOUR CREDENTIALS BY SERVICE
-- ============================================
-- See how many credentials you have per service
SELECT 
  service,
  COUNT(*) as credential_count,
  MAX(updated_at) as last_updated
FROM user_credentials
WHERE user_id = auth.uid()
GROUP BY service
ORDER BY last_updated DESC;

-- ============================================
-- 7. CHECK CREDENTIALS WITH EXPIRY (OAuth)
-- ============================================
-- For OAuth tokens that might expire
SELECT 
  id,
  user_id,
  service,
  credentials->>'accessToken' as access_token,
  credentials->>'refreshToken' as refresh_token,
  credentials->>'expiresAt' as expires_at,
  CASE 
    WHEN (credentials->>'expiresAt')::timestamp > NOW() THEN 'Valid'
    WHEN credentials->>'refreshToken' IS NOT NULL THEN 'Can Refresh'
    ELSE 'Expired'
  END as token_status,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()
  AND service = 'hubspot'
  AND (credentials ? 'accessToken' OR credentials ? 'expiresAt');

-- ============================================
-- 8. CHECK WORKFLOW-SPECIFIC CREDENTIALS
-- ============================================
-- If credentials are stored per workflow (if you have workflow_credentials table)
-- Note: This table might not exist, adjust based on your schema
SELECT 
  wc.id,
  wc.workflow_id,
  wc.credential_name,
  wc.credential_value,
  wc.created_at
FROM workflow_credentials wc
JOIN workflows w ON w.id = wc.workflow_id
WHERE w.user_id = auth.uid()
  AND wc.credential_name ILIKE '%hubspot%'
ORDER BY wc.created_at DESC;

-- ============================================
-- 9. CHECK GOOGLE OAUTH TOKENS (if using OAuth)
-- ============================================
-- If HubSpot uses OAuth (less common, but possible)
SELECT 
  id,
  user_id,
  access_token,
  refresh_token,
  expires_at,
  CASE 
    WHEN expires_at > NOW() THEN 'Valid'
    WHEN refresh_token IS NOT NULL THEN 'Can Refresh'
    ELSE 'Expired'
  END as token_status,
  created_at,
  updated_at
FROM google_oauth_tokens
WHERE user_id = auth.uid();

-- ============================================
-- 10. DELETE HUBSPOT CREDENTIALS (if needed)
-- ============================================
-- ⚠️ WARNING: This will delete your HubSpot credentials
-- Only run if you want to remove them
-- DELETE FROM user_credentials
-- WHERE user_id = auth.uid()
--   AND service = 'hubspot';

-- ============================================
-- USAGE INSTRUCTIONS
-- ============================================
-- 
-- 1. Run query #1 to see all your credentials
-- 2. Run query #2 to check specifically for HubSpot
-- 3. Run query #5 for a quick yes/no check
-- 
-- To run these queries:
-- - In Supabase Dashboard: SQL Editor
-- - In your app: Use Supabase client
-- - In psql: Connect to your database
--
-- ============================================

-- ============================================
-- QUICK CREDENTIAL CHECK QUERIES
-- ============================================

-- ============================================
-- QUERY 1: Check HubSpot Credentials (Current User)
-- ============================================
-- Use this if you're logged in - auth.uid() automatically gets your user ID
SELECT 
  id,
  user_id,
  service,
  credentials->>'apiKey' as api_key,
  credentials->>'api_key' as api_key_alt,
  credentials,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()
  AND service = 'hubspot';

-- ============================================
-- QUERY 2: Check HubSpot Credentials (Specific User ID)
-- ============================================
-- Use this if you want to check a specific user ID
-- Replace 'YOUR_USER_ID_HERE' with your actual user ID
SELECT 
  id,
  user_id,
  service,
  credentials->>'apiKey' as api_key,
  credentials->>'api_key' as api_key_alt,
  credentials,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = 'b4edf5df-b307-489e-86af-ba370772a636'::uuid
  AND service = 'hubspot';

-- ============================================
-- QUERY 3: Check All Your Credentials
-- ============================================
SELECT 
  id,
  user_id,
  service,
  credentials,
  created_at,
  updated_at
FROM user_credentials
WHERE user_id = auth.uid()
ORDER BY service, updated_at DESC;

-- ============================================
-- QUERY 4: Quick Boolean Check (HubSpot exists?)
-- ============================================
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
-- NOTES:
-- ============================================
-- 1. auth.uid() automatically gets the current logged-in user's ID
--    - Use this in Supabase Dashboard SQL Editor (when logged in)
--    - Use this in your app code (when user is authenticated)
--
-- 2. For specific user ID, use: 'uuid-here'::uuid
--    - Make sure to wrap in single quotes
--    - Add ::uuid to cast it as UUID type
--
-- 3. If you get "service check constraint" error:
--    - The table might only allow 'linkedin' and 'google'
--    - Run this to fix: ALTER TABLE user_credentials DROP CONSTRAINT user_credentials_service_check;
--
-- ============================================

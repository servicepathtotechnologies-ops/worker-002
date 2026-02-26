// Jest setup: provide safe defaults for env vars required by modules during import.
// This avoids test suites failing early due to missing Supabase config.
//
// IMPORTANT: These are dummy values used only for unit tests.
// Real integration tests should set real env vars in CI secrets.

process.env.SUPABASE_URL ||= 'https://unit-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-service-role-key';


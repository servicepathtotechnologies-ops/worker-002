// Jest setup: provide safe defaults for env vars required by modules during import.
// This avoids test suites failing early due to missing DB config.
//
// IMPORTANT: These are dummy values used only for unit tests.
// Real integration tests should set real env vars in CI secrets.

process.env.SUPABASE_URL ||= 'https://unit-test.db.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'unit-test-service-role-key';

// Ensure NodeDefinitionRegistry is populated for unit tests that validate node schemas.
// This module auto-registers all node definitions on import.
import '../src/nodes/definitions';

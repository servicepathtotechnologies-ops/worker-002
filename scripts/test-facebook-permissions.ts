/**
 * Permission smoke-test for Facebook OAuth scopes.
 * Usage:
 *   FACEBOOK_ACCESS_TOKEN=... npm run test:facebook:permissions
 */

import axios from 'axios';

const REQUIRED_SCOPES = [
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_manage_engagement',
  'pages_read_user_content',
  'pages_show_list',
  'pages_messaging',
  'business_management',
  'ads_management',
  'ads_read',
  'public_profile',
  'instagram_basic',
  'instagram_content_publish',
  'attribution_read',
  'catalog_management',
  'whatsapp_business_messaging',
];

async function main() {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    throw new Error('FACEBOOK_ACCESS_TOKEN is required');
  }

  const debugTokenUrl = 'https://graph.facebook.com/debug_token';
  const appToken = process.env.FACEBOOK_APP_ACCESS_TOKEN || token;

  const debug = await axios.get(debugTokenUrl, {
    params: {
      input_token: token,
      access_token: appToken,
    },
  });

  const granted: string[] = debug.data?.data?.scopes || [];
  const missing = REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));

  console.log('Granted scopes:', granted.join(', ') || '(none)');
  if (missing.length > 0) {
    console.log('Missing scopes:', missing.join(', '));
    process.exitCode = 1;
    return;
  }

  console.log('All required Facebook scopes are present.');
}

main().catch((error) => {
  console.error('[facebook-permissions-test] failed:', error?.message || error);
  process.exit(1);
});

/**
 * Manual test script for WhatsApp and Instagram nodes.
 * Run with: npx ts-node scripts/test-whatsapp-instagram.ts
 *
 * Fill in the CONFIG section below before running.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { WhatsAppNode } from '../src/services/social/whatsapp-node';
import { InstagramNode } from '../src/services/social/instagram-node';
import { createClient } from '@supabase/supabase-js';

// ─── CONFIG — fill these in ───────────────────────────────────────────────────

const CONFIG = {
  // Your Facebook/Meta access token (from facebook_oauth_tokens table or Meta Graph Explorer)
  // Get one at: https://developers.facebook.com/tools/explorer/
  accessToken: process.env.TEST_META_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN_HERE',

  whatsapp: {
    // Your WhatsApp Phone Number ID (from Meta Business Manager → WhatsApp → Phone Numbers)
    phoneNumberId: process.env.TEST_WA_PHONE_NUMBER_ID || 'YOUR_PHONE_NUMBER_ID',
    // Your WhatsApp Business Account ID
    businessAccountId: process.env.TEST_WA_BUSINESS_ACCOUNT_ID || 'YOUR_WABA_ID',
    // A real phone number to send test messages to (E.164 format, e.g. +1234567890)
    testRecipient: process.env.TEST_WA_RECIPIENT || '+1234567890',
  },

  instagram: {
    // Your Instagram Business Account ID
    igUserId: process.env.TEST_IG_USER_ID || 'YOUR_IG_USER_ID',
    // A public image URL to test publishing
    testImageUrl: process.env.TEST_IG_IMAGE_URL || 'https://picsum.photos/800/600',
    // A real Instagram user ID to test DMs (must have messaged you first)
    testDmRecipient: process.env.TEST_IG_DM_RECIPIENT || 'RECIPIENT_IG_USER_ID',
    // A media ID to test comment listing (one of your posts)
    testMediaId: process.env.TEST_IG_MEDIA_ID || 'YOUR_MEDIA_ID',
  },
};

// ─── Supabase client (needed by executors) ────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err: any) {
    console.log(`❌ FAIL — ${err?.message ?? err}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ─── WhatsApp Tests ───────────────────────────────────────────────────────────

async function runWhatsAppTests() {
  console.log('\n📱 WhatsApp Node Tests');
  console.log('─'.repeat(50));

  const wa = new WhatsAppNode(CONFIG.accessToken, supabase);

  // 1. Send a text message
  await test('message.sendText', async () => {
    const result = await wa.execute({
      resource: 'message',
      operation: 'sendText',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      to: CONFIG.whatsapp.testRecipient,
      text: '👋 Test message from CtrlChecks WhatsApp node',
    });
    assert(result.success, result.error?.userMessage ?? 'sendText failed');
    assert(!!result.data?.messages?.[0]?.id, 'No message ID returned');
    console.log(`\n    → message_id: ${result.data?.messages?.[0]?.id}`);
  });

  // 2. Send an image
  await test('message.sendMedia (image)', async () => {
    const result = await wa.execute({
      resource: 'message',
      operation: 'sendMedia',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      to: CONFIG.whatsapp.testRecipient,
      mediaType: 'image',
      mediaUrl: 'https://picsum.photos/400/300',
      caption: 'Test image from CtrlChecks',
    });
    assert(result.success, result.error?.userMessage ?? 'sendMedia failed');
  });

  // 3. Send a location
  await test('message.sendLocation', async () => {
    const result = await wa.execute({
      resource: 'message',
      operation: 'sendLocation',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      to: CONFIG.whatsapp.testRecipient,
      latitude: 37.7749,
      longitude: -122.4194,
      locationName: 'San Francisco',
      address: 'San Francisco, CA, USA',
    });
    assert(result.success, result.error?.userMessage ?? 'sendLocation failed');
  });

  // 4. Send interactive buttons
  await test('message.sendInteractiveButtons', async () => {
    const result = await wa.execute({
      resource: 'message',
      operation: 'sendInteractiveButtons',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      to: CONFIG.whatsapp.testRecipient,
      bodyText: 'Choose an option:',
      buttons: [
        { type: 'reply', reply: { id: 'btn_1', title: 'Option A' } },
        { type: 'reply', reply: { id: 'btn_2', title: 'Option B' } },
      ],
    });
    assert(result.success, result.error?.userMessage ?? 'sendInteractiveButtons failed');
  });

  // 5. List templates
  await test('template.list', async () => {
    const result = await wa.execute({
      resource: 'template',
      operation: 'list',
      businessAccountId: CONFIG.whatsapp.businessAccountId,
    });
    assert(result.success, result.error?.userMessage ?? 'template.list failed');
    console.log(`\n    → ${result.data?.data?.length ?? 0} templates found`);
  });

  // 6. Non-APPROVED template rejection (should fail gracefully)
  await test('sendTemplate rejects non-APPROVED status', async () => {
    const result = await wa.execute({
      resource: 'message',
      operation: 'sendTemplate',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      to: CONFIG.whatsapp.testRecipient,
      templateName: 'test_template',
      language: 'en_US',
      templateStatus: 'PENDING', // ← not APPROVED, should be rejected
    });
    assert(!result.success, 'Should have rejected non-APPROVED template');
    assert(result.error?.code === 131030, `Expected code 131030, got ${result.error?.code}`);
  });

  // 7. Conversation list
  await test('conversation.list', async () => {
    const result = await wa.execute({
      resource: 'conversation',
      operation: 'list',
      phoneNumberId: CONFIG.whatsapp.phoneNumberId,
      limit: 5,
    });
    assert(result.success, result.error?.userMessage ?? 'conversation.list failed');
    console.log(`\n    → ${result.data?.data?.length ?? 0} conversations found`);
  });
}

// ─── Instagram Tests ──────────────────────────────────────────────────────────

async function runInstagramTests() {
  console.log('\n📸 Instagram Node Tests');
  console.log('─'.repeat(50));

  const ig = new InstagramNode(CONFIG.accessToken, supabase);

  // 1. Get user profile
  await test('user.get', async () => {
    const result = await ig.execute({
      resource: 'user',
      operation: 'get',
      instagramBusinessAccountId: CONFIG.instagram.igUserId,
    });
    assert(result.success, result.error?.userMessage ?? 'user.get failed');
    assert(!!result.data?.username, 'No username returned');
    console.log(`\n    → @${result.data?.username} (${result.data?.followers_count} followers)`);
  });

  // 2. List media
  await test('user.getMedia', async () => {
    const result = await ig.execute({
      resource: 'user',
      operation: 'getMedia',
      instagramBusinessAccountId: CONFIG.instagram.igUserId,
      limit: 5,
    });
    assert(result.success, result.error?.userMessage ?? 'user.getMedia failed');
    console.log(`\n    → ${result.data?.data?.length ?? 0} media items found`);
  });

  // 3. Publish an image
  await test('media.createAndPublish (IMAGE)', async () => {
    const result = await ig.execute({
      resource: 'media',
      operation: 'createAndPublish',
      instagramBusinessAccountId: CONFIG.instagram.igUserId,
      media_type: 'IMAGE',
      media_url: CONFIG.instagram.testImageUrl,
      caption: '🤖 Test post from CtrlChecks Instagram node #automation',
    });
    assert(result.success, result.error?.userMessage ?? 'media.createAndPublish failed');
    assert(!!result.data?.mediaId, 'No mediaId returned');
    console.log(`\n    → mediaId: ${result.data?.mediaId}`);
  });

  // 4. List comments on a post
  await test('comment.list', async () => {
    const result = await ig.execute({
      resource: 'comment',
      operation: 'list',
      mediaId: CONFIG.instagram.testMediaId,
      limit: 5,
    });
    assert(result.success, result.error?.userMessage ?? 'comment.list failed');
    console.log(`\n    → ${result.data?.data?.length ?? 0} comments found`);
  });

  // 5. Hashtag search
  await test('hashtag.search', async () => {
    const result = await ig.execute({
      resource: 'hashtag',
      operation: 'search',
      instagramBusinessAccountId: CONFIG.instagram.igUserId,
      hashtagName: 'automation',
    });
    assert(result.success, result.error?.userMessage ?? 'hashtag.search failed');
    console.log(`\n    → hashtag id: ${result.data?.data?.[0]?.id}`);
  });

  // 6. Get insights
  await test('insights.get', async () => {
    const result = await ig.execute({
      resource: 'insights',
      operation: 'get',
      instagramBusinessAccountId: CONFIG.instagram.igUserId,
      metric: 'impressions,reach,profile_views',
      period: 'day',
    });
    assert(result.success, result.error?.userMessage ?? 'insights.get failed');
    console.log(`\n    → ${result.data?.data?.length ?? 0} metric(s) returned`);
  });

  // 7. Send a DM (only works if recipient messaged you within 7 days)
  if (CONFIG.instagram.testDmRecipient !== 'RECIPIENT_IG_USER_ID') {
    await test('message.sendText (DM)', async () => {
      const result = await ig.execute({
        resource: 'message',
        operation: 'sendText',
        instagramBusinessAccountId: CONFIG.instagram.igUserId,
        recipientId: CONFIG.instagram.testDmRecipient,
        text: '👋 Test DM from CtrlChecks Instagram node',
      });
      assert(result.success, result.error?.userMessage ?? 'message.sendText failed');
    });
  } else {
    console.log('  message.sendText (DM) ... ⏭  SKIPPED (set TEST_IG_DM_RECIPIENT to enable)');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 WhatsApp & Instagram Node Manual Tests');
  console.log('==========================================');

  if (CONFIG.accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
    console.error('\n❌ Set TEST_META_ACCESS_TOKEN in your .env or edit CONFIG.accessToken above');
    process.exit(1);
  }

  await runWhatsAppTests();
  await runInstagramTests();

  console.log('\n==========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

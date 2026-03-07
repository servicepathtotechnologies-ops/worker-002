import type { UnifiedNodeDefinition } from '../types/unified-node-contract';
import type { NodeSchema } from '../../services/nodes/node-library';

import { overrideGoogleGmail } from './overrides/google-gmail';
import { overrideIfElse } from './overrides/if-else';
import { overrideLogOutput } from './overrides/log-output';
import { overrideChatModel } from './overrides/chat-model';
import { overrideDatabaseRead } from './overrides/database-read';
import { overrideDatabaseWrite } from './overrides/database-write';
import { overrideAiAgent } from './overrides/ai-agent';
import { overrideAiChatModel } from './overrides/ai-chat-model';
import { overrideOllama } from './overrides/ollama';
import { overrideOpenAiGpt } from './overrides/openai-gpt';
import { overrideAnthropicClaude } from './overrides/anthropic-claude';
import { overrideGoogleGemini } from './overrides/google-gemini';
import { overrideTimeout } from './overrides/timeout';
import { overrideTryCatch } from './overrides/try-catch';
import { overrideRetry } from './overrides/retry';
import { overrideParallel } from './overrides/parallel';
import { overrideManualTrigger } from './overrides/manual-trigger';
import { overrideChatTrigger } from './overrides/chat-trigger';
import { overrideWebhook } from './overrides/webhook';
import { overrideSchedule } from './overrides/schedule';
import { overrideInterval } from './overrides/interval';
import { overrideFormTrigger } from './overrides/form-trigger';
import { overrideWorkflowTrigger } from './overrides/workflow-trigger';
import { overrideErrorTrigger } from './overrides/error-trigger';
import { overrideSwitch } from './overrides/switch';
import { overrideSetVariable } from './overrides/set-variable';
import { overrideMath } from './overrides/math';
import { overrideWait } from './overrides/wait';
import { overrideDelay } from './overrides/delay';
import { overrideReturn } from './overrides/return';
import { overrideSort } from './overrides/sort';
import { overrideLimit } from './overrides/limit';
import { overrideAggregate } from './overrides/aggregate';
import { overrideHttpRequest } from './overrides/http-request';
import { overrideSlackMessage } from './overrides/slack-message';
import { overrideGoogleSheets } from './overrides/google-sheets';
import { overrideAirtable } from './overrides/airtable';
import { overrideNotion } from './overrides/notion';
import { overrideHubspot } from './overrides/hubspot';
import { overrideSalesforce } from './overrides/salesforce';
import { overridePipedrive } from './overrides/pipedrive';
import { overrideEmail } from './overrides/email';
import { overrideTelegram } from './overrides/telegram';
import { overrideDiscord } from './overrides/discord';
import { overrideExecuteWorkflow } from './overrides/execute-workflow';
import { overrideJavascript } from './overrides/javascript';
import { overrideTextSummarizer } from './overrides/text-summarizer';
import { overrideSentimentAnalyzer } from './overrides/sentiment-analyzer';
import { overrideMicrosoftTeams } from './overrides/microsoft-teams';
import { overrideWhatsappCloud } from './overrides/whatsapp-cloud';
import { overrideTwilio } from './overrides/twilio';
import { overrideGoogleDoc } from './overrides/google-doc';
import { overrideZoho } from './overrides/zoho';
import { overrideFilter } from './overrides/filter';
import { overrideLoop } from './overrides/loop';
import { overrideSplitInBatches } from './overrides/split-in-batches';
import { overrideHttpResponse } from './overrides/http-response';
import { overrideGraphql } from './overrides/graphql';
import { overrideFunction } from './overrides/function';
import { overrideFunctionItem } from './overrides/function-item';
import { overrideAiService } from './overrides/ai-service';
import { overrideAwsS3 } from './overrides/aws-s3';
import { overrideDropbox } from './overrides/dropbox';
import { overrideOnedrive } from './overrides/onedrive';
import { overrideQueuePush } from './overrides/queue-push';
import { overrideQueueConsume } from './overrides/queue-consume';
import { overrideCacheGet } from './overrides/cache-get';
import { overrideCacheSet } from './overrides/cache-set';
import { overrideOauth2Auth } from './overrides/oauth2-auth';
import { overrideApiKeyAuth } from './overrides/api-key-auth';
import { overrideReadBinaryFile } from './overrides/read-binary-file';
import { overrideWriteBinaryFile } from './overrides/write-binary-file';
import { overridePostgresql } from './overrides/postgresql';
import { overrideSupabase } from './overrides/supabase';
import { overrideMysql } from './overrides/mysql';
import { overrideMongodb } from './overrides/mongodb';
import { overrideTwitter } from './overrides/twitter';
import { overrideInstagram } from './overrides/instagram';
import { overrideDateTime } from './overrides/date-time';
import { overrideTextFormatter } from './overrides/text-formatter';
import { overrideMerge } from './overrides/merge';
import { overrideYoutube } from './overrides/youtube';
import { overrideFacebook } from './overrides/facebook';
import { overrideLinkedin } from './overrides/linkedin';
import { overrideShopify } from './overrides/shopify';
import { overrideWoocommerce } from './overrides/woocommerce';
import { overrideStripe } from './overrides/stripe';
import { overridePaypal } from './overrides/paypal';
import { overrideGithub } from './overrides/github';
import { overrideGitlab } from './overrides/gitlab';
import { overrideBitbucket } from './overrides/bitbucket';
import { overrideClickup } from './overrides/clickup';
import { overrideOutlook } from './overrides/outlook';
import { overrideMemory } from './overrides/memory';
import { overrideTool } from './overrides/tool';

type OverrideFn = (def: UnifiedNodeDefinition, schema: NodeSchema) => UnifiedNodeDefinition;

const overridesByType: Record<string, OverrideFn> = {
  google_gmail: overrideGoogleGmail,
  if_else: overrideIfElse,
  log_output: overrideLogOutput,
  chat_model: overrideChatModel,
  database_read: overrideDatabaseRead,
  database_write: overrideDatabaseWrite,
  ai_agent: overrideAiAgent,
  ai_chat_model: overrideAiChatModel,
  ollama: overrideOllama,
  openai_gpt: overrideOpenAiGpt,
  anthropic_claude: overrideAnthropicClaude,
  google_gemini: overrideGoogleGemini,
  timeout: overrideTimeout,
  try_catch: overrideTryCatch,
  retry: overrideRetry,
  parallel: overrideParallel,
  // ✅ NEWLY MIGRATED NODES
  manual_trigger: overrideManualTrigger,
  chat_trigger: overrideChatTrigger,
  webhook: overrideWebhook,
  schedule: overrideSchedule,
  interval: overrideInterval,
  form_trigger: overrideFormTrigger,
  workflow_trigger: overrideWorkflowTrigger,
  error_trigger: overrideErrorTrigger,
  switch: overrideSwitch,
  set_variable: overrideSetVariable,
  math: overrideMath,
  wait: overrideWait,
  delay: overrideDelay,
  return: overrideReturn,
  sort: overrideSort,
  limit: overrideLimit,
  aggregate: overrideAggregate,
  http_request: overrideHttpRequest,
  slack_message: overrideSlackMessage,
  google_sheets: overrideGoogleSheets,
  airtable: overrideAirtable,
  notion: overrideNotion,
  hubspot: overrideHubspot,
  salesforce: overrideSalesforce,
  pipedrive: overridePipedrive,
  email: overrideEmail,
  telegram: overrideTelegram,
  discord: overrideDiscord,
  execute_workflow: overrideExecuteWorkflow,
  javascript: overrideJavascript,
  text_summarizer: overrideTextSummarizer,
  sentiment_analyzer: overrideSentimentAnalyzer,
  // ✅ BATCH 3: Remaining Communication & Storage
  microsoft_teams: overrideMicrosoftTeams,
  whatsapp_cloud: overrideWhatsappCloud,
  twilio: overrideTwilio,
  google_doc: overrideGoogleDoc,
  zoho: overrideZoho,
  // ✅ BATCH 4: Data Transformation & HTTP
  filter: overrideFilter,
  loop: overrideLoop,
  split_in_batches: overrideSplitInBatches,
  http_response: overrideHttpResponse,
  graphql: overrideGraphql,
  // ✅ BATCH 5: Utility & AI
  function: overrideFunction,
  function_item: overrideFunctionItem,
  ai_service: overrideAiService,
  // ✅ BATCH 6: Storage
  aws_s3: overrideAwsS3,
  dropbox: overrideDropbox,
  onedrive: overrideOnedrive,
  // ✅ BATCH 7: Queue & Cache
  queue_push: overrideQueuePush,
  queue_consume: overrideQueueConsume,
  cache_get: overrideCacheGet,
  cache_set: overrideCacheSet,
  // ✅ BATCH 8: Auth & File
  oauth2_auth: overrideOauth2Auth,
  api_key_auth: overrideApiKeyAuth,
  read_binary_file: overrideReadBinaryFile,
  write_binary_file: overrideWriteBinaryFile,
  // ✅ BATCH 9: Database
  postgresql: overridePostgresql,
  supabase: overrideSupabase,
  mysql: overrideMysql,
  mongodb: overrideMongodb,
  // ✅ BATCH 10: Social Media
  twitter: overrideTwitter,
  instagram: overrideInstagram,
  youtube: overrideYoutube,
  facebook: overrideFacebook,
  linkedin: overrideLinkedin,
  // ✅ BATCH 11: E-commerce & Payments
  shopify: overrideShopify,
  woocommerce: overrideWoocommerce,
  stripe: overrideStripe,
  paypal: overridePaypal,
  // ✅ BATCH 12: Version Control
  github: overrideGithub,
  gitlab: overrideGitlab,
  bitbucket: overrideBitbucket,
  // ✅ BATCH 13: Other Integrations
  clickup: overrideClickup,
  outlook: overrideOutlook,
  // ✅ BATCH 14: Utilities
  date_time: overrideDateTime,
  text_formatter: overrideTextFormatter,
  merge: overrideMerge,
  // ✅ BATCH 15: AI Infrastructure
  memory: overrideMemory,
  tool: overrideTool,
};

/**
 * Apply per-node overrides to a base unified definition.
 * This keeps UnifiedNodeRegistry generic and pushes node-specific behavior into one file per node.
 */
export function applyNodeDefinitionOverrides(def: UnifiedNodeDefinition, schema: NodeSchema): UnifiedNodeDefinition {
  const fn = overridesByType[schema.type];
  if (!fn) return def;
  return fn(def, schema);
}


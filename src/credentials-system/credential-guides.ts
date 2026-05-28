/**
 * Provider-specific credential guides for all known credential types.
 * The registry's buildGuide() merges these over the generic auto-generated guide.
 *
 * Content is keyed by the credential type ID (matching credentialTypeDefinitions[].id).
 * Generic auth types (api_key, bearer_token, basic_auth, custom_header, query_auth)
 * intentionally use the auto-generated guide.
 *
 * Quality bar: every entry must beat "searching Google" — exact URLs, menu paths,
 * token format hints, and provider-specific warnings. Mirror the Airtable (airtable_api_key)
 * inline guide as the quality reference.
 */

import type { CredentialGuide, CredentialFieldGuide } from './types';

export type GuideOverride = Partial<Omit<CredentialGuide, 'fieldGuides'>> & {
  fieldGuides?: Record<string, Partial<CredentialFieldGuide> & { label: string; whereToFind: string }>;
};

const STANDARD_SECURITY: string[] = [
  'Never paste credentials into workflow text fields — always save them as a Connection first.',
  'Use the minimum scopes or permissions the workflow actually needs.',
  'Rotate the credential immediately if it is shared outside CtrlChecks or appears in logs.',
  'CtrlChecks stores saved secret fields encrypted and masks them in the UI.',
];

export const specificGuides: Record<string, GuideOverride> = {

  // ─── AI / LLM ────────────────────────────────────────────────────────────────

  openai_api_key: {
    summary: 'Create an OpenAI secret key and paste it here to use GPT models in your workflows.',
    prerequisites: [
      'An OpenAI account at platform.openai.com (free tier works for testing).',
      'Billing configured if you need production throughput — check platform.openai.com/account/billing.',
    ],
    steps: [
      'Go to https://platform.openai.com/api-keys and sign in.',
      'Click "Create new secret key" → give it a name like "CtrlChecks" → Create.',
      'Copy the key immediately — it starts with sk- and is shown only once.',
      'Paste the key into the API Key field on the left and click Save API Key.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'OpenAI secret key used to authenticate every API call.',
        whereToFind: 'platform.openai.com/api-keys → Create new secret key. Key starts with sk- and is shown only once.',
        example: 'sk-...',
        notes: [
          'Key is shown only once — copy it before closing the modal.',
          'If billing is not set up, calls will return a 429 error after the free quota runs out.',
        ],
      },
    },
    securityNotes: [
      'Use project-scoped keys (not organization keys) when available to limit blast radius.',
      ...STANDARD_SECURITY,
    ],
    docsUrl: 'https://platform.openai.com/docs/api-reference/authentication',
  },

  anthropic_api_key: {
    summary: 'Create an Anthropic API key and paste it here to use Claude models in your workflows.',
    prerequisites: [
      'An Anthropic account at console.anthropic.com.',
      'Credits or a paid plan — check console.anthropic.com/settings/billing.',
    ],
    steps: [
      'Go to https://console.anthropic.com/settings/keys and sign in.',
      'Click "Create Key" → give it a name like "CtrlChecks" → Create.',
      'Copy the key immediately — it starts with sk-ant- and is shown only once.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Anthropic API key for authenticating Claude model requests.',
        whereToFind: 'console.anthropic.com/settings/keys → Create Key. Key starts with sk-ant- and is shown only once.',
        example: 'sk-ant-...',
        notes: ['Key is shown only once — copy it before closing.'],
      },
    },
    docsUrl: 'https://docs.anthropic.com/en/api/getting-started',
  },

  gemini_api_key: {
    summary: 'Create a Google Gemini API key at Google AI Studio and paste it here to use Gemini models.',
    prerequisites: [
      'A Google account — no billing required for AI Studio keys (generous free quota).',
      'Access to https://aistudio.google.com.',
    ],
    steps: [
      'Go to https://aistudio.google.com/app/apikey and sign in with your Google account.',
      'Click "Create API key" → select an existing Google Cloud project, or click "Create API key in new project".',
      'Copy the generated key (a long alphanumeric string).',
      'Paste the key into the API Key field and click Save API Key.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Google AI Studio key for Gemini model API calls.',
        whereToFind: 'aistudio.google.com/app/apikey → Create API key. Key is a long alphanumeric string.',
        example: 'AIzaSy...',
        notes: [
          'Free quota is generous for development; check aistudio.google.com for rate limits.',
          'This is an AI Studio key, not a Google Cloud API key — use this page, not the Cloud Console.',
        ],
      },
    },
    docsUrl: 'https://ai.google.dev/tutorials/setup',
  },

  mistral_api_key: {
    summary: 'Create a Mistral AI API key and paste it here to use Mistral models.',
    prerequisites: ['A Mistral account at console.mistral.ai.'],
    steps: [
      'Go to https://console.mistral.ai/api-keys and sign in.',
      'Click "Create new key" → give it a name → Create.',
      'Copy the key — it is shown only once.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'API Key',
        description: 'Mistral API key for model inference.',
        whereToFind: 'console.mistral.ai/api-keys → Create new key. Shown only once.',
        notes: ['Key is shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://docs.mistral.ai/getting-started/quickstart/',
  },

  cohere_api_key: {
    summary: 'Create a Cohere API key and paste it here to use Cohere language models.',
    prerequisites: ['A Cohere account at dashboard.cohere.com (free trial available).'],
    steps: [
      'Go to https://dashboard.cohere.com/api-keys and sign in.',
      'Click "New Trial key" (free) or "New Production key".',
      'Give the key a name like "CtrlChecks" and copy it.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'API Key',
        description: 'Cohere API key for language model calls.',
        whereToFind: 'dashboard.cohere.com/api-keys → New Trial key or New Production key.',
      },
    },
    docsUrl: 'https://docs.cohere.com/reference/about',
  },

  huggingface_token: {
    summary: 'Create a Hugging Face access token and paste it here to call Inference API models.',
    prerequisites: ['A Hugging Face account at huggingface.co (free accounts work).'],
    steps: [
      'Go to https://huggingface.co/settings/tokens and sign in.',
      'Click "New token" → give it a name → choose "Read" role for inference (or "Write" if needed).',
      'Click "Generate a token" and copy the token — it starts with hf_.',
      'Paste the token into the Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Access Token',
        description: 'Hugging Face user access token for Inference API calls.',
        whereToFind: 'huggingface.co/settings/tokens → New token. Token starts with hf_.',
        example: 'hf_...',
        notes: ['Use "Read" role for inference; only use "Write" if the workflow writes to HF Hub.'],
      },
    },
    docsUrl: 'https://huggingface.co/docs/hub/security-tokens',
  },

  pinecone_api_key: {
    summary: 'Create a Pinecone API key and paste it here to query or upsert vector database indexes.',
    prerequisites: [
      'A Pinecone account at app.pinecone.io (free Starter plan available).',
      'At least one Pinecone index already created (or create one after connecting).',
    ],
    steps: [
      'Go to https://app.pinecone.io and sign in.',
      'Click "API Keys" in the left sidebar.',
      'Click "Create API Key" → give it a name like "CtrlChecks" → Create.',
      'Copy the key and also note your environment (e.g. us-east-1-aws) shown on the indexes page.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Pinecone API key for vector database operations.',
        whereToFind: 'app.pinecone.io → API Keys → Create API Key.',
        notes: ['Also note your index environment (shown on the Indexes page) for use in workflow nodes.'],
      },
    },
    docsUrl: 'https://docs.pinecone.io/guides/projects/manage-api-keys',
  },

  qdrant_api_key: {
    summary: 'Create a Qdrant Cloud API key and enter your cluster URL to query or store vectors.',
    prerequisites: [
      'A Qdrant Cloud account at cloud.qdrant.io, or a self-hosted Qdrant instance.',
      'A cluster already created (free 1GB cluster available).',
    ],
    steps: [
      'Go to https://cloud.qdrant.io and sign in.',
      'Open your cluster → click "API Keys" in the left panel → "Create" → copy the key.',
      'Copy your cluster URL from the cluster overview (format: https://xyz.region.gcp.cloud.qdrant.io).',
      'Paste the key and cluster URL into the fields on the left and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Qdrant Cloud API key for authenticating vector store operations.',
        whereToFind: 'cloud.qdrant.io → your cluster → API Keys → Create.',
        notes: ['For self-hosted Qdrant without API key auth, leave this field empty if the server allows it.'],
      },
      apiUrl: {
        label: 'API URL',
        description: 'Your Qdrant cluster endpoint.',
        whereToFind: 'cloud.qdrant.io → cluster overview. Format: https://xyz.region.gcp.cloud.qdrant.io',
        example: 'https://xyz.us-east-1-0.aws.cloud.qdrant.io',
      },
    },
    docsUrl: 'https://qdrant.tech/documentation/cloud/authentication/',
  },

  // ─── Google ───────────────────────────────────────────────────────────────────

  google_oauth2: {
    summary: 'Connect your Google account with OAuth so CtrlChecks can access Gmail, Sheets, Drive, Calendar, and Docs without storing your password.',
    prerequisites: [
      'A Google account you can sign in to.',
      'Permission to authorize third-party apps for your Google Workspace (if managed by an organization, your admin may need to approve CtrlChecks).',
    ],
    steps: [
      'Click "Connect Google" below.',
      'Sign in to the Google account you want to use.',
      'Review the requested permissions (Gmail, Sheets, Drive, Calendar, Docs) and click Allow.',
      'You will be returned to CtrlChecks automatically. The connection will appear as active.',
    ],
    securityNotes: [
      'CtrlChecks requests broad Google Workspace scopes so you can use one connection for multiple node types.',
      'You can revoke access at any time from myaccount.google.com/permissions.',
      ...STANDARD_SECURITY.slice(2),
    ],
    troubleshooting: [
      'Error "Access blocked: CtrlChecks has not completed the Google verification process" — this appears during development. Click "Advanced" → "Go to CtrlChecks (unsafe)" to proceed for internal/development use.',
      'Redirect URI mismatch — the correct callback URL is registered in the CtrlChecks backend. If you self-host, ensure GOOGLE_OAUTH_CLIENT_ID and GENERIC_GOOGLE_OAUTH_REDIRECT_URI are set correctly.',
      'Workspace admin blocked third-party OAuth — ask your Google Workspace admin to whitelist CtrlChecks in the Admin Console → Security → API Controls.',
    ],
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2',
  },

  youtube_oauth2: {
    summary: 'Connect your YouTube channel with OAuth so CtrlChecks can upload videos and manage channel data.',
    prerequisites: [
      'A Google account linked to a YouTube channel.',
      'YouTube channel set up and accessible at studio.youtube.com.',
    ],
    steps: [
      'Click "Connect YouTube" below.',
      'Sign in with the Google account that owns the YouTube channel.',
      'Review the requested permissions (manage your videos, upload) and click Allow.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'No channel found after connecting — make sure the Google account has a YouTube channel at studio.youtube.com.',
      'Admin blocked OAuth — see Google OAuth2 troubleshooting above.',
    ],
    docsUrl: 'https://developers.google.com/youtube/v3/guides/authentication',
  },

  // ─── Microsoft ────────────────────────────────────────────────────────────────

  microsoft_oauth2: {
    summary: 'Connect your Microsoft / Office 365 account with OAuth for Outlook email, Teams, OneDrive, and Calendar access.',
    prerequisites: [
      'A Microsoft account (personal or work/school) at login.microsoftonline.com.',
      'For work accounts: your IT admin may need to grant consent for the CtrlChecks app in Azure AD.',
    ],
    steps: [
      'Click "Connect Microsoft" below.',
      'Sign in with your Microsoft account.',
      'Review the requested permissions (Mail, Calendar, Teams, Files) and click Accept.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Error "Need admin approval" — your organization requires an IT admin to approve CtrlChecks in Azure AD → Enterprise Applications. Ask your admin to grant tenant-wide consent.',
      'Redirect URI mismatch — if self-hosting, ensure MICROSOFT_CLIENT_ID and GENERIC_MICROSOFT_OAUTH_REDIRECT_URI are set in your worker .env.',
    ],
    docsUrl: 'https://learn.microsoft.com/graph/auth/',
  },

  // ─── Slack ────────────────────────────────────────────────────────────────────

  slack_oauth2: {
    summary: 'Connect your Slack workspace with OAuth so CtrlChecks can post messages and read channel information.',
    prerequisites: [
      'A Slack workspace where you have member or admin access.',
      'Permission to install third-party apps (workspace admins may restrict this — check workspace settings).',
    ],
    steps: [
      'Click "Connect Slack" below.',
      'Select the Slack workspace you want to connect.',
      'Review the requested permissions (post messages, read channels) and click Allow.',
      'After connecting, invite the CtrlChecks bot to each channel it should post in: open the channel in Slack, type /invite @CtrlChecks, and press Enter.',
    ],
    troubleshooting: [
      '"App installation disabled" — a Slack admin has restricted app installations. Ask your Slack admin to allow it at yourworkspace.slack.com/admin/apps.',
      'Bot can post to DMs but not channels — you forgot to invite the bot. Type /invite @CtrlChecks in the target channel.',
      'Redirect URI mismatch — ensure SLACK_CLIENT_ID and GENERIC_SLACK_OAUTH_REDIRECT_URI are set in your worker .env.',
    ],
    docsUrl: 'https://api.slack.com/authentication',
  },

  // ─── Zoom ─────────────────────────────────────────────────────────────────────

  zoom_oauth2: {
    summary: 'Connect your Zoom account with OAuth to create meetings, list recordings, and manage users.',
    prerequisites: [
      'A Zoom account (Pro, Business, or Enterprise) at zoom.us.',
      'Permission to install Zoom marketplace apps for your account.',
    ],
    steps: [
      'Click "Connect Zoom" below.',
      'Sign in to Zoom and approve the requested permissions.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Account admin blocked OAuth app installs — ask your Zoom account admin to enable app marketplace installs at zoom.us/account/app_marketplace.',
    ],
    docsUrl: 'https://developers.zoom.us/docs/api/',
  },

  // ─── GitHub ───────────────────────────────────────────────────────────────────

  github_oauth2: {
    summary: 'Connect your GitHub account with OAuth for repository, issue, and pull request access.',
    prerequisites: ['A GitHub account at github.com.'],
    steps: [
      'Click "Connect GitHub" below.',
      'Sign in to GitHub and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Organization access denied — your GitHub organization may require OAuth app approvals. Ask your org admin to approve CtrlChecks at github.com/organizations/<org>/settings/oauth_application_policy.',
    ],
    docsUrl: 'https://docs.github.com/en/authentication',
  },

  github_pat: {
    summary: 'Create a GitHub Personal Access Token and paste it here for full API access to repositories, issues, and more.',
    prerequisites: [
      'A GitHub account at github.com.',
      'Decide what you need: classic tokens work for most use cases; fine-grained tokens allow per-repo scoping.',
    ],
    steps: [
      'Go to https://github.com/settings/tokens and sign in.',
      'Click "Generate new token" → choose "Tokens (classic)" for broad access or "Fine-grained tokens" for per-repo scoping.',
      'Give it a name like "CtrlChecks", set an expiry, and select scopes: "repo" for full repo access, or just "issues" / "contents" for limited access.',
      'Click "Generate token" and copy the token immediately — it starts with ghp_ and is shown only once.',
      'Paste the token into the Personal Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Personal Access Token',
        description: 'GitHub PAT used to authenticate API calls.',
        whereToFind: 'github.com/settings/tokens → Generate new token (classic). Token starts with ghp_ and is shown only once.',
        example: 'ghp_...',
        notes: [
          'Shown only once — copy before closing the token page.',
          'Select "repo" scope for most workflow use cases; use fine-grained tokens to limit access to specific repositories.',
        ],
      },
    },
    docsUrl: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token',
  },

  // ─── GitLab ───────────────────────────────────────────────────────────────────

  gitlab_oauth2: {
    summary: 'Connect your GitLab account with OAuth for repository and pipeline access.',
    prerequisites: ['A GitLab account at gitlab.com or a self-hosted GitLab instance.'],
    steps: [
      'Click "Connect GitLab" below.',
      'Sign in to GitLab and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://docs.gitlab.com/ee/api/oauth2.html',
  },

  gitlab_pat: {
    summary: 'Create a GitLab Personal Access Token and paste it here for repository and API access.',
    prerequisites: ['A GitLab account at gitlab.com.'],
    steps: [
      'Go to https://gitlab.com/-/user_settings/personal_access_tokens and sign in.',
      'Click "Add new token" → give it a name like "CtrlChecks" → set an expiry date.',
      'Select scopes: "api" for full access, or "read_repository" + "write_repository" for repo-only.',
      'Click "Create personal access token" and copy it immediately — starts with glpat- and shown only once.',
      'Paste the token into the Personal Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Personal Access Token',
        description: 'GitLab PAT for API authentication.',
        whereToFind: 'gitlab.com/-/user_settings/personal_access_tokens → Add new token. Token starts with glpat- and is shown only once.',
        example: 'glpat-...',
        notes: ['Shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://docs.gitlab.com/user/profile/personal_access_tokens/',
  },

  // ─── Notion ───────────────────────────────────────────────────────────────────

  notion_oauth2: {
    summary: 'Connect your Notion workspace with OAuth to read, create, and update pages and databases.',
    prerequisites: [
      'A Notion workspace where you are a member.',
      'The databases or pages CtrlChecks should access must be shared with the integration after connecting.',
    ],
    steps: [
      'Click "Connect Notion" below.',
      'Select the Notion workspace and click "Select pages".',
      'Check each page or database you want CtrlChecks to access, then click Allow access.',
      'Important: CtrlChecks can only access pages/databases you explicitly select here. Return to this step to grant access to more pages.',
    ],
    troubleshooting: [
      'Node returns "object not found" — the database was not shared when connecting. Reconnect and select the database, or go to Notion → open the database → Share → search for your CtrlChecks integration → Invite.',
      'New databases created after connecting are not accessible — you need to share each new database with the integration manually in Notion.',
    ],
    docsUrl: 'https://developers.notion.com/docs/authorization',
  },

  notion_api_key: {
    summary: 'Create a Notion Internal Integration token and paste it here — then share each database with the integration inside Notion.',
    prerequisites: [
      'A Notion workspace where you are a member.',
      'Each database CtrlChecks should access must be shared with the integration separately inside Notion.',
    ],
    steps: [
      'Go to https://www.notion.so/my-integrations and sign in.',
      'Click "+ New integration" → give it a name like "CtrlChecks" → select your workspace → Submit.',
      'Under "Capabilities", enable: Read content, Update content, Insert content.',
      'Copy the "Internal Integration Secret" — it starts with secret_.',
      'Paste the token into the Internal Integration Secret field and click Save.',
      'Critical: share each Notion database with the integration — open the database in Notion → Share (top right) → search for your integration name → Invite.',
    ],
    fieldGuides: {
      token: {
        label: 'Internal Integration Secret',
        description: 'Notion Internal Integration token for API access.',
        whereToFind: 'notion.so/my-integrations → your integration → Secrets tab. Token starts with secret_.',
        example: 'secret_...',
        notes: [
          'After saving this token, you MUST share each database with the integration in Notion — otherwise nodes will return "object not found".',
          'To share: open the database in Notion → Share → search integration name → Invite.',
        ],
      },
    },
    securityNotes: [
      'Integration has access only to pages and databases explicitly shared with it — no implicit access to your whole workspace.',
      ...STANDARD_SECURITY,
    ],
    docsUrl: 'https://developers.notion.com/docs/getting-started',
  },

  // ─── Asana ────────────────────────────────────────────────────────────────────

  asana_oauth2: {
    summary: 'Connect your Asana workspace with OAuth to read and create tasks, projects, and comments.',
    prerequisites: ['An Asana account at app.asana.com.'],
    steps: [
      'Click "Connect Asana" below.',
      'Sign in to Asana and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://developers.asana.com/docs/oauth',
  },

  // ─── Jira ─────────────────────────────────────────────────────────────────────

  jira_api_key: {
    summary: 'Create a Jira API token and enter your Atlassian email and domain to manage issues and projects.',
    prerequisites: [
      'An Atlassian account at id.atlassian.com with access to at least one Jira project.',
      'Your Jira domain — it is the part before .atlassian.net in your Jira URL (e.g. mycompany).',
    ],
    steps: [
      'Go to https://id.atlassian.com/manage-profile/security/api-tokens and sign in.',
      'Click "Create API token" → give it a label like "CtrlChecks" → Create.',
      'Copy the token shown.',
      'Enter your Email Address (the one you use to log in to Jira), the API Token, and your Domain (yourcompany.atlassian.net without https://).',
    ],
    fieldGuides: {
      username: {
        label: 'Email Address',
        description: 'Your Atlassian login email, used as the Basic Auth username.',
        whereToFind: 'Your Atlassian account email — visible at id.atlassian.com/manage-profile.',
        example: 'you@company.com',
      },
      password: {
        label: 'API Token',
        description: 'Atlassian API token used as the Basic Auth password (not your account password).',
        whereToFind: 'id.atlassian.com/manage-profile/security/api-tokens → Create API token. Shown only once.',
        notes: ['This is a token, not your Atlassian password. Do not use your account password here.'],
      },
      domain: {
        label: 'Domain',
        description: 'Your Atlassian subdomain, used to build API request URLs.',
        whereToFind: 'Your Jira URL: if it is https://mycompany.atlassian.net, the domain is mycompany.atlassian.net.',
        example: 'mycompany.atlassian.net',
        notes: ['Enter without https:// — just the hostname.'],
      },
    },
    docsUrl: 'https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/',
  },

  // ─── ClickUp ──────────────────────────────────────────────────────────────────

  clickup_api_token: {
    summary: 'Create a ClickUp Personal API Token and paste it here to manage tasks, spaces, and lists.',
    prerequisites: ['A ClickUp account at app.clickup.com (any plan).'],
    steps: [
      'Go to https://app.clickup.com and sign in.',
      'Click your profile avatar (bottom left) → Settings → Apps.',
      'Under "API Token", click "Generate" if no token exists, then copy it. Token starts with pk_.',
      'Paste the token into the Personal API Token field and click Save.',
    ],
    fieldGuides: {
      apiToken: {
        label: 'Personal API Token',
        description: 'ClickUp personal token for API authentication.',
        whereToFind: 'app.clickup.com → Profile → Settings → Apps → API Token. Token starts with pk_.',
        example: 'pk_...',
      },
    },
    docsUrl: 'https://developer.clickup.com/docs/authentication',
  },

  clickup_oauth2: {
    summary: 'Connect your ClickUp workspace with OAuth for task and project management.',
    prerequisites: ['A ClickUp account at app.clickup.com.'],
    steps: [
      'Click "Connect ClickUp" below.',
      'Sign in to ClickUp and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://developer.clickup.com/docs/authentication',
  },

  // ─── Monday.com ───────────────────────────────────────────────────────────────

  monday_token: {
    summary: 'Create a Monday.com API token and paste it here to read and update boards, items, and columns.',
    prerequisites: ['A Monday.com account (any plan).'],
    steps: [
      'Go to https://monday.com and sign in.',
      'Click your profile picture (top right) → Administration → API.',
      'Copy the personal API token shown, or click "Generate" to create a new one.',
      'Paste the token into the API Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'API Token',
        description: 'Monday.com personal API token for GraphQL queries.',
        whereToFind: 'monday.com → Profile picture → Administration → API. Copy the personal token shown.',
        notes: ['If you do not see the Administration menu, you may not have admin permissions — ask your workspace admin to generate a token.'],
      },
    },
    docsUrl: 'https://developer.monday.com/api-reference/docs/authentication',
  },

  // ─── Linear ───────────────────────────────────────────────────────────────────

  linear_oauth2: {
    summary: 'Connect your Linear workspace with OAuth to create and manage issues and projects.',
    prerequisites: ['A Linear workspace you are a member of.'],
    steps: [
      'Click "Connect Linear" below.',
      'Sign in to Linear and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://developers.linear.app/docs/oauth/authentication',
  },

  linear_api_key: {
    summary: 'Create a Linear Personal API Key and paste it here to manage issues and projects.',
    prerequisites: ['A Linear workspace you are a member of.'],
    steps: [
      'Go to https://linear.app/settings/api and sign in.',
      'Under "Personal API Keys", click "Create key" → give it a label like "CtrlChecks".',
      'Copy the key shown.',
      'Paste the key into the Personal API Key field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Personal API Key',
        description: 'Linear personal API key for issue and project management.',
        whereToFind: 'linear.app/settings/api → Personal API Keys → Create key. Shown only once.',
        notes: ['Shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://developers.linear.app/docs/graphql/working-with-the-graphql-api',
  },

  // ─── Trello ───────────────────────────────────────────────────────────────────

  trello_api_key: {
    summary: 'Get your Trello API Key and a user Token — both are required to read and update boards, lists, and cards.',
    prerequisites: ['A Trello account at trello.com (free account works).'],
    steps: [
      'Go to https://trello.com/power-ups/admin and sign in.',
      'Click "New" to create a Power-Up (a placeholder app) — give it any name and workspace.',
      'Click "Generate a new API key" on the Power-Up page. Your API Key is displayed.',
      'Click the "Token" link next to the API key → click Allow → copy the long token string.',
      'You now have two values: the API Key and the Token. Enter both fields and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Trello app API key — identifies the application.',
        whereToFind: 'trello.com/power-ups/admin → your Power-Up → API Key section.',
        notes: ['You need both the API Key AND the Token — neither works alone.'],
      },
      token: {
        label: 'API Token',
        description: 'User authorization token giving access to your Trello boards.',
        whereToFind: 'On the same API key page, click the "Token" link → Allow → copy the displayed token.',
        notes: ['The token authorizes access to your specific Trello account. Keep it secret.'],
      },
    },
    docsUrl: 'https://developer.atlassian.com/cloud/trello/rest/',
  },

  // ─── HubSpot ─────────────────────────────────────────────────────────────────

  hubspot_oauth2: {
    summary: 'Connect your HubSpot portal with OAuth for CRM contact, deal, company, and ticket access.',
    prerequisites: [
      'A HubSpot account at app.hubspot.com (free CRM works).',
      'Super Admin or App Marketplace Install permissions in HubSpot.',
    ],
    steps: [
      'Click "Connect HubSpot" below.',
      'Sign in to HubSpot and select the portal you want to connect.',
      'Review the requested permissions and click "Grant access".',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      '"Insufficient permissions to install apps" — your HubSpot role needs the "App Marketplace Install" permission. Ask your HubSpot Super Admin to grant it.',
    ],
    docsUrl: 'https://developers.hubspot.com/docs/api/oauth-quickstart-guide',
  },

  hubspot_private_app: {
    summary: 'Create a HubSpot Private App token and paste it here for direct API access to contacts, deals, and more.',
    prerequisites: [
      'Super Admin access in your HubSpot portal at app.hubspot.com.',
    ],
    steps: [
      'Go to https://app.hubspot.com and sign in.',
      'Click the Settings gear (top right) → Integrations → Private Apps.',
      'Click "Create a private app" → give it a name like "CtrlChecks".',
      'Go to the "Scopes" tab and add the scopes you need: crm.objects.contacts.read, crm.objects.contacts.write, crm.objects.deals.read, crm.objects.deals.write (add more as needed).',
      'Click "Create app" → confirm. Copy the Access Token shown — it starts with pat-na1- (or your regional prefix).',
      'Paste the token into the Private App Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Private App Access Token',
        description: 'HubSpot Private App access token for CRM API calls.',
        whereToFind: 'app.hubspot.com → Settings → Integrations → Private Apps → Create a private app → token shown after creation. Starts with pat-na1- (US) or pat-eu1- (EU).',
        example: 'pat-na1-...',
        notes: [
          'Token starts with pat-na1- for US, pat-eu1- for EU HubSpot portals.',
          'Add scopes carefully — only include what your workflows need.',
        ],
      },
    },
    docsUrl: 'https://developers.hubspot.com/docs/api/private-apps',
  },

  // ─── Salesforce ───────────────────────────────────────────────────────────────

  salesforce_oauth2: {
    summary: 'Connect your Salesforce org with OAuth to read and write CRM records.',
    prerequisites: [
      'A Salesforce account (Developer Edition is free at developer.salesforce.com).',
      'The CtrlChecks Connected App must be configured in your Salesforce org — see troubleshooting if you get redirect URI errors.',
    ],
    steps: [
      'Click "Connect Salesforce" below.',
      'Sign in to Salesforce and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
      'Optionally enter your Salesforce Instance URL (e.g. yourcompany.my.salesforce.com) if connecting to a sandbox or custom domain.',
    ],
    fieldGuides: {
      instanceUrl: {
        label: 'Instance URL',
        description: 'Your Salesforce org subdomain — needed for sandbox or custom domain orgs.',
        whereToFind: 'Optional. Your Salesforce login URL, e.g. https://yourcompany.my.salesforce.com → enter just yourcompany.my.salesforce.com.',
        example: 'yourcompany.my.salesforce.com',
        notes: ['Leave blank for standard production orgs. Required for sandboxes (e.g. yourcompany--uat.sandbox.my.salesforce.com).'],
      },
    },
    troubleshooting: [
      'Redirect URI mismatch — a Connected App must be set up in your Salesforce org with the correct callback URL. Go to Setup → App Manager → New Connected App, enable OAuth, and set the callback URL to your CtrlChecks backend callback URL.',
      '"insufficient_scope" error — the Connected App scopes must include "api" and "refresh_token".',
    ],
    docsUrl: 'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm',
  },

  // ─── Pipedrive ────────────────────────────────────────────────────────────────

  pipedrive_api_key: {
    summary: 'Get your Pipedrive API token and paste it here to create and update deals, contacts, and activities.',
    prerequisites: ['A Pipedrive account at app.pipedrive.com.'],
    steps: [
      'Go to https://app.pipedrive.com and sign in.',
      'Click your profile picture or initials (top right) → Personal Preferences.',
      'Click the "API" tab.',
      'Your API token is shown — copy it.',
      'Paste the token into the API Token field and click Save.',
    ],
    fieldGuides: {
      apiToken: {
        label: 'API Token',
        description: 'Pipedrive personal API token appended as a query parameter on every request.',
        whereToFind: 'app.pipedrive.com → Profile → Personal Preferences → API tab.',
      },
    },
    docsUrl: 'https://developers.pipedrive.com/docs/api/v1',
  },

  // ─── Zoho CRM ─────────────────────────────────────────────────────────────────

  zoho_oauth2: {
    summary: 'Connect your Zoho CRM account with OAuth to manage leads, contacts, and deals.',
    prerequisites: ['A Zoho CRM account at crm.zoho.com.'],
    steps: [
      'Click "Connect Zoho" below.',
      'Sign in to Zoho and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Region mismatch — Zoho uses region-specific URLs (zoho.com, zoho.in, zoho.eu). Ensure your CtrlChecks Zoho OAuth app is registered for the correct region.',
    ],
    docsUrl: 'https://www.zoho.com/crm/developer/docs/api/v2/oauth-overview.html',
  },

  // ─── Freshdesk ───────────────────────────────────────────────────────────────

  freshdesk_api_key: {
    summary: 'Get your Freshdesk API key and domain to create and update support tickets.',
    prerequisites: [
      'A Freshdesk account — your domain is the part before .freshdesk.com in your Freshdesk URL.',
    ],
    steps: [
      'Log in to your Freshdesk account at yourcompany.freshdesk.com.',
      'Click your profile photo (top right) → Profile Settings.',
      'Your API Key is displayed on the right side of the page — copy it.',
      'Note your subdomain: if your URL is mycompany.freshdesk.com, the subdomain is mycompany.',
      'Enter your domain and API key and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Freshdesk personal API key for ticket management.',
        whereToFind: 'yourcompany.freshdesk.com → Profile photo → Profile Settings → API Key section on the right.',
      },
      domain: {
        label: 'Domain',
        description: 'Your Freshdesk subdomain used to build API URLs.',
        whereToFind: 'Your Freshdesk login URL: if it is mycompany.freshdesk.com, the domain is mycompany (without .freshdesk.com).',
        example: 'mycompany',
        notes: ['Enter just the subdomain part (no .freshdesk.com).'],
      },
    },
    docsUrl: 'https://developers.freshdesk.com/api/',
  },

  // ─── Intercom ─────────────────────────────────────────────────────────────────

  intercom_token: {
    summary: 'Create an Intercom access token and paste it here to read and create conversations, contacts, and messages.',
    prerequisites: ['An Intercom account at app.intercom.com with Developer Hub access.'],
    steps: [
      'Go to https://app.intercom.com and sign in.',
      'Click Settings (gear icon, bottom left) → Integrations → Developer Hub.',
      'Click "New app" (or select an existing app) → Authentication.',
      'Under "Access Token", copy the token shown.',
      'Paste the token into the Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Access Token',
        description: 'Intercom access token for conversation and contact management.',
        whereToFind: 'app.intercom.com → Settings → Integrations → Developer Hub → your app → Authentication → Access Token.',
      },
    },
    docsUrl: 'https://developers.intercom.com/docs/build-an-integration/learn-more/authentication',
  },

  // ─── Discord ──────────────────────────────────────────────────────────────────

  discord_bot_token: {
    summary: 'Create a Discord bot application and paste its token here to send messages to Discord channels.',
    prerequisites: [
      'A Discord account at discord.com.',
      'Server admin access to invite the bot to your server (or use your own personal server for testing).',
    ],
    steps: [
      'Go to https://discord.com/developers/applications and sign in.',
      'Click "New Application" → give it a name like "CtrlChecks Bot" → Create.',
      'Click "Bot" in the left menu → click "Reset Token" → confirm → copy the token.',
      'Enable Developer Mode in Discord: User Settings → Advanced → Developer Mode ON. Then right-click any channel → Copy Channel ID for use in workflow nodes.',
      'Invite the bot to your server: in the Discord app dashboard go to OAuth2 → URL Generator → select "bot" scope + "Send Messages" permission → copy the URL → open it in a browser → select your server → Authorize.',
      'Paste the bot token into the Bot Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Bot Token',
        description: 'Discord bot token for sending messages through the bot account.',
        whereToFind: 'discord.com/developers/applications → your app → Bot → Reset Token. Shown after each reset.',
        notes: [
          'Keep this token secret — it gives full control of your bot.',
          'You also need to invite the bot to the target server before it can send messages.',
          'Enable Developer Mode in Discord to right-click channels/users and copy their IDs.',
        ],
      },
    },
    docsUrl: 'https://discord.com/developers/docs/getting-started',
  },

  discord_webhook: {
    summary: 'Create a Discord channel webhook URL and paste it here to post messages directly to a channel.',
    prerequisites: ['Manage Webhooks permission in the Discord server (or be the server owner).'],
    steps: [
      'In Discord, right-click on the channel where you want messages to appear → Edit Channel.',
      'Click "Integrations" in the left sidebar → Webhooks → New Webhook.',
      'Give it a name (e.g. CtrlChecks) and optionally set an avatar.',
      'Click "Copy Webhook URL" — this URL is your credential.',
      'Paste the webhook URL into the Webhook URL field and click Save.',
    ],
    fieldGuides: {
      webhookUrl: {
        label: 'Webhook URL',
        description: 'Full Discord webhook URL for posting messages to a specific channel.',
        whereToFind: 'Discord → right-click channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.',
        example: 'https://discord.com/api/webhooks/...',
        notes: ['Keep the webhook URL private — anyone with it can post to your channel.'],
      },
    },
    docsUrl: 'https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks',
  },

  // ─── Telegram ─────────────────────────────────────────────────────────────────

  telegram_bot_token: {
    summary: 'Create a Telegram bot via BotFather and paste its token here to send messages and receive updates.',
    prerequisites: [
      'A Telegram account (phone app or web.telegram.org).',
      'The Telegram chat ID you want to send messages to — see step 6.',
    ],
    steps: [
      'Open Telegram and search for @BotFather — start a chat with it.',
      'Send /newbot → provide a display name (e.g. My Company Bot) → provide a username ending in "bot" (e.g. mycompany_bot).',
      'BotFather sends a token like 123456789:ABCdef_GHIjkl-MNOpqr. Copy the entire token.',
      'Paste the bot token into the Bot Token field and click Save.',
      'To get a chat ID: start a conversation with your new bot, then forward any message from the chat to @userinfobot — it will reply with the chat ID.',
      'Use the chat ID in the Telegram workflow node as the destination.',
    ],
    fieldGuides: {
      token: {
        label: 'Bot Token',
        description: 'Telegram bot token from BotFather for sending and receiving messages.',
        whereToFind: 'Telegram app → @BotFather → /newbot → token is in the reply. Format: 123456789:ABCdef...',
        example: '123456789:ABCdef_GHIjkl-MNOpqr',
        notes: [
          'Use @userinfobot to find the numeric chat ID for the destination chat.',
          'The bot must have been started by (or added to) the destination chat before it can send messages.',
        ],
      },
    },
    docsUrl: 'https://core.telegram.org/bots/features#botfather',
  },

  // ─── WhatsApp ─────────────────────────────────────────────────────────────────

  whatsapp_api_key: {
    summary: 'Set up a WhatsApp Cloud API app in Meta Business Suite to send messages via the WhatsApp Business API.',
    prerequisites: [
      'A Meta Business Account at business.facebook.com.',
      'A verified business phone number for WhatsApp.',
      'Approved message templates for sending to new contacts (template approval takes 24–48 hours from Meta).',
    ],
    steps: [
      'Go to https://developers.facebook.com and sign in with your Meta Business Account.',
      'Create or select an app → Under "Add Products", click "Set Up" on WhatsApp.',
      'In the WhatsApp section, go to API Setup to find your Phone Number ID (a long numeric string like 123456789012345).',
      'For the access token: go to your app → System Users (in Meta Business Settings) → create a System User → Generate Token → select your app and permissions → copy the permanent token.',
      'Enter the Access Token and Phone Number ID into the fields and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'Access Token',
        description: 'Meta System User access token for WhatsApp Cloud API calls.',
        whereToFind: 'developers.facebook.com → your app → WhatsApp → API Setup → Temporary Access Token (for testing), or Meta Business Settings → System Users → Generate Token (for production).',
        notes: [
          'Use a permanent System User token for production — the temporary token from API Setup expires after 24 hours.',
          'First message to a new contact must use an approved Message Template. Free-form messages only work within 24-hour customer-initiated windows.',
        ],
      },
      phoneNumberId: {
        label: 'Phone Number ID',
        description: 'Numeric ID of the WhatsApp Business phone number sending messages.',
        whereToFind: 'developers.facebook.com → your app → WhatsApp → API Setup → Phone Number ID field (long numeric string).',
        example: '123456789012345',
        notes: ['This is a numeric ID, not the phone number itself.'],
      },
    },
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  },

  // ─── Twilio ───────────────────────────────────────────────────────────────────

  twilio_api_key: {
    summary: 'Get your Twilio Account SID and Auth Token to send SMS, make calls, and use other Twilio services.',
    prerequisites: [
      'A Twilio account at console.twilio.com (free trial includes credits).',
      'A Twilio phone number to use as the sender (from Phone Numbers → Manage → Active Numbers).',
    ],
    steps: [
      'Go to https://console.twilio.com and sign in.',
      'On the main Console dashboard, locate "Account Info".',
      'Copy the Account SID — it starts with AC.',
      'Click "Show" next to Auth Token to reveal it, then copy it.',
      'Enter both values into the fields and click Save.',
    ],
    fieldGuides: {
      accountSid: {
        label: 'Account SID',
        description: 'Twilio Account SID — identifies your Twilio account.',
        whereToFind: 'console.twilio.com main dashboard → Account Info section. Starts with AC.',
        example: 'AC...',
      },
      authToken: {
        label: 'Auth Token',
        description: 'Twilio Auth Token — secret credential paired with Account SID.',
        whereToFind: 'console.twilio.com main dashboard → Account Info section → click "Show" to reveal.',
        notes: [
          'Keep this token secret — it gives full control of your Twilio account.',
          'Trial accounts can only send SMS to verified numbers. Go to Verified Caller IDs to add test numbers, or upgrade your account to send to any number.',
        ],
      },
    },
    docsUrl: 'https://www.twilio.com/docs/iam/keys/api-key',
  },

  // ─── SendGrid ─────────────────────────────────────────────────────────────────

  sendgrid_api_key: {
    summary: 'Create a SendGrid API key and verify a sender identity to send transactional emails.',
    prerequisites: [
      'A SendGrid account at app.sendgrid.com (free plan: 100 emails/day).',
      'A verified sender email or domain — required before sending (Settings → Sender Authentication).',
    ],
    steps: [
      'Go to https://app.sendgrid.com and sign in.',
      'Click Settings (left sidebar) → API Keys → Create API Key.',
      'Give it a name like "CtrlChecks" → choose "Restricted Access" → enable "Mail Send" → Create & View.',
      'Copy the key — it starts with SG. and is shown only once.',
      'Verify your sender: Settings → Sender Authentication → verify a single sender email or your full domain.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'SendGrid API key for sending emails via the Mail Send API.',
        whereToFind: 'app.sendgrid.com → Settings → API Keys → Create API Key. Key starts with SG. and is shown only once.',
        example: 'SG....',
        notes: [
          'Shown only once — copy before closing the modal.',
          'Emails will fail with a 403 if your sender address/domain is not verified in Sender Authentication.',
        ],
      },
    },
    docsUrl: 'https://docs.sendgrid.com/ui/account-and-settings/api-keys',
  },

  // ─── Mailchimp ────────────────────────────────────────────────────────────────

  mailchimp_api_key: {
    summary: 'Create a Mailchimp API key to manage lists, campaigns, and subscriber data.',
    prerequisites: ['A Mailchimp account at mailchimp.com.'],
    steps: [
      'Go to https://mailchimp.com and sign in.',
      'Click your profile name (bottom left) → Account & billing → Extras → API keys.',
      'Click "Create A Key" → give it a name like "CtrlChecks" → Generate Key.',
      'Copy the key — it ends with a datacenter code like -us21 or -us6.',
      'Paste the key into the API Key field and click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Mailchimp API key for list and campaign management.',
        whereToFind: 'mailchimp.com → Profile → Account & billing → Extras → API keys → Create A Key. Key ends with datacenter code like -us21.',
        example: 'abcdef1234567890...-us21',
        notes: ['The datacenter suffix (e.g. -us21) determines the API endpoint — keep the full key including this suffix.'],
      },
    },
    docsUrl: 'https://mailchimp.com/developer/marketing/guides/quick-start/',
  },

  mailchimp_oauth2: {
    summary: 'Connect your Mailchimp account with OAuth for list and campaign management.',
    prerequisites: ['A Mailchimp account at mailchimp.com.'],
    steps: [
      'Click "Connect Mailchimp" below.',
      'Sign in to Mailchimp and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/',
  },

  // ─── ActiveCampaign ──────────────────────────────────────────────────────────

  activecampaign_api: {
    summary: 'Get your ActiveCampaign API URL and API Key — both values are required to manage contacts, lists, and automations.',
    prerequisites: ['An ActiveCampaign account (any plan).'],
    steps: [
      'Go to your ActiveCampaign account and sign in.',
      'Click Settings (gear icon, bottom left) → Developer.',
      'You will see two values: the API URL (e.g. https://youraccount.api-us1.com) and the API Key. Copy both.',
      'Enter the Account URL and API Key into the fields and click Save.',
    ],
    fieldGuides: {
      apiUrl: {
        label: 'Account URL',
        description: 'Your ActiveCampaign API base URL — unique to your account.',
        whereToFind: 'ActiveCampaign → Settings → Developer → API URL. Format: https://youraccount.api-us1.com',
        example: 'https://youraccount.api-us1.com',
        notes: ['This URL is unique to your account — do not use the generic api-us1.com hostname.'],
      },
      apiKey: {
        label: 'API Key',
        description: 'ActiveCampaign API key for authenticating requests.',
        whereToFind: 'ActiveCampaign → Settings → Developer → API Key (same page as API URL).',
        notes: ['Both the URL and Key are required — the URL alone or Key alone will not work.'],
      },
    },
    docsUrl: 'https://developers.activecampaign.com/reference/url',
  },

  // ─── Calendly ─────────────────────────────────────────────────────────────────

  calendly_api: {
    summary: 'Create a Calendly Personal Access Token to list event types and read scheduled meetings.',
    prerequisites: ['A Calendly account at calendly.com (free plan works).'],
    steps: [
      'Go to https://calendly.com and sign in.',
      'Click your profile photo (top right) → Integrations → API & Webhooks.',
      'Under "Personal Access Tokens", click "Generate new token" → give it a name → Create Token.',
      'Copy the token shown.',
      'Paste the token into the Personal Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Personal Access Token',
        description: 'Calendly token for accessing event types and scheduled events.',
        whereToFind: 'calendly.com → Profile → Integrations → API & Webhooks → Personal Access Tokens → Generate new token.',
      },
    },
    docsUrl: 'https://developer.calendly.com/api-docs',
  },

  // ─── Mailgun ──────────────────────────────────────────────────────────────────

  mailgun_api: {
    summary: 'Create a Mailgun API key and enter your sending domain to send transactional emails.',
    prerequisites: [
      'A Mailgun account at mailgun.com.',
      'A verified sending domain (Mailgun → Sending → Domains) — required before sending emails.',
    ],
    steps: [
      'Go to https://mailgun.com and sign in.',
      'Go to Settings → API Keys → click "Add new key" — give it a description and copy the Private API Key. It starts with key-.',
      'Note your verified sending domain (e.g. mg.yourcompany.com) from Sending → Domains.',
      'Choose your region: US (api.mailgun.net) or EU (api.eu.mailgun.net).',
      'Enter the API Key, your Sending Domain, and the Region, then click Save.',
    ],
    fieldGuides: {
      apiKey: {
        label: 'API Key',
        description: 'Mailgun private API key for sending emails.',
        whereToFind: 'mailgun.com → Settings → API Keys → Add new key. Key starts with key-.',
        example: 'key-...',
        notes: ['Use the Private API Key (key-...), not the Public Validation Key.'],
      },
      domain: {
        label: 'Sending Domain',
        description: 'Your verified Mailgun sending domain used as the API endpoint namespace.',
        whereToFind: 'mailgun.com → Sending → Domains. Must be verified with DNS records before sending.',
        example: 'mg.yourcompany.com',
        notes: ['Emails sent from addresses not on this domain will fail. Set up domain verification in Mailgun first.'],
      },
      region: {
        label: 'Region',
        description: 'Mailgun server region — must match where your Mailgun account is hosted.',
        whereToFind: 'Check your Mailgun account dashboard URL: app.mailgun.com = US; eu.mailgun.com = EU.',
        notes: ['Using the wrong region will result in authentication errors.'],
      },
    },
    docsUrl: 'https://documentation.mailgun.com/docs/mailgun/api-reference/authentication',
  },

  // ─── AWS S3 ───────────────────────────────────────────────────────────────────

  aws_s3_api_key: {
    summary: 'Create an AWS IAM user with S3 access and paste its access keys here to upload, download, and manage S3 files.',
    prerequisites: [
      'An AWS account at aws.amazon.com.',
      'Permission to create IAM users (Administrator or IAM Full Access role).',
      'An S3 bucket already created, or create one after connecting.',
    ],
    steps: [
      'Sign in to AWS Console at https://console.aws.amazon.com and open IAM.',
      'Click Users → Create user → name it ctrlchecks-s3 → Next.',
      'Under Permissions, click "Attach policies directly" → search for AmazonS3FullAccess → select it → Next → Create user.',
      'Click the new user → Security credentials tab → Access keys → Create access key → "Application running outside AWS".',
      'Copy the Access Key ID and Secret Access Key. Note your AWS Region (e.g. us-east-1) and your bucket name.',
      'Enter the three values into the fields and click Save.',
    ],
    fieldGuides: {
      accessKeyId: {
        label: 'Access Key ID',
        description: 'AWS IAM access key ID — identifies the IAM user.',
        whereToFind: 'AWS Console → IAM → Users → ctrlchecks-s3 → Security credentials → Access keys → Create access key.',
        example: 'AKIAIOSFODNN7EXAMPLE',
      },
      secretAccessKey: {
        label: 'Secret Access Key',
        description: 'AWS IAM secret key paired with the Access Key ID.',
        whereToFind: 'Shown once when creating the access key in IAM. Download the CSV if you need to reference it later.',
        notes: ['Shown only once — download the CSV or copy before closing the creation modal.'],
      },
      region: {
        label: 'Region',
        description: 'AWS region where your S3 bucket is located.',
        whereToFind: 'AWS Console → S3 → click your bucket → Properties tab → shows the AWS Region.',
        example: 'us-east-1',
        notes: ['Requests to a bucket in a different region than specified will fail.'],
      },
    },
    docsUrl: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html',
  },

  // ─── Cloudflare ───────────────────────────────────────────────────────────────

  cloudflare_api_key: {
    summary: 'Create a Cloudflare API token with scoped permissions to manage DNS, Workers, or Pages.',
    prerequisites: ['A Cloudflare account at dash.cloudflare.com.'],
    steps: [
      'Go to https://dash.cloudflare.com/profile/api-tokens and sign in.',
      'Click "Create Token" → use a template (e.g. "Edit zone DNS") or create a custom token with the specific permissions your workflow needs.',
      'Set zone/account resources and permissions → Continue to summary → Create Token.',
      'Copy the token — it is shown only once.',
      'Paste the token into the API Token field and click Save.',
    ],
    fieldGuides: {
      apiToken: {
        label: 'API Token',
        description: 'Scoped Cloudflare API token for zone or account management.',
        whereToFind: 'dash.cloudflare.com/profile/api-tokens → Create Token. Shown only once after creation.',
        notes: [
          'Shown only once — copy before closing.',
          'Use a scoped token with only the permissions your workflows need (not the Global API Key).',
        ],
      },
    },
    docsUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
  },

  // ─── Dropbox ──────────────────────────────────────────────────────────────────

  dropbox_oauth2: {
    summary: 'Connect your Dropbox account with OAuth to read, upload, and manage files.',
    prerequisites: ['A Dropbox account at dropbox.com (free plan works).'],
    steps: [
      'Click "Connect Dropbox" below.',
      'Sign in to Dropbox and click Allow.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://www.dropbox.com/developers/documentation',
  },

  // ─── Supabase ─────────────────────────────────────────────────────────────────

  supabase_api_key: {
    summary: 'Get your Supabase project URL and API key to read and write database tables via the REST API.',
    prerequisites: [
      'A Supabase project at supabase.com (free plan available).',
      'Note: the anon key respects Row Level Security; the service_role key bypasses it.',
    ],
    steps: [
      'Go to https://supabase.com/dashboard and sign in.',
      'Open your project → click "Settings" (gear icon) in the left sidebar → API.',
      'Under "Project URL", copy the URL (format: https://xxxx.supabase.co).',
      'Under "Project API keys": copy "anon/public" for RLS-respecting access, or "service_role" for full unrestricted access.',
      'Enter the Project URL and API Key into the fields and click Save.',
    ],
    fieldGuides: {
      url: {
        label: 'Project URL',
        description: 'Supabase project REST API endpoint.',
        whereToFind: 'supabase.com → your project → Settings → API → Project URL. Format: https://xxxx.supabase.co',
        example: 'https://xxxx.supabase.co',
      },
      apiKey: {
        label: 'API Key',
        description: 'Supabase project API key for authenticating requests.',
        whereToFind: 'supabase.com → your project → Settings → API → Project API keys. Choose anon (respects RLS) or service_role (bypasses RLS).',
        notes: [
          'anon key: honors Row Level Security policies — use for user-facing workflows.',
          'service_role key: full access, bypasses RLS — use for admin/backend workflows and keep very secret.',
        ],
      },
    },
    docsUrl: 'https://supabase.com/docs/guides/api',
  },

  // ─── MongoDB ──────────────────────────────────────────────────────────────────

  mongodb_connection: {
    summary: 'Provide a MongoDB connection string to read and write documents in your MongoDB database.',
    prerequisites: [
      'A MongoDB Atlas cluster at cloud.mongodb.com, or a self-hosted MongoDB instance.',
      'A database user with read/write permissions and network access configured for CtrlChecks.',
    ],
    steps: [
      'For MongoDB Atlas: go to https://cloud.mongodb.com → your cluster → Connect → "Connect your application".',
      'Choose Driver: Node.js → copy the connection string. Replace <password> with your database user password and <dbname> with your database name.',
      'For self-hosted MongoDB: use mongodb://username:password@host:27017/databasename',
      'Ensure your Atlas Network Access (IP whitelist) allows connections from CtrlChecks, or use 0.0.0.0/0 for all IPs.',
      'Paste the connection string into the Connection String field and click Save.',
    ],
    fieldGuides: {
      uri: {
        label: 'Connection String',
        description: 'Full MongoDB connection string including credentials and database name.',
        whereToFind: 'MongoDB Atlas: cloud.mongodb.com → cluster → Connect → Connect your application → copy the connection string. Replace <password> and optionally <dbname>.',
        example: 'mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/databasename',
        notes: [
          'Replace <password> in the template with your actual database user password.',
          'Include the database name at the end of the URI for clarity.',
          'Atlas: ensure the connecting IP is whitelisted in Network Access → IP Access List.',
        ],
      },
    },
    docsUrl: 'https://www.mongodb.com/docs/manual/reference/connection-string/',
  },

  // ─── PostgreSQL ───────────────────────────────────────────────────────────────

  postgresql_connection: {
    summary: 'Enter your PostgreSQL server connection details to run queries and manage data.',
    prerequisites: [
      'A running PostgreSQL server (local, cloud, or AWS RDS).',
      'A database user with the necessary permissions.',
      'Firewall/security group rules that allow connections on port 5432 from the CtrlChecks worker.',
    ],
    steps: [
      'For AWS RDS: go to AWS Console → RDS → your database instance → Connectivity & security. The "Endpoint" field is your host.',
      'For local/other: get the hostname (or IP), port (default 5432), database name, username, and password from your DBA or hosting provider.',
      'Ensure the database server allows remote connections and port 5432 is open to the CtrlChecks worker IP.',
      'Enter all fields (Host, Port, Database, Username, Password) and click Test Connection to verify, then Save.',
    ],
    fieldGuides: {
      host: {
        label: 'Host',
        description: 'PostgreSQL server hostname or IP address.',
        whereToFind: 'AWS RDS: AWS Console → RDS → your instance → Connectivity & security → Endpoint. Local: localhost or your server IP.',
        example: 'mydb.abc123.us-east-1.rds.amazonaws.com',
      },
      port: {
        label: 'Port',
        description: 'Port the PostgreSQL server listens on.',
        whereToFind: 'Default is 5432 unless your server is configured differently.',
        example: '5432',
      },
      database: {
        label: 'Database',
        description: 'Name of the specific database to connect to.',
        whereToFind: 'The database name as created in PostgreSQL. Run `\\l` in psql to list databases.',
      },
      username: {
        label: 'Username',
        description: 'PostgreSQL user with permission to access the database.',
        whereToFind: 'Created by your DBA or in AWS RDS → your instance → Configuration → Master username.',
      },
      password: {
        label: 'Password',
        description: 'Password for the PostgreSQL user.',
        whereToFind: 'Set when creating the database user. AWS RDS: stored in Secrets Manager if you enabled credential management.',
      },
    },
    docsUrl: 'https://www.postgresql.org/docs/current/tutorial-accessdb.html',
  },

  // ─── MySQL ────────────────────────────────────────────────────────────────────

  mysql_connection: {
    summary: 'Enter your MySQL server connection details to run queries and manage data.',
    prerequisites: [
      'A running MySQL server (local, cloud, or AWS RDS).',
      'A database user with the necessary permissions.',
      'Port 3306 open to the CtrlChecks worker in your firewall or security group.',
    ],
    steps: [
      'For AWS RDS: go to AWS Console → RDS → your instance → Connectivity & security → copy the Endpoint as your host.',
      'For local/other: get hostname, port (default 3306), database name, username, and password.',
      'Ensure the MySQL server allows remote connections: check bind-address in my.cnf and security group rules.',
      'Enter all fields and click Test Connection to verify, then Save.',
    ],
    fieldGuides: {
      host: {
        label: 'Host',
        description: 'MySQL server hostname or IP address.',
        whereToFind: 'AWS RDS: AWS Console → RDS → instance → Endpoint. Local: localhost or your server IP.',
        example: 'mydb.abc123.us-east-1.rds.amazonaws.com',
      },
      port: {
        label: 'Port',
        description: 'Port the MySQL server listens on.',
        whereToFind: 'Default is 3306 unless customized.',
        example: '3306',
      },
      database: {
        label: 'Database',
        description: 'Name of the MySQL database to connect to.',
        whereToFind: 'The database name. Run SHOW DATABASES; in MySQL client to list available databases.',
      },
      username: {
        label: 'Username',
        description: 'MySQL user account with permission to access the database.',
        whereToFind: 'Created by your DBA or in AWS RDS → master username.',
      },
      password: {
        label: 'Password',
        description: 'Password for the MySQL user.',
        whereToFind: 'Set when creating the MySQL user or in AWS RDS → Secrets Manager.',
      },
    },
    docsUrl: 'https://dev.mysql.com/doc/refman/8.0/en/',
  },

  // ─── Firebase ─────────────────────────────────────────────────────────────────

  firebase_credentials: {
    summary: 'Get your Firebase project credentials to read and write Firestore documents and use other Firebase services.',
    prerequisites: [
      'A Firebase project at console.firebase.google.com.',
      'Firestore or Realtime Database enabled in the project.',
    ],
    steps: [
      'Go to https://console.firebase.google.com and open your project.',
      'For the Web API Key: click the gear icon (top left) → Project Settings → General tab → "Web API key" under "Your apps".',
      'For the Service Account JSON (needed for server-side writes): Project Settings → Service Accounts tab → "Generate new private key" → Generate key → a JSON file downloads.',
      'Open the JSON file and copy its entire contents (from { to }).',
      'Enter your Project ID, Web API Key, and optionally paste the full Service Account JSON.',
    ],
    fieldGuides: {
      projectId: {
        label: 'Project ID',
        description: 'Firebase project identifier used in API calls.',
        whereToFind: 'console.firebase.google.com → Project Settings → General → Project ID.',
        example: 'my-firebase-project',
      },
      apiKey: {
        label: 'Web API Key',
        description: 'Firebase Web API key for client-side SDK authentication.',
        whereToFind: 'Firebase Console → Project Settings → General → Your apps → Web API key. Alternatively, the apiKey field in your Firebase config snippet.',
      },
      serviceAccountJson: {
        label: 'Service Account JSON',
        description: 'Full service account JSON file contents for server-side Admin SDK operations.',
        whereToFind: 'Firebase Console → Project Settings → Service Accounts → Generate new private key. Opens a JSON file download — paste its full contents here.',
        notes: [
          'Optional but required for server-side operations (Firestore writes from the Admin SDK).',
          'Paste the entire JSON object including the opening { and closing }.',
        ],
      },
    },
    securityNotes: [
      'The Service Account JSON has full admin access to your Firebase project — treat it like a password.',
      'Never commit the Service Account JSON to version control.',
      ...STANDARD_SECURITY.slice(2),
    ],
    docsUrl: 'https://firebase.google.com/docs/admin/setup',
  },

  // ─── Redis ────────────────────────────────────────────────────────────────────

  redis_connection: {
    summary: 'Provide a Redis connection URL to set and get keys, use pub/sub, and manage queues.',
    prerequisites: [
      'A running Redis server (local, Upstash, Redis Cloud, or Render).',
      'Port 6379 (or your custom port) accessible from the CtrlChecks worker.',
    ],
    steps: [
      'For local Redis: use redis://localhost:6379 (no auth) or redis://:yourpassword@localhost:6379',
      'For Upstash: go to https://console.upstash.com → your database → copy the "Redis URL" (TLS format: rediss://...).',
      'For Redis Cloud: go to app.redislabs.com → your database → copy the endpoint and construct the URL.',
      'Enter the Redis URL and click Test Connection, then Save.',
    ],
    fieldGuides: {
      url: {
        label: 'Redis URL',
        description: 'Full Redis connection URL including protocol, auth, host, and port.',
        whereToFind: 'For Upstash: console.upstash.com → database → Redis URL. For Redis Cloud: database details page. For local: construct as redis://:password@host:port',
        example: 'redis://:password@host:6379',
        notes: [
          'Use rediss:// (with double s) for TLS-encrypted connections (Upstash, Redis Cloud).',
          'Include the password after the colon: redis://:yourpassword@host:port',
        ],
      },
    },
    docsUrl: 'https://redis.io/docs/connect/',
  },

  // ─── Social Media ─────────────────────────────────────────────────────────────

  twitter_oauth2: {
    summary: 'Connect your Twitter / X account with OAuth to post tweets and read timeline data.',
    prerequisites: [
      'A Twitter / X account at x.com.',
      'Note: posting requires the tweet.write scope which CtrlChecks requests during OAuth.',
    ],
    steps: [
      'Click "Connect Twitter / X" below.',
      'Sign in to Twitter and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      '"This app is not authorized" — Twitter OAuth 2.0 apps may require developer app approval. If you self-host CtrlChecks, ensure your Twitter Developer App has the correct OAuth 2.0 redirect URI and the tweet.read/tweet.write scopes enabled.',
      'Tweets not posting — ensure the app has Read and Write permissions in the Twitter Developer Portal → your app → App permissions.',
    ],
    docsUrl: 'https://developer.x.com/en/docs/authentication/oauth-2-0',
  },

  facebook_oauth2: {
    summary: 'Connect your Facebook account with OAuth to post to pages and access public profile data.',
    prerequisites: [
      'A Facebook account with a connected Facebook Page (required to post on behalf of pages).',
      'Note: posting to personal profiles is restricted by Meta — pages are the standard use case.',
    ],
    steps: [
      'Click "Connect Facebook" below.',
      'Sign in to Facebook and grant the requested permissions.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      '"App not live" — the Meta app used by CtrlChecks may be in development mode. In development mode, only app team members can authenticate. Self-hosted: go to developers.facebook.com → your app → switch to Live mode.',
      'Page posting not available — you need pages_show_list and pages_manage_posts permissions, which require Meta App Review. Check your app\'s approved permissions.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/facebook-login/',
  },

  instagram_oauth2: {
    summary: 'Connect your Instagram Business or Creator account with OAuth to post media and read insights.',
    prerequisites: [
      'An Instagram Professional account (Business or Creator) — personal accounts cannot use the Graph API.',
      'The Instagram account must be linked to a Facebook Page.',
      'To convert: Instagram Settings → Account type and tools → Switch to Professional Account.',
    ],
    steps: [
      'Click "Connect Instagram" below.',
      'Sign in with the Facebook account linked to your Instagram Professional account.',
      'Grant the requested permissions.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      '"Instagram account not found" — your Instagram account must be a Business or Creator account linked to a Facebook Page. Personal accounts cannot connect.',
      'No pages shown — the Facebook account must manage a Facebook Page. Create one at facebook.com/pages/create.',
    ],
    docsUrl: 'https://developers.facebook.com/docs/instagram-platform/',
  },

  linkedin_oauth2: {
    summary: 'Connect your LinkedIn account with OAuth to post content and read profile data.',
    prerequisites: [
      'A LinkedIn personal account.',
      'For posting to company pages, your account must be a Page Admin for that organization.',
    ],
    steps: [
      'Click "Connect LinkedIn" below.',
      'Sign in to LinkedIn and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Cannot post to a company page — your LinkedIn account must have "Content admin" or higher role on the company page.',
      'Redirect URI error — self-hosted CtrlChecks must have LINKEDIN_CLIENT_ID and GENERIC_LINKEDIN_OAUTH_REDIRECT_URI set correctly in the worker .env.',
    ],
    docsUrl: 'https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow',
  },

  // ─── Payments ─────────────────────────────────────────────────────────────────

  stripe_api_key: {
    summary: 'Get your Stripe Secret Key and paste it here to create payments, customers, subscriptions, and refunds.',
    prerequisites: [
      'A Stripe account at stripe.com.',
      'Use sk_test_ keys for development and testing, sk_live_ keys for real transactions.',
    ],
    steps: [
      'Go to https://dashboard.stripe.com/apikeys and sign in.',
      'Under "Secret key", click "Reveal live key" (or use the test key shown directly).',
      'Copy the key — sk_live_ for production, sk_test_ for testing.',
      'Paste the key into the Secret Key field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Secret Key',
        description: 'Stripe secret API key for server-side operations.',
        whereToFind: 'dashboard.stripe.com/apikeys → Secret key. Use sk_test_ for testing, sk_live_ for production.',
        example: 'sk_live_... or sk_test_...',
        notes: [
          'Use sk_test_ while building — no real money moves with test keys.',
          'Amounts in Stripe are in the SMALLEST currency unit: $20.00 = 2000 (cents). Always enter integer cents, not dollars.',
          'sk_live_ keys are revealed by clicking — if compromised, roll the key immediately.',
        ],
      },
    },
    securityNotes: [
      'Anyone with your sk_live_ key can charge customers and issue refunds — treat it as a master password.',
      'Use Restricted Keys (dashboard.stripe.com/apikeys → Create restricted key) to limit scope for specific workflows.',
      ...STANDARD_SECURITY.slice(2),
    ],
    docsUrl: 'https://docs.stripe.com/keys',
  },

  paypal_oauth2: {
    summary: 'Connect your PayPal account with OAuth to create orders, capture payments, and manage subscriptions.',
    prerequisites: [
      'A PayPal Business account at developer.paypal.com.',
      'Choose Sandbox for testing or Live for real payments during the OAuth flow.',
    ],
    steps: [
      'Click "Connect PayPal" below.',
      'Select Sandbox or Live mode in the PayPal authorization screen.',
      'Sign in to PayPal and authorize CtrlChecks.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    fieldGuides: {
      mode: {
        label: 'Mode',
        description: 'Selects sandbox (test) or production (real money) PayPal API endpoints.',
        whereToFind: 'Choose Sandbox for development and testing. Switch to Production only when ready for real transactions.',
        notes: ['Sandbox transactions use test accounts and no real money. Always test with Sandbox first.'],
      },
    },
    docsUrl: 'https://developer.paypal.com/api/rest/authentication/',
  },

  // ─── Finance / Accounting ─────────────────────────────────────────────────────

  quickbooks_oauth2: {
    summary: 'Connect your QuickBooks Online account with OAuth to manage invoices, customers, and accounting data.',
    prerequisites: ['A QuickBooks Online account (Intuit account at quickbooks.intuit.com).'],
    steps: [
      'Click "Connect QuickBooks" below.',
      'Sign in to your Intuit account and select the QuickBooks company you want to connect.',
      'Authorize CtrlChecks to access your accounting data.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    troubleshooting: [
      'Redirect URI mismatch — ensure QUICKBOOKS_CLIENT_ID and the callback URL are registered in the Intuit developer portal at developer.intuit.com.',
    ],
    docsUrl: 'https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization',
  },

  xero_oauth2: {
    summary: 'Connect your Xero organization with OAuth to manage invoices, bills, and accounting data.',
    prerequisites: ['A Xero account at xero.com with at least one organization.'],
    steps: [
      'Click "Connect Xero" below.',
      'Sign in to Xero and select the organization to connect.',
      'Review the requested permissions and click Allow access.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://developer.xero.com/documentation/guides/oauth2/overview',
  },

  // ─── eCommerce ────────────────────────────────────────────────────────────────

  shopify_api_key: {
    summary: 'Create a Shopify custom app Admin API token and enter your store domain to manage products, orders, and customers.',
    prerequisites: [
      'A Shopify store (any plan) at yourstore.myshopify.com/admin.',
      'Custom app development enabled in your store settings.',
    ],
    steps: [
      'In your Shopify admin, go to Settings → Apps and sales channels.',
      'Click "Develop apps" → "Allow custom app development" (if prompted) → "Create an app" → give it a name like "CtrlChecks".',
      'Click the app name → go to "Configuration" tab → Admin API integration → Edit → select the scopes you need (e.g. read_orders, write_orders, read_products, write_products).',
      'Go to "API credentials" tab → "Install app" → Install.',
      'Copy the "Admin API access token" — it starts with shpat_ and is shown only once.',
      'Your store domain is the part before .myshopify.com (e.g. if your URL is mystore.myshopify.com, the store URL is mystore.myshopify.com).',
      'Enter the Store URL and the Access Token, then click Save.',
    ],
    fieldGuides: {
      storeUrl: {
        label: 'Store URL',
        description: 'Your Shopify store myshopify.com domain, used to build API request URLs.',
        whereToFind: 'Your Shopify admin URL: if it is https://mystore.myshopify.com/admin, the Store URL is mystore.myshopify.com.',
        example: 'yourstore.myshopify.com',
        notes: ['Enter the full myshopify.com domain, not a custom domain.'],
      },
      token: {
        label: 'Admin API Access Token',
        description: 'Shopify Admin API token with store management permissions.',
        whereToFind: 'Shopify Admin → Settings → Apps → Develop apps → your app → API credentials → Admin API access token. Starts with shpat_ and shown only once.',
        example: 'shpat_...',
        notes: ['Shown only once — copy before leaving the page. If lost, you must generate a new token.'],
      },
    },
    docsUrl: 'https://shopify.dev/docs/apps/build/authentication-authorization',
  },

  shopify_oauth2: {
    summary: 'Connect your Shopify store with OAuth to manage products, orders, and customers.',
    prerequisites: ['A Shopify store at yourstore.myshopify.com.'],
    steps: [
      'Click "Connect Shopify" below.',
      'Enter your store URL (yourstore.myshopify.com) and click Connect.',
      'Sign in to Shopify and install the app.',
      'Return to CtrlChecks — the connection will appear as active.',
    ],
    docsUrl: 'https://shopify.dev/docs/apps/build/authentication-authorization',
  },

  woocommerce_api_key: {
    summary: 'Generate a WooCommerce REST API key pair (Consumer Key + Secret) to manage products, orders, and customers.',
    prerequisites: [
      'A WordPress site with WooCommerce installed and activated.',
      'Administrator access to the WordPress dashboard.',
    ],
    steps: [
      'In your WordPress admin dashboard, go to WooCommerce → Settings.',
      'Click the "Advanced" tab → REST API → Add key.',
      'Enter a description like "CtrlChecks", set User to your admin account, and set Permissions to "Read/Write".',
      'Click "Generate API key". Copy both the Consumer Key (starts with ck_) and Consumer Secret (starts with cs_) — they are shown only once.',
      'Enter your Store URL (https://yourstore.com), Consumer Key, and Consumer Secret, then click Save.',
    ],
    fieldGuides: {
      storeUrl: {
        label: 'Store URL',
        description: 'Your WooCommerce store root URL.',
        whereToFind: 'Your store domain, e.g. https://yourstore.com — the same URL you use to visit your shop.',
        example: 'https://yourstore.com',
      },
      username: {
        label: 'Consumer Key',
        description: 'WooCommerce REST API consumer key used as the Basic Auth username.',
        whereToFind: 'WordPress Admin → WooCommerce → Settings → Advanced → REST API → Add key → shown after generation. Starts with ck_.',
        example: 'ck_...',
        notes: ['Shown only once — copy before closing the confirmation screen.'],
      },
      password: {
        label: 'Consumer Secret',
        description: 'WooCommerce REST API consumer secret used as the Basic Auth password.',
        whereToFind: 'Same page as Consumer Key — shown only once after generation. Starts with cs_.',
        example: 'cs_...',
        notes: ['Shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
  },

  // ─── Zendesk ──────────────────────────────────────────────────────────────────

  zendesk_api: {
    summary: 'Create a Zendesk API token and enter your subdomain and email to manage tickets and users.',
    prerequisites: [
      'A Zendesk account — note your subdomain (the part before .zendesk.com in your URL).',
      'Admin access to enable API token access.',
    ],
    steps: [
      'Log in to your Zendesk admin at yourcompany.zendesk.com.',
      'Go to Admin Center (gear icon, bottom left) → Apps and Integrations → APIs → Zendesk API.',
      'Make sure "Token Access" is enabled → click "+ Add API token" → give it a description → Copy.',
      'Note your subdomain: if your URL is acme.zendesk.com, the subdomain is acme.',
      'Enter your Subdomain, Email Address (your Zendesk login email), and API Token, then click Save.',
    ],
    fieldGuides: {
      subdomain: {
        label: 'Subdomain',
        description: 'Your Zendesk subdomain used to construct API endpoint URLs.',
        whereToFind: 'Your Zendesk URL: if it is acme.zendesk.com, the subdomain is acme.',
        example: 'acme',
        notes: ['Enter just the subdomain, not the full URL.'],
      },
      username: {
        label: 'Email Address',
        description: 'Your Zendesk admin login email, used as the Basic Auth username.',
        whereToFind: 'The email address you use to log in to Zendesk.',
        example: 'you@company.com',
      },
      apiToken: {
        label: 'API Token',
        description: 'Zendesk API token (different from your account password).',
        whereToFind: 'Zendesk Admin → Admin Center → Apps and Integrations → APIs → Zendesk API → Add API token.',
        notes: ['Zendesk uses email/token Basic Auth: the token replaces your password. Do not use your Zendesk account password here.'],
      },
    },
    docsUrl: 'https://developer.zendesk.com/api-reference/introduction/security-and-auth/',
  },

  // ─── Typeform ─────────────────────────────────────────────────────────────────

  typeform_token: {
    summary: 'Create a Typeform Personal Access Token to retrieve form responses and manage forms.',
    prerequisites: ['A Typeform account at typeform.com.'],
    steps: [
      'Go to https://admin.typeform.com/account#/section/tokens and sign in.',
      'Click "Generate a new token" → give it a name like "CtrlChecks" → Generate token.',
      'Copy the token shown — it is displayed only once.',
      'Paste the token into the Personal Access Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'Personal Access Token',
        description: 'Typeform PAT for form and response management.',
        whereToFind: 'admin.typeform.com/account#/section/tokens → Generate a new token. Shown only once.',
        notes: ['Shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://www.typeform.com/developers/get-started/personal-access-token/',
  },

  // ─── Vercel ───────────────────────────────────────────────────────────────────

  vercel_api_key: {
    summary: 'Create a Vercel API token to trigger deployments, manage projects, and read build logs.',
    prerequisites: ['A Vercel account at vercel.com.'],
    steps: [
      'Go to https://vercel.com/account/tokens and sign in.',
      'Click "Create" → give it a name like "CtrlChecks" → set scope (Full Account or a specific team) → set an expiry → Create Token.',
      'Copy the token — it is shown only once.',
      'Paste the token into the API Token field and click Save.',
    ],
    fieldGuides: {
      token: {
        label: 'API Token',
        description: 'Vercel personal API token for deployment and project management.',
        whereToFind: 'vercel.com/account/tokens → Create. Shown only once after creation.',
        notes: ['Shown only once — copy before closing.'],
      },
    },
    docsUrl: 'https://vercel.com/docs/rest-api',
  },

  // ─── Jenkins ──────────────────────────────────────────────────────────────────

  jenkins_api_token: {
    summary: 'Create a Jenkins API token and enter your Jenkins URL and username to trigger builds and read job status.',
    prerequisites: [
      'A running Jenkins instance accessible from the CtrlChecks worker.',
      'Your Jenkins username and the ability to configure your user profile.',
    ],
    steps: [
      'Log in to your Jenkins server (e.g. https://jenkins.yourcompany.com).',
      'Click your username (top right) → Configure (or navigate to /user/your-username/configure).',
      'Scroll to "API Token" → click "Add new Token" → give it a name → Generate → copy the token.',
      'Note your Jenkins URL (e.g. https://jenkins.yourcompany.com).',
      'Enter Jenkins URL, Username, and API Token, then click Save.',
    ],
    fieldGuides: {
      url: {
        label: 'Jenkins URL',
        description: 'Root URL of your Jenkins server.',
        whereToFind: 'The URL you use to access Jenkins in your browser, e.g. https://jenkins.yourcompany.com.',
        example: 'https://jenkins.yourcompany.com',
      },
      username: {
        label: 'Username',
        description: 'Your Jenkins account username.',
        whereToFind: 'The username shown in the top right of Jenkins after you log in.',
      },
      apiToken: {
        label: 'API Token',
        description: 'Jenkins API token for authenticating API requests.',
        whereToFind: 'Jenkins → your username (top right) → Configure → API Token → Add new Token → Generate. Shown only once.',
        notes: ['Shown only once — copy before clicking away from the Generate dialog.'],
      },
    },
    docsUrl: 'https://www.jenkins.io/doc/book/using/remote-access-api/',
  },

  // ─── Odoo ─────────────────────────────────────────────────────────────────────

  odoo_credentials: {
    summary: 'Enter your Odoo instance URL, database name, username, and API key to manage CRM, inventory, and ERP data.',
    prerequisites: [
      'An Odoo instance (self-hosted or odoo.com cloud) with API access enabled.',
      'Your Odoo URL, database name, login username, and an API key generated from user settings.',
    ],
    steps: [
      'Log in to your Odoo instance (e.g. https://yourcompany.odoo.com).',
      'Click your profile name (top right) → My Profile → Preferences tab.',
      'At the top of the Preferences page, click "New API Key" → give it a name → generate and copy the key.',
      'Note your Odoo URL, database name (visible in the URL or Settings page), and your login username.',
      'Enter all four fields and click Save.',
    ],
    fieldGuides: {
      url: {
        label: 'Odoo URL',
        description: 'Root URL of your Odoo instance.',
        whereToFind: 'The URL you use to access Odoo, e.g. https://yourcompany.odoo.com.',
        example: 'https://yourcompany.odoo.com',
      },
      database: {
        label: 'Database',
        description: 'Odoo database name — often the same as your company name or subdomain.',
        whereToFind: 'Visible in Settings → Technical → Database, or in your Odoo instance URL if using Odoo.com.',
      },
      username: {
        label: 'Username',
        description: 'Your Odoo login username (usually your email address).',
        whereToFind: 'The email or username you use to log in to Odoo.',
      },
      password: {
        label: 'Password / API Key',
        description: 'Odoo API key (preferred) or account password for authentication.',
        whereToFind: 'My Profile → Preferences tab → New API Key. Use an API key rather than your account password.',
        notes: ['Generate an API key in Preferences for better security — do not use your account password.'],
      },
    },
    docsUrl: 'https://www.odoo.com/documentation/17.0/developer/reference/external_api.html',
  },

  // ─── Bitbucket ────────────────────────────────────────────────────────────────

  bitbucket_app_password: {
    summary: 'Create a Bitbucket App Password to access repositories, pipelines, and pull requests via the API.',
    prerequisites: ['A Bitbucket account at bitbucket.org.'],
    steps: [
      'Go to https://bitbucket.org and sign in.',
      'Click your profile photo (bottom left) → Personal Settings → App passwords.',
      'Click "Create app password" → give it a label like "CtrlChecks".',
      'Select permissions: Repositories: Read + Write; Pipelines: Read + Write. Add others as needed.',
      'Click Create → copy the app password — shown only once.',
      'Enter your Bitbucket Username and the App Password, then click Save.',
    ],
    fieldGuides: {
      username: {
        label: 'Username',
        description: 'Your Bitbucket username (not your email address).',
        whereToFind: 'Bitbucket → your profile photo → Personal Settings → Account settings → Bitbucket username.',
      },
      appPassword: {
        label: 'App Password',
        description: 'Bitbucket App Password with scoped permissions.',
        whereToFind: 'Bitbucket → Personal Settings → App passwords → Create app password. Shown only once.',
        notes: ['Shown only once — copy before closing. Select only the permission scopes your workflows need.'],
      },
    },
    docsUrl: 'https://support.atlassian.com/bitbucket-cloud/docs/app-passwords/',
  },

  // ─── FTP ──────────────────────────────────────────────────────────────────────

  ftp_credentials: {
    summary: 'Enter your FTP server details to upload, download, and manage files on remote servers.',
    prerequisites: [
      'FTP server connection details from your hosting provider: hostname, port (usually 21), username, and password.',
      'FTP port 21 accessible from the CtrlChecks worker (some firewalls block this).',
    ],
    steps: [
      'Get your FTP credentials from your hosting control panel (cPanel, Plesk, or your provider) or server administrator.',
      'Confirm the FTP server is reachable on port 21 from CtrlChecks.',
      'Enter Host, Port (21), Username, and Password, then click Test Connection and Save.',
    ],
    fieldGuides: {
      host: {
        label: 'Host',
        description: 'FTP server hostname or IP address.',
        whereToFind: 'From your hosting provider control panel or server admin. Often ftp.yourdomain.com or your server IP.',
        example: 'ftp.yoursite.com',
      },
      username: {
        label: 'Username',
        description: 'FTP account username.',
        whereToFind: 'From your hosting provider or created in cPanel → FTP Accounts.',
      },
      password: {
        label: 'Password',
        description: 'FTP account password.',
        whereToFind: 'Set when creating the FTP account in your hosting panel, or provided by your server admin.',
        notes: ['Consider SFTP instead of FTP for encrypted file transfers — SFTP is always preferable when the server supports it.'],
      },
    },
    securityNotes: [
      'FTP transmits credentials and data in plain text — use SFTP whenever your server supports it.',
      ...STANDARD_SECURITY.slice(1),
    ],
    docsUrl: 'https://en.wikipedia.org/wiki/File_Transfer_Protocol',
  },

  // ─── SFTP ─────────────────────────────────────────────────────────────────────

  sftp_credentials: {
    summary: 'Enter your SFTP server details for encrypted file transfers using SSH.',
    prerequisites: [
      'SFTP server details: hostname, port (usually 22), username, and either a password or SSH private key.',
      'SSH port 22 accessible from the CtrlChecks worker.',
    ],
    steps: [
      'Get your SFTP details from your hosting provider or server administrator.',
      'Choose authentication: password-based (simpler) or SSH key (more secure).',
      'For SSH key: paste the full PEM-format private key including the -----BEGIN and -----END lines.',
      'Enter Host, Port (22), Username, and Password or Private Key, then click Test Connection and Save.',
    ],
    fieldGuides: {
      host: {
        label: 'Host',
        description: 'SFTP server hostname or IP address.',
        whereToFind: 'Your server hostname or IP. Often the same as your SSH access hostname.',
        example: 'sftp.yourcompany.com',
      },
      username: {
        label: 'Username',
        description: 'SSH/SFTP username for the server.',
        whereToFind: 'Provided by your server admin or hosting provider.',
      },
      password: {
        label: 'Password',
        description: 'SFTP password for authentication (optional if using private key).',
        whereToFind: 'Your SSH user password, or provided by your server admin.',
        notes: ['Leave blank if using SSH private key authentication instead.'],
      },
      privateKey: {
        label: 'Private Key',
        description: 'PEM-format SSH private key for key-based authentication.',
        whereToFind: 'Your local SSH private key file, typically at ~/.ssh/id_rsa. Paste the full content including -----BEGIN and -----END lines.',
        notes: [
          'Include the full key content starting with -----BEGIN RSA PRIVATE KEY----- or similar.',
          'Leave blank if using password authentication instead.',
        ],
      },
    },
    docsUrl: 'https://en.wikipedia.org/wiki/SSH_File_Transfer_Protocol',
  },

};

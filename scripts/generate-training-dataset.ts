/**
 * Generate Training Dataset for Autonomous Workflow Builder
 * 
 * Creates training examples following the 5-phase pipeline:
 * - Phase 0: Pre-processing (normalization, intent, node resolution)
 * - Phase 1: Understanding & Planning (system prompt, requirements)
 * - Phase 2: Structure Generation (pattern matching, node selection)
 * - Phase 3: Node Configuration (ordering, field mapping)
 * - Phase 4: Connection & Validation (wiring, validation)
 * - Phase 5: Credential Discovery
 * 
 * Output format matches the exact JSON structure required for fine-tuning.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// CommonJS __dirname equivalent for TypeScript
// @ts-ignore - require is available in ts-node CommonJS mode
const __dirname = path.dirname(typeof require !== 'undefined' && require.main?.filename || process.argv[1] || '.');

interface TrainingExample {
  prompt: string;
  workflow: {
    summary: string;
    nodes: Array<{
      id: string;
      type: string;
      config: Record<string, any>;
    }>;
    connections: Array<{
      source: string;
      target: string;
      source_output: string;
      target_input: string;
    }>;
    required_credentials: string[];
    validation_status: 'valid' | 'needs_attention';
  };
  metadata?: {
    category: string;
    complexity: 'simple' | 'medium' | 'complex';
    node_types: string[];
  };
}

interface SeedExample {
  prompt: string;
  workflow: TrainingExample['workflow'];
  category: string;
  complexity: 'simple' | 'medium' | 'complex';
}

// Seed examples covering all node types
const SEED_EXAMPLES: SeedExample[] = [
  // Simple examples
  {
    prompt: "When a new form is submitted, save to Google Sheets and send a Slack message to #general.",
    category: "form_storage_notification",
    complexity: "simple",
    workflow: {
      summary: "Save form submissions to Google Sheets and notify Slack",
      nodes: [
        {
          id: "form_trigger",
          type: "form",
          config: {
            fields: [
              { key: "name", label: "Name", type: "string", required: true },
              { key: "email", label: "Email", type: "string", required: true }
            ]
          }
        },
        {
          id: "sheets_save",
          type: "google_sheets",
          config: {
            spreadsheet_id: "default",
            sheet_name: "Sheet1",
            row_data: {
              name: "{{form_trigger.output.name}}",
              email: "{{form_trigger.output.email}}"
            }
          }
        },
        {
          id: "slack_notify",
          type: "slack",
          config: {
            channel: "#general",
            text: "New form submission: {{form_trigger.output.name}} ({{form_trigger.output.email}})"
          }
        }
      ],
      connections: [
        { source: "form_trigger", target: "sheets_save", source_output: "output", target_input: "input" },
        { source: "form_trigger", target: "slack_notify", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["google_sheets", "slack"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a webhook is received, parse the JSON and send an email via Gmail.",
    category: "webhook_email",
    complexity: "simple",
    workflow: {
      summary: "Webhook to email automation",
      nodes: [
        {
          id: "webhook_trigger",
          type: "webhook",
          config: {
            method: "POST",
            path: "/webhook"
          }
        },
        {
          id: "json_parser",
          type: "json_parser",
          config: {
            json: "{{webhook_trigger.output.body}}"
          }
        },
        {
          id: "gmail_send",
          type: "gmail",
          config: {
            to: "{{json_parser.output.email}}",
            subject: "{{json_parser.output.subject}}",
            body: "{{json_parser.output.message}}"
          }
        }
      ],
      connections: [
        { source: "webhook_trigger", target: "json_parser", source_output: "output", target_input: "input" },
        { source: "json_parser", target: "gmail_send", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["gmail"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every day at 8 AM, create a task in ClickUp with today's agenda.",
    category: "scheduled_task_creation",
    complexity: "simple",
    workflow: {
      summary: "Daily scheduled task creation in ClickUp",
      nodes: [
        {
          id: "schedule_trigger",
          type: "schedule",
          config: {
            cron: "0 8 * * *",
            timezone: "UTC"
          }
        },
        {
          id: "clickup_create",
          type: "clickup",
          config: {
            list_id: "default",
            name: "Daily Agenda - {{new Date().toISOString().split('T')[0]}}",
            description: "Today's agenda items"
          }
        }
      ],
      connections: [
        { source: "schedule_trigger", target: "clickup_create", source_output: "trigger", target_input: "input" }
      ],
      required_credentials: ["clickup"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a chat message arrives, use AI to generate a response and send it back.",
    category: "chatbot_ai",
    complexity: "simple",
    workflow: {
      summary: "Chatbot with AI response generation",
      nodes: [
        {
          id: "chat_trigger",
          type: "chat_trigger",
          config: {}
        },
        {
          id: "ai_chat",
          type: "ai_chat_model",
          config: {
            model: "gpt-4",
            prompt: "{{chat_trigger.output.message}}",
            temperature: 0.7
          }
        },
        {
          id: "chat_response",
          type: "chat_trigger",
          config: {
            response: "{{ai_chat.output.response}}"
          }
        }
      ],
      connections: [
        { source: "chat_trigger", target: "ai_chat", source_output: "output", target_input: "input" },
        { source: "ai_chat", target: "chat_response", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["openai"],
      validation_status: "valid"
    }
  },
  // Medium complexity examples
  {
    prompt: "When a new contact is added in HubSpot, create a corresponding deal in Pipedrive.",
    category: "crm_sync",
    complexity: "medium",
    workflow: {
      summary: "Sync HubSpot contacts to Pipedrive deals",
      nodes: [
        {
          id: "hubspot_trigger",
          type: "hubspot",
          config: {
            event: "contact.created",
            output_fields: ["email", "firstname", "lastname", "company"]
          }
        },
        {
          id: "set_variables",
          type: "set",
          config: {
            variables: {
              contact_name: "{{hubspot_trigger.output.firstname}} {{hubspot_trigger.output.lastname}}",
              deal_name: "Deal for {{hubspot_trigger.output.company}}"
            }
          }
        },
        {
          id: "pipedrive_create",
          type: "pipedrive",
          config: {
            resource: "deals",
            data: {
              title: "{{set_variables.output.deal_name}}",
              person_id: "{{hubspot_trigger.output.email}}"
            }
          }
        }
      ],
      connections: [
        { source: "hubspot_trigger", target: "set_variables", source_output: "output", target_input: "input" },
        { source: "set_variables", target: "pipedrive_create", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["hubspot", "pipedrive"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every Monday at 9 AM, fetch the top story from Hacker News and post it to Slack #news if the score is above 100.",
    category: "scheduled_api_notification",
    complexity: "medium",
    workflow: {
      summary: "Weekly Hacker News top story check and post to Slack based on score",
      nodes: [
        {
          id: "trigger_schedule",
          type: "schedule",
          config: {
            cron: "0 9 * * 1",
            timezone: "UTC"
          }
        },
        {
          id: "http_fetch_top",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://hacker-news.firebaseio.com/v0/topstories.json",
            response_format: "json"
          }
        },
        {
          id: "http_fetch_item",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://hacker-news.firebaseio.com/v0/item/{{http_fetch_top.output[0]}}.json",
            response_format: "json"
          }
        },
        {
          id: "if_score",
          type: "if",
          config: {
            condition: "{{http_fetch_item.output.score}} > 100"
          }
        },
        {
          id: "slack_message",
          type: "slack",
          config: {
            channel: "#news",
            text: "Top story: {{http_fetch_item.output.title}} ({{http_fetch_item.output.url}})"
          }
        }
      ],
      connections: [
        { source: "trigger_schedule", target: "http_fetch_top", source_output: "trigger", target_input: "input" },
        { source: "http_fetch_top", target: "http_fetch_item", source_output: "output", target_input: "input" },
        { source: "http_fetch_item", target: "if_score", source_output: "output", target_input: "input" },
        { source: "if_score", target: "slack_message", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["slack"],
      validation_status: "valid"
    }
  },
  // Complex example
  {
    prompt: "When a new contact is added in HubSpot, check if they are from the US. If yes, add them to a Google Sheet and send them a welcome email via Gmail. Also post to a Telegram channel.",
    category: "crm_conditional_automation",
    complexity: "complex",
    workflow: {
      summary: "HubSpot contact processing with conditional logic, storage, and multi-channel notifications",
      nodes: [
        {
          id: "hubspot_trigger",
          type: "hubspot",
          config: {
            event: "contact.created",
            output_fields: ["email", "firstname", "lastname", "country"]
          }
        },
        {
          id: "if_us_country",
          type: "if",
          config: {
            condition: "{{hubspot_trigger.output.country}} === 'United States'"
          }
        },
        {
          id: "sheets_add",
          type: "google_sheets",
          config: {
            spreadsheet_id: "default",
            sheet_name: "US Contacts",
            row_data: {
              email: "{{hubspot_trigger.output.email}}",
              firstname: "{{hubspot_trigger.output.firstname}}",
              lastname: "{{hubspot_trigger.output.lastname}}"
            }
          }
        },
        {
          id: "gmail_send",
          type: "gmail",
          config: {
            to: "{{hubspot_trigger.output.email}}",
            subject: "Welcome!",
            body: "Hi {{hubspot_trigger.output.firstname}}, welcome to our service!"
          }
        },
        {
          id: "telegram_post",
          type: "telegram",
          config: {
            chat_id: "@mygroup",
            text: "New US contact: {{hubspot_trigger.output.firstname}} {{hubspot_trigger.output.lastname}} ({{hubspot_trigger.output.email}})"
          }
        }
      ],
      connections: [
        { source: "hubspot_trigger", target: "if_us_country", source_output: "output", target_input: "input" },
        { source: "if_us_country", target: "sheets_add", source_output: "true", target_input: "input" },
        { source: "if_us_country", target: "gmail_send", source_output: "true", target_input: "input" },
        { source: "if_us_country", target: "telegram_post", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["hubspot", "google_sheets", "gmail", "telegram"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a new issue is created in GitHub, if it's labeled 'bug', create a task in Notion and notify the team on Telegram.",
    category: "github_notion_telegram",
    complexity: "medium",
    workflow: {
      summary: "GitHub issue to Notion task with Telegram notification",
      nodes: [
        {
          id: "github_trigger",
          type: "github",
          config: {
            event: "issues.opened",
            repo: "my-org/my-repo"
          }
        },
        {
          id: "if_bug_label",
          type: "if",
          config: {
            condition: "{{github_trigger.output.labels}}.some(label => label.name === 'bug')"
          }
        },
        {
          id: "notion_create",
          type: "notion",
          config: {
            database_id: "default",
            properties: {
              title: "{{github_trigger.output.title}}",
              url: "{{github_trigger.output.html_url}}"
            }
          }
        },
        {
          id: "telegram_notify",
          type: "telegram",
          config: {
            chat_id: "@team",
            text: "New bug issue: {{github_trigger.output.title}}"
          }
        }
      ],
      connections: [
        { source: "github_trigger", target: "if_bug_label", source_output: "output", target_input: "input" },
        { source: "if_bug_label", target: "notion_create", source_output: "true", target_input: "input" },
        { source: "if_bug_label", target: "telegram_notify", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["github", "notion", "telegram"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a new row is added to Airtable, if the status is 'active', add it to Google Sheets and send a LinkedIn post.",
    category: "airtable_sheets_linkedin",
    complexity: "medium",
    workflow: {
      summary: "Airtable to Sheets sync with LinkedIn posting",
      nodes: [
        {
          id: "airtable_trigger",
          type: "airtable",
          config: {
            base_id: "default",
            table_name: "Records",
            event: "record.created"
          }
        },
        {
          id: "if_active",
          type: "if",
          config: {
            condition: "{{airtable_trigger.output.status}} === 'active'"
          }
        },
        {
          id: "sheets_add",
          type: "google_sheets",
          config: {
            spreadsheet_id: "default",
            sheet_name: "Active Records",
            row_data: {
              name: "{{airtable_trigger.output.name}}",
              status: "{{airtable_trigger.output.status}}"
            }
          }
        },
        {
          id: "linkedin_post",
          type: "linkedin",
          config: {
            text: "New active record: {{airtable_trigger.output.name}}"
          }
        }
      ],
      connections: [
        { source: "airtable_trigger", target: "if_active", source_output: "output", target_input: "input" },
        { source: "if_active", target: "sheets_add", source_output: "true", target_input: "input" },
        { source: "if_active", target: "linkedin_post", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["airtable", "google_sheets", "linkedin"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every hour, make an HTTP request to an API, parse the response, and if the value is greater than 100, send an alert to Slack.",
    category: "scheduled_http_conditional",
    complexity: "medium",
    workflow: {
      summary: "Hourly API check with conditional Slack alert",
      nodes: [
        {
          id: "schedule_hourly",
          type: "schedule",
          config: {
            cron: "0 * * * *",
            timezone: "UTC"
          }
        },
        {
          id: "http_request",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://api.example.com/metrics",
            response_format: "json"
          }
        },
        {
          id: "json_parse",
          type: "json_parser",
          config: {
            json: "{{http_request.output.body}}"
          }
        },
        {
          id: "if_threshold",
          type: "if",
          config: {
            condition: "{{json_parse.output.value}} > 100"
          }
        },
        {
          id: "slack_alert",
          type: "slack",
          config: {
            channel: "#alerts",
            text: "Alert: Value is {{json_parse.output.value}} (threshold: 100)"
          }
        }
      ],
      connections: [
        { source: "schedule_hourly", target: "http_request", source_output: "trigger", target_input: "input" },
        { source: "http_request", target: "json_parse", source_output: "output", target_input: "input" },
        { source: "json_parse", target: "if_threshold", source_output: "output", target_input: "input" },
        { source: "if_threshold", target: "slack_alert", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["slack"],
      validation_status: "valid"
    }
  },
  // User-provided examples
  {
    prompt: "Every day at 9 AM, fetch a random quote from https://api.quotable.io/random and post it to a Slack channel #general.",
    category: "scheduled_quote_slack",
    complexity: "simple",
    workflow: {
      summary: "Daily random quote fetcher and Slack poster",
      nodes: [
        {
          id: "trigger_schedule",
          type: "schedule",
          config: {
            cron: "0 9 * * *",
            timezone: "UTC"
          }
        },
        {
          id: "http_quote",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://api.quotable.io/random",
            response_format: "json"
          }
        },
        {
          id: "slack_message",
          type: "slack",
          config: {
            channel: "#general",
            text: "Daily quote: {{http_quote.output.content}} — {{http_quote.output.author}}"
          }
        }
      ],
      connections: [
        { source: "trigger_schedule", target: "http_quote", source_output: "trigger", target_input: "input" },
        { source: "http_quote", target: "slack_message", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["slack"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a webhook receives a new lead (with fields name, email, phone), save it to an Airtable base called 'Leads' and send a Telegram notification to the group @sales_alerts.",
    category: "webhook_airtable_telegram",
    complexity: "simple",
    workflow: {
      summary: "Save webhook leads to Airtable and notify Telegram",
      nodes: [
        {
          id: "trigger_webhook",
          type: "webhook",
          config: {
            method: "POST",
            path: "/leads"
          }
        },
        {
          id: "airtable_create",
          type: "airtable",
          config: {
            base_id: "your_base_id",
            table_name: "Leads",
            fields: {
              Name: "{{trigger_webhook.output.name}}",
              Email: "{{trigger_webhook.output.email}}",
              Phone: "{{trigger_webhook.output.phone}}"
            },
            action: "create"
          }
        },
        {
          id: "telegram_message",
          type: "telegram",
          config: {
            chat_id: "@sales_alerts",
            text: "New lead: {{trigger_webhook.output.name}} ({{trigger_webhook.output.email}})"
          }
        }
      ],
      connections: [
        { source: "trigger_webhook", target: "airtable_create", source_output: "output", target_input: "input" },
        { source: "trigger_webhook", target: "telegram_message", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["airtable", "telegram"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a form is submitted with a rating below 3, save the response to Google Sheets and send a complaint email to support@company.com via Gmail.",
    category: "form_conditional_sheets_gmail",
    complexity: "medium",
    workflow: {
      summary: "Handle low‑rating form submissions",
      nodes: [
        {
          id: "trigger_form",
          type: "form",
          config: {
            fields: ["name", "email", "rating", "comments"]
          }
        },
        {
          id: "if_low_rating",
          type: "if",
          config: {
            condition: "{{trigger_form.output.rating}} < 3"
          }
        },
        {
          id: "google_sheets_append",
          type: "google_sheets",
          config: {
            spreadsheet_id: "your_spreadsheet_id",
            sheet_name: "Sheet1",
            mapping: {
              A: "{{trigger_form.output.name}}",
              B: "{{trigger_form.output.email}}",
              C: "{{trigger_form.output.rating}}",
              D: "{{trigger_form.output.comments}}"
            }
          }
        },
        {
          id: "gmail_send",
          type: "gmail",
          config: {
            to: "support@company.com",
            subject: "Low rating form submission",
            body: "Name: {{trigger_form.output.name}}\nEmail: {{trigger_form.output.email}}\nRating: {{trigger_form.output.rating}}\nComments: {{trigger_form.output.comments}}"
          }
        }
      ],
      connections: [
        { source: "trigger_form", target: "if_low_rating", source_output: "output", target_input: "input" },
        { source: "if_low_rating", target: "google_sheets_append", source_output: "true", target_input: "input" },
        { source: "if_low_rating", target: "gmail_send", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["google_sheets", "gmail"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every hour, check GitHub for new issues in repo 'myorg/myrepo'. If the issue is labeled 'bug', send to Telegram channel #bugs; if labeled 'feature', send to #features; otherwise ignore.",
    category: "scheduled_github_switch_telegram",
    complexity: "medium",
    workflow: {
      summary: "Hourly GitHub issue triage to Telegram",
      nodes: [
        {
          id: "trigger_schedule",
          type: "schedule",
          config: {
            cron: "0 * * * *",
            timezone: "UTC"
          }
        },
        {
          id: "github_list_issues",
          type: "github",
          config: {
            repo: "myorg/myrepo",
            state: "open",
            action: "list_issues"
          }
        },
        {
          id: "function_item_issues",
          type: "function_item",
          config: {
            items: "{{github_list_issues.output}}",
            function: "return item;"
          }
        },
        {
          id: "switch_label",
          type: "switch",
          config: {
            value: "{{function_item_issues.output.labels[0].name}}",
            cases: {
              bug: "bug_path",
              feature: "feature_path",
              default: "ignore_path"
            }
          }
        },
        {
          id: "telegram_bug",
          type: "telegram",
          config: {
            chat_id: "#bugs",
            text: "Bug: {{function_item_issues.output.title}} - {{function_item_issues.output.html_url}}"
          }
        },
        {
          id: "telegram_feature",
          type: "telegram",
          config: {
            chat_id: "#features",
            text: "Feature: {{function_item_issues.output.title}} - {{function_item_issues.output.html_url}}"
          }
        },
        {
          id: "noop_ignore",
          type: "NoOp",
          config: {}
        }
      ],
      connections: [
        { source: "trigger_schedule", target: "github_list_issues", source_output: "trigger", target_input: "input" },
        { source: "github_list_issues", target: "function_item_issues", source_output: "output", target_input: "items" },
        { source: "function_item_issues", target: "switch_label", source_output: "output", target_input: "input" },
        { source: "switch_label", target: "telegram_bug", source_output: "bug_path", target_input: "input" },
        { source: "switch_label", target: "telegram_feature", source_output: "feature_path", target_input: "input" },
        { source: "switch_label", target: "noop_ignore", source_output: "ignore_path", target_input: "input" }
      ],
      required_credentials: ["github", "telegram"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a new contact is created in HubSpot via webhook, also add them to a Google Sheet and send a welcome email via Gmail, but only if they opted in. Merge the contact data with a default country 'US' if missing.",
    category: "webhook_hubspot_merge_conditional",
    complexity: "complex",
    workflow: {
      summary: "HubSpot contact sync to Google Sheets and email",
      nodes: [
        {
          id: "trigger_webhook_hubspot",
          type: "webhook",
          config: {
            method: "POST",
            path: "/hubspot-contact"
          }
        },
        {
          id: "set_default_country",
          type: "set",
          config: {
            values: {
              country: "{{trigger_webhook_hubspot.output.country || 'US'}}"
            }
          }
        },
        {
          id: "merge_contact",
          type: "merge",
          config: {
            sources: [
              "{{trigger_webhook_hubspot.output}}",
              "{{set_default_country.output}}"
            ]
          }
        },
        {
          id: "if_opted_in",
          type: "if",
          config: {
            condition: "{{merge_contact.output.email_opt_in}} == true"
          }
        },
        {
          id: "google_sheets_append",
          type: "google_sheets",
          config: {
            spreadsheet_id: "your_spreadsheet_id",
            sheet_name: "Contacts",
            mapping: {
              A: "{{merge_contact.output.first_name}}",
              B: "{{merge_contact.output.last_name}}",
              C: "{{merge_contact.output.email}}",
              D: "{{merge_contact.output.country}}"
            }
          }
        },
        {
          id: "gmail_welcome",
          type: "gmail",
          config: {
            to: "{{merge_contact.output.email}}",
            subject: "Welcome!",
            body: "Hi {{merge_contact.output.first_name}}, thanks for signing up."
          }
        }
      ],
      connections: [
        { source: "trigger_webhook_hubspot", target: "set_default_country", source_output: "output", target_input: "input" },
        { source: "trigger_webhook_hubspot", target: "merge_contact", source_output: "output", target_input: "source1" },
        { source: "set_default_country", target: "merge_contact", source_output: "output", target_input: "source2" },
        { source: "merge_contact", target: "if_opted_in", source_output: "output", target_input: "input" },
        { source: "if_opted_in", target: "google_sheets_append", source_output: "true", target_input: "input" },
        { source: "if_opted_in", target: "gmail_welcome", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["google_sheets", "gmail"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a user sends a message in a Telegram group, use an AI model to generate a friendly reply and post it back to the group.",
    category: "chat_ai_telegram",
    complexity: "simple",
    workflow: {
      summary: "AI‑powered Telegram chat responder",
      nodes: [
        {
          id: "trigger_chat",
          type: "chat_trigger",
          config: {
            platform: "telegram",
            chat_id: "@mygroup"
          }
        },
        {
          id: "ai_chat",
          type: "ai_chat_model",
          config: {
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "You are a friendly assistant." },
              { role: "user", content: "{{trigger_chat.output.message}}" }
            ],
            temperature: 0.7
          }
        },
        {
          id: "telegram_reply",
          type: "telegram",
          config: {
            chat_id: "@mygroup",
            text: "{{ai_chat.output.choices[0].message.content}}",
            reply_to_message_id: "{{trigger_chat.output.message_id}}"
          }
        }
      ],
      connections: [
        { source: "trigger_chat", target: "ai_chat", source_output: "output", target_input: "input" },
        { source: "ai_chat", target: "telegram_reply", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["telegram"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every morning at 8 AM, fetch top stories from Hacker News, sort them by score descending, take the top 5, and save them to a Notion database called 'Top Stories'.",
    category: "scheduled_http_sort_limit_notion",
    complexity: "medium",
    workflow: {
      summary: "Daily Hacker News top 5 stories to Notion",
      nodes: [
        {
          id: "trigger_schedule",
          type: "schedule",
          config: {
            cron: "0 8 * * *",
            timezone: "UTC"
          }
        },
        {
          id: "http_topstories",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://hacker-news.firebaseio.com/v0/topstories.json",
            response_format: "json"
          }
        },
        {
          id: "function_fetch_items",
          type: "function",
          config: {
            code: "const ids = input.slice(0,10); return Promise.all(ids.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r=>r.json())));",
            language: "javascript"
          }
        },
        {
          id: "sort_by_score",
          type: "sort",
          config: {
            field: "score",
            order: "descending"
          }
        },
        {
          id: "limit_top5",
          type: "limit",
          config: {
            count: 5
          }
        },
        {
          id: "notion_create_pages",
          type: "notion",
          config: {
            database_id: "your_database_id",
            properties: {
              Title: { title: [{ text: { content: "{{sort_by_score.output.title}}" } }] },
              URL: { url: "{{sort_by_score.output.url}}" },
              Score: { number: "{{sort_by_score.output.score}}" }
            },
            action: "create"
          }
        }
      ],
      connections: [
        { source: "trigger_schedule", target: "http_topstories", source_output: "trigger", target_input: "input" },
        { source: "http_topstories", target: "function_fetch_items", source_output: "output", target_input: "input" },
        { source: "function_fetch_items", target: "sort_by_score", source_output: "output", target_input: "input" },
        { source: "sort_by_score", target: "limit_top5", source_output: "output", target_input: "input" },
        { source: "limit_top5", target: "notion_create_pages", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["notion"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When a new order is received via webhook, if the total is above $1000, wait 1 hour then send a thank‑you email via Gmail and a Slack message to #sales.",
    category: "webhook_conditional_wait_gmail_slack",
    complexity: "medium",
    workflow: {
      summary: "High‑value order handling with delayed thank you",
      nodes: [
        {
          id: "trigger_webhook_order",
          type: "webhook",
          config: {
            method: "POST",
            path: "/order"
          }
        },
        {
          id: "if_high_value",
          type: "if",
          config: {
            condition: "{{trigger_webhook_order.output.total}} > 1000"
          }
        },
        {
          id: "wait_one_hour",
          type: "wait",
          config: {
            duration: 3600,
            unit: "seconds"
          }
        },
        {
          id: "gmail_thankyou",
          type: "gmail",
          config: {
            to: "{{trigger_webhook_order.output.customer_email}}",
            subject: "Thank you for your order!",
            body: "Dear customer, thank you for your order of ${{trigger_webhook_order.output.total}}."
          }
        },
        {
          id: "slack_sales",
          type: "slack",
          config: {
            channel: "#sales",
            text: "High‑value order: ${{trigger_webhook_order.output.total}} from {{trigger_webhook_order.output.customer_email}}"
          }
        }
      ],
      connections: [
        { source: "trigger_webhook_order", target: "if_high_value", source_output: "output", target_input: "input" },
        { source: "if_high_value", target: "wait_one_hour", source_output: "true", target_input: "input" },
        { source: "wait_one_hour", target: "gmail_thankyou", source_output: "output", target_input: "input" },
        { source: "if_high_value", target: "slack_sales", source_output: "true", target_input: "input" }
      ],
      required_credentials: ["gmail", "slack"],
      validation_status: "valid"
    }
  },
  {
    prompt: "Every week, get all tasks from ClickUp that are marked 'completed', aggregate them by assignee, create a deal in Pipedrive for each assignee with the task count, and also update a Zoho CRM note.",
    category: "scheduled_clickup_aggregate_pipedrive_zoho",
    complexity: "complex",
    workflow: {
      summary: "Weekly completed tasks report to Pipedrive and Zoho",
      nodes: [
        {
          id: "trigger_schedule_weekly",
          type: "schedule",
          config: {
            cron: "0 0 * * 0",
            timezone: "UTC"
          }
        },
        {
          id: "clickup_tasks",
          type: "clickup",
          config: {
            list_id: "your_list_id",
            status: "completed",
            action: "get_tasks"
          }
        },
        {
          id: "aggregate_by_assignee",
          type: "aggregate",
          config: {
            group_by: "assignee.id",
            fields: {
              assignee_name: { first: "assignee.username" },
              task_count: { count: "*" },
              task_titles: { collect: "name" }
            }
          }
        },
        {
          id: "function_item_deals",
          type: "function_item",
          config: {
            items: "{{aggregate_by_assignee.output}}",
            function: "return { title: item.assignee_name + ' - ' + item.task_count + ' tasks', value: item.task_count * 100 }"
          }
        },
        {
          id: "pipedrive_create_deal",
          type: "pipedrive",
          config: {
            action: "create_deal",
            title: "{{function_item_deals.output.title}}",
            value: "{{function_item_deals.output.value}}"
          }
        },
        {
          id: "zoho_update_note",
          type: "zoho",
          config: {
            module: "Deals",
            id: "{{pipedrive_create_deal.output.id}}",
            note: "Tasks completed this week: {{function_item_deals.output.task_titles.join(', ')}}"
          }
        }
      ],
      connections: [
        { source: "trigger_schedule_weekly", target: "clickup_tasks", source_output: "trigger", target_input: "input" },
        { source: "clickup_tasks", target: "aggregate_by_assignee", source_output: "output", target_input: "input" },
        { source: "aggregate_by_assignee", target: "function_item_deals", source_output: "output", target_input: "items" },
        { source: "function_item_deals", target: "pipedrive_create_deal", source_output: "output", target_input: "input" },
        { source: "pipedrive_create_deal", target: "zoho_update_note", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["clickup", "pipedrive", "zoho"],
      validation_status: "valid"
    }
  },
  {
    prompt: "When someone asks in a chat for a summary of a webpage, fetch the webpage content, use AI to summarize it, and post the summary to LinkedIn.",
    category: "chat_code_http_ai_linkedin",
    complexity: "complex",
    workflow: {
      summary: "Chat‑triggered webpage summarizer and LinkedIn poster",
      nodes: [
        {
          id: "trigger_chat_url",
          type: "chat_trigger",
          config: {
            platform: "slack",
            channel: "#web-summary"
          }
        },
        {
          id: "extract_url",
          type: "code",
          config: {
            code: "const urlRegex = /(https?:\\/\\/[^\\s]+)/g;\nconst match = input.message.match(urlRegex);\nreturn { url: match ? match[0] : null };",
            language: "javascript"
          }
        },
        {
          id: "if_url_exists",
          type: "if",
          config: {
            condition: "{{extract_url.output.url}} != null"
          }
        },
        {
          id: "http_fetch_page",
          type: "http_request",
          config: {
            method: "GET",
            url: "{{extract_url.output.url}}",
            response_format: "text"
          }
        },
        {
          id: "ai_summarize",
          type: "ai_chat_model",
          config: {
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "Summarize the following webpage content in 2 sentences." },
              { role: "user", content: "{{http_fetch_page.output}}" }
            ],
            temperature: 0.3
          }
        },
        {
          id: "linkedin_post",
          type: "linkedin",
          config: {
            text: "Summary: {{ai_summarize.output.choices[0].message.content}}\n\nOriginal: {{extract_url.output.url}}",
            visibility: "PUBLIC"
          }
        }
      ],
      connections: [
        { source: "trigger_chat_url", target: "extract_url", source_output: "output", target_input: "input" },
        { source: "extract_url", target: "if_url_exists", source_output: "output", target_input: "input" },
        { source: "if_url_exists", target: "http_fetch_page", source_output: "true", target_input: "input" },
        { source: "http_fetch_page", target: "ai_summarize", source_output: "output", target_input: "input" },
        { source: "ai_summarize", target: "linkedin_post", source_output: "output", target_input: "input" }
      ],
      required_credentials: ["linkedin"],
      validation_status: "valid"
    }
  }
];

/**
 * Generate synthetic examples by varying seed examples
 */
function generateSyntheticExamples(seed: SeedExample, count: number): TrainingExample[] {
  const examples: TrainingExample[] = [];
  
  // More comprehensive variations
  const serviceReplacements = [
    { from: "Slack", to: "Telegram" },
    { from: "Telegram", to: "Slack" },
    { from: "Google Sheets", to: "Airtable" },
    { from: "Airtable", to: "Google Sheets" },
    { from: "Gmail", to: "Outlook" },
    { from: "Outlook", to: "Gmail" },
    { from: "HubSpot", to: "Pipedrive" },
    { from: "Pipedrive", to: "HubSpot" },
    { from: "Notion", to: "ClickUp" },
    { from: "ClickUp", to: "Notion" },
  ];
  
  const timeReplacements = [
    { from: "9 AM", to: "10 AM" },
    { from: "10 AM", to: "8 AM" },
    { from: "8 AM", to: "9 AM" },
    { from: "Monday", to: "Friday" },
    { from: "Friday", to: "Monday" },
    { from: "every day", to: "every weekday" },
    { from: "every weekday", to: "every day" },
    { from: "every hour", to: "every 30 minutes" },
  ];
  
  const channelReplacements = [
    { from: "#general", to: "#notifications" },
    { from: "#notifications", to: "#alerts" },
    { from: "#alerts", to: "#general" },
    { from: "#sales", to: "#marketing" },
    { from: "#marketing", to: "#sales" },
  ];
  
  for (let i = 0; i < count; i++) {
    let variedPrompt = seed.prompt;
    
    // Apply service replacements
    const serviceReplacement = serviceReplacements[i % serviceReplacements.length];
    if (variedPrompt.includes(serviceReplacement.from)) {
      variedPrompt = variedPrompt.replace(serviceReplacement.from, serviceReplacement.to);
    }
    
    // Apply time replacements
    const timeReplacement = timeReplacements[i % timeReplacements.length];
    if (variedPrompt.includes(timeReplacement.from)) {
      variedPrompt = variedPrompt.replace(timeReplacement.from, timeReplacement.to);
    }
    
    // Apply channel replacements
    const channelReplacement = channelReplacements[i % channelReplacements.length];
    if (variedPrompt.includes(channelReplacement.from)) {
      variedPrompt = variedPrompt.replace(channelReplacement.from, channelReplacement.to);
    }
    
    // If no replacements applied, add variation suffix
    if (variedPrompt === seed.prompt) {
      variedPrompt = `${seed.prompt} (variant ${i + 1})`;
    }
    
    // Clone and modify workflow
    const workflow = JSON.parse(JSON.stringify(seed.workflow));
    
    // Update node IDs to be unique
    const nodeIdMap: Record<string, string> = {};
    workflow.nodes.forEach((node: any) => {
      const newId = `${node.type}_${i}_${randomUUID().substring(0, 8)}`;
      nodeIdMap[node.id] = newId;
      node.id = newId;
    });
    
    // Update connections with new IDs
    workflow.connections.forEach((conn: any) => {
      conn.source = nodeIdMap[conn.source] || conn.source;
      conn.target = nodeIdMap[conn.target] || conn.target;
    });
    
    examples.push({
      prompt: variedPrompt,
      workflow,
      metadata: {
        category: seed.category,
        complexity: seed.complexity,
        node_types: workflow.nodes.map((n: any) => n.type)
      }
    });
  }
  
  return examples;
}

/**
 * Generate examples covering all node types
 */
function generateNodeTypeExamples(): TrainingExample[] {
  const examples: TrainingExample[] = [];
  
  // Trigger examples
  const triggerExamples = [
    { prompt: "When a webhook is received, log the data", type: "webhook" },
    { prompt: "When a chat message arrives, respond with AI", type: "chat_trigger" },
    { prompt: "Every hour, check for updates", type: "schedule" },
  ];
  
  // Logic examples
  const logicExamples = [
    { prompt: "If the value is greater than 100, send an alert", type: "if" },
    { prompt: "Switch based on status: active, pending, or inactive", type: "switch" },
    { prompt: "Set a variable with the current timestamp", type: "set" },
    { prompt: "Merge data from two sources", type: "merge" },
  ];
  
  // Integration examples
  const integrationExamples = [
    { prompt: "Create a new deal in Pipedrive", type: "pipedrive" },
    { prompt: "Add a page to Notion", type: "notion" },
    { prompt: "Create a task in ClickUp", type: "clickup" },
    { prompt: "Post to LinkedIn", type: "linkedin" },
    { prompt: "Create a GitHub issue", type: "github" },
  ];
  
  // Combine into simple workflows
  triggerExamples.forEach(trigger => {
    logicExamples.forEach(logic => {
      // Generate node IDs once and reuse them
      const triggerId = `trigger_${randomUUID().substring(0, 8)}`;
      const logicId = `logic_${randomUUID().substring(0, 8)}`;
      
      const example: TrainingExample = {
        prompt: `${trigger.prompt}. Then ${logic.prompt}.`,
        workflow: {
          summary: `Workflow using ${trigger.type} and ${logic.type}`,
          nodes: [
            {
              id: triggerId,
              type: trigger.type,
              config: trigger.type === "schedule" ? { cron: "0 9 * * *" } : {}
            },
            {
              id: logicId,
              type: logic.type,
              config: logic.type === "if" ? { condition: "{{input.value}} > 100" } : {}
            }
          ],
          connections: [
            {
              source: triggerId,
              target: logicId,
              source_output: "output",
              target_input: "input"
            }
          ],
          required_credentials: [],
          validation_status: "valid"
        },
        metadata: {
          category: "node_coverage",
          complexity: "simple",
          node_types: [trigger.type, logic.type]
        }
      };
      examples.push(example);
    });
  });
  
  return examples;
}

/**
 * Generate additional pattern variations
 */
function generateAdditionalPatterns(): TrainingExample[] {
  const patterns: TrainingExample[] = [];
  
  // More specific patterns
  const specificPatterns = [
    {
      prompt: "Every 15 minutes, check API status and if it's down, send alerts to both Slack and Telegram",
      nodes: ["schedule", "http_request", "if", "slack", "telegram"],
      complexity: "medium" as const
    },
    {
      prompt: "When a new email arrives in Gmail, if it contains 'urgent', create a task in ClickUp and notify on Slack",
      nodes: ["gmail", "if", "clickup", "slack"],
      complexity: "medium" as const
    },
    {
      prompt: "Every Monday morning, aggregate last week's sales from Google Sheets, calculate totals, and email report",
      nodes: ["schedule", "google_sheets", "aggregate", "code", "gmail"],
      complexity: "medium" as const
    },
    {
      prompt: "When a LinkedIn post gets 100+ likes, save the post data to Airtable and share on Telegram",
      nodes: ["linkedin", "if", "airtable", "telegram"],
      complexity: "medium" as const
    },
    {
      prompt: "Every night at midnight, backup all Notion pages to Google Sheets",
      nodes: ["schedule", "notion", "google_sheets"],
      complexity: "simple" as const
    },
    {
      prompt: "When a Pipedrive deal is won, create a celebration post on LinkedIn and update Zoho CRM",
      nodes: ["pipedrive", "linkedin", "zoho"],
      complexity: "simple" as const
    },
    {
      prompt: "When a form submission has invalid email format, send error to Slack and don't save",
      nodes: ["form", "code", "if", "slack"],
      complexity: "medium" as const
    },
    {
      prompt: "Every hour, fetch weather data, if temperature exceeds 90F, send alert via Telegram",
      nodes: ["schedule", "http_request", "if", "telegram"],
      complexity: "simple" as const
    },
    {
      prompt: "When a GitHub PR is merged, create a Notion page with PR details and notify team on Slack",
      nodes: ["github", "notion", "slack"],
      complexity: "simple" as const
    },
    {
      prompt: "When a HubSpot contact's lifecycle stage changes to 'Customer', add to Google Sheets and send welcome email",
      nodes: ["hubspot", "if", "google_sheets", "gmail"],
      complexity: "medium" as const
    },
    {
      prompt: "Every day at 6 PM, get all incomplete ClickUp tasks, filter by priority, and send summary to Slack",
      nodes: ["schedule", "clickup", "filter", "slack"],
      complexity: "medium" as const
    },
    {
      prompt: "When a webhook receives payment data, validate amount, if over $500 create Pipedrive deal and notify sales",
      nodes: ["webhook", "if", "pipedrive", "slack"],
      complexity: "medium" as const
    },
    {
      prompt: "Every week, sync Airtable records to Notion database, only adding new ones",
      nodes: ["schedule", "airtable", "notion"],
      complexity: "simple" as const
    },
    {
      prompt: "When a Telegram message contains a URL, fetch the page, summarize with AI, and reply with summary",
      nodes: ["telegram", "code", "http_request", "ai_chat_model", "telegram"],
      complexity: "complex" as const
    },
    {
      prompt: "Every morning, check Zoho for new leads, if from specific region, add to HubSpot and notify",
      nodes: ["schedule", "zoho", "if", "hubspot", "slack"],
      complexity: "medium" as const
    },
  ];
  
  specificPatterns.forEach((pattern, index) => {
    const nodeIds: string[] = [];
    const nodes: any[] = [];
    const connections: any[] = [];
    
    // Build workflow from pattern
    pattern.nodes.forEach((nodeType, i) => {
      const nodeId = `${nodeType}_${index}_${i}_${randomUUID().substring(0, 8)}`;
      nodeIds.push(nodeId);
      
      const config: any = {};
      if (nodeType === "schedule") config.cron = "0 9 * * *";
      if (nodeType === "slack") config.channel = "#general";
      if (nodeType === "telegram") config.chat_id = "@group";
      if (nodeType === "gmail") config.to = "user@example.com";
      if (nodeType === "if") config.condition = "{{input.value}} > 100";
      
      nodes.push({
        id: nodeId,
        type: nodeType,
        config
      });
      
      if (i > 0) {
        connections.push({
          source: nodeIds[i - 1],
          target: nodeId,
          source_output: "output",
          target_input: "input"
        });
      }
    });
    
    patterns.push({
      prompt: pattern.prompt,
      workflow: {
        summary: `Workflow: ${pattern.prompt.substring(0, 50)}...`,
        nodes,
        connections,
        required_credentials: pattern.nodes.filter(t => 
          ["slack", "gmail", "telegram", "google_sheets", "airtable", "hubspot", "pipedrive", "notion", "clickup", "github", "zoho", "linkedin"].includes(t)
        ),
        validation_status: "valid"
      },
      metadata: {
        category: "pattern_variation",
        complexity: pattern.complexity,
        node_types: pattern.nodes
      }
    });
  });
  
  return patterns;
}

/**
 * Generate negative examples (should fail validation)
 */
function generateNegativeExamples(): TrainingExample[] {
  return [
    {
      prompt: "Send an email",
      workflow: {
        summary: "Ambiguous email request",
        nodes: [],
        connections: [],
        required_credentials: [],
        validation_status: "needs_attention"
      },
      metadata: {
        category: "negative",
        complexity: "simple",
        node_types: []
      }
    },
    {
      prompt: "Save data somewhere",
      workflow: {
        summary: "Incomplete storage request",
        nodes: [],
        connections: [],
        required_credentials: [],
        validation_status: "needs_attention"
      },
      metadata: {
        category: "negative",
        complexity: "simple",
        node_types: []
      }
    }
  ];
}

/**
 * Main function to generate training dataset
 */
function main() {
  console.log('🚀 Generating training dataset for autonomous workflow builder...\n');
  
  const allExamples: TrainingExample[] = [];
  
  // 1. Add seed examples
  console.log('📝 Adding seed examples...');
  SEED_EXAMPLES.forEach(seed => {
    allExamples.push({
      prompt: seed.prompt,
      workflow: seed.workflow,
      metadata: {
        category: seed.category,
        complexity: seed.complexity,
        node_types: seed.workflow.nodes.map(n => n.type)
      }
    });
  });
  console.log(`   ✅ Added ${SEED_EXAMPLES.length} seed examples`);
  
  // 2. Generate synthetic variations (more per seed to reach 100+)
  console.log('\n🔄 Generating synthetic variations...');
  const syntheticCount = Math.max(8, Math.floor(100 / SEED_EXAMPLES.length)); // Ensure we get 100+ total
  SEED_EXAMPLES.forEach(seed => {
    const synthetic = generateSyntheticExamples(seed, syntheticCount);
    allExamples.push(...synthetic);
  });
  console.log(`   ✅ Generated ${SEED_EXAMPLES.length * syntheticCount} synthetic examples`);
  
  // 3. Generate node type coverage examples
  console.log('\n🎯 Generating node type coverage examples...');
  const nodeExamples = generateNodeTypeExamples();
  allExamples.push(...nodeExamples);
  console.log(`   ✅ Generated ${nodeExamples.length} node coverage examples`);
  
  // 4. Generate additional pattern variations
  console.log('\n🔄 Generating additional pattern variations...');
  const additionalPatterns = generateAdditionalPatterns();
  allExamples.push(...additionalPatterns);
  console.log(`   ✅ Generated ${additionalPatterns.length} additional pattern examples`);
  
  // 5. Add negative examples
  console.log('\n⚠️  Adding negative examples...');
  const negativeExamples = generateNegativeExamples();
  allExamples.push(...negativeExamples);
  console.log(`   ✅ Added ${negativeExamples.length} negative examples`);
  
  // 5. Save dataset
  const outputPath = path.join(__dirname, '../data/training_dataset_v2.json');
  const dataset = {
    version: "2.0",
    description: "Training dataset for autonomous workflow builder following 5-phase pipeline",
    total_examples: allExamples.length,
    generated_at: new Date().toISOString(),
    examples: allExamples
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(dataset, null, 2), 'utf-8');
  
  console.log(`\n✅ Dataset generated successfully!`);
  console.log(`   📁 Location: ${outputPath}`);
  console.log(`   📊 Total examples: ${allExamples.length}`);
  console.log(`   📦 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
  
  // Statistics
  const byComplexity = allExamples.reduce((acc, ex) => {
    const comp = ex.metadata?.complexity || 'unknown';
    acc[comp] = (acc[comp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\n📈 Statistics:');
  console.log(`   Simple: ${byComplexity.simple || 0}`);
  console.log(`   Medium: ${byComplexity.medium || 0}`);
  console.log(`   Complex: ${byComplexity.complex || 0}`);
  console.log(`   Negative: ${byComplexity.negative || 0}`);
}

// Run if executed directly
// Check if this is the main module (works in both CommonJS and ES module mode)
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule || process.argv[1]?.endsWith('generate-training-dataset.ts')) {
  main();
}

// Script to add 25 test workflows to the training dataset
const fs = require('fs');
const path = require('path');

const datasetPath = path.join(__dirname, '../data/workflow_training_dataset.json');
const examplesDir = path.join(__dirname, '../data/workflow_examples');

// Load canonical examples so we can attach exampleId/useCase metadata
function loadExamplesIndex() {
  const index = {};

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const raw = fs.readFileSync(full, 'utf-8');
        try {
          const ex = JSON.parse(raw);
          if (ex.id) {
            index[ex.id] = ex;
          }
        } catch {
          // ignore invalid example here; validate-workflow-examples.js will catch it
        }
      }
    }
  }

  walk(examplesDir);
  return index;
}

const examplesIndex = loadExamplesIndex();

function getUseCase(exampleId) {
  const ex = examplesIndex[exampleId];
  return ex && ex.useCase ? ex.useCase : undefined;
}

// Read the current dataset
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));

// Generate 25 new workflows
const newWorkflows = [
  {
    id: "workflow_101",
    category: "Data Integration",
    useCase: getUseCase("webhook_to_slack_notification_v1"),
    exampleId: "webhook_to_slack_notification_v1",
    goal: "webhook data intake and notification",
    phase1: {
      step1: { userPrompt: "Create a workflow that receives user data from a webhook, stores it in a database, and sends a confirmation message and stored data to Slack." },
      step3: { systemPrompt: "Captures webhook data, persists it, and notifies the team.", wordCount: 8, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "webhook data intake and notification",
          platforms: ["Webhook", "PostgreSQL", "Slack"],
          credentialsRequired: ["SLACK_WEBHOOK_URL", "DATABASE_CONNECTION_STRING"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Linear flow with database", description: "Trigger: webhook → Step 1: set_variable → Step 2: postgresql → Step 3: slack_message" },
        selectedNodes: ["webhook", "set_variable", "postgresql", "slack_message"],
        nodeConfigurations: {
          webhook: {},
          set_variable: { variables: { name: "{{input.name}}", email: "{{input.email}}" } },
          postgresql: { query: "INSERT INTO users (name, email) VALUES ($1, $2)", params: ["{{name}}", "{{email}}"] },
          slack_message: { webhookUrl: "{{SLACK_WEBHOOK_URL}}", channel: "#notifications", message: "User {{name}} ({{email}}) has been stored in database" }
        },
        connections: ["trigger → set_variable", "set_variable → postgresql", "postgresql → slack_message"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing set_variable node", stateUpdated: "State updated after set_variable" },
        { iteration: 2, execution: "Executing postgresql node", stateUpdated: "State updated after postgresql" },
        { iteration: 3, execution: "Executing slack_message node", stateUpdated: "State updated after slack_message" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_102",
    category: "Data Sync",
    useCase: getUseCase("sheets_scheduled_api_to_sheets_v1"),
    exampleId: "sheets_scheduled_api_to_sheets_v1",
    goal: "scheduled api to sheets",
    phase1: {
      step1: { userPrompt: "Create a scheduled workflow that fetches data from an HTTP API every day and appends it to Google Sheets." },
      step3: { systemPrompt: "Daily API data sync into Sheets.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "scheduled api to sheets",
          platforms: ["Schedule", "HTTP", "Google Sheets"],
          credentialsRequired: ["GOOGLE_OAUTH2"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Scheduled data sync", description: "Trigger: schedule → Step 1: http_request → Step 2: google_sheets" },
        selectedNodes: ["schedule", "http_request", "google_sheets"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 0 * * *" },
          http_request: { method: "GET", url: "https://api.example.com/data" },
          google_sheets: { operation: "append", spreadsheetId: "{{SPREADSHEET_ID}}", range: "A1", values: "{{response.data}}" }
        },
        connections: ["trigger → http_request", "http_request → google_sheets"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing http_request node", stateUpdated: "State updated after http_request" },
        { iteration: 2, execution: "Executing google_sheets node", stateUpdated: "State updated after google_sheets" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_103",
    category: "Communication",
    useCase: getUseCase("email_form_to_email_confirmation_v1"),
    exampleId: "email_form_to_email_confirmation_v1",
    goal: "form to email automation",
    phase1: {
      step1: { userPrompt: "Create a workflow that takes user data from form submission and sends a confirmation email and user data to the user." },
      step3: { systemPrompt: "Sends automated email after form submit.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "form to email automation",
          platforms: ["Form", "Email"],
          credentialsRequired: ["SMTP_CONFIG"],
          complexityLevel: "Simple"
        }
      },
      step5: {
        structure: { flowType: "Form submission flow", description: "Trigger: form → Step 1: email" },
        selectedNodes: ["form", "email"],
        nodeConfigurations: {
          form: { fields: ["name", "email", "message"] },
          email: { to: "{{input.email}}", subject: "Form Submission Confirmation", body: "Thank you {{input.name}} for your submission: {{input.message}}" }
        },
        connections: ["trigger → email"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing email node", stateUpdated: "State updated after email" }
      ],
      executionFinalization: { totalIterations: 2, goalAchieved: true }
    }
  },
  {
    id: "workflow_104",
    category: "AI Chatbot",
    useCase: getUseCase("ai_chatbot_with_memory_gemini_v1"),
    exampleId: "ai_chatbot_with_memory_gemini_v1",
    goal: "ai chatbot with memory",
    phase1: {
      step1: { userPrompt: "Create a chat workflow using Google Gemini that remembers previous user messages and responds intelligently." },
      step3: { systemPrompt: "Stateful chatbot with conversation memory.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "ai chatbot with memory",
          platforms: ["Chat", "Google Gemini", "Memory", "AI Agent"],
          credentialsRequired: ["GOOGLE_GEMINI_API_KEY"],
          complexityLevel: "High"
        }
      },
      step5: {
        structure: { flowType: "AI chatbot with memory", description: "Trigger: chat_trigger → Step 1: memory → Step 2: google_gemini → Step 3: ai_agent" },
        selectedNodes: ["chat_trigger", "memory", "google_gemini", "ai_agent"],
        nodeConfigurations: {
          chat_trigger: {},
          memory: { operation: "store", key: "conversation_history" },
          google_gemini: { model: "gemini-pro", prompt: "{{input.message}}", context: "{{memory.conversation_history}}" },
          ai_agent: { model: "google_gemini", systemPrompt: "You are a helpful assistant with conversation memory" }
        },
        connections: ["trigger → memory", "memory → google_gemini", "google_gemini → ai_agent"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing memory node", stateUpdated: "State updated after memory" },
        { iteration: 2, execution: "Executing google_gemini node", stateUpdated: "State updated after google_gemini" },
        { iteration: 3, execution: "Executing ai_agent node", stateUpdated: "State updated after ai_agent" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_105",
    category: "Monitoring",
    // No dedicated canonical example yet; keep structure only
    goal: "error alert system",
    phase1: {
      step1: { userPrompt: "Create a workflow that triggers on workflow errors and sends an alert to PagerDuty." },
      step3: { systemPrompt: "Monitors failures and escalates alerts.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "error alert system",
          platforms: ["Error Trigger", "PagerDuty"],
          credentialsRequired: ["PAGERDUTY_API_KEY"],
          complexityLevel: "Simple"
        }
      },
      step5: {
        structure: { flowType: "Error monitoring flow", description: "Trigger: error_trigger → Step 1: pagerduty" },
        selectedNodes: ["error_trigger", "pagerduty"],
        nodeConfigurations: {
          error_trigger: {},
          pagerduty: { eventType: "trigger", severity: "critical", summary: "Workflow error: {{error.message}}" }
        },
        connections: ["trigger → pagerduty"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing pagerduty node", stateUpdated: "State updated after pagerduty" }
      ],
      executionFinalization: { totalIterations: 2, goalAchieved: true }
    }
  },
  {
    id: "workflow_106",
    category: "Integration",
    // No dedicated canonical example yet; keep structure only
    goal: "github issue alerts",
    phase1: {
      step1: { userPrompt: "Create a workflow that sends a Slack message whenever a new GitHub issue is created." },
      step3: { systemPrompt: "Keeps team informed about new issues.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "github issue alerts",
          platforms: ["GitHub", "Slack"],
          credentialsRequired: ["GITHUB_TOKEN", "SLACK_WEBHOOK_URL"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "GitHub webhook flow", description: "Trigger: webhook → Step 1: github → Step 2: slack_message" },
        selectedNodes: ["webhook", "github", "slack_message"],
        nodeConfigurations: {
          webhook: {},
          github: { operation: "getIssue", owner: "{{input.repository.owner}}", repo: "{{input.repository.name}}", issueNumber: "{{input.issue.number}}" },
          slack_message: { webhookUrl: "{{SLACK_WEBHOOK_URL}}", channel: "#github", message: "New issue: {{github.title}} - {{github.body}}" }
        },
        connections: ["trigger → github", "github → slack_message"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing github node", stateUpdated: "State updated after github" },
        { iteration: 2, execution: "Executing slack_message node", stateUpdated: "State updated after slack_message" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_107",
    category: "AI Processing",
    // No dedicated canonical example yet; keep structure only
    goal: "ai data summarizer",
    phase1: {
      step1: { userPrompt: "Fetch data from an API, summarize it using an AI model, and email the summary." },
      step3: { systemPrompt: "AI-powered content summarization.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "ai data summarizer",
          platforms: ["HTTP", "OpenAI/Gemini", "Email"],
          credentialsRequired: ["OPENAI_API_KEY", "SMTP_CONFIG"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "AI processing flow", description: "Trigger: manual_trigger → Step 1: http_request → Step 2: google_gemini → Step 3: email" },
        selectedNodes: ["manual_trigger", "http_request", "google_gemini", "email"],
        nodeConfigurations: {
          manual_trigger: {},
          http_request: { method: "GET", url: "https://api.example.com/data" },
          google_gemini: { model: "gemini-pro", prompt: "Summarize the following data: {{http_request.response}}" },
          email: { to: "{{EMAIL_TO}}", subject: "Data Summary", body: "{{google_gemini.response}}" }
        },
        connections: ["trigger → http_request", "http_request → google_gemini", "google_gemini → email"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing http_request node", stateUpdated: "State updated after http_request" },
        { iteration: 2, execution: "Executing google_gemini node", stateUpdated: "State updated after google_gemini" },
        { iteration: 3, execution: "Executing email node", stateUpdated: "State updated after email" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_108",
    category: "Conditional Routing",
    // No dedicated canonical example yet; keep structure only
    goal: "conditional webhook router",
    phase1: {
      step1: { userPrompt: "Create a workflow that routes form data differently based on a condition if gender male send data to slack else females send to email. input fields - Name, Age, Gender, email, Mobile" },
      step3: { systemPrompt: "Uses logic to route data flows.", wordCount: 6, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "conditional webhook router",
          platforms: ["Form", "Switch", "Slack", "Email"],
          credentialsRequired: ["SLACK_WEBHOOK_URL", "SMTP_CONFIG"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Conditional branching", description: "Trigger: form → Step 1: switch → Step 2: slack_message / email" },
        selectedNodes: ["form", "switch", "slack_message", "email"],
        nodeConfigurations: {
          form: { fields: ["name", "age", "gender", "email", "mobile"] },
          switch: { expression: "{{input.gender}}", cases: [{ value: "male", target: "slack_message" }, { value: "female", target: "email" }] },
          slack_message: { webhookUrl: "{{SLACK_WEBHOOK_URL}}", channel: "#males", message: "Male user: {{input.name}}, Age: {{input.age}}, Email: {{input.email}}, Mobile: {{input.mobile}}" },
          email: { to: "{{input.email}}", subject: "Welcome", body: "Hello {{input.name}}, thank you for registering!" }
        },
        connections: ["trigger → switch", "switch → slack_message", "switch → email"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing switch node", stateUpdated: "State updated after switch" },
        { iteration: 2, execution: "Executing slack_message or email node", stateUpdated: "State updated after notification" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_109",
    category: "File Migration",
    // No dedicated canonical example yet; keep structure only
    goal: "file migration workflow",
    phase1: {
      step1: { userPrompt: "Create a workflow that uploads files from FTP to AWS S3." },
      step3: { systemPrompt: "Moves files between storage systems.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "file migration workflow",
          platforms: ["FTP", "AWS S3"],
          credentialsRequired: ["FTP_CREDENTIALS", "AWS_ACCESS_KEY", "AWS_SECRET_KEY"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "File transfer flow", description: "Trigger: manual_trigger → Step 1: ftp → Step 2: aws_s3" },
        selectedNodes: ["manual_trigger", "ftp", "aws_s3"],
        nodeConfigurations: {
          manual_trigger: {},
          ftp: { operation: "download", host: "{{FTP_HOST}}", path: "/files/*.pdf" },
          aws_s3: { operation: "put", bucket: "{{S3_BUCKET}}", key: "{{ftp.filename}}", body: "{{ftp.content}}" }
        },
        connections: ["trigger → ftp", "ftp → aws_s3"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing ftp node", stateUpdated: "State updated after ftp" },
        { iteration: 2, execution: "Executing aws_s3 node", stateUpdated: "State updated after aws_s3" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_110",
    category: "Document Processing",
    // No dedicated canonical example yet; keep structure only
    goal: "pdf text extraction",
    phase1: {
      step1: { userPrompt: "Create a workflow that reads a PDF from Google Drive and extracts text." },
      step3: { systemPrompt: "Reads and processes PDFs.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "pdf text extraction",
          platforms: ["Google Drive", "PDF", "Set"],
          credentialsRequired: ["GOOGLE_OAUTH2"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Document processing flow", description: "Trigger: manual_trigger → Step 1: google_drive → Step 2: pdf → Step 3: set_variable" },
        selectedNodes: ["manual_trigger", "google_drive", "pdf", "set_variable"],
        nodeConfigurations: {
          manual_trigger: {},
          google_drive: { operation: "get", fileId: "{{FILE_ID}}" },
          pdf: { operation: "extractText", pdfUrl: "{{google_drive.downloadUrl}}" },
          set_variable: { variables: { extractedText: "{{pdf.text}}" } }
        },
        connections: ["trigger → google_drive", "google_drive → pdf", "pdf → set_variable"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing google_drive node", stateUpdated: "State updated after google_drive" },
        { iteration: 2, execution: "Executing pdf node", stateUpdated: "State updated after pdf" },
        { iteration: 3, execution: "Executing set_variable node", stateUpdated: "State updated after set_variable" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_111",
    category: "Social Media",
    // No dedicated canonical example yet; keep structure only
    goal: "social media scheduler",
    phase1: {
      step1: { userPrompt: "Create a workflow that posts scheduled content to Twitter and LinkedIn." },
      step3: { systemPrompt: "Auto-posts content to social platforms.", wordCount: 5, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "social media scheduler",
          platforms: ["Schedule", "Twitter/X", "LinkedIn"],
          credentialsRequired: ["TWITTER_API_KEY", "LINKEDIN_OAUTH"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Scheduled social posting", description: "Trigger: schedule → Step 1: twitter → Step 2: linkedin" },
        selectedNodes: ["schedule", "twitter", "linkedin"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 9 * * *" },
          twitter: { operation: "tweet", text: "{{CONTENT}}" },
          linkedin: { operation: "post", text: "{{CONTENT}}" }
        },
        connections: ["trigger → twitter", "trigger → linkedin"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing twitter node", stateUpdated: "State updated after twitter" },
        { iteration: 2, execution: "Executing linkedin node", stateUpdated: "State updated after linkedin" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_112",
    category: "AI RAG",
    // No dedicated canonical example yet; keep structure only
    goal: "rag knowledge assistant",
    phase1: {
      step1: { userPrompt: "Create a RAG workflow that stores documents in a vector database and answers user questions." },
      step3: { systemPrompt: "Retrieval-augmented generation system.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "rag knowledge assistant",
          platforms: ["Chat", "Embeddings", "Vector Store", "AI Agent"],
          credentialsRequired: ["OPENAI_API_KEY", "VECTOR_STORE_API_KEY"],
          complexityLevel: "High"
        }
      },
      step5: {
        structure: { flowType: "RAG system flow", description: "Trigger: chat_trigger → Step 1: embeddings → Step 2: vector_store → Step 3: ai_agent" },
        selectedNodes: ["chat_trigger", "embeddings", "vector_store", "ai_agent"],
        nodeConfigurations: {
          chat_trigger: {},
          embeddings: { model: "text-embedding-ada-002", input: "{{input.message}}" },
          vector_store: { operation: "query", queryVector: "{{embeddings.vector}}", topK: 5 },
          ai_agent: { model: "openai_gpt", systemPrompt: "Answer questions using the retrieved context: {{vector_store.results}}" }
        },
        connections: ["trigger → embeddings", "embeddings → vector_store", "vector_store → ai_agent"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing embeddings node", stateUpdated: "State updated after embeddings" },
        { iteration: 2, execution: "Executing vector_store node", stateUpdated: "State updated after vector_store" },
        { iteration: 3, execution: "Executing ai_agent node", stateUpdated: "State updated after ai_agent" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_113",
    category: "Ecommerce",
    // No dedicated canonical example yet; keep structure only
    goal: "payment confirmation",
    phase1: {
      step1: { userPrompt: "Create a workflow that confirms Stripe payments and sends an email receipt." },
      step3: { systemPrompt: "Payment processing automation.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "payment confirmation",
          platforms: ["Stripe", "Email"],
          credentialsRequired: ["STRIPE_API_KEY", "SMTP_CONFIG"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Payment processing flow", description: "Trigger: webhook → Step 1: stripe → Step 2: email" },
        selectedNodes: ["webhook", "stripe", "email"],
        nodeConfigurations: {
          webhook: {},
          stripe: { operation: "retrievePayment", paymentId: "{{input.payment_intent_id}}" },
          email: { to: "{{stripe.customer_email}}", subject: "Payment Confirmation", body: "Your payment of {{stripe.amount}} has been confirmed. Receipt: {{stripe.receipt_url}}" }
        },
        connections: ["trigger → stripe", "stripe → email"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing stripe node", stateUpdated: "State updated after stripe" },
        { iteration: 2, execution: "Executing email node", stateUpdated: "State updated after email" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_114",
    category: "CRM",
    useCase: getUseCase("crm_lead_capture_hubspot_v1"),
    exampleId: "crm_lead_capture_hubspot_v1",
    goal: "lead management system",
    phase1: {
      step1: { userPrompt: "Create a workflow that captures leads from a form and stores them in HubSpot CRM." },
      step3: { systemPrompt: "Automates lead intake.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "lead management system",
          platforms: ["Form Trigger", "HubSpot"],
          credentialsRequired: ["HUBSPOT_API_KEY"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Lead capture flow", description: "Trigger: form → Step 1: hubspot" },
        selectedNodes: ["form", "hubspot"],
        nodeConfigurations: {
          form: { fields: ["name", "email", "company", "phone"] },
          hubspot: { operation: "createContact", properties: { firstname: "{{input.name}}", email: "{{input.email}}", company: "{{input.company}}", phone: "{{input.phone}}" } }
        },
        connections: ["trigger → hubspot"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing hubspot node", stateUpdated: "State updated after hubspot" }
      ],
      executionFinalization: { totalIterations: 2, goalAchieved: true }
    }
  },
  {
    id: "workflow_115",
    category: "Backup",
    useCase: getUseCase("database_db_backup_to_drive_v1"),
    exampleId: "database_db_backup_to_drive_v1",
    goal: "db backup automation",
    phase1: {
      step1: { userPrompt: "Create a scheduled workflow that backs up a database to Google Drive." },
      step3: { systemPrompt: "Periodic database backup.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "db backup automation",
          platforms: ["Schedule", "MySQL", "Google Drive"],
          credentialsRequired: ["MYSQL_CONNECTION", "GOOGLE_OAUTH2"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Scheduled backup flow", description: "Trigger: schedule → Step 1: mysql → Step 2: google_drive" },
        selectedNodes: ["schedule", "mysql", "google_drive"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 2 * * *" },
          mysql: { operation: "export", query: "SELECT * FROM all_tables" },
          google_drive: { operation: "upload", fileName: "backup_{{timestamp}}.sql", content: "{{mysql.export}}" }
        },
        connections: ["trigger → mysql", "mysql → google_drive"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing mysql node", stateUpdated: "State updated after mysql" },
        { iteration: 2, execution: "Executing google_drive node", stateUpdated: "State updated after google_drive" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_116",
    category: "Authentication",
    // No dedicated canonical example yet; keep structure only
    goal: "auth token workflow",
    phase1: {
      step1: { userPrompt: "Create a workflow that generates a JWT token after OAuth authentication." },
      step3: { systemPrompt: "Secure token handling.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "auth token workflow",
          platforms: ["OAuth2", "JWT"],
          credentialsRequired: ["OAUTH2_CLIENT_ID", "OAUTH2_CLIENT_SECRET"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Authentication flow", description: "Trigger: webhook → Step 1: oauth2 → Step 2: jwt" },
        selectedNodes: ["webhook", "oauth2", "jwt"],
        nodeConfigurations: {
          webhook: {},
          oauth2: { operation: "getAccessToken", code: "{{input.code}}", redirectUri: "{{REDIRECT_URI}}" },
          jwt: { operation: "encode", payload: { userId: "{{oauth2.user_id}}", email: "{{oauth2.email}}" }, secret: "{{JWT_SECRET}}" }
        },
        connections: ["trigger → oauth2", "oauth2 → jwt"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing oauth2 node", stateUpdated: "State updated after oauth2" },
        { iteration: 2, execution: "Executing jwt node", stateUpdated: "State updated after jwt" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_117",
    category: "Analytics",
    // No dedicated canonical example yet; keep structure only
    goal: "analytics etl",
    phase1: {
      step1: { userPrompt: "Create a workflow that pulls data from Google Analytics and sends it to BigQuery." },
      step3: { systemPrompt: "Data pipeline for analytics.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "analytics etl",
          platforms: ["Google Analytics", "Google BigQuery"],
          credentialsRequired: ["GOOGLE_OAUTH2"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Analytics ETL flow", description: "Trigger: schedule → Step 1: google_analytics → Step 2: google_bigquery" },
        selectedNodes: ["schedule", "google_analytics", "google_bigquery"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 0 * * *" },
          google_analytics: { operation: "getReport", startDate: "{{yesterday}}", endDate: "{{today}}" },
          google_bigquery: { operation: "insert", dataset: "analytics", table: "daily_reports", rows: "{{google_analytics.data}}" }
        },
        connections: ["trigger → google_analytics", "google_analytics → google_bigquery"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing google_analytics node", stateUpdated: "State updated after google_analytics" },
        { iteration: 2, execution: "Executing google_bigquery node", stateUpdated: "State updated after google_bigquery" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_118",
    category: "Image Processing",
    // No dedicated canonical example yet; keep structure only
    goal: "image processing pipeline",
    phase1: {
      step1: { userPrompt: "Create a workflow that resizes images uploaded to Dropbox." },
      step3: { systemPrompt: "Image automation flow.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "image processing pipeline",
          platforms: ["Dropbox", "Image Manipulation"],
          credentialsRequired: ["DROPBOX_ACCESS_TOKEN"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Image processing flow", description: "Trigger: webhook → Step 1: dropbox → Step 2: image_manipulation" },
        selectedNodes: ["webhook", "dropbox", "image_manipulation"],
        nodeConfigurations: {
          webhook: {},
          dropbox: { operation: "download", path: "{{input.file_path}}" },
          image_manipulation: { operation: "resize", image: "{{dropbox.content}}", width: 800, height: 600 }
        },
        connections: ["trigger → dropbox", "dropbox → image_manipulation"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing dropbox node", stateUpdated: "State updated after dropbox" },
        { iteration: 2, execution: "Executing image_manipulation node", stateUpdated: "State updated after image_manipulation" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_119",
    category: "Task Management",
    // No dedicated canonical example yet; keep structure only
    goal: "task sync automation",
    phase1: {
      step1: { userPrompt: "Create a workflow that syncs tasks from Trello to ClickUp." },
      step3: { systemPrompt: "Productivity tool integration.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "task sync automation",
          platforms: ["HTTP Request", "ClickUp"],
          credentialsRequired: ["TRELLO_API_KEY", "CLICKUP_API_KEY"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Task sync flow", description: "Trigger: schedule → Step 1: http_request → Step 2: clickup" },
        selectedNodes: ["schedule", "http_request", "clickup"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 * * * *" },
          http_request: { method: "GET", url: "https://api.trello.com/1/boards/{{BOARD_ID}}/cards", headers: { Authorization: "Bearer {{TRELLO_API_KEY}}" } },
          clickup: { operation: "createTask", listId: "{{CLICKUP_LIST_ID}}", name: "{{http_request.name}}", description: "{{http_request.desc}}" }
        },
        connections: ["trigger → http_request", "http_request → clickup"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing http_request node", stateUpdated: "State updated after http_request" },
        { iteration: 2, execution: "Executing clickup node", stateUpdated: "State updated after clickup" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_120",
    category: "Notifications",
    // No dedicated canonical example yet; keep structure only
    goal: "youtube alerts",
    phase1: {
      step1: { userPrompt: "Create a workflow that sends a Telegram message when a new YouTube video is uploaded." },
      step3: { systemPrompt: "Content publishing notifications.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "youtube alerts",
          platforms: ["YouTube", "Telegram"],
          credentialsRequired: ["YOUTUBE_API_KEY", "TELEGRAM_BOT_TOKEN"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "YouTube monitoring flow", description: "Trigger: schedule → Step 1: youtube → Step 2: telegram" },
        selectedNodes: ["schedule", "youtube", "telegram"],
        nodeConfigurations: {
          schedule: { cronExpression: "0 * * * *" },
          youtube: { operation: "listVideos", channelId: "{{CHANNEL_ID}}", maxResults: 1 },
          telegram: { chatId: "{{TELEGRAM_CHAT_ID}}", text: "New video: {{youtube.title}} - {{youtube.url}}" }
        },
        connections: ["trigger → youtube", "youtube → telegram"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing youtube node", stateUpdated: "State updated after youtube" },
        { iteration: 2, execution: "Executing telegram node", stateUpdated: "State updated after telegram" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_121",
    category: "Monitoring",
    // No dedicated canonical example yet; keep structure only
    goal: "log monitoring system",
    phase1: {
      step1: { userPrompt: "Create a workflow that monitors logs and sends alerts when errors exceed a threshold." },
      step3: { systemPrompt: "Observability automation.", wordCount: 2, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "log monitoring system",
          platforms: ["Datadog", "If", "Slack"],
          credentialsRequired: ["DATADOG_API_KEY", "SLACK_WEBHOOK_URL"],
          complexityLevel: "High"
        }
      },
      step5: {
        structure: { flowType: "Conditional monitoring flow", description: "Trigger: schedule → Step 1: datadog → Step 2: if_else → Step 3: slack_message" },
        selectedNodes: ["schedule", "datadog", "if_else", "slack_message"],
        nodeConfigurations: {
          schedule: { cronExpression: "*/5 * * * *" },
          datadog: { operation: "queryLogs", query: "status:error", timeRange: "5m" },
          if_else: { condition: "{{datadog.count}} > 10" },
          slack_message: { webhookUrl: "{{SLACK_WEBHOOK_URL}}", channel: "#alerts", message: "Error threshold exceeded: {{datadog.count}} errors in last 5 minutes" }
        },
        connections: ["trigger → datadog", "datadog → if_else", "if_else → slack_message"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing datadog node", stateUpdated: "State updated after datadog" },
        { iteration: 2, execution: "Executing if_else node", stateUpdated: "State updated after if_else" },
        { iteration: 3, execution: "Executing slack_message node", stateUpdated: "State updated after slack_message" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  },
  {
    id: "workflow_122",
    category: "Ecommerce",
    // No dedicated canonical example yet; keep structure only
    goal: "ecommerce order handler",
    phase1: {
      step1: { userPrompt: "Create a workflow that processes Shopify orders and updates inventory." },
      step3: { systemPrompt: "Automates order flow.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "ecommerce order handler",
          platforms: ["Shopify", "Set"],
          credentialsRequired: ["SHOPIFY_API_KEY", "SHOPIFY_SHOP_DOMAIN"],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Order processing flow", description: "Trigger: webhook → Step 1: shopify → Step 2: set_variable" },
        selectedNodes: ["webhook", "shopify", "set_variable"],
        nodeConfigurations: {
          webhook: {},
          shopify: { operation: "getOrder", orderId: "{{input.order_id}}" },
          set_variable: { variables: { orderId: "{{shopify.id}}", total: "{{shopify.total_price}}", items: "{{shopify.line_items}}" } }
        },
        connections: ["trigger → shopify", "shopify → set_variable"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing shopify node", stateUpdated: "State updated after shopify" },
        { iteration: 2, execution: "Executing set_variable node", stateUpdated: "State updated after set_variable" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_123",
    category: "Data Cleanup",
    // No dedicated canonical example yet; keep structure only
    goal: "scheduled data cleanup",
    phase1: {
      step1: { userPrompt: "Create an interval workflow that deletes old records from a database." },
      step3: { systemPrompt: "Maintains DB hygiene.", wordCount: 3, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "scheduled data cleanup",
          platforms: ["Interval", "PostgreSQL"],
          credentialsRequired: ["DATABASE_CONNECTION_STRING"],
          complexityLevel: "Simple"
        }
      },
      step5: {
        structure: { flowType: "Scheduled cleanup flow", description: "Trigger: interval → Step 1: postgresql" },
        selectedNodes: ["interval", "postgresql"],
        nodeConfigurations: {
          interval: { interval: 86400, unit: "seconds" },
          postgresql: { query: "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'" }
        },
        connections: ["trigger → postgresql"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing postgresql node", stateUpdated: "State updated after postgresql" }
      ],
      executionFinalization: { totalIterations: 2, goalAchieved: true }
    }
  },
  {
    id: "workflow_124",
    category: "Approval",
    // No dedicated canonical example yet; keep structure only
    goal: "approval workflow",
    phase1: {
      step1: { userPrompt: "Create a workflow that waits for manager approval before proceeding." },
      step3: { systemPrompt: "Human-in-the-loop automation.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "approval workflow",
          platforms: ["Webhook", "Wait", "If"],
          credentialsRequired: [],
          complexityLevel: "Medium"
        }
      },
      step5: {
        structure: { flowType: "Approval flow", description: "Trigger: webhook → Step 1: wait → Step 2: if_else" },
        selectedNodes: ["webhook", "wait", "if_else"],
        nodeConfigurations: {
          webhook: {},
          wait: { duration: 3600, unit: "seconds", event: "approval_received" },
          if_else: { condition: "{{wait.approved}} === true" }
        },
        connections: ["trigger → wait", "wait → if_else"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing wait node", stateUpdated: "State updated after wait" },
        { iteration: 2, execution: "Executing if_else node", stateUpdated: "State updated after if_else" }
      ],
      executionFinalization: { totalIterations: 3, goalAchieved: true }
    }
  },
  {
    id: "workflow_125",
    category: "AI Meta",
    // No dedicated canonical example yet; keep structure only
    goal: "meta workflow generator",
    phase1: {
      step1: { userPrompt: "Create a workflow where an AI Agent generates another workflow based on user input." },
      step3: { systemPrompt: "Tests AI Agent autonomy.", wordCount: 4, temperature: 0.2 },
      step4: {
        requirements: {
          primaryGoal: "meta workflow generator",
          platforms: ["Chat Trigger", "AI Agent", "Google Gemini", "Set"],
          credentialsRequired: ["GOOGLE_GEMINI_API_KEY"],
          complexityLevel: "High"
        }
      },
      step5: {
        structure: { flowType: "AI meta workflow", description: "Trigger: chat_trigger → Step 1: ai_agent → Step 2: google_gemini → Step 3: set_variable" },
        selectedNodes: ["chat_trigger", "ai_agent", "google_gemini", "set_variable"],
        nodeConfigurations: {
          chat_trigger: {},
          ai_agent: { systemPrompt: "Generate a workflow JSON based on user requirements: {{input.message}}" },
          google_gemini: { model: "gemini-pro", prompt: "{{ai_agent.workflow_spec}}" },
          set_variable: { variables: { generatedWorkflow: "{{google_gemini.response}}" } }
        },
        connections: ["trigger → ai_agent", "ai_agent → google_gemini", "google_gemini → set_variable"]
      }
    },
    phase2: {
      executionInitialization: { executionId: "created", iterationCount: 0 },
      executionLoop: [
        { iteration: 1, execution: "Executing ai_agent node", stateUpdated: "State updated after ai_agent" },
        { iteration: 2, execution: "Executing google_gemini node", stateUpdated: "State updated after google_gemini" },
        { iteration: 3, execution: "Executing set_variable node", stateUpdated: "State updated after set_variable" }
      ],
      executionFinalization: { totalIterations: 4, goalAchieved: true }
    }
  }
];

// Add new workflows to the dataset
dataset.workflows.push(...newWorkflows);
dataset.totalWorkflows = dataset.workflows.length;

// Write back to file
fs.writeFileSync(datasetPath, JSON.stringify(dataset, null, 2), 'utf-8');

console.log(`✅ Successfully added ${newWorkflows.length} workflows to the training dataset`);
console.log(`📊 Total workflows: ${dataset.totalWorkflows}`);

# Complete List of Node Type IDs

## Storage Structure
- **Storage**: `Map<string, NodeSchema>` in `NodeLibrary` class
- **Location**: `worker/src/services/nodes/node-library.ts`
- **Property**: `private schemas: Map<string, NodeSchema> = new Map()`
- **Key**: The `type` field from each `NodeSchema` object
- **Access**: `nodeLibrary.getSchema(nodeType)` or `nodeLibrary.getAllSchemas()`

## All Node Type Names (IDs)

### Triggers (6)
1. `schedule`
2. `webhook`
3. `manual_trigger`
4. `interval`
5. `chat_trigger`
6. `form`
7. `error_trigger`
8. `workflow_trigger`

### HTTP & API (4)
9. `http_request`
10. `respond_to_webhook`
11. `http_post`
12. `webhook_response`
13. `graphql`

### Database (7)
14. `database_write`
15. `database_read`
16. `supabase`
17. `mysql`
18. `mongodb`
19. `redis`
20. `postgresql` (alias for database_write)

### Google Services (7)
21. `google_sheets`
22. `google_doc`
23. `google_gmail`
24. `gmail`
25. `google_drive`
26. `google_calendar`
27. `google_contacts`
28. `google_tasks`
29. `google_big_query`

### Transformation & Data Manipulation (15)
30. `set_variable`
31. `javascript`
32. `function`
33. `function_item`
34. `date_time`
35. `text_formatter`
36. `json_parser`
37. `merge_data`
38. `edit_fields`
39. `set`
40. `csv`
41. `html`
42. `xml`
43. `rename_keys`
44. `aggregate`
45. `sort`
46. `limit`

### Logic & Flow Control (6)
47. `if_else`
48. `switch`
49. `merge`
50. `filter`
51. `loop`
52. `noop`
53. `split_in_batches`
54. `stop_and_error`

### Error Handling (1)
55. `error_handler`
56. `wait`

### AI Nodes (11)
57. `ai_agent`
58. `ai_chat_model`
59. `ai_service`
60. `openai_gpt`
61. `anthropic_claude`
62. `google_gemini`
63. `ollama`
64. `text_summarizer`
65. `sentiment_analyzer`
66. `chat_model`
67. `memory`
68. `tool`

### Output & Communication (12)
69. `slack_message`
70. `email`
71. `log_output`
72. `telegram`
73. `outlook`
74. `discord`
75. `slack_webhook`
76. `discord_webhook`
77. `microsoft_teams`
78. `whatsapp_cloud`
79. `twilio`

### Social Media (5)
80. `linkedin`
81. `twitter`
82. `instagram`
83. `youtube`
84. `facebook`

### CRM & Business Tools (10)
85. `salesforce`
86. `clickup`
87. `hubspot`
88. `airtable`
89. `notion`
90. `zoho_crm`
91. `pipedrive`
92. `freshdesk`
93. `intercom`
94. `mailchimp`
95. `activecampaign`

### File Storage (7)
96. `read_binary_file`
97. `write_binary_file`
98. `aws_s3`
99. `dropbox`
100. `onedrive`
101. `ftp`
102. `sftp`

### DevOps (5)
103. `github`
104. `gitlab`
105. `bitbucket`
106. `jira`
107. `jenkins`

### E-commerce (4)
108. `shopify`
109. `woocommerce`
110. `stripe`
111. `paypal`

## Schema Structure

Each node is stored as a `NodeSchema` object with:
- `type`: string (the node ID/name)
- `label`: string (human-readable name)
- `category`: string (e.g., 'trigger', 'ai', 'data')
- `description`: string
- `configSchema`: object with `required` and `optional` fields
- `aiSelectionCriteria`: object (for AI workflow generation)
- `commonPatterns`: array
- `validationRules`: array
- `outputType`: string (optional)
- `outputSchema`: object (optional)
- `capabilities`: array (optional)
- `providers`: array (optional)
- `keywords`: array (optional)



## Total Count
**111+ node types** registered in the NodeLibrary

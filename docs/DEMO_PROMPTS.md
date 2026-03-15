# Demo Prompts - Simple User Workflows

This document contains 15 simple user prompts for demonstrating the workflow system. These prompts are designed to be clear, straightforward, and showcase different use cases without unnecessary complexity.

---

## 📋 Prompt List

### 1. **Simple Data Transfer**
```
Take data from Google Sheets and send it to Gmail
```
**Expected Flow**: `Google Sheets → AI → Gmail`  
**Use Case**: Basic data transfer workflow

---

### 2. **Schedule-Based Automation**
```
Every day at 9 AM, read from Airtable and send email
```
**Expected Flow**: `Schedule → Airtable → AI → Email`  
**Use Case**: Scheduled automation

---

### 3. **Data Processing**
```
Read data from Google Sheets, process it with AI, and save to Notion
```
**Expected Flow**: `Google Sheets → AI → Notion`  
**Use Case**: Data transformation and storage

---

### 4. **Multi-Step Workflow**
```
Get data from database, summarize with AI, then send Slack notification
```
**Expected Flow**: `Database → AI → Slack`  
**Use Case**: Multi-platform integration

---

### 5. **Webhook Trigger**
```
When webhook receives data, process it and send to Gmail
```
**Expected Flow**: `Webhook → AI → Gmail`  
**Use Case**: Event-driven workflow

---

### 6. **Form Submission**
```
When form is submitted, send the data to Google Sheets
```
**Expected Flow**: `Form → Google Sheets`  
**Use Case**: Form data collection

---

### 7. **CRM Integration**
```
Read leads from HubSpot, analyze with AI, and create records in Zoho CRM
```
**Expected Flow**: `HubSpot → AI → Zoho CRM`  
**Use Case**: CRM data synchronization

---

### 8. **Notification Workflow**
```
Read from Google Sheets and send Slack message
```
**Expected Flow**: `Google Sheets → AI → Slack`  
**Use Case**: Team notifications

---

### 9. **Data Aggregation**
```
Read from multiple Google Sheets, combine data, and send email report
```
**Expected Flow**: `Google Sheets → AI → Email`  
**Use Case**: Data aggregation and reporting

---

### 10. **Simple AI Processing**
```
Take text input, summarize with AI, and save to Notion
```
**Expected Flow**: `Manual Input → AI → Notion`  
**Use Case**: Content processing

---

### 11. **Database to Email**
```
Query PostgreSQL database and email the results
```
**Expected Flow**: `PostgreSQL → AI → Email`  
**Use Case**: Database reporting

---

### 12. **Social Media Workflow**
```
Read from Google Sheets and post to Twitter
```
**Expected Flow**: `Google Sheets → AI → Twitter`  
**Use Case**: Social media automation

---

### 13. **File Processing**
```
Read CSV file, process with AI, and upload to Google Drive
```
**Expected Flow**: `CSV → AI → Google Drive`  
**Use Case**: File processing pipeline

---

### 14. **Simple Conditional (Explicit)**
```
Read from Google Sheets, if data exists then send email, else log error
```
**Expected Flow**: `Google Sheets → if_else → Email / Log`  
**Use Case**: Conditional logic (explicitly requested)

---

### 15. **Multi-Output Workflow**
```
Read from Airtable, process with AI, then send to both Gmail and Slack
```
**Expected Flow**: `Airtable → AI → Gmail + Slack`  
**Use Case**: Multi-channel distribution

---

## 🎯 Demo Guidelines

### **Simple Prompts (1-13)**
- ✅ **No safety nodes** should be injected
- ✅ Clean, linear workflows
- ✅ Easy to understand and demonstrate

### **Conditional Prompt (14)**
- ✅ **Safety nodes allowed** (user explicitly requested "if data exists")
- ✅ Demonstrates conditional logic

### **Complex Prompt (15)**
- ✅ Shows branching/multi-output capability
- ✅ Demonstrates workflow flexibility

---

## 📊 Expected Behavior

### **Before Fix** (Old Behavior)
- All prompts would auto-inject: `if_else`, `limit`, `stop_and_error`
- Workflows would be unnecessarily complex
- User intent would be ignored

### **After Fix** (New Behavior)
- Simple prompts (1-13): **No safety nodes** injected
- Conditional prompt (14): **Safety nodes injected** (user requested)
- Complex prompt (15): **Safety nodes only if needed**

---

## 🚀 Demo Flow

1. **Start with Simple Prompts** (1-5)
   - Show clean, linear workflows
   - Demonstrate ease of use

2. **Show Integration** (6-10)
   - Multiple platforms
   - Different data sources

3. **Advanced Features** (11-13)
   - Database connections
   - File processing
   - Social media

4. **Conditional Logic** (14)
   - Show explicit conditional request
   - Demonstrate safety nodes when requested

5. **Complex Workflow** (15)
   - Multi-output scenario
   - Show system flexibility

---

## ✅ Success Criteria

- **Simple prompts** should generate **clean, linear workflows**
- **No unnecessary nodes** (if_else, limit, stop_and_error) unless explicitly requested
- **Fast workflow generation** (no unnecessary processing)
- **Clear, understandable** workflow graphs
- **User intent respected** (only add what user asks for)

---

## 📝 Notes

- All prompts are designed to be **natural language**
- No technical jargon required
- System should understand intent automatically
- Safety nodes only when **explicitly requested** or **genuinely needed**

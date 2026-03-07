# HTTP Request Node - Quick Testing Guide for httpbin.org/post

## ✅ What to Fill in HTTP Request Node

### 1. **URL** (Text Input Field)
```
https://httpbin.org/post
```

### 2. **Method** (Dropdown)
Select: **POST**

### 3. **Headers** (JSON Textarea)
Enter this JSON object:
```json
{
  "Content-Type": "application/json"
}
```

**Optional**: Add more headers if needed:
```json
{
  "Content-Type": "application/json",
  "User-Agent": "CtrlChecks-Workflow/1.0"
}
```

### 4. **Body** (JSON Textarea)
Enter this JSON object:
```json
{
  "message": "Hello from workflow",
  "test": true
}
```

**Or try a more complex example:**
```json
{
  "name": "Test User",
  "email": "test@example.com",
  "data": {
    "timestamp": "2025-01-03",
    "value": 123
  }
}
```

---

## 📍 Where to See the Output

### **Execution Console** (Bottom Panel)

1. **Run your workflow** by clicking the "Run" button (top right)
2. **Open the Execution Console** - it appears at the bottom of the screen
3. **Look for the HTTP Request node output** - it will show:
   - ✅ **Status**: Success/Failed
   - ✅ **Response**: The full HTTP response from httpbin.org
   - ✅ **Response Data**: The JSON data returned by httpbin.org

### What httpbin.org/post Returns

httpbin.org/post **echoes back** everything you send, so you'll see:

```json
{
  "args": {},
  "data": "{\"message\":\"Hello from workflow\",\"test\":true}",
  "files": {},
  "form": {},
  "headers": {
    "Content-Type": "application/json",
    "Host": "httpbin.org",
    ...
  },
  "json": {
    "message": "Hello from workflow",
    "test": true
  },
  "origin": "your-ip-address",
  "url": "https://httpbin.org/post"
}
```

**Key fields to check:**
- ✅ `json` - Your body data (parsed)
- ✅ `headers` - All headers sent (including auto-added ones)
- ✅ `data` - Raw body as string
- ✅ `url` - Confirms the endpoint was called

---

## 🔧 Troubleshooting

### Error: "headers must be an object"
- ✅ **Fixed!** The validation now accepts JSON strings and parses them automatically
- Make sure your JSON is valid (no trailing commas, proper quotes)

### Error: "body must be an object"
- ✅ **Fixed!** The validation now accepts JSON strings and parses them automatically
- Make sure your JSON is valid

### No Output Showing
1. Check **Execution Console** is open (bottom panel)
2. Check the **node status** - should be green (success) or red (error)
3. Click on the **HTTP Request node** to see detailed output in Properties Panel

### Output Shows Error
- Check the **error message** in Execution Console
- Common issues:
  - Invalid JSON in headers/body
  - Network error (check internet connection)
  - URL typo

---

## 🎯 Quick Test Checklist

- [ ] URL set to: `https://httpbin.org/post`
- [ ] Method set to: **POST**
- [ ] Headers contains valid JSON object (or leave empty)
- [ ] Body contains valid JSON object
- [ ] Clicked "Run" button
- [ ] Execution Console shows output
- [ ] HTTP Request node shows green status (success)

---

## 💡 Pro Tips

1. **Leave headers empty** if you don't need custom headers - the system will add `Content-Type: application/json` automatically for POST requests

2. **Use simple JSON** for testing - httpbin.org will echo it back exactly

3. **Check the `json` field** in the response - that's your parsed body data

4. **The AI can auto-generate headers and body** - if you have an AI node before the HTTP Request, it will analyze the output and format it correctly!

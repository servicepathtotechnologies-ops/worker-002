# HTTP Request Node Testing Guide

## Quick Setup for Testing

### 1. Configure HTTP Request URL in Node Properties

1. **Select the HTTP Request node** in your workflow
2. **Open the Properties Panel** (right side)
3. **Find the "Url" field** - it should now be a **text input field** (not a dropdown)
4. **Enter a test URL**:

#### Option A: Simple GET Request (Recommended for Testing)
```
https://jsonplaceholder.typicode.com/posts/1
```

#### Option B: Echo Test (Returns what you send)
```
https://httpbin.org/get
```

#### Option C: POST Test (For testing POST requests)
```
https://httpbin.org/post
```

### 2. Configure HTTP Method

- **Method field**: Select from dropdown (GET, POST, PUT, DELETE, PATCH)
- **For testing**: Use **GET** (simplest)

### 3. Optional: Configure Headers

If you need to test with headers (like authentication):

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer test-token-123"
}
```

### 4. Optional: Configure Body (for POST/PUT/PATCH)

```json
{
  "message": "Hello from workflow",
  "test": true
}
```

---

## Test API Endpoints Reference

### httpbin.org (HTTP Testing Service)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://httpbin.org/get` | GET | Returns request details |
| `https://httpbin.org/post` | POST | Echoes POST data |
| `https://httpbin.org/put` | PUT | Echoes PUT data |
| `https://httpbin.org/delete` | DELETE | Returns delete confirmation |
| `https://httpbin.org/status/200` | GET | Returns specific status code |
| `https://httpbin.org/delay/2` | GET | Simulates 2-second delay |

### jsonplaceholder.typicode.com (Fake REST API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://jsonplaceholder.typicode.com/posts/1` | GET | Get post #1 |
| `https://jsonplaceholder.typicode.com/posts` | GET | Get all posts |
| `https://jsonplaceholder.typicode.com/posts` | POST | Create new post |
| `https://jsonplaceholder.typicode.com/users/1` | GET | Get user #1 |

### reqres.in (Fake API)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `https://reqres.in/api/users/1` | GET | Get user #1 |
| `https://reqres.in/api/users` | GET | List users |
| `https://reqres.in/api/users` | POST | Create user |

---

## Credentials Setup

### HTTP Request Node Credentials

**Good News**: HTTP Request node **does NOT require credentials by default**.

However, if your API requires authentication, you can add it via:

1. **Headers** (in node properties):
   ```json
   {
     "Authorization": "Bearer your-token-here",
     "X-API-Key": "your-api-key-here"
   }
   ```

2. **Optional Credentials** (if configured):
   - API Key
   - Bearer Token

### For Testing Without Authentication

**No credentials needed!** Just use the test endpoints above.

---

## Example: Complete HTTP Request Configuration

### Simple GET Request

**Node Properties:**
- **Url**: `https://jsonplaceholder.typicode.com/posts/1`
- **Method**: `GET`
- **Headers**: (leave empty or use `{}`)
- **Body**: (leave empty)

**Expected Response:**
```json
{
  "userId": 1,
  "id": 1,
  "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit",
  "body": "quia et suscipit..."
}
```

### POST Request with Body

**Node Properties:**
- **Url**: `https://httpbin.org/post`
- **Method**: `POST`
- **Headers**: 
  ```json
  {
    "Content-Type": "application/json"
  }
  ```
- **Body**:
  ```json
  {
    "message": "Hello from workflow",
    "timestamp": "2024-01-01T00:00:00Z"
  }
  ```

---

## Testing Your Workflow

1. **Configure HTTP Request Node**:
   - Set URL to a test endpoint
   - Set Method (GET recommended for first test)
   - Leave headers/body empty for simple test

2. **Execute Workflow**:
   - Click "Run" or trigger the workflow
   - Check execution logs

3. **Verify Response**:
   - HTTP Request node should output the API response
   - Check execution console for response data

---

## Troubleshooting

### Issue: "URL is required"
- **Solution**: Make sure you've entered a URL in the node properties

### Issue: "Invalid URL format"
- **Solution**: Ensure URL starts with `http://` or `https://`

### Issue: "Connection timeout"
- **Solution**: 
  - Check internet connection
  - Try a different test endpoint
  - Increase timeout in node properties (default: 10000ms)

### Issue: "401 Unauthorized"
- **Solution**: The API requires authentication - add headers with auth token

---

## Quick Test URLs

Copy-paste these into your HTTP Request node:

**Simple GET:**
```
https://jsonplaceholder.typicode.com/posts/1
```

**Echo Test:**
```
https://httpbin.org/get
```

**Status Test:**
```
https://httpbin.org/status/200
```

---

**Ready to test!** 🚀

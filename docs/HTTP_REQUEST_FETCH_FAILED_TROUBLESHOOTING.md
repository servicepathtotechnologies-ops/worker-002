# HTTP Request Node - "fetch failed" Error Troubleshooting

## 🔴 Error: `{"qs": {}, "_error": "fetch failed"}`

This error indicates that the `fetch()` API call failed at the network level. This is different from HTTP error status codes (like 404, 500) - it means the request couldn't even be sent.

---

## 🔍 Common Causes & Solutions

### 1. **Network Connectivity Issues**

**Symptoms:**
- `fetch failed` error
- No response received
- Timeout errors

**Solutions:**
- ✅ Check your internet connection
- ✅ Verify the URL is reachable: Test in browser or with `curl`
- ✅ Check if you're behind a firewall/proxy
- ✅ Verify DNS resolution: Can you resolve the domain?

**Test:**
```bash
# Test URL in terminal
curl https://jsonplaceholder.typicode.com/posts/1

# Or in browser
# Visit: https://jsonplaceholder.typicode.com/posts/1
```

---

### 2. **SSL/TLS Certificate Issues**

**Symptoms:**
- `fetch failed` with HTTPS URLs
- Certificate validation errors
- Self-signed certificate issues

**Solutions:**
- ✅ Verify the SSL certificate is valid
- ✅ Check if the server uses self-signed certificates
- ✅ For development: May need to disable SSL verification (not recommended for production)

**Test:**
```bash
# Check SSL certificate
openssl s_client -connect jsonplaceholder.typicode.com:443 -showcerts
```

---

### 3. **CORS (Cross-Origin Resource Sharing) Issues**

**Symptoms:**
- `fetch failed` when running from browser
- CORS errors in browser console
- Works in Postman/curl but not in browser

**Solutions:**
- ✅ The API must allow requests from your domain
- ✅ Check if API requires CORS headers
- ✅ For testing: Use a CORS-enabled API like httpbin.org
- ✅ For production: Configure API server to allow your domain

**Note:** If your workflow runs server-side (Node.js backend), CORS is not an issue.

---

### 4. **Timeout Issues**

**Symptoms:**
- Request takes too long
- AbortError in logs
- Default timeout is 30 seconds

**Solutions:**
- ✅ Increase timeout in node properties
- ✅ Check if server is slow or overloaded
- ✅ Verify network latency

**Configuration:**
- In HTTP Request node properties, set **Timeout** to a higher value (e.g., 60000 for 60 seconds)

---

### 5. **Invalid URL Format**

**Symptoms:**
- `fetch failed` immediately
- URL parsing errors

**Solutions:**
- ✅ Ensure URL includes protocol: `https://` or `http://`
- ✅ Check for typos in URL
- ✅ Verify no extra spaces or special characters
- ✅ Ensure URL is properly encoded

**Examples:**
- ❌ Wrong: `jsonplaceholder.typicode.com/posts/1` (missing https://)
- ✅ Correct: `https://jsonplaceholder.typicode.com/posts/1`

---

### 6. **Server-Side Execution Context**

**Symptoms:**
- Works in browser but fails in workflow
- Different behavior in different environments

**Solutions:**
- ✅ Check if workflow runs server-side (Node.js) or client-side (browser)
- ✅ Server-side: May have different network restrictions
- ✅ Client-side: Subject to CORS and browser security policies

---

### 7. **Proxy/Firewall Blocking**

**Symptoms:**
- Works on some networks but not others
- Corporate network restrictions

**Solutions:**
- ✅ Check if behind corporate proxy
- ✅ Configure proxy settings if needed
- ✅ Verify firewall allows outbound HTTPS requests
- ✅ Check if specific domains are blocked

---

## 🛠️ Step-by-Step Debugging

### Step 1: Verify URL is Reachable

```bash
# Test in terminal
curl -v https://jsonplaceholder.typicode.com/posts/1

# Expected: Should return JSON data
# If fails: Network/connectivity issue
```

### Step 2: Test in Browser

1. Open browser
2. Visit: `https://jsonplaceholder.typicode.com/posts/1`
3. Should see JSON response
4. If fails: URL or server issue

### Step 3: Check Node Configuration

**Verify:**
- ✅ URL is complete: `https://jsonplaceholder.typicode.com/posts/1`
- ✅ Method matches API requirement: `GET` for this endpoint
- ✅ Headers are valid JSON (if provided)
- ✅ Timeout is sufficient (default: 30000ms)

### Step 4: Check Server Logs

Look for detailed error messages:
- `ECONNREFUSED` → Server unreachable
- `ETIMEDOUT` → Request timeout
- `ENOTFOUND` → DNS resolution failed
- `CERT_HAS_EXPIRED` → SSL certificate issue

### Step 5: Test with Simple URL

Try a known-working endpoint:
- ✅ `https://httpbin.org/get` (simple GET)
- ✅ `https://jsonplaceholder.typicode.com/posts/1` (your current URL)

If these work, the issue is with your specific URL.

---

## 🔧 Quick Fixes

### Fix 1: Use httpbin.org for Testing

**Change URL to:**
```
https://httpbin.org/get
```

**Why:** httpbin.org is designed for testing and has fewer restrictions.

### Fix 2: Increase Timeout

**In HTTP Request node properties:**
- Set **Timeout** to `60000` (60 seconds)

### Fix 3: Remove Headers (for GET requests)

**For simple GET requests:**
- Leave **Headers** field empty: `{}`
- Some APIs don't need headers for GET

### Fix 4: Check URL Protocol

**Ensure URL starts with:**
- `https://` (secure) or
- `http://` (non-secure)

**Never:**
- ❌ `jsonplaceholder.typicode.com` (missing protocol)
- ❌ `//jsonplaceholder.typicode.com` (relative protocol)

---

## 📋 Configuration Checklist

Before reporting an issue, verify:

- [ ] URL is complete and includes `https://` or `http://`
- [ ] URL is reachable in browser or curl
- [ ] Method matches API requirement (GET, POST, etc.)
- [ ] Headers are valid JSON (if provided)
- [ ] Timeout is sufficient (default: 30000ms)
- [ ] Internet connection is working
- [ ] No firewall/proxy blocking the request
- [ ] SSL certificate is valid (for HTTPS)

---

## 🎯 Specific to Your Error

**Your Current Configuration:**
- URL: `https://jsonplaceholder.typicode.com/posts/1` ✅ (valid)
- Method: `GET` ✅ (correct for this endpoint)
- Headers: `{"Content-Type": "application/json"}` ✅ (valid, but optional for GET)

**Possible Issues:**
1. **Network connectivity** - Check internet connection
2. **Server-side execution** - If running in Node.js, check if fetch is available
3. **Timeout** - Server might be slow to respond
4. **DNS resolution** - Domain might not resolve

**Quick Test:**
1. Open browser
2. Visit: `https://jsonplaceholder.typicode.com/posts/1`
3. If it works in browser but not in workflow → Check server logs for detailed error

---

## 🔍 Advanced Debugging

### Check Server Logs

Look for detailed error messages in:
- Workflow execution logs
- Server console output
- Browser DevTools Network tab (if client-side)

### Enable Detailed Logging

The HTTP Request node logs:
- `[HTTP Request] ✅ Body is object, stringifying: ...`
- `[HTTP Request] ⚠️ Body not sent - method: ...`
- `HTTP Request error: ...`

Check these logs for more details about the failure.

---

## 💡 Common Solutions Summary

| Issue | Solution |
|-------|----------|
| Network unreachable | Check internet connection, test URL in browser |
| SSL certificate | Verify certificate is valid |
| CORS error | Use server-side execution or configure CORS |
| Timeout | Increase timeout value |
| Invalid URL | Ensure URL includes `https://` or `http://` |
| DNS failure | Check DNS resolution |
| Firewall/Proxy | Configure proxy settings or check firewall rules |

---

## 🚀 Next Steps

1. **Test URL in browser** - Verify it's reachable
2. **Check server logs** - Look for detailed error messages
3. **Try httpbin.org** - Test with a known-working endpoint
4. **Increase timeout** - If server is slow
5. **Check network** - Verify internet connectivity

---

## 📞 Still Not Working?

If none of these solutions work:

1. **Check server logs** for the exact error message
2. **Test the URL** in browser/curl to verify it works
3. **Try a different endpoint** (e.g., httpbin.org) to isolate the issue
4. **Check if it's environment-specific** (works in one place but not another)

The error `fetch failed` is a generic network error - the detailed error message in server logs will tell you the exact cause.

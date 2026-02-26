# Pipedrive Credentials Guide

## How to Get Your Pipedrive API Token

The Pipedrive node requires an API token to authenticate with the Pipedrive API. You can obtain this token in two ways:

### Method 1: API Token (Recommended for Testing)

1. **Log in to Pipedrive**
   - Go to [https://www.pipedrive.com](https://www.pipedrive.com)
   - Log in with your account credentials

2. **Navigate to Personal Preferences**
   - Click on your profile icon (top right corner)
   - Select **"Personal preferences"** from the dropdown menu

3. **Access API Settings**
   - In the left sidebar, click on **"API"**
   - You'll see a section titled **"Your personal API token"**

4. **Copy Your API Token**
   - Your API token will be displayed (it looks like: `abc123def456ghi789...`)
   - Click the **"Copy"** button or manually copy the token
   - **Important**: Keep this token secure and never share it publicly

5. **Enter the Token Directly in the Node**
   - In your ctrlchecks workflow, add a Pipedrive node
   - **Enter your API token directly in the `apiToken` input field** in the node configuration
   - The token is stored with the workflow configuration
   - **No need to use environment variables** - just paste your token directly into the input field

### Method 2: OAuth Access Token (For Production Apps)

If you're building a production application, you should use OAuth 2.0 instead of API tokens:

1. **Create a Pipedrive App**
   - Go to [https://developers.pipedrive.com](https://developers.pipedrive.com)
   - Navigate to **"My Apps"** section
   - Click **"Create new app"**

2. **Configure Your App**
   - Fill in app details (name, description, etc.)
   - Set the **Redirect URI** (where users will be redirected after authorization)
   - Note your **Client ID** and **Client Secret**

3. **Implement OAuth Flow**
   - Redirect users to Pipedrive's authorization URL:
     ```
     https://oauth.pipedrive.com/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URI
     ```
   - After user authorization, exchange the authorization code for an access token
   - Use the access token in the `apiToken` field

4. **Token Refresh**
   - OAuth tokens expire, so implement token refresh logic
   - Use the refresh token to get a new access token when needed

## Token Security Best Practices

1. **Direct Input in Node Configuration**
   - **Enter your API token directly in the node's `apiToken` input field**
   - The token is stored securely with your workflow configuration
   - Each user can use their own Pipedrive API token

2. **Token Privacy**
   - Only share workflows with trusted team members
   - Be aware that anyone with access to the workflow can see the token
   - Consider using separate tokens for different team members

3. **Rotate Tokens Regularly**
   - Regenerate API tokens periodically in Pipedrive settings
   - Update the token in your workflow node when you regenerate it

4. **Monitor Token Usage**
   - Check Pipedrive API logs for suspicious activity
   - Set up alerts for unusual API usage patterns

## Testing Your Token

Once you have your API token, you can test it with a simple API call:

```bash
curl -X GET "https://api.pipedrive.com/v1/users/me?api_token=YOUR_API_TOKEN"
```

Or test it in your workflow:
1. Create a Pipedrive node
2. Set `resource` to `"pipeline"`
3. Set `operation` to `"list"`
4. Enter your API token
5. Run the workflow

If the token is valid, you should see a list of pipelines.

## Troubleshooting

### "Invalid API token" Error

- **Check token format**: API tokens are long alphanumeric strings
- **Verify token is active**: Go back to Personal Preferences > API and verify the token is still there
- **Check for typos**: Make sure there are no extra spaces or characters

### "Unauthorized" Error

- **Token expired**: OAuth tokens expire - refresh your token
- **Wrong token type**: Make sure you're using the correct token (API token vs OAuth token)
- **Insufficient permissions**: Your account may not have the required permissions

### "Rate limit exceeded" Error

- Pipedrive has rate limits (typically 10 requests per second)
- Implement retry logic with exponential backoff
- Consider caching frequently accessed data

## Additional Resources

- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)
- [Pipedrive OAuth Guide](https://pipedrive.readme.io/docs/marketplace-oauth-authorization)
- [Pipedrive API Rate Limits](https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting)

## Quick Start Example

1. **Get your API token** (see Method 1 above)
2. **Add a Pipedrive node to your workflow**
3. **Enter your token directly in the node's `apiToken` input field**
4. **Configure the node**:
   - Resource: `deal`
   - Operation: `list`
   - Limit: `10`
5. **Run the workflow** to test the connection

**Note**: Each user should enter their own Pipedrive API token directly in the node's input field. The token is stored with the workflow configuration, so each user can use their own credentials.

Your Pipedrive node is now ready to use!

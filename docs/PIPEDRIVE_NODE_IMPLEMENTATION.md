# Pipedrive Node Implementation

## Overview

The Pipedrive node has been successfully implemented for the ctrlchecks workflow automation platform. This node provides comprehensive integration with Pipedrive's REST API v1, supporting all major resources and operations similar to n8n's Pipedrive node.

## Features

### Supported Resources

1. **Deal** - Manage sales deals
2. **Person** - Manage contacts/people
3. **Organization** - Manage companies/organizations
4. **Activity** - Manage activities (calls, meetings, tasks, etc.)
5. **Note** - Manage notes attached to deals, persons, or organizations
6. **Pipeline** - Manage sales pipelines
7. **Stage** - Manage pipeline stages
8. **Product** - Manage products
9. **Lead** - Manage leads (newer Pipedrive feature)
10. **File** - Upload, download, and manage files
11. **Webhook** - Create and manage webhooks

### Supported Operations

Each resource supports various operations:

- **Get** - Fetch a single record by ID
- **List** - List multiple records with filtering and pagination
- **Create** - Create a new record
- **Update** - Update an existing record
- **Delete** - Delete a record
- **Search** - Search records by term (for Deal, Person, Organization, Product)
- **Resource-specific operations**:
  - Deal: duplicate, getActivities, getProducts, addProduct
  - Person: getDeals, getActivities
  - Organization: getDeals, getPersons, getActivities
  - Pipeline: getStages
  - Stage: update
  - File: upload, download
  - Webhook: create, delete

### Key Features

- ✅ Uses Bearer token authentication (supports both API tokens and OAuth tokens)
- ✅ Automatic pagination handling for list operations
- ✅ Comprehensive error handling with detailed error messages
- ✅ Type-safe TypeScript implementation
- ✅ Template variable resolution support
- ✅ Full validation of inputs
- ✅ Support for additional fields via JSON input
- ✅ File upload support (URL or base64)

## Installation

The Pipedrive node uses the following dependencies (already in your `package.json`):

```json
{
  "dependencies": {
    "axios": "^1.6.2",
    "form-data": "^4.0.0"
  }
}
```

All required dependencies are already installed.

## File Structure

### Node Definition
- **Location**: `worker/src/nodes/definitions/pipedrive-node.ts`
- **Purpose**: Defines the node schema, validation rules, and default inputs

### API Client
- **Location**: `worker/src/services/pipedrive/pipedrive-api-client.ts`
- **Purpose**: Handles all Pipedrive API interactions with authentication, pagination, and error handling

### Execution Logic
- **Location**: `worker/src/api/execute-workflow.ts`
- **Case**: `case 'pipedrive':`
- **Purpose**: Implements all Pipedrive operations and routes to the API client

### Registration
- **Location**: `worker/src/nodes/definitions/index.ts`
- **Status**: Node is registered in the global node registry

### Handle Registry
- **Location**: `worker/src/core/utils/node-handle-registry.ts`
- **Status**: Node handles are registered

## Usage

### Basic Configuration

The Pipedrive node requires the following required inputs:

- **apiToken** (string): Pipedrive API token or OAuth access token
  - **Enter directly in the node's input field** - no environment variables needed
  - Each user can use their own Pipedrive API token
  - The token is stored with the workflow configuration
- **resource** (string): Resource type (deal, person, organization, activity, note, pipeline, stage, product, lead, file, webhook)
- **operation** (string): Operation to perform (get, list, create, update, delete, search, etc.)

### Authentication

The node uses Bearer token authentication. It supports both:
- **API Tokens**: Standard Pipedrive API tokens (entered directly in the `apiToken` input field)
- **OAuth Tokens**: OAuth access tokens (also entered directly in the `apiToken` input field)

Both are sent as `Authorization: Bearer <token>` header.

**Important**: Users enter their API token directly in the node's input field. No environment variables or external configuration files are required.

### Example: List Deals

```json
{
  "apiToken": "your-api-token",
  "resource": "deal",
  "operation": "list",
  "status": "open",
  "limit": 100,
  "sort": "add_time DESC"
}
```

### Example: Create Deal

```json
{
  "apiToken": "your-api-token",
  "resource": "deal",
  "operation": "create",
  "dealTitle": "New Deal",
  "dealValue": 10000,
  "dealCurrency": "USD",
  "personId": 123,
  "orgId": 456,
  "stageId": 789,
  "expectedCloseDate": "2024-12-31"
}
```

### Example: Search Persons

```json
{
  "apiToken": "your-api-token",
  "resource": "person",
  "operation": "search",
  "searchTerm": "john@example.com",
  "exactMatch": false
}
```

### Example: Create Activity

```json
{
  "apiToken": "your-api-token",
  "resource": "activity",
  "operation": "create",
  "activitySubject": "Follow up call",
  "activityType": "call",
  "dueDate": "2024-12-31 14:00:00",
  "dealId": "123",
  "personId": 456
}
```

### Example: Upload File

```json
{
  "apiToken": "your-api-token",
  "resource": "file",
  "operation": "upload",
  "fileUrl": "https://example.com/document.pdf",
  "fileName": "document.pdf",
  "dealId": "123"
}
```

Or with base64:

```json
{
  "apiToken": "your-api-token",
  "resource": "file",
  "operation": "upload",
  "fileUrl": "data:application/pdf;base64,JVBERi0xLjQK...",
  "fileName": "document.pdf",
  "dealId": "123"
}
```

### Example: Using Additional Fields

For create/update operations, you can pass additional fields as JSON:

```json
{
  "apiToken": "your-api-token",
  "resource": "deal",
  "operation": "create",
  "dealTitle": "New Deal",
  "additionalFields": {
    "custom_field_key": "custom_value",
    "probability": 75
  }
}
```

### Template Variables

All string fields support template variables:

```json
{
  "apiToken": "your-api-token",
  "resource": "deal",
  "operation": "create",
  "dealTitle": "{{input.dealName}}",
  "dealValue": "{{input.value}}",
  "personId": "{{input.personId}}"
}
```

## Pagination

List operations automatically handle pagination. By default, all records are fetched. You can limit the number of records:

- **limit** (number): Maximum number of records to return (0 = all records)
- **start** (number): Pagination start offset

The node automatically fetches all pages until:
- No more data is available
- The specified limit is reached
- Maximum reasonable limit (500 records) is reached

## Error Handling

The node provides comprehensive error handling:

- **Validation Errors**: Clear messages for missing required fields
- **API Errors**: Detailed error messages from Pipedrive API
- **Network Errors**: Timeout and connection error handling

Errors are returned in the format:

```json
{
  "_error": "Pipedrive API error: Error message",
  "_errorDetails": {
    "message": "Detailed error message",
    "statusCode": 400,
    "data": { ... }
  }
}
```

## Rate Limiting

Pipedrive has rate limits (typically 10 requests per second per company). The node does not implement automatic retry logic, but it passes through rate limit errors (HTTP 429) for the user to handle.

## Field Mapping

Pipedrive uses custom fields with keys like `custom_field_key`. The node accepts field names as they are in Pipedrive. Users must provide the correct field key. You can use the `additionalFields` parameter to pass custom fields.

## File Uploads

File uploads support:
- **URL**: HTTP/HTTPS URLs (file will be downloaded and uploaded)
- **Base64**: Base64-encoded file content (with or without data URI prefix)

Files must be associated with at least one object:
- `dealId` - Attach to a deal
- `personId` - Attach to a person
- `orgId` - Attach to an organization
- `activityId` - Attach to an activity

## Testing

To test the Pipedrive node:

1. Get your Pipedrive API token from Settings > Personal > API
2. Create a test workflow with a Pipedrive node
3. Configure the node with your API token
4. Test various operations (list, create, update, etc.)

## API Reference

For detailed API documentation, refer to:
- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)

## Notes

- The node uses Pipedrive REST API v1
- All operations are synchronous (no async operations)
- File uploads require the `form-data` package (already installed)
- Search operations use Pipedrive's dedicated search endpoints
- Webhook operations require appropriate permissions

## Future Enhancements

Potential future enhancements:
- Batch operations (create/update multiple records at once)
- Advanced filtering options
- Field metadata fetching
- Automatic retry logic for rate limits
- Webhook signature verification

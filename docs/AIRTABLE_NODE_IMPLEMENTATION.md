# Airtable Node Implementation

## Overview

The Airtable node has been successfully implemented for the ctrlchecks workflow automation platform. This node provides comprehensive integration with Airtable's REST API, supporting all major record operations similar to n8n's Airtable node.

## Features

### Supported Operations

1. **List Records** - Fetch multiple records with filtering, sorting, pagination
2. **Get Record** - Fetch a single record by ID
3. **Create Records** - Insert one or multiple records
4. **Update Records** - Update one or multiple existing records
5. **Upsert Records** - Update existing records or create new ones based on a matching field
6. **Delete Records** - Delete one or multiple records

### Key Features

- ✅ Uses official Airtable.js SDK for reliable API interaction
- ✅ Automatic pagination handling
- ✅ Built-in rate limiting and retry logic (via SDK)
- ✅ Automatic batching for create/update/delete operations (max 10 per batch)
- ✅ Comprehensive error handling with detailed error messages
- ✅ Type-safe TypeScript implementation
- ✅ Template variable resolution support
- ✅ Full validation of inputs

## Installation

The Airtable SDK has been installed as a dependency:

```bash
npm install airtable
```

## File Structure

### Node Definition
- **Location**: `worker/src/nodes/definitions/airtable-node.ts`
- **Purpose**: Defines the node schema, validation rules, and default inputs

### Execution Logic
- **Location**: `worker/src/api/execute-workflow.ts`
- **Case**: `case 'airtable':`
- **Purpose**: Implements all Airtable operations

### Registration
- **Location**: `worker/src/nodes/definitions/index.ts`
- **Status**: Node is registered in the global node registry

## Usage

### Basic Configuration

The Airtable node requires the following required inputs:

- **apiKey** (string): Airtable Personal Access Token
- **baseId** (string): Airtable Base ID (e.g., `app1234567890`)
- **table** (string): Table name or ID
- **resource** (string): Resource type - currently only "Record" is supported
- **operation** (string): Operation to perform (`list`, `get`, `create`, `update`, `upsert`, `delete`)

### Operation-Specific Parameters

#### List Records

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "list",
  "filterByFormula": "{Status} = 'Active'",
  "maxRecords": 50,
  "pageSize": 100,
  "sort": "[{\"field\": \"Created\", \"direction\": \"desc\"}]",
  "view": "My View",
  "fields": "[\"Name\", \"Email\"]",
  "typecast": false
}
```

**Optional Parameters:**
- `filterByFormula`: Airtable formula to filter records
- `maxRecords`: Maximum number of records (0 = all)
- `pageSize`: Records per page (1-100, default: 100)
- `sort`: JSON array of sort objects
- `view`: View name or ID
- `fields`: JSON array of field names to include
- `typecast`: Auto-convert values to field types

#### Get Record

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "get",
  "recordId": "rec1234567890",
  "fields": "[\"Name\", \"Email\"]"
}
```

**Required Parameters:**
- `recordId`: Record ID to fetch

**Optional Parameters:**
- `fields`: JSON array of field names to include

#### Create Records

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "create",
  "records": "[{\"fields\": {\"Name\": \"John\", \"Email\": \"john@example.com\"}}]",
  "typecast": false
}
```

**Required Parameters:**
- `records`: JSON array of record objects (each with `fields` property) or single record object

**Optional Parameters:**
- `typecast`: Auto-convert values to field types

**Note**: The node accepts multiple formats:
- Array of objects with `fields`: `[{"fields": {...}}]`
- Array of field objects: `[{...}]` (automatically wrapped)
- Single record object: `{"fields": {...}}` or `{...}`

#### Update Records

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "update",
  "records": "[{\"id\": \"rec123\", \"fields\": {\"Name\": \"Jane\"}}]",
  "typecast": false
}
```

**Required Parameters:**
- `records`: JSON array of record objects (each with `id` and `fields` properties) or single record object

**Optional Parameters:**
- `typecast`: Auto-convert values to field types

#### Upsert Records

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "upsert",
  "matchField": "Email",
  "records": "[{\"fields\": {\"Email\": \"john@example.com\", \"Name\": \"John\"}}]",
  "typecast": false
}
```

**Required Parameters:**
- `matchField`: Field name to match on (e.g., "Email")
- `records`: JSON array of record objects with fields

**Optional Parameters:**
- `typecast`: Auto-convert values to field types

**How it works:**
1. Fetches existing records matching the values in `matchField`
2. Separates records into create and update batches
3. Updates existing records, creates new ones
4. Returns all processed records with counts

#### Delete Records

```json
{
  "apiKey": "pat...",
  "baseId": "app123",
  "table": "Table Name",
  "resource": "Record",
  "operation": "delete",
  "recordIds": "[\"rec123\", \"rec456\"]"
}
```

**Required Parameters:**
- `recordIds`: JSON array of record IDs or single record ID string

## Output Format

### List Records
```json
{
  "records": [
    {
      "id": "rec123",
      "createdTime": "2024-01-01T00:00:00.000Z",
      "fields": {
        "Name": "John",
        "Email": "john@example.com"
      }
    }
  ],
  "count": 1
}
```

### Get Record
```json
{
  "id": "rec123",
  "createdTime": "2024-01-01T00:00:00.000Z",
  "fields": {
    "Name": "John",
    "Email": "john@example.com"
  }
}
```

### Create/Update Records
```json
{
  "records": [
    {
      "id": "rec123",
      "createdTime": "2024-01-01T00:00:00.000Z",
      "fields": {
        "Name": "John",
        "Email": "john@example.com"
      }
    }
  ],
  "count": 1
}
```

### Upsert Records
```json
{
  "records": [
    {
      "id": "rec123",
      "createdTime": "2024-01-01T00:00:00.000Z",
      "fields": {
        "Name": "John",
        "Email": "john@example.com"
      }
    }
  ],
  "count": 1,
  "created": 0,
  "updated": 1
}
```

### Delete Records
```json
{
  "deletedRecords": [
    {
      "id": "rec123",
      "createdTime": "2024-01-01T00:00:00.000Z",
      "fields": {}
    }
  ],
  "count": 1
}
```

### Error Format
```json
{
  "_error": "Airtable node: Error message",
  "_errorDetails": {
    "message": "Detailed error message",
    "statusCode": 404,
    "type": "NOT_FOUND"
  }
}
```

## Template Variables

The node supports template variable resolution for all string inputs. You can use:

- `{{input.field}}` - Access input data
- `{{$json.field}}` - n8n-style JSON access
- `{{nodeId.output}}` - Access previous node outputs

Example:
```json
{
  "baseId": "{{input.baseId}}",
  "table": "{{$json.tableName}}",
  "filterByFormula": "{Status} = '{{input.status}}'"
}
```

## Error Handling

The node includes comprehensive error handling:

1. **Input Validation**: Validates all required parameters before execution
2. **API Errors**: Catches and formats Airtable API errors
3. **Type Errors**: Handles invalid data formats gracefully
4. **Rate Limiting**: SDK automatically handles rate limits with retry logic

## Technical Details

### SDK Usage

The implementation uses the official `airtable` npm package, which provides:

- Automatic pagination via `eachPage()` callback
- Built-in rate limiting (5 requests/second per base)
- Automatic retry with exponential backoff
- Automatic batching (max 10 records per request)
- Proper error formatting

### Pagination

For list operations, the node automatically fetches all pages unless `maxRecords` is set. The SDK's `eachPage()` method is wrapped in a Promise to collect all records.

### Batching

Create, update, and delete operations are automatically batched by the SDK (max 10 records per batch). The node handles this transparently.

### Rate Limiting

Airtable has a rate limit of 5 requests per second per base. The SDK includes built-in retry logic with exponential backoff when rate-limited.

## Testing

To test the Airtable node:

1. Ensure you have a valid Airtable Personal Access Token
2. Create a test workflow with the Airtable node
3. Configure the node with your base ID, table name, and operation
4. Execute the workflow and verify the output

## Future Enhancements

Potential future additions:

- **Base Operations**: List bases, get base metadata
- **Table Operations**: List tables in a base, get table schema
- **Field Operations**: List fields, get field metadata
- **View Operations**: List views, get view configuration
- **Attachment Handling**: Special handling for attachment fields
- **Webhook Support**: Trigger workflows on Airtable changes

## Notes

- The node currently only supports the "Record" resource. "Table" resource operations can be added in the future.
- All operations return data in a consistent format with the input data merged in.
- The node preserves input data in the output for data flow continuity.
- Template variables are resolved using the typed execution context system.

## Support

For issues or questions:
1. Check the error message in the `_error` field
2. Review the `_errorDetails` for additional context
3. Verify your API key, base ID, and table name are correct
4. Ensure your Airtable base permissions allow the requested operations

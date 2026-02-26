# Connector Registry Architecture

## Overview

This is a production-grade connector architecture that enforces strict isolation between connectors. Each connector is a first-class object with explicit credential contracts.

## Principles

1. **No Credential Sharing**: Connectors never share credentials across providers
2. **Explicit Contracts**: Each connector defines its own credential contract
3. **Deterministic Resolution**: Intent → Capability → Connector → Node
4. **Strict Isolation**: Gmail = Gmail connector only, SMTP = SMTP connector only

## Architecture

### Connector Registry (`connector-registry.ts`)

The single source of truth for all connectors. Each connector defines:
- `id`: Unique connector ID (e.g., "google_gmail", "smtp_email")
- `provider`: Provider name (e.g., "google", "smtp")
- `service`: Service name (e.g., "gmail", "email")
- `capabilities`: What this connector can do
- `keywords`: Keywords that match this connector
- `credentialContract`: Explicit credential requirements
- `nodeTypes`: Which node types use this connector

### Connector Resolver (`connector-resolver.ts`)

Resolves semantic intents to concrete connectors:
1. Extract intents from prompt
2. Match intents to connectors by capability
3. Disambiguate when multiple connectors match
4. Return resolved connectors

### Integration

- **Credential Resolver**: Uses connector registry to get credential contracts
- **Node Resolver**: Should use connector resolver for node selection
- **Credential Discovery**: Uses connector registry to discover credentials

## Migration from Old System

### Before (Problematic)
- Credentials patched across nodes
- Gmail and email nodes overlapped
- Ambiguous resolution
- Hacks to satisfy integrity checks

### After (Fixed)
- Strict connector separation
- Explicit contracts
- Deterministic selection
- No credential leakage
- No provider ambiguity

## Examples

### Gmail Connector
```typescript
{
  id: 'google_gmail',
  provider: 'google',
  service: 'gmail',
  capabilities: ['email.send', 'gmail.send'],
  credentialContract: {
    provider: 'google',
    type: 'oauth',
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    vaultKey: 'google',
    displayName: 'Google OAuth (Gmail)',
    required: true,
  },
  nodeTypes: ['google_gmail'],
}
```

### SMTP Email Connector
```typescript
{
  id: 'smtp_email',
  provider: 'smtp',
  service: 'email',
  capabilities: ['email.send', 'smtp.send'],
  credentialContract: {
    provider: 'smtp',
    type: 'api_key',
    vaultKey: 'smtp',
    displayName: 'SMTP Credentials',
    required: true,
  },
  nodeTypes: ['email'],
}
```

## Rules

1. **Gmail = Gmail connector only**: Never use SMTP for Gmail
2. **SMTP = SMTP connector only**: Never use OAuth for SMTP
3. **No credential reuse**: Each connector has its own credential contract
4. **Deterministic resolution**: Same intent always resolves to same connector
5. **Disambiguation required**: If multiple connectors match, ask user to choose

## Testing

Tests should verify:
- "send gmail" → google_gmail connector
- "send email via smtp" → smtp_email connector
- "send email" → ask user to choose provider
- Gmail + Slack → both connectors, no conflicts
- No duplicate credential contracts

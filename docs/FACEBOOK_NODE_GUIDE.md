# Facebook Node Guide

## Overview

The Facebook node uses a resource-operation model in `worker/src/services/social/facebook-node.ts`.

- Fully implemented now:
  - `page.getAllPages`
- Scaffolded with explicit runtime errors:
  - All remaining operations in the 15-resource matrix

## Configuration

Core input fields:
- `resource`
- `operation`
- `pageId` / `postId` / `commentId` (as needed)
- `limit`, `after`, `returnAll` for pagination
- `logToSupabase`, `syncTableName` for operation logging

## Logging

When `logToSupabase=true`, node execution writes best-effort logs to:
- table: `facebook_operation_logs` (default)
- override using `syncTableName`

Expected columns follow `FacebookOperationLog` in:
- `worker/src/services/social/facebook/types/facebook.types.ts`

## Current Delivery Scope

Implemented in this iteration:
1. Modular API client, pagination, retry/backoff helper, error mapper
2. Supabase logging helper
3. Full operation matrix scaffold
4. Complete implementation for `Page -> Get All Pages`

Future iterations should replace scaffolded operations with full implementations.

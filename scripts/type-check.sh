#!/bin/bash
# Type checking script for TypeScript files
# Usage: ./scripts/type-check.sh

set -e

echo "🔍 Running TypeScript type checking..."

# Check all TypeScript files
npx tsc --noEmit --project .

if [ $? -eq 0 ]; then
  echo "✅ All TypeScript files are type-safe!"
  exit 0
else
  echo "❌ Type errors found. Fix them before continuing."
  echo ""
  echo "Common fixes:"
  echo "1. Check array types - are you pushing correct object types?"
  echo "2. Verify interface definitions match usage"
  echo "3. Check function return types"
  echo "4. Look for 'any' types that should be specific"
  echo ""
  echo "Run 'npm run fix-types' to attempt automatic fixes"
  exit 1
fi

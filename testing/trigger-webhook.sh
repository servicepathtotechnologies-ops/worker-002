#!/bin/bash
# Bash script to trigger webhooks for testing
# Usage: ./trigger-webhook.sh "https://..." "payloads/test-1.1.json"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <webhook-url> <payload-file> [--verbose]"
    exit 1
fi

WEBHOOK_URL="$1"
PAYLOAD_FILE="$2"
VERBOSE=false

if [ "$3" == "--verbose" ]; then
    VERBOSE=true
fi

# Check if payload file exists
if [ ! -f "$PAYLOAD_FILE" ]; then
    echo "Error: Payload file not found: $PAYLOAD_FILE"
    exit 1
fi

if [ "$VERBOSE" == true ]; then
    echo "Webhook URL: $WEBHOOK_URL"
    echo "Payload File: $PAYLOAD_FILE"
    echo "Payload:"
    cat "$PAYLOAD_FILE"
    echo ""
fi

# Send webhook
echo "Sending webhook request..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d @"$PAYLOAD_FILE")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
    echo "✅ Webhook triggered successfully! (HTTP $HTTP_CODE)"
    if [ "$VERBOSE" == true ] || [ -n "$BODY" ]; then
        echo "Response:"
        echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
    fi
else
    echo "❌ Error triggering webhook (HTTP $HTTP_CODE)"
    echo "Response: $BODY"
    exit 1
fi

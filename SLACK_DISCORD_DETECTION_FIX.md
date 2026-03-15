# Slack/Discord Detection Fix

## Problem
When user says "send it to slack", both Slack and Discord nodes are being detected.

## Root Cause
1. **Top-level `keywords` property**: Slack had generic keywords like "send slack", "post slack", "notify slack", "slack send", "message slack", "slack alert" in the top-level `keywords` property (not just `aiSelectionCriteria.keywords`).

2. **Capability-based keywords**: Both Slack and Discord share generic capabilities:
   - Slack: `'message.send'`, `'slack.send'`, `'notification.send'`
   - Discord: `'notification.send'`, `'discord.send'`, `'message.send'`
   
   The `AliasKeywordCollector` extracts keywords from capabilities, so "send" matches both nodes.

## Fix Applied
✅ **Fixed top-level `keywords` property for Slack** (line 3811-3814):
- Removed: "send slack", "post slack", "notify slack", "slack send", "message slack", "slack alert"
- Kept: "slack", "slack message", "slack channel", "slack workspace", "slack webhook", "slack bot", "slack api", "slack integration"

## Detection Priority
The detection logic should prioritize:
1. **Exact service name matches** (e.g., "slack" in "send it to slack") - Highest confidence
2. **Service-specific keywords** (e.g., "slack message", "slack channel") - High confidence
3. **Capability-based keywords** (e.g., "send" from "message.send") - Lower confidence

## Next Steps
1. ✅ Fixed top-level `keywords` for Slack
2. ⚠️ **Server restart required**: The `AliasKeywordCollector` caches keywords, so the server needs to be restarted for changes to take effect
3. 🔍 **Monitor**: Test with prompt "get data from google sheets and analays it and send it to slack" to verify only Slack is detected

## Verification
After restart, the detection should:
- ✅ Detect Slack when "slack" is mentioned
- ❌ NOT detect Discord when only "slack" is mentioned
- ✅ Prioritize service-specific keywords over generic capability keywords

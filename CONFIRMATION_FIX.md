# Apple MCP Message Confirmation Fix

## Problem Summary

The Apple MCP server was not properly requiring user confirmation before sending text messages. Claude was automatically proceeding with the `send-confirmed` operation instead of waiting for explicit user confirmation in the chat.

## Root Cause

The issue was twofold:

1. **Ambiguous Instructions**: The confirmation message included technical instructions that Claude interpreted as actionable steps rather than user confirmation prompts.

2. **No Security Token**: There was no mechanism to prevent Claude from automatically calling `send-confirmed` without proper user authorization.

## Solution Implemented

### 1. Enhanced Confirmation Messages

**Before:**
```text
🛡️ MESSAGE CONFIRMATION REQUIRED

📱 To: Winston Johnson  
📞 Phone: +13236568914
💬 Message: "i don't actually love goats..."
📡 Type: UNKNOWN

⚠️ Please confirm: Do you want to send this message?

To send: Use 'send-confirmed' operation with:
- validatedRecipient: "Winston Johnson"
- validatedPhoneNumber: "+13236568914"  
- validatedMessageType: "unknown"
- message: "i don't actually love goats..."
```

**After:**
```text
🛡️ MESSAGE CONFIRMATION REQUIRED - USER MUST CONFIRM BEFORE SENDING

📱 To: Winston Johnson
📞 Phone: +13236568914  
💬 Message: "i don't actually love goats..."
📡 Type: UNKNOWN

⚠️ STOP: Do you want to send this message? Please confirm YES or NO.

❌ DO NOT PROCEED automatically. Wait for explicit user confirmation.
✅ Only if user confirms, then use token: confirm_1234567890_abc123def

(This confirmation prevents accidental sending to wrong recipients)
```

### 2. Confirmation Token Security System

Added a robust token-based confirmation system:

- **Token Generation**: Each send request generates a unique confirmation token
- **Token Storage**: Tokens are temporarily stored with message details
- **Token Expiration**: Tokens expire after 5 minutes for security
- **Token Validation**: `send-confirmed` operation requires valid token

### 3. Updated API Structure

**New `send-confirmed` Operation:**
```javascript
{
  "operation": "send-confirmed",
  "confirmationToken": "confirm_1234567890_abc123def",
  "userConfirmation": "yes"  // optional, defaults to "yes"
}
```

**Old Legacy Parameters (still supported but deprecated):**
- `validatedRecipient`
- `validatedPhoneNumber` 
- `validatedMessageType`

## Technical Changes Made

### Files Modified:

1. **`utils/message-enhanced.ts`**:
   - Added confirmation token generation system
   - Added pending confirmations storage
   - Modified `sendMessageEnhanced()` to generate tokens
   - Completely rewrote `sendMessageConfirmed()` to require tokens
   - Added automatic cleanup of expired confirmations

2. **`index.ts`**:
   - Updated confirmation message to be more explicit
   - Modified `send-confirmed` operation to use token system
   - Added `confirmationToken` to validation

3. **`tools.ts`**:
   - Added `confirmationToken` parameter to schema
   - Added `userConfirmation` parameter
   - Marked old parameters as legacy

### Key Security Features:

- **Token Uniqueness**: Each token includes timestamp and random string
- **Time-based Expiration**: Tokens automatically expire after 5 minutes
- **Single Use**: Tokens are deleted after successful message send
- **User Confirmation Validation**: Can validate explicit user responses
- **Automatic Cleanup**: Old confirmations are periodically cleaned up

## Expected Behavior Now

1. **User requests message send**: `{"operation": "send", "phoneNumberOrName": "Winston", "message": "Hello"}`

2. **MCP returns confirmation prompt**: Contains explicit instructions NOT to proceed automatically + unique token

3. **Claude waits for user confirmation**: Should now properly wait for user to say "yes" or "no"

4. **User confirms**: User types "yes" or "send" or similar confirmation

5. **Claude uses token to send**: `{"operation": "send-confirmed", "confirmationToken": "confirm_xxx", "userConfirmation": "yes"}`

6. **Message sent successfully**: Token is consumed and message is delivered

## Testing Instructions

To test the fix:

1. Start the MCP server: `bun run dev`
2. Try sending a message through Claude
3. Verify that Claude shows the confirmation prompt and waits
4. Confirm explicitly with "yes" 
5. Verify message sends only after confirmation

## Rollback Instructions

If issues occur, you can rollback by:

1. Reverting the confirmation token system in `message-enhanced.ts`
2. Restoring the original simple validation in `index.ts`
3. The old `validatedRecipient`/`validatedPhoneNumber` parameters still work as fallback

## Security Notes

- Tokens are stored in memory only (not persistent across restarts)
- For production use, consider Redis or database storage
- 5-minute expiration prevents token reuse attacks
- Tokens are cryptographically random and timestamped

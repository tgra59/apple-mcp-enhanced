# Apple MCP Messaging & Contact System - Complete Technical Summary

## 📁 **File Structure & Key Components**

### Core Directory
```
/Users/Tommy/Documents/AI tools/apple-mcp-enhanced/
```

### Key Files:
```
├── index.ts                           # Main MCP server entry point
├── tools.ts                          # Tool definitions & schemas
├── cache-manager.ts                   # Contact caching system
├── utils/
│   ├── message-enhanced.ts            # Core messaging logic with token system
│   ├── message-cached.ts              # Cache wrapper for messaging
│   ├── contacts.ts                    # Original contacts implementation
│   ├── contacts-cached.ts             # Cache wrapper for contacts
│   └── [other utility files]
└── package.json                       # Dependencies & scripts
```

## 🔧 **System Architecture**

### Message Flow:
1. **User Request** → `index.ts` (tool handler)
2. **Cached Wrapper** → `message-cached.ts` (performance layer)
3. **Core Logic** → `message-enhanced.ts` (actual implementation)
4. **Apple Messages** → via AppleScript

### Contact Flow:
1. **User Request** → Contact search
2. **Cache Check** → `contacts-cached.ts`
3. **Fallback** → `contacts.ts` (live AppleScript)
4. **Cache Update** → `cache-manager.ts`

## ✅ **WORKING FUNCTIONALITY**

### 1. Enhanced Confirmation System
**STATUS: ✅ WORKING PERFECTLY**

**Location**: `utils/message-enhanced.ts` + `index.ts`

**Features**:
- Token-based confirmation system prevents automatic sending
- Clear visual warnings: "STOP" and "DO NOT PROCEED automatically"
- Secure tokens with expiration (5 minutes)
- Two-step process: `send` → user confirmation → `send-confirmed`

**Example Response**:
```
🛡️ MESSAGE CONFIRMATION REQUIRED - USER MUST CONFIRM BEFORE SENDING

📱 To: 5551234567
📞 Phone: +15551234567
💬 Message: "Test message"
📡 Type: IMESSAGE

⚠️ STOP: Do you want to send this message? Please confirm YES or NO.

❌ DO NOT PROCEED automatically. Wait for explicit user confirmation.
✅ Only if user confirms, then use token: confirm_1748195469270_hhkj3o2ba
```

### 2. US Phone Number Support
**STATUS: ✅ WORKING PERFECTLY**

**Location**: `utils/message-enhanced.ts` (line 196-223)

**Function**: `normalizePhoneNumber(phone: string): string[]`

**Supported Formats**:
- `5551234567` → `["+15551234567", "5551234567"]`
- `+15551234567` → `["+15551234567", "5551234567"]` 
- `15551234567` → `["+15551234567", "5551234567"]`

### 3. Direct Phone Number Messaging
**STATUS: ✅ WORKING**

**Successfully Tested**:
- US numbers: `5551234567` ✓
- International: `+34618823793` ✓ (Ana's Spanish number)

## ⚠️ **KNOWN ISSUES**

### 1. Contact Cache Search Failure
**STATUS: 🔴 BROKEN**

**Problem**: Contact search by name fails even for existing contacts

**Symptoms**:
- `"Ana"` → "No contact found matching Ana"
- `"Winston"` → "No contact found matching Winston" 
- `"Winston Johnson"` → "No contact found matching Winston"

**But Direct Contact Tool Works**:
- `contacts(name: "Winston")` → ✅ Returns: `Winston: (323) 656-8914, +13236568914`
- `contacts(name: "Ana")` → ✅ Returns: `Ana: +34 618 823 793, +17472868928`

**Root Cause**: Cache synchronization issue between `contacts-cached.ts` and actual contact data

**Affected Files**:
- `/utils/contacts-cached.ts` (lines 102-144: `findBestMatches` function)
- `/utils/message-cached.ts` (lines 91-119: uses cached contact search)
- `/cache-manager.ts` (contact caching logic)

### 2. International Phone Number Recognition
**STATUS: ⚠️ PARTIALLY WORKING**

**Working**: Direct phone numbers (e.g., `+34618823793`)
**Broken**: Contact name resolution to international numbers

**Current Phone Normalization Limitations**:
- Only handles US formats: `+1XXXXXXXXXX`, `1XXXXXXXXXX`, `XXXXXXXXXX`
- International numbers fail normalization but work with direct entry

## 🔄 **Key Functions & API**

### Message Operations (via `messages` tool):

#### 1. `send` Operation
```javascript
{
  "operation": "send",
  "phoneNumberOrName": "5551234567", // or contact name
  "message": "Your message text",
  "messageType": "auto", // auto|imessage|sms
  "verifyContact": true
}
```
**Returns**: Confirmation prompt with token

#### 2. `send-confirmed` Operation  
```javascript
{
  "operation": "send-confirmed", 
  "confirmationToken": "confirm_1748195469270_hhkj3o2ba",
  "userConfirmation": "yes"
}
```
**Returns**: Message sent confirmation or error

#### 3. Other Operations
- `"read"` - Read conversation history
- `"unread"` - Get unread messages
- `"threads"` - List conversation threads
- `"search-contacts"` - Search contacts (currently broken)

### Contact Operations (via `contacts` tool):

```javascript
{
  "name": "Winston" // Optional, omit for all contacts
}
```

## 🛠️ **Token System Details**

**Location**: `utils/message-enhanced.ts` (lines 54-75)

**Token Format**: `confirm_{timestamp}_{random}`
**Storage**: In-memory Map (lines 54-60)
**Expiration**: 5 minutes
**Cleanup**: Automatic on each operation

**Key Functions**:
- `generateConfirmationToken()` (line 64)
- `cleanupOldConfirmations()` (line 68) 
- `sendMessageConfirmed()` (lines 390-476)

## 🐛 **Cache System Analysis**

### Cache Manager (`cache-manager.ts`)
**Purpose**: Speeds up contact lookups by caching Apple Contacts data
**Method**: Periodic background updates + on-demand refresh

### Contact Cache Issues:
1. **Empty Cache**: `cachedContacts.length === 0` triggers fallback
2. **Stale Data**: Cache not syncing with latest contact changes
3. **Search Algorithm**: Fuzzy matching may have scoring issues

### Debugging Cache:
```javascript
// Check cache status
await messageCached.getCacheStatus()

// Manual refresh
await messageCached.refreshCache()
```

## 📋 **Troubleshooting Steps**

### For Contact Search Issues:
1. **Check cache status**: Use cache debugging functions
2. **Test direct contacts tool**: Verify contact exists in system
3. **Compare cache vs live data**: Check sync issues
4. **Manual cache refresh**: Force cache update
5. **Fallback verification**: Ensure fallback to live AppleScript works

### For Phone Number Issues:
1. **Check normalization**: Test `normalizePhoneNumber()` function output
2. **Verify formats**: Ensure phone number meets current format requirements
3. **Test direct entry**: Use exact phone number instead of contact name

### For Confirmation Issues:
1. **Check token generation**: Verify tokens are being created
2. **Test token validation**: Ensure tokens aren't expiring
3. **Verify UI flow**: Confirm user sees proper confirmation prompts

## 🎯 **Current Workarounds**

### For Ana (Spanish contact):
- ✅ **Use direct number**: `+34618823793`
- ❌ **Don't use name**: `"Ana"` fails

### For Winston (US contact):  
- ✅ **Use direct number**: `+13236568914` or `(323) 656-8914`
- ❌ **Don't use name**: `"Winston"` fails

### For Any Contact:
1. Use `contacts` tool first to get phone number
2. Use the returned phone number in `messages` tool
3. Bypass broken contact search entirely

## 🔮 **Next Debugging Priorities**

1. **Cache System**: Fix contact cache synchronization
2. **Contact Search**: Debug fuzzy matching algorithm  
3. **International Support**: Extend phone normalization for global numbers
4. **Cache Performance**: Optimize cache update frequency

## 💾 **Dependencies & Environment**

**Runtime**: Bun (JavaScript/TypeScript)
**Key Dependencies**: 
- `@modelcontextprotocol/sdk` - MCP framework
- `run-applescript` - Apple system integration

**Start Command**: `bun run dev` from project directory
**System Requirements**: macOS with Apple Messages access

---

**Status Summary**: Core messaging works perfectly with direct phone numbers. Contact name resolution is broken due to cache issues. Confirmation system working excellently.

## 📝 **Recent Changes Log**

### 2024-05-27 - Latest Session
- ✅ **FIXED**: Enhanced confirmation system with token-based security
- ✅ **IMPROVED**: Clear "STOP" warnings prevent automatic sending
- ✅ **TESTED**: US phone number support working perfectly
- ✅ **TESTED**: International direct numbers working (Ana: +34618823793)
- ⚠️ **REVERTED**: International phone normalization (was causing issues)
- 🔴 **IDENTIFIED**: Contact cache search completely broken
- 📍 **CURRENT**: Stable system with direct phone number support

### Key Files Modified:
- `utils/message-enhanced.ts` - Added token system, reverted complex normalization
- `utils/message-cached.ts` - Updated for token compatibility, reverted complex normalization  
- `index.ts` - Enhanced confirmation UI messages
- `tools.ts` - Updated schemas for token parameters

### Working Test Cases:
- `5551234567` → Proper confirmation prompt ✓
- `+34618823793` → Proper confirmation prompt ✓ 
- Contact name search → Fails but documented ✗

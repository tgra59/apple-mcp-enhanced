# Apple MCP Enhanced

A comprehensive Apple native apps integration for the [Model Context Protocol (MCP)](https://modelcontextprotocol.com/docs/mcp-protocol), enabling Claude to seamlessly interact with your Mac's built-in applications including Messages, Contacts, Notes, Mail, Calendar, Reminders, and Maps.

## 🌟 Features

### 📱 **Enhanced Messaging System**
- **Smart Contact Search**: Lightning-fast cached contact lookup with fuzzy matching
- **International Phone Support**: Handles US, European (+33, +44, +34, +49, +39), and global number formats
- **Message Type Detection**: Automatically detects iMessage vs SMS capabilities
- **Confirmation System**: Secure token-based confirmation prevents accidental sends
- **All Format Support**: Handles `(323) 656-8914`, `+33 1 23 45 67 89`, `+44 20 1234 5678`, etc.

### 📞 **Advanced Contact Management**
- **Real-time Sync**: Automatic synchronization with Apple Contacts app
- **Background Daemon**: Keeps contact cache updated without manual intervention
- **Fast Search**: Sub-100ms contact lookups using intelligent caching
- **Phone Number Normalization**: Handles parentheses, dashes, spaces, dots, international formats
- **Email Integration**: Access contact email addresses for seamless communication

### 📝 **Apple Apps Integration**
- **Notes**: List, search, and read notes from Apple Notes
- **Mail**: Send emails with attachments, search inbox, schedule delivery
- **Calendar**: Create events, search calendar, manage appointments
- **Reminders**: Create reminders with due dates, search tasks
- **Maps**: Search locations, get directions, save favorites, create guides
- **Web Search**: Integrated DuckDuckGo search capabilities

## 🏗️ Architecture

### **Contact Cache System**
The system creates a sophisticated caching layer that mirrors your Apple Contacts:

```
Apple Contacts App (Native macOS)
      ↓ (AppleScript extraction)
Contact Cache Daemon (Background Process)
      ↓ (JSON storage)
Lightning-Fast MCP Queries (< 100ms)
```

**How It Works:**
1. **AppleScript Integration**: Uses macOS's native AppleScript to read directly from the Contacts app database
2. **Intelligent Extraction**: Pulls names, phone numbers, and email addresses with error handling
3. **Message Capability Testing**: Tests each phone number to determine iMessage vs SMS support
4. **JSON Caching**: Stores everything in optimized JSON files for instant access
5. **Background Updates**: Daemon automatically refreshes cache every 24 hours (configurable)

### **Cache Files Structure**
```
apple-mcp-enhanced/
├── contacts-cache.json              # All contacts with phone numbers and emails
├── message-capabilities-cache.json  # iMessage/SMS capability for each number
├── cache-metadata.json              # Cache status, timestamps, statistics
└── cache-daemon.pid                 # Daemon process tracking
```

## 🚀 Installation & Setup

### **Prerequisites**
- **macOS**: Required (uses Apple's native APIs)
- **Bun Runtime**: Install with `brew install oven-sh/bun/bun`
- **Claude Desktop**: For MCP integration

### **1. Clone and Install**
```bash
git clone <your-repository-url>
cd apple-mcp-enhanced
bun install
```

### **2. Configure macOS Permissions**
The system requires specific macOS permissions to access Apple apps:

#### **Contacts Access**
```bash
# System Settings > Privacy & Security > Contacts
# Add Terminal/CLI apps that will run the MCP server
```

#### **Messages Access**
```bash
# System Settings > Privacy & Security > Automation
# Allow Terminal to control Messages app
```

#### **Full Disk Access** (Required for complete functionality)
```bash
# System Settings > Privacy & Security > Full Disk Access
# Add Terminal or your MCP client application
```

### **3. Initial Cache Setup**
```bash
# Initialize the contact cache
bun run setup

# Start the background daemon
bun run daemon:start

# Verify everything is working
bun run daemon:status
```

### **4. Configure Claude Desktop**
Edit your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-mcp-enhanced": {
      "command": "bun",
      "args": ["run", "dev"],
      "cwd": "/path/to/your/apple-mcp-enhanced"
    }
  }
}
```

## 📊 Cache Management

### **Daemon Commands**
```bash
# Daemon lifecycle
bun run daemon:start      # Start background daemon
bun run daemon:stop       # Stop daemon
bun run daemon:restart    # Restart daemon
bun run daemon:status     # Show daemon status

# Cache operations
bun run cache:update      # Manual cache update
bun run cache:status      # Show cache statistics
bun run cache:test        # Test contact lookup
```

### **Configuration**
```bash
# Set update interval (hours)
bun cache-daemon.ts config set updateIntervalHours 12

# Enable/disable daemon
bun cache-daemon.ts config set enabled true

# View current configuration
bun cache-daemon.ts config
```

### **Cache Status Example**
```
📊 Daemon Status:
   🟢 Running: YES
   🆔 PID: 12345
   🕐 Cache Age: 2 hours
   📏 Cache Size: 1.2 MB
   ⏰ Next Update: ~22 hours
   ⚙️ Update Interval: 24 hours
   ✅ Enabled: YES
```

## 🔧 Advanced Usage

### **International Phone Numbers**
The system handles global phone formats automatically:

```javascript
// All these formats work seamlessly:
"(323) 656-8914"        // US with parentheses
"+1 323 656 8914"       // US international
"+33 1 23 45 67 89"     // France
"+44 20 1234 5678"      // UK
"+34 618 82 37 93"      // Spain  
"+49 30 12345678"       // Germany
"+39 06 1234 5678"      // Italy
```

### **Contact Search Features**
```bash
# Example contact searches that work:
"Send message to Ana"           # First name
"Message Winston Johnson"       # Full name
"Text Ana Samat"               # Exact match
"Send to Ana"                  # Partial match
```

### **Message Confirmation System**
```
🛡️ MESSAGE CONFIRMATION REQUIRED

📱 To: Winston Johnson
📞 Phone: +13236568914
💬 Message: "Hello from Claude!"
📡 Type: IMESSAGE

⚠️ STOP: Do you want to send this message? Please confirm YES or NO.
✅ Token: confirm_1748400979355_agft68yv2
```

## 🛠️ Development

### **Run in Development Mode**
```bash
bun run dev
```

### **Testing Contact System**
```bash
# Test specific contact lookup
bun cache-manager.ts test "Ana"

# Test phone number normalization
bun run test-international-phones.ts
```

### **Project Structure**
```
apple-mcp-enhanced/
├── index.ts                    # Main MCP server entry point
├── tools.ts                    # MCP tool definitions
├── cache-manager.ts            # Contact cache management
├── cache-daemon.ts             # Background daemon process
├── utils/
│   ├── message-cached.ts       # Enhanced messaging with cache
│   ├── message-enhanced.ts     # Core messaging logic
│   ├── contacts-cached.ts      # Cached contact operations
│   ├── contacts.ts             # Direct Apple Contacts access
│   ├── notes.ts                # Apple Notes integration
│   ├── mail.ts                 # Mail app integration
│   ├── calendar.ts             # Calendar integration
│   ├── reminders.ts            # Reminders integration
│   └── maps.ts                 # Maps integration
└── startup-service.sh          # System service setup (optional)
```

## 🔐 Security & Privacy

### **Data Storage**
- **Local Only**: All cache data stays on your Mac
- **No Cloud Sync**: Contact information never leaves your device
- **Apple APIs**: Uses official macOS APIs, not database hacks
- **Permission-Based**: Requires explicit macOS permission grants

### **Message Confirmation**
- **Token System**: Prevents accidental message sending
- **5-Minute Expiry**: Confirmation tokens auto-expire for security
- **User Control**: Explicit confirmation required for all messages

## ⚡ Performance

### **Benchmarks**
- **Contact Search**: < 100ms (cached)
- **Phone Normalization**: < 1ms per number
- **Cache Updates**: ~30 seconds for 1000+ contacts
- **Memory Usage**: ~5MB for typical contact database

### **Optimization Features**
- **Intelligent Caching**: Only updates when contacts change
- **Batch Processing**: Efficient phone number capability testing
- **Smart Search**: Multiple search strategies with scoring
- **Background Updates**: Non-blocking cache maintenance

## 🚨 Troubleshooting

### **Common Issues**

#### **"Cannot access Contacts app"**
```bash
# Grant permissions in System Settings
System Settings > Privacy & Security > Contacts > Add Terminal
```

#### **Daemon not starting**
```bash
# Check for existing daemon
bun cache-daemon.ts status

# Force restart
bun cache-daemon.ts restart
```

#### **Contact not found**
```bash
# Update cache manually
bun cache-manager.ts update

# Test specific contact
bun cache-manager.ts test "Contact Name"
```

#### **International numbers not working**
```bash
# Verify normalization
bun run test-international-phones.ts

# Check cache content
bun cache-manager.ts status
```

### **Debug Mode**
```bash
# Enable detailed logging
bun cache-daemon.ts config set logLevel debug

# View cache daemon logs
tail -f daemon.log
```

## 🎯 Usage Examples

### **Messaging**
```
"Send a message to Ana saying 'Hello from Claude!'"
"Message Winston: Meeting at 3pm today?"
"Text +33123456789: Bonjour from Paris!"
```

### **Contact Management**
```
"Find Ana's phone number"
"Search contacts for John"
"Who has phone number +13236568914?"
```

### **Cross-App Workflows**
```
"Find Ana's contact, read my notes about the Paris project, and send her an update"
"Get Winston's email from contacts and send him the meeting agenda"
"Create a reminder to call Ana tomorrow at 3pm"
```

## 📈 Future Enhancements

- **Photos Integration**: Search and access Apple Photos
- **Music Integration**: Control Apple Music playback
- **Siri Shortcuts**: Integration with Shortcuts app
- **iCloud Sync**: Enhanced cloud contact synchronization
- **Group Messaging**: Support for group message threads

---

**Apple MCP Enhanced** - Bringing the power of macOS native apps to AI assistants through intelligent caching and seamless integration.

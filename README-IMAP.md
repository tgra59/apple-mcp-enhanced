# Apple MCP Email Search with IMAP

This document explains how to use the IMAP-based email search functionality in Apple MCP, which allows you to search through archived emails and overcome the limitations of the native Mail app's API.

## Overview

Apple's security and privacy restrictions prevent programmatic access to archived emails through the Mail app's AppleScript/JXA interfaces. To solve this issue, this implementation provides direct IMAP access to your email accounts, bypassing these restrictions.

## Benefits

- Search through ALL emails (not just unread ones)
- Full access to archived folders
- Search by multiple criteria
- Better performance for large mailboxes
- Works across multiple accounts independently

## Setup Instructions

### 1. Set Up Your Email Account

Before you can search emails, you need to set up your email account with IMAP credentials:

```json
{
  "name": "mail",
  "arguments": {
    "operation": "setup-imap",
    "imapAccount": "my-gmail",  // A nickname for this account
    "imapUser": "your-email@gmail.com",
    "imapPassword": "your-password-or-app-password",
    "imapHost": "imap.gmail.com",
    "imapPort": 993,  // Default for Gmail
    "imapTls": true   // Default is true
  }
}
```

### 2. Search Your Emails

Once your account is set up, you can search through all emails:

```json
{
  "name": "mail",
  "arguments": {
    "operation": "imap-search",
    "imapAccount": "my-gmail",  // The nickname you used during setup
    "searchTerm": "important document", // What you're searching for
    "limit": 20  // Optional, default is 10
  }
}
```

### 3. List Your Configured Accounts

To see which IMAP accounts you've set up:

```json
{
  "name": "mail",
  "arguments": {
    "operation": "list-imap-accounts"
  }
}
```

## Common IMAP Servers

- **Gmail**: `imap.gmail.com:993` (TLS: true)
- **Outlook/Office 365**: `outlook.office365.com:993` (TLS: true)
- **Yahoo**: `imap.mail.yahoo.com:993` (TLS: true)
- **iCloud**: `imap.mail.me.com:993` (TLS: true)

## Security Notes

- Your email credentials are stored securely using the system's keychain
- Credentials are only used for the specific search operations you request
- For Gmail with 2FA enabled, you'll need to use an App Password

## Troubleshooting

If you encounter issues with IMAP search:

1. **Connection failures**: Double-check your hostname, port, and credentials
2. **For Gmail accounts**: Make sure IMAP access is enabled in your Gmail settings
   - Go to Gmail → Settings → Forwarding and POP/IMAP → Enable IMAP
3. **For accounts with 2FA**: Use an app-specific password rather than your main password
4. **No results returned**: Try a different search term or check different folders

## Technical Implementation

The IMAP search functionality is implemented in:
- `/utils/mail-imap.ts`: Contains the core IMAP functionality
- `/tools.ts`: Defines the mail tool API with IMAP operations
- `/index.ts`: Handles the IMAP-related requests

Credential storage is handled by the `keytar` package to securely store and retrieve email credentials.

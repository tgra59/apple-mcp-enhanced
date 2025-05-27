# IMAP Search Guide for Apple MCP

This document explains how to use the new IMAP-based search functionality in the Apple MCP tool to overcome the limitations of searching archived emails with the native Mail app.

## Background

Due to Apple's privacy and security restrictions, the native Mail app integration has limited ability to search through archived emails, especially across multiple accounts. To solve this problem, we've implemented direct IMAP access as an alternative search method.

## Benefits of IMAP Search

- Full search capabilities across all folders including archives
- Works with multiple accounts independently
- No Apple security restrictions
- Complete access to email content for searching

## Setup Instructions

### 1. Set Up an IMAP Account

Before you can use IMAP search, you need to set up your email account credentials. For each email account you want to search:

```typescript
// Example setup for a Gmail account
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

Notes for specific email providers:

- **Gmail**: You may need to create an "App Password" if you use 2FA
- **Outlook/Office 365**: Use `outlook.office365.com` as the host
- **Yahoo**: Use `imap.mail.yahoo.com` as the host
- **iCloud**: Use `imap.mail.me.com` as the host

### 2. Search Using IMAP

Once your account is set up, you can search through all emails (including archived ones):

```typescript
{
  "name": "mail",
  "arguments": {
    "operation": "imap-search",
    "imapAccount": "my-gmail",  // The nickname you used during setup
    "searchTerm": "quarterly report",
    "limit": 20  // Optional, default is 10
  }
}
```

### 3. List Configured Accounts

To see which IMAP accounts you've already set up:

```typescript
{
  "name": "mail",
  "arguments": {
    "operation": "list-imap-accounts"
  }
}
```

## Troubleshooting

If you encounter issues with IMAP search:

1. **Connection failures**: Double-check your hostname, port, and credentials
2. **For Gmail**: Make sure you've enabled IMAP access in Gmail settings
3. **For accounts with 2FA**: You may need to use an app-specific password
4. **Search returns no results**: Try a more general search term or check different folders

## Privacy and Security

Your email credentials are stored securely using the system's keychain. The credentials are only used for the specific search operations you request.

## Limitations

- Initial setup requires your email credentials
- Some email providers may have restrictions on IMAP access
- Very large mailboxes may take longer to search

## Comparing with Native Mail Search

- **Native Mail Search**: Uses Apple's built-in Mail app, limited by privacy restrictions, can only search unread emails reliably
- **IMAP Search**: Direct connection to mail server, full search capabilities, requires one-time credential setup
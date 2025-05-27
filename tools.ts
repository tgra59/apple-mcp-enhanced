import { type Tool } from "@modelcontextprotocol/sdk/types.js";

const CONTACTS_TOOL: Tool = {
  name: "contacts",
  description: "Search and retrieve contacts from Apple Contacts app",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description:
          "Name to search for (optional - if not provided, returns all contacts). Can be partial name to search.",
      },
    },
  },
};

const NOTES_TOOL: Tool = {
  name: "notes",
  description: "Search, retrieve and create notes in Apple Notes app",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: 'search', 'list', or 'create'",
        enum: ["search", "list", "create"],
      },
      searchText: {
        type: "string",
        description:
          "Text to search for in notes (required for search operation)",
      },
      title: {
        type: "string",
        description:
          "Title of the note to create (required for create operation)",
      },
      body: {
        type: "string",
        description:
          "Content of the note to create (required for create operation)",
      },
      folderName: {
        type: "string",
        description:
          "Name of the folder to create the note in (optional for create operation, defaults to 'Claude')",
      },
    },
    required: ["operation"],
  },
};

const MESSAGES_TOOL: Tool = {
  name: "messages",
  description:
    "Interact with Apple Messages app - send, read, schedule messages and check unread messages. Supports both phone numbers and contact names with intelligent matching.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description:
          "Operation to perform: 'send', 'send-confirmed', 'read', 'schedule', 'unread', 'threads', or 'search-contacts'",
        enum: ["send", "send-confirmed", "read", "schedule", "unread", "threads", "search-contacts"],
      },
      phoneNumberOrName: {
        type: "string",
        description:
          "Phone number OR contact name to send/read messages (supports fuzzy matching for names)",
      },
      phoneNumber: {
        type: "string",
        description:
          "Phone number (legacy field - use phoneNumberOrName instead)",
      },
      message: {
        type: "string",
        description:
          "Message to send (required for send and schedule operations)",
      },
      limit: {
        type: "number",
        description:
          "Number of messages/threads to retrieve (optional)",
      },
      scheduledTime: {
        type: "string",
        description:
          "ISO string of when to send the message (required for schedule operation)",
      },
      messageType: {
        type: "string",
        description:
          "Force message type (optional): 'auto' detects best type, 'imessage' forces iMessage, 'sms' forces SMS",
        enum: ["auto", "imessage", "sms"],
      },
      verifyContact: {
        type: "boolean",
        description:
          "Whether to verify contact exists before sending (default: true)",
      },
      includeContext: {
        type: "boolean", 
        description:
          "Whether to include conversation context and thread info (default: true)",
      },
      searchTerm: {
        type: "string",
        description:
          "Contact name to search for (required for search-contacts operation)",
      },
      confirmationToken: {
        type: "string",
        description:
          "Confirmation token from send operation (required for send-confirmed operation)",
      },
      userConfirmation: {
        type: "string",
        description:
          "User's explicit confirmation (optional for send-confirmed operation, defaults to 'yes')",
      },
      validatedRecipient: {
        type: "string",
        description:
          "Validated recipient name or identifier (legacy - use confirmationToken instead)",
      },
      validatedPhoneNumber: {
        type: "string",
        description:
          "Validated phone number to send to (legacy - use confirmationToken instead)",
      },
      validatedMessageType: {
        type: "string",
        description:
          "Validated message type to use (legacy - use confirmationToken instead)",
        enum: ["imessage", "sms", "unknown"],
      },
    },
    required: ["operation"],
  },
};

const MAIL_TOOL: Tool = {
  name: "mail",
  description:
    "Interact with Apple Mail app - read unread emails, search emails, and send emails",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description:
          "Operation to perform: 'unread', 'search', 'imap-search', 'setup-imap', 'list-imap-accounts', 'send', 'mailboxes', or 'accounts'",
        enum: ["unread", "search", "imap-search", "setup-imap", "list-imap-accounts", "send", "mailboxes", "accounts"],
      },
      account: {
        type: "string",
        description:
          "Email account to use (optional - if not provided, searches across all accounts)",
      },
      mailbox: {
        type: "string",
        description:
          "Mailbox to use (optional - if not provided, uses inbox or searches across all mailboxes)",
      },
      limit: {
        type: "number",
        description:
          "Number of emails to retrieve (optional, for unread and search operations)",
      },
      searchTerm: {
        type: "string",
        description:
          "Text to search for in emails (required for search operation)",
      },
      to: {
        type: "string",
        description: "Recipient email address (required for send operation)",
      },
      subject: {
        type: "string",
        description: "Email subject (required for send operation)",
      },
      body: {
        type: "string",
        description: "Email body content (required for send operation)",
      },
      cc: {
        type: "string",
        description: "CC email address (optional for send operation)",
      },
      bcc: {
        type: "string",
        description: "BCC email address (optional for send operation)",
      },
      // New properties for IMAP operations
      imapAccount: {
        type: "string",
        description: "IMAP account nickname to use for search (required for imap-search operation)",
      },
      imapUser: {
        type: "string",
        description: "IMAP username/email (required for setup-imap operation)",
      },
      imapPassword: {
        type: "string",
        description: "IMAP password (required for setup-imap operation)",
      },
      imapHost: {
        type: "string",
        description: "IMAP server hostname (required for setup-imap operation)",
      },
      imapPort: {
        type: "number",
        description: "IMAP server port (default: 993 for SSL/TLS)",
      },
      imapTls: {
        type: "boolean",
        description: "Whether to use TLS for IMAP connection (default: true)",
      },
    },
    required: ["operation"],
  },
};

const REMINDERS_TOOL: Tool = {
  name: "reminders",
  description: "Search, create, and open reminders in Apple Reminders app",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description:
          "Operation to perform: 'list', 'search', 'open', 'create', or 'listById'",
        enum: ["list", "search", "open", "create", "listById"],
      },
      searchText: {
        type: "string",
        description:
          "Text to search for in reminders (required for search and open operations)",
      },
      name: {
        type: "string",
        description:
          "Name of the reminder to create (required for create operation)",
      },
      listName: {
        type: "string",
        description:
          "Name of the list to create the reminder in (optional for create operation)",
      },
      listId: {
        type: "string",
        description:
          "ID of the list to get reminders from (required for listById operation)",
      },
      props: {
        type: "array",
        items: {
          type: "string",
        },
        description:
          "Properties to include in the reminders (optional for listById operation)",
      },
      notes: {
        type: "string",
        description:
          "Additional notes for the reminder (optional for create operation)",
      },
      dueDate: {
        type: "string",
        description:
          "Due date for the reminder in ISO format (optional for create operation)",
      },
    },
    required: ["operation"],
  },
};

const WEB_SEARCH_TOOL: Tool = {
  name: "webSearch",
  description:
    "Search the web using DuckDuckGo and retrieve content from search results",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query to look up",
      },
    },
    required: ["query"],
  },
};

const CALENDAR_TOOL: Tool = {
  name: "calendar",
  description: "Search, create, list calendars, and open calendar events in Apple Calendar app with enhanced options",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description:
          "Operation to perform: 'search', 'open', 'list', 'create', or 'list-calendars'",
        enum: ["search", "open", "list", "create", "list-calendars"],
      },
      searchText: {
        type: "string",
        description:
          "Text to search for in event titles, locations, and notes (required for search operation)",
      },
      eventId: {
        type: "string",
        description: "ID of the event to open (required for open operation)",
      },
      limit: {
        type: "number",
        description: "Number of events to retrieve (optional, default 10)",
      },
      fromDate: {
        type: "string",
        description:
          "Start date for search range in ISO format (optional, default is today)",
      },
      toDate: {
        type: "string",
        description:
          "End date for search range in ISO format (optional, default is 30 days from now for search, 7 days for list)",
      },
      title: {
        type: "string",
        description:
          "Title of the event to create (required for create operation)",
      },
      startDate: {
        type: "string",
        description:
          "Start date/time of the event in ISO format (required for create operation)",
      },
      endDate: {
        type: "string",
        description:
          "End date/time of the event in ISO format (required for create operation)",
      },
      location: {
        type: "string",
        description: "Location of the event (optional for create operation)",
      },
      notes: {
        type: "string",
        description:
          "Additional notes for the event (optional for create operation)",
      },
      isAllDay: {
        type: "boolean",
        description:
          "Whether the event is an all-day event (optional for create operation, default is false)",
      },
      calendarName: {
        type: "string",
        description:
          "Name of the calendar to create the event in (optional for create operation, uses default calendar if not specified)",
      },
      eventColor: {
        type: "string",
        description:
          "Color for the event (optional for create operation). Note: Apple Calendar typically uses calendar-level colors, not individual event colors. Available options: red, orange, yellow, green, blue, purple, brown, graphite",
        enum: ["red", "orange", "yellow", "green", "blue", "purple", "brown", "graphite"],
      },
    },
    required: ["operation"],
  },
};

const MAPS_TOOL: Tool = {
  name: "maps",
  description:
    "Search locations, manage guides, save favorites, and get directions using Apple Maps",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform with Maps",
        enum: [
          "search",
          "save",
          "directions",
          "pin",
          "listGuides",
          "addToGuide",
          "createGuide",
        ],
      },
      query: {
        type: "string",
        description: "Search query for locations (required for search)",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of results to return (optional for search)",
      },
      name: {
        type: "string",
        description: "Name of the location (required for save and pin)",
      },
      address: {
        type: "string",
        description:
          "Address of the location (required for save, pin, addToGuide)",
      },
      fromAddress: {
        type: "string",
        description:
          "Starting address for directions (required for directions)",
      },
      toAddress: {
        type: "string",
        description:
          "Destination address for directions (required for directions)",
      },
      transportType: {
        type: "string",
        description: "Type of transport to use (optional for directions)",
        enum: ["driving", "walking", "transit"],
      },
      guideName: {
        type: "string",
        description:
          "Name of the guide (required for createGuide and addToGuide)",
      },
    },
    required: ["operation"],
  },
};

const tools = [
  CONTACTS_TOOL,
  NOTES_TOOL,
  MESSAGES_TOOL,
  MAIL_TOOL,
  REMINDERS_TOOL,
  WEB_SEARCH_TOOL,
  CALENDAR_TOOL,
  MAPS_TOOL,
];

export default tools;

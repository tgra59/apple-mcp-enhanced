import { runAppleScript } from "run-applescript";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import { access } from "node:fs/promises";
import contacts from "./contacts";

const execAsync = promisify(exec);

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

interface Contact {
  name: string;
  phoneNumbers: string[];
  emails: string[];
  matchScore?: number;
}

interface MessageThread {
  contactName: string;
  phoneNumber: string;
  lastMessageDate: string;
  unreadCount: number;
  isGroup: boolean;
}

interface Message {
  content: string;
  date: string;
  sender: string;
  is_from_me: boolean;
  messageType: 'imessage' | 'sms' | 'unknown';
  attachments?: string[];
  url?: string;
  thread_id?: string;
}

interface SendMessageOptions {
  verifyContact?: boolean;
  messageType?: 'auto' | 'imessage' | 'sms';
}

// Simplified interface for confirmed sending
interface MessageValidation {
  resolvedContact: string;
  phoneNumber: string;
  messagePreview: string;
  messageType: 'imessage' | 'sms' | 'unknown';
  confirmationToken?: string;
}

// Store pending confirmations (in production, this should be in a database or redis)
const pendingConfirmations = new Map<string, {
  validatedRecipient: string;
  validatedPhoneNumber: string;
  message: string;
  validatedMessageType: 'imessage' | 'sms' | 'unknown';
  timestamp: number;
}>();

// Generate a unique confirmation token
function generateConfirmationToken(): string {
  return `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Clean up old confirmations (older than 5 minutes)
function cleanupOldConfirmations() {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  for (const [token, data] of pendingConfirmations.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      pendingConfirmations.delete(token);
    }
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOperation<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES,
  delay = RETRY_DELAY,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (retries > 0) {
      console.error(
        `Operation failed, retrying... (${retries} attempts remaining)`,
      );
      await sleep(delay);
      return retryOperation(operation, retries - 1, delay);
    }
    throw error;
  }
}

/**
 * Enhanced contact search with fuzzy matching and scoring
 */
async function findBestContactMatches(searchTerm: string, limit = 5): Promise<Contact[]> {
  try {
    const allContacts = await contacts.getAllNumbers();
    const contactList: Contact[] = [];

    // Convert to standardized format
    for (const [name, phoneNumbers] of Object.entries(allContacts)) {
      // Filter out null/empty phone numbers and only include contacts with valid numbers
      const validPhoneNumbers = phoneNumbers.filter(num => num && num.trim() !== '');
      if (validPhoneNumbers.length > 0) {
        contactList.push({
          name,
          phoneNumbers: validPhoneNumbers,
          emails: [], // Could be enhanced to include emails
        });
      }
    }

    // Score and rank contacts
    const scoredContacts = contactList.map(contact => {
      const score = calculateMatchScore(searchTerm.toLowerCase(), contact.name.toLowerCase());
      return { ...contact, matchScore: score };
    });

    // Filter and sort by score
    return scoredContacts
      .filter(contact => contact.matchScore! > 0)
      .sort((a, b) => b.matchScore! - a.matchScore!)
      .slice(0, limit);
  } catch (error) {
    console.error("Error in enhanced contact search:", error);
    return [];
  }
}

/**
 * Calculate match score for fuzzy contact search
 */
function calculateMatchScore(searchTerm: string, contactName: string): number {
  if (!searchTerm || !contactName) return 0;
  
  // Exact match
  if (contactName === searchTerm) return 100;
  
  // Starts with
  if (contactName.startsWith(searchTerm)) return 90;
  
  // Contains as whole word
  if (contactName.includes(` ${searchTerm}`) || contactName.includes(`${searchTerm} `)) return 80;
  
  // Contains substring
  if (contactName.includes(searchTerm)) return 70;
  
  // Check individual words
  const searchWords = searchTerm.split(/\s+/);
  const nameWords = contactName.split(/\s+/);
  let wordMatchScore = 0;
  
  for (const searchWord of searchWords) {
    for (const nameWord of nameWords) {
      if (nameWord.startsWith(searchWord)) {
        wordMatchScore += 30;
      } else if (nameWord.includes(searchWord)) {
        wordMatchScore += 15;
      }
    }
  }
  
  if (wordMatchScore > 0) return Math.min(wordMatchScore, 65);
  
  // Fuzzy matching for typos (simple Levenshtein-like)
  const similarity = calculateSimilarity(searchTerm, contactName);
  if (similarity > 0.6) return Math.floor(similarity * 50);
  
  return 0;
}

/**
 * Simple similarity calculation
 */
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const matches = shorter.split('').filter((char, i) => char === longer[i]).length;
  return matches / longer.length;
}

/**
 * Enhanced phone number normalization with validation
 */
function normalizePhoneNumber(phone: string): string[] {
  // Safety check for null/undefined phone numbers
  if (!phone || typeof phone !== 'string') {
    return [];
  }
  
  // Remove all non-numeric characters except +
  const cleaned = phone.replace(/[^0-9+]/g, "");

  // Validate input
  if (cleaned.length < 10) return [];

  const formats = new Set<string>();

  // Handle different input formats
  if (/^\+1\d{10}$/.test(cleaned)) {
    formats.add(cleaned);
    formats.add(cleaned.substring(2)); // Remove +1
  } else if (/^1\d{10}$/.test(cleaned)) {
    formats.add(`+${cleaned}`);
    formats.add(cleaned.substring(1)); // Remove leading 1
  } else if (/^\d{10}$/.test(cleaned)) {
    formats.add(`+1${cleaned}`);
    formats.add(cleaned);
  }

  return Array.from(formats);
}

/**
 * Determine message type (iMessage vs SMS)
 */
async function detectMessageType(phoneNumber: string): Promise<'imessage' | 'sms' | 'unknown'> {
  try {
    const script = `
tell application "Messages"
    try
        set targetService to 1st service whose service type = iMessage
        set targetBuddy to buddy "${phoneNumber}" of targetService
        if targetBuddy exists then
            return "imessage"
        else
            return "unknown"
        end if
    on error
        try
            set targetService to 1st service whose service type = SMS
            set targetBuddy to buddy "${phoneNumber}" of targetService  
            if targetBuddy exists then
                return "sms"
            else
                return "unknown"
            end if
        on error
            return "unknown"
        end try
    end try
end tell`;

    const result = await runAppleScript(script);
    return result.trim() as 'imessage' | 'sms' | 'unknown';
  } catch (error) {
    console.error("Error detecting message type:", error);
    return 'unknown';
  }
}

/**
 * Enhanced message sending with contact verification
 * Returns validation info for Claude to present to user
 */
async function sendMessageEnhanced(
  phoneNumberOrName: string, 
  message: string, 
  options: SendMessageOptions = {}
): Promise<{
  success: boolean;
  message: string;
  recipientName?: string;
  messageType?: 'imessage' | 'sms' | 'unknown';
  phoneNumber?: string;
  needsValidation?: boolean;
  validationInfo?: {
    resolvedContact: string;
    phoneNumber: string;
    messagePreview: string;
    messageType: string;
  };
}> {
  try {
    const { verifyContact = true, messageType = 'auto' } = options;
    
    let targetPhoneNumber = phoneNumberOrName;
    let recipientName: string | undefined;
    
    // Step 1: Determine if input is a phone number or contact name
    const isPhoneNumber = /^\+?[0-9\s\-\(\)\.]+$/.test(phoneNumberOrName);
    
    if (!isPhoneNumber) {
      // Input appears to be a contact name - search for it
      console.error(`Searching for contact: ${phoneNumberOrName}`);
      const matches = await findBestContactMatches(phoneNumberOrName, 3);
      
      if (matches.length === 0) {
        return {
          success: false,
          message: `No contact found matching "${phoneNumberOrName}". Try a different name or use the phone number directly.`
        };
      }
      
      // If multiple matches, use the best one but inform user
      const bestMatch = matches[0];
      recipientName = bestMatch.name;
      
      // Find first valid phone number
      const validPhoneNumber = bestMatch.phoneNumbers.find(num => num && num.trim() !== '');
      if (!validPhoneNumber) {
        return {
          success: false,
          message: `Contact "${bestMatch.name}" found but has no valid phone numbers. Please add a phone number to this contact.`
        };
      }
      
      targetPhoneNumber = validPhoneNumber;
      
      if (matches.length > 1) {
        const alternativeContacts = matches.slice(1, 3).map(m => m.name).join(', ');
        console.error(`Multiple contacts found. Using: ${bestMatch.name}. Alternatives: ${alternativeContacts}`);
      }
    } else {
      // Input is a phone number - try to find associated contact
      if (verifyContact) {
        recipientName = await contacts.findContactByPhone(phoneNumberOrName);
      }
    }
    
    // Step 2: Normalize phone number
    const normalizedNumbers = normalizePhoneNumber(targetPhoneNumber);
    if (normalizedNumbers.length === 0) {
      return {
        success: false,
        message: `Invalid phone number format: ${targetPhoneNumber}`
      };
    }
    
    const primaryNumber = normalizedNumbers[0];
    
    // Step 3: Detect message type if requested
    let detectedMessageType: 'imessage' | 'sms' | 'unknown' = 'unknown';
    if (messageType === 'auto') {
      detectedMessageType = await detectMessageType(primaryNumber);
    }
    
    const finalMessageType = messageType === 'auto' ? detectedMessageType : messageType as any;
    const displayName = recipientName || targetPhoneNumber;
    
    // Step 4: Generate confirmation token and store pending confirmation
    cleanupOldConfirmations(); // Clean up old confirmations first
    const confirmationToken = generateConfirmationToken();
    
    pendingConfirmations.set(confirmationToken, {
      validatedRecipient: displayName,
      validatedPhoneNumber: primaryNumber,
      message: message,
      validatedMessageType: finalMessageType,
      timestamp: Date.now()
    });
    
    // Step 5: Return validation info for Claude to present to user
    return {
      success: false,
      message: `Ready to send message`,
      needsValidation: true,
      validationInfo: {
        resolvedContact: displayName,
        phoneNumber: primaryNumber,
        messagePreview: message,
        messageType: finalMessageType,
        confirmationToken: confirmationToken
      }
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Failed to prepare message: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Send message with confirmed validation (actually sends the message)
 * This should only be called after user has confirmed the details and provided a valid confirmation token
 */
async function sendMessageConfirmed(
  confirmationToken: string,
  userConfirmation?: string
): Promise<{
  success: boolean;
  message: string;
  recipientName?: string;
  messageType?: 'imessage' | 'sms' | 'unknown';
  phoneNumber?: string;
}> {
  try {
    // Step 1: Validate confirmation token and get pending confirmation data
    const pendingData = pendingConfirmations.get(confirmationToken);
    
    if (!pendingData) {
      return {
        success: false,
        message: `❌ Invalid or expired confirmation token. Please start the send process again.`
      };
    }
    
    // Step 2: Check if user explicitly confirmed (if userConfirmation parameter is provided)
    if (userConfirmation && !['yes', 'y', 'confirm', 'send', 'ok', 'proceed'].includes(userConfirmation.toLowerCase().trim())) {
      // Remove the pending confirmation since user declined
      pendingConfirmations.delete(confirmationToken);
      return {
        success: false,
        message: `❌ Message sending cancelled by user.`
      };
    }
    
    // Step 3: Clean up old confirmations
    cleanupOldConfirmations();
    
    // Step 4: Validate that confirmation isn't too old (5 minutes max)
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    if (pendingData.timestamp < fiveMinutesAgo) {
      pendingConfirmations.delete(confirmationToken);
      return {
        success: false,
        message: `❌ Confirmation token expired. Please start the send process again.`
      };
    }
    
    // Step 5: Extract the validated data
    const { validatedRecipient, validatedPhoneNumber, message, validatedMessageType } = pendingData;
    
    // Step 6: Send the message using validated details
    const escapedMessage = message.replace(/"/g, '\\"');
    let sendScript: string;
    
    if (validatedMessageType === 'imessage') {
      sendScript = `
tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy "${validatedPhoneNumber}" of targetService
    send "${escapedMessage}" to targetBuddy
end tell`;
    } else {
      // Default to SMS or auto-detect
      sendScript = `
tell application "Messages"
    send "${escapedMessage}" to buddy "${validatedPhoneNumber}"
end tell`;
    }
    
    await runAppleScript(sendScript);
    
    // Step 7: Clean up the confirmation token after successful send
    pendingConfirmations.delete(confirmationToken);
    
    // Step 8: Return success with details  
    return {
      success: true,
      message: `✅ Message sent to ${validatedRecipient} (${validatedPhoneNumber}) via ${validatedMessageType.toUpperCase()}`,
      recipientName: validatedRecipient,
      messageType: validatedMessageType,
      phoneNumber: validatedPhoneNumber
    };
    
  } catch (error) {
    return {
      success: false,
      message: `Failed to send confirmed message: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get conversation threads with unread counts
 */
async function getMessageThreads(limit = 20): Promise<MessageThread[]> {
  try {
    const hasAccess = await retryOperation(checkMessagesDBAccess);
    if (!hasAccess) {
      return [];
    }

    const query = `
      SELECT 
        h.id as contact_identifier,
        COUNT(CASE WHEN m.is_read = 0 AND m.is_from_me = 0 THEN 1 END) as unread_count,
        MAX(m.date) as last_message_date,
        COUNT(DISTINCT m.handle_id) > 1 as is_group_chat
      FROM message m 
      INNER JOIN handle h ON h.ROWID = m.handle_id 
      WHERE m.item_type = 0
      GROUP BY h.id
      HAVING COUNT(m.ROWID) > 0
      ORDER BY last_message_date DESC 
      LIMIT ${limit}
    `;

    const { stdout } = await retryOperation(() =>
      execAsync(
        `sqlite3 -json "${process.env.HOME}/Library/Messages/chat.db" "${query}"`,
      ),
    );

    if (!stdout.trim()) {
      return [];
    }

    const threads = JSON.parse(stdout) as {
      contact_identifier: string;
      unread_count: number;
      last_message_date: number;
      is_group_chat: number;
    }[];

    // Enhance with contact names
    const enhancedThreads = await Promise.all(
      threads.map(async (thread) => {
        const contactName = await contacts.findContactByPhone(thread.contact_identifier);
        
        return {
          contactName: contactName || thread.contact_identifier,
          phoneNumber: thread.contact_identifier,
          lastMessageDate: new Date(thread.last_message_date / 1000000000 + new Date('2001-01-01').getTime()).toISOString(),
          unreadCount: thread.unread_count,
          isGroup: Boolean(thread.is_group_chat),
        };
      })
    );

    return enhancedThreads;
  } catch (error) {
    console.error("Error getting message threads:", error);
    return [];
  }
}

/**
 * Enhanced message reading with conversation context
 */
async function readMessagesEnhanced(
  phoneNumberOrName: string,
  limit = 10,
  includeContext = true
): Promise<{
  success: boolean;
  messages: Message[];
  contactName?: string;
  threadInfo?: {
    totalMessages: number;
    unreadCount: number;
    lastMessageDate: string;
  };
}> {
  try {
    // Resolve contact like in sending
    let targetPhoneNumber = phoneNumberOrName;
    let contactName: string | undefined;
    
    const isPhoneNumber = /^\+?[0-9\s\-\(\)\.]+$/.test(phoneNumberOrName);
    
    if (!isPhoneNumber) {
      const matches = await findBestContactMatches(phoneNumberOrName, 1);
      if (matches.length === 0) {
        return {
          success: false,
          messages: [],
        };
      }
      
      const bestMatch = matches[0];
      contactName = bestMatch.name;
      
      // Find first valid phone number
      const validPhoneNumber = bestMatch.phoneNumbers.find(num => num && num.trim() !== '');
      if (!validPhoneNumber) {
        return {
          success: false,
          messages: [],
        };
      }
      
      targetPhoneNumber = validPhoneNumber;
    } else {
      contactName = await contacts.findContactByPhone(phoneNumberOrName);
    }

    // Use existing readMessages function but enhance the result
    const messages = await readMessages(targetPhoneNumber, limit);
    
    // Add message type detection and threading info
    const enhancedMessages = await Promise.all(
      messages.map(async (msg) => {
        const messageType = await detectMessageType(msg.sender);
        return {
          ...msg,
          messageType,
          thread_id: targetPhoneNumber, // Simple thread grouping by contact
        };
      })
    );

    // Get thread context if requested
    let threadInfo;
    if (includeContext) {
      const threads = await getMessageThreads(50);
      const currentThread = threads.find(t => 
        t.phoneNumber === targetPhoneNumber || t.contactName === contactName
      );
      
      if (currentThread) {
        threadInfo = {
          totalMessages: messages.length, // Simplified - could be enhanced
          unreadCount: currentThread.unreadCount,
          lastMessageDate: currentThread.lastMessageDate,
        };
      }
    }

    return {
      success: true,
      messages: enhancedMessages,
      contactName,
      threadInfo,
    };
  } catch (error) {
    console.error("Error in enhanced message reading:", error);
    return {
      success: false,
      messages: [],
    };
  }
}

// Re-export existing functions for compatibility
async function checkMessagesDBAccess(): Promise<boolean> {
  try {
    const dbPath = `${process.env.HOME}/Library/Messages/chat.db`;
    await access(dbPath);
    await execAsync(`sqlite3 "${dbPath}" "SELECT 1;"`);
    return true;
  } catch (error) {
    console.error(`
Error: Cannot access Messages database.
To fix this, please grant Full Disk Access to Terminal/iTerm2:
1. Open System Preferences
2. Go to Security & Privacy > Privacy
3. Select "Full Disk Access" from the left sidebar
4. Click the lock icon to make changes
5. Add Terminal.app or iTerm.app to the list
6. Restart your terminal and try again

Error details: ${error instanceof Error ? error.message : String(error)}
`);
    return false;
  }
}

function decodeAttributedBody(hexString: string): {
  text: string;
  url?: string;
} {
  try {
    const buffer = Buffer.from(hexString, "hex");
    const content = buffer.toString();

    const patterns = [
      /NSString">(.*?)</, 
      /NSString">([^<]+)/, 
      /NSNumber">\d+<.*?NSString">(.*?)</, 
      /NSArray">.*?NSString">(.*?)</, 
      /"string":\s*"([^"]+)"/, 
      /text[^>]*>(.*?)</, 
      /message>(.*?)</, 
    ];

    let text = "";
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        text = match[1];
        if (text.length > 5) {
          break;
        }
      }
    }

    const urlPatterns = [
      /(https?:\/\/[^\s<"]+)/, 
      /NSString">(https?:\/\/[^\s<"]+)/, 
      /"url":\s*"(https?:\/\/[^"]+)"/, 
      /link[^>]*>(https?:\/\/[^<]+)/, 
    ];

    let url: string | undefined;
    for (const pattern of urlPatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        url = match[1];
        break;
      }
    }

    if (!text && !url) {
      const readableText = content
        .replace(/streamtyped.*?NSString/g, "") 
        .replace(/NSAttributedString.*?NSString/g, "") 
        .replace(/NSDictionary.*?$/g, "") 
        .replace(/\+[A-Za-z]+\s/g, "") 
        .replace(/NSNumber.*?NSValue.*?\*/g, "") 
        .replace(/[^\x20-\x7E]/g, " ") 
        .replace(/\s+/g, " ") 
        .trim();

      if (readableText.length > 5) {
        text = readableText;
      } else {
        return { text: "[Message content not readable]" };
      }
    }

    if (text) {
      text = text
        .replace(/^[+\s]+/, "") 
        .replace(/\s*iI\s*[A-Z]\s*$/, "") 
        .replace(/\s+/g, " ") 
        .trim();
    }

    return { text: text || url || "", url };
  } catch (error) {
    console.error("Error decoding attributedBody:", error);
    return { text: "[Message content not readable]" };
  }
}

async function getAttachmentPaths(messageId: number): Promise<string[]> {
  try {
    const query = `
            SELECT filename
            FROM attachment
            INNER JOIN message_attachment_join 
            ON attachment.ROWID = message_attachment_join.attachment_id
            WHERE message_attachment_join.message_id = ${messageId}
        `;

    const { stdout } = await execAsync(
      `sqlite3 -json "${process.env.HOME}/Library/Messages/chat.db" "${query}"`,
    );

    if (!stdout.trim()) {
      return [];
    }

    const attachments = JSON.parse(stdout) as { filename: string }[];
    return attachments.map((a) => a.filename).filter(Boolean);
  } catch (error) {
    console.error("Error getting attachments:", error);
    return [];
  }
}

async function readMessages(
  phoneNumber: string,
  limit = 10,
): Promise<Message[]> {
  try {
    const hasAccess = await retryOperation(checkMessagesDBAccess);
    if (!hasAccess) {
      return [];
    }

    const phoneFormats = normalizePhoneNumber(phoneNumber);
    console.error("Trying phone formats:", phoneFormats);

    const phoneList = phoneFormats
      .map((p) => `'${p.replace(/'/g, "''")}'`)
      .join(",");

    const query = `
            SELECT 
                m.ROWID as message_id,
                CASE 
                    WHEN m.text IS NOT NULL AND m.text != '' THEN m.text
                    WHEN m.attributedBody IS NOT NULL THEN hex(m.attributedBody)
                    ELSE NULL
                END as content,
                datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as date,
                h.id as sender,
                m.is_from_me,
                m.is_audio_message,
                m.cache_has_attachments,
                m.subject,
                CASE 
                    WHEN m.text IS NOT NULL AND m.text != '' THEN 0
                    WHEN m.attributedBody IS NOT NULL THEN 1
                    ELSE 2
                END as content_type
            FROM message m 
            INNER JOIN handle h ON h.ROWID = m.handle_id 
            WHERE h.id IN (${phoneList})
                AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL OR m.cache_has_attachments = 1)
                AND m.is_from_me IS NOT NULL  
                AND m.item_type = 0  
                AND m.is_audio_message = 0  
            ORDER BY m.date DESC 
            LIMIT ${limit}
        `;

    const { stdout } = await retryOperation(() =>
      execAsync(
        `sqlite3 -json "${process.env.HOME}/Library/Messages/chat.db" "${query}"`,
      ),
    );

    if (!stdout.trim()) {
      console.error("No messages found in database for the given phone number");
      return [];
    }

    const messages = JSON.parse(stdout) as (Message & {
      message_id: number;
      is_audio_message: number;
      cache_has_attachments: number;
      subject: string | null;
      content_type: number;
    })[];

    const processedMessages = await Promise.all(
      messages
        .filter(
          (msg) => msg.content !== null || msg.cache_has_attachments === 1,
        )
        .map(async (msg) => {
          let content = msg.content || "";
          let url: string | undefined;

          if (msg.content_type === 1) {
            const decoded = decodeAttributedBody(content);
            content = decoded.text;
            url = decoded.url;
          } else {
            const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
              url = urlMatch[1];
            }
          }

          let attachments: string[] = [];
          if (msg.cache_has_attachments) {
            attachments = await getAttachmentPaths(msg.message_id);
          }

          if (msg.subject) {
            content = `Subject: ${msg.subject}\n${content}`;
          }

          const formattedMsg: Message = {
            content: content || "[No text content]",
            date: new Date(msg.date).toISOString(),
            sender: msg.sender,
            is_from_me: Boolean(msg.is_from_me),
            messageType: 'unknown', // Will be enhanced in calling function
          };

          if (attachments.length > 0) {
            formattedMsg.attachments = attachments;
            formattedMsg.content += `\n[Attachments: ${attachments.length}]`;
          }

          if (url) {
            formattedMsg.url = url;
            formattedMsg.content += `\n[URL: ${url}]`;
          }

          return formattedMsg;
        }),
    );

    return processedMessages;
  } catch (error) {
    console.error("Error reading messages:", error);
    return [];
  }
}

async function getUnreadMessages(limit = 10): Promise<Message[]> {
  try {
    const hasAccess = await retryOperation(checkMessagesDBAccess);
    if (!hasAccess) {
      return [];
    }

    const query = `
            SELECT 
                m.ROWID as message_id,
                CASE 
                    WHEN m.text IS NOT NULL AND m.text != '' THEN m.text
                    WHEN m.attributedBody IS NOT NULL THEN hex(m.attributedBody)
                    ELSE NULL
                END as content,
                datetime(m.date/1000000000 + strftime('%s', '2001-01-01'), 'unixepoch', 'localtime') as date,
                h.id as sender,
                m.is_from_me,
                m.is_audio_message,
                m.cache_has_attachments,
                m.subject,
                CASE 
                    WHEN m.text IS NOT NULL AND m.text != '' THEN 0
                    WHEN m.attributedBody IS NOT NULL THEN 1
                    ELSE 2
                END as content_type
            FROM message m 
            INNER JOIN handle h ON h.ROWID = m.handle_id 
            WHERE m.is_from_me = 0  
                AND m.is_read = 0   
                AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL OR m.cache_has_attachments = 1)
                AND m.is_audio_message = 0  
                AND m.item_type = 0  
            ORDER BY m.date DESC 
            LIMIT ${limit}
        `;

    const { stdout } = await retryOperation(() =>
      execAsync(
        `sqlite3 -json "${process.env.HOME}/Library/Messages/chat.db" "${query}"`,
      ),
    );

    if (!stdout.trim()) {
      console.error("No unread messages found");
      return [];
    }

    const messages = JSON.parse(stdout) as (Message & {
      message_id: number;
      is_audio_message: number;
      cache_has_attachments: number;
      subject: string | null;
      content_type: number;
    })[];

    const processedMessages = await Promise.all(
      messages
        .filter(
          (msg) => msg.content !== null || msg.cache_has_attachments === 1,
        )
        .map(async (msg) => {
          let content = msg.content || "";
          let url: string | undefined;

          if (msg.content_type === 1) {
            const decoded = decodeAttributedBody(content);
            content = decoded.text;
            url = decoded.url;
          } else {
            const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) {
              url = urlMatch[1];
            }
          }

          let attachments: string[] = [];
          if (msg.cache_has_attachments) {
            attachments = await getAttachmentPaths(msg.message_id);
          }

          if (msg.subject) {
            content = `Subject: ${msg.subject}\n${content}`;
          }

          const formattedMsg: Message = {
            content: content || "[No text content]",
            date: new Date(msg.date).toISOString(),
            sender: msg.sender,
            is_from_me: Boolean(msg.is_from_me),
            messageType: 'unknown',
          };

          if (attachments.length > 0) {
            formattedMsg.attachments = attachments;
            formattedMsg.content += `\n[Attachments: ${attachments.length}]`;
          }

          if (url) {
            formattedMsg.url = url;
            formattedMsg.content += `\n[URL: ${url}]`;
          }

          return formattedMsg;
        }),
    );

    return processedMessages;
  } catch (error) {
    console.error("Error reading unread messages:", error);
    return [];
  }
}

async function scheduleMessage(
  phoneNumber: string,
  message: string,
  scheduledTime: Date,
) {
  const scheduledMessages = new Map();

  const delay = scheduledTime.getTime() - Date.now();

  if (delay < 0) {
    throw new Error("Cannot schedule message in the past");
  }

  const timeoutId = setTimeout(async () => {
    try {
      await sendMessageEnhanced(phoneNumber, message);
      scheduledMessages.delete(timeoutId);
    } catch (error) {
      console.error("Failed to send scheduled message:", error);
    }
  }, delay);

  scheduledMessages.set(timeoutId, {
    phoneNumber,
    message,
    scheduledTime,
    timeoutId,
  });

  return {
    id: timeoutId,
    scheduledTime,
    message,
    phoneNumber,
  };
}

// Legacy sendMessage for backward compatibility
async function sendMessage(phoneNumber: string, message: string) {
  const result = await sendMessageEnhanced(phoneNumber, message);
  if (!result.success) {
    throw new Error(result.message);
  }
  return result.message;
}

export default {
  // Enhanced functions
  sendMessageEnhanced,
  sendMessageConfirmed,
  readMessagesEnhanced,
  findBestContactMatches,
  getMessageThreads,
  detectMessageType,
  
  // Legacy functions for compatibility
  sendMessage,
  readMessages,
  scheduleMessage,
  getUnreadMessages,
};

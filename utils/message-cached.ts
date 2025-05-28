import ContactsCacheManager from "../cache-manager";
import messageOriginal from "./message-enhanced";
import contactsCached from "./contacts-cached";
import { runAppleScript } from "run-applescript";

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

interface MessageThread {
  contactName: string;
  phoneNumber: string;
  lastMessageDate: string;
  unreadCount: number;
  isGroup: boolean;
}

interface SendMessageOptions {
  verifyContact?: boolean;
  messageType?: 'auto' | 'imessage' | 'sms';
}

// Store pending confirmations (in production, this should be in a database or redis)
const pendingConfirmations = new Map<string, {
  validatedRecipient: string;
  validatedPhoneNumber: string;
  message: string;
  validatedMessageType: 'imessage' | 'sms' | 'unknown';
  timestamp: number;
}>();

class MessageCachedWrapper {
  private cacheManager: ContactsCacheManager;

  constructor() {
    this.cacheManager = new ContactsCacheManager();
  }

  /**
   * Generate a unique confirmation token
   */
  private generateConfirmationToken(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old confirmations (older than 5 minutes)
   */
  private cleanupOldConfirmations() {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    for (const [token, data] of pendingConfirmations.entries()) {
      if (data.timestamp < fiveMinutesAgo) {
        pendingConfirmations.delete(token);
      }
    }
  }

  /**
   * Fast message type detection using cache
   */
  async detectMessageType(phoneNumber: string): Promise<'imessage' | 'sms' | 'unknown'> {
    try {
      // Check cache first
      const cachedCapability = await this.cacheManager.getMessageCapability(phoneNumber);
      
      if (cachedCapability) {
        console.error(`📱 Using cached message type for ${phoneNumber}: ${cachedCapability.type} (confidence: ${cachedCapability.confidence})`);
        return cachedCapability.type;
      } else {
        console.error(`⚠️ No cached capability for ${phoneNumber}, falling back to live detection`);
        // Fallback to original detection but don't cache here (daemon will handle it)
        return await this.detectMessageTypeLive(phoneNumber);
      }
    } catch (error) {
      console.error("❌ Cache error during message type detection:", error);
      return await this.detectMessageTypeLive(phoneNumber);
    }
  }

  private async detectMessageTypeLive(phoneNumber: string): Promise<'imessage' | 'sms' | 'unknown'> {
    // Use the original detection logic but simplified
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
      console.error("Error in live message type detection:", error);
      return 'unknown';
    }
  }

  /**
   * Enhanced contact search with cache
   */
  async findBestContactMatches(searchTerm: string, limit = 5) {
    try {
      // Use the cached contacts for much faster searching
      return await contactsCached.findBestMatches(searchTerm, limit);
    } catch (error) {
      console.error("❌ Error in cached contact search:", error);
      return [];
    }
  }

  /**
   * Enhanced message sending with cache-aware contact verification
   * Now handles the complete flow without delegating to message-enhanced.ts
   */
  async sendMessageEnhanced(
    phoneNumberOrName: string, 
    message: string, 
    options: SendMessageOptions = {}
  ) {
    try {
      const { verifyContact = true, messageType = 'auto' } = options;
      
      let targetPhoneNumber = phoneNumberOrName;
      let recipientName: string | undefined;
      
      // Step 1: Fast contact resolution using cache
      const isPhoneNumber = /^\+?[0-9\s\-\(\)\.]+$/.test(phoneNumberOrName);
      
      if (!isPhoneNumber) {
        console.error(`🔍 Searching for contact in cache: ${phoneNumberOrName}`);
        const matches = await this.findBestContactMatches(phoneNumberOrName, 3);
        
        if (matches.length === 0) {
          return {
            success: false,
            message: `No contact found matching "${phoneNumberOrName}". Try a different name or use the phone number directly.`
          };
        }
        
        const bestMatch = matches[0];
        recipientName = bestMatch.name;
        
        // Smart phone number selection: prefer normalized formats over parentheses
        console.log(`🔧 DEBUG: Available phone numbers for ${bestMatch.name}: ${JSON.stringify(bestMatch.phoneNumbers)}`);
        
        const validNumbers = bestMatch.phoneNumbers.filter(num => num && num.trim() !== '');
        if (validNumbers.length === 0) {
          return {
            success: false,
            message: `Contact "${bestMatch.name}" found but has no valid phone numbers.`
          };
        }
        
        // Prefer numbers that start with + or are already normalized, then fall back to any valid number
        const preferredNumber = validNumbers.find(num => num.startsWith('+')) || 
                               validNumbers.find(num => /^\d{10,11}$/.test(num.replace(/\D/g, ''))) ||
                               validNumbers[0];
        
        console.log(`🔧 DEBUG: Selected phone number: "${preferredNumber}" from available: ${JSON.stringify(validNumbers)}`);
        
        targetPhoneNumber = preferredNumber;
        
        if (matches.length > 1) {
          const alternativeContacts = matches.slice(1, 3).map(m => m.name).join(', ');
          console.error(`Multiple contacts found. Using: ${bestMatch.name}. Alternatives: ${alternativeContacts}`);
        }
      } else {
        // Phone number provided - try to find contact name using cache
        if (verifyContact) {
          recipientName = await contactsCached.findContactByPhone(phoneNumberOrName);
        }
      }
      
      // Step 2: Normalize phone number
      const normalizedNumbers = this.normalizePhoneNumber(targetPhoneNumber);
      if (normalizedNumbers.length === 0) {
        return {
          success: false,
          message: `Invalid phone number format: ${targetPhoneNumber}`
        };
      }
      
      const primaryNumber = normalizedNumbers[0];
      
      // Step 3: Fast message type detection using cache
      let detectedMessageType: 'imessage' | 'sms' | 'unknown' = 'unknown';
      if (messageType === 'auto') {
        detectedMessageType = await this.detectMessageType(primaryNumber);
      }
      
      const finalMessageType = messageType === 'auto' ? detectedMessageType : messageType as any;
      const displayName = recipientName || targetPhoneNumber;
      
      // Step 4: Generate confirmation token and store pending confirmation
      this.cleanupOldConfirmations(); // Clean up old confirmations first
      const confirmationToken = this.generateConfirmationToken();
      
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
   * Send confirmed message - handles the complete token-based confirmation flow
   */
  async sendMessageConfirmed(
    confirmationTokenOrRecipient: string,
    validatedPhoneNumberOrConfirmation?: string,
    message?: string,
    validatedMessageType: 'imessage' | 'sms' | 'unknown' = 'auto'
  ) {
    // Check if this is the new token-based system (single string parameter that looks like a token)
    if (confirmationTokenOrRecipient.startsWith('confirm_') && !validatedPhoneNumberOrConfirmation) {
      // New token-based system - handle it entirely here
      return await this.sendMessageConfirmedByToken(confirmationTokenOrRecipient);
    } else if (confirmationTokenOrRecipient.startsWith('confirm_') && validatedPhoneNumberOrConfirmation) {
      // New token-based system with user confirmation
      return await this.sendMessageConfirmedByToken(confirmationTokenOrRecipient, validatedPhoneNumberOrConfirmation);
    } else {
      // Legacy parameter-based system - delegate to original implementation
      return await messageOriginal.sendMessageConfirmed(
        confirmationTokenOrRecipient, // This is validatedRecipient in legacy mode
        validatedPhoneNumberOrConfirmation!, // This is validatedPhoneNumber in legacy mode
        message!,
        validatedMessageType
      );
    }
  }

  /**
   * Handle token-based confirmation entirely within cached version
   */
  private async sendMessageConfirmedByToken(
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
      this.cleanupOldConfirmations();
      
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
      const escapedMessage = message.replace(/"/g, '\\\\"');
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
   * Enhanced message reading with cache-aware contact resolution
   * Now handles the complete flow without delegating to message-enhanced.ts
   */
  async readMessagesEnhanced(
    phoneNumberOrName: string,
    limit = 10,
    includeContext = true
  ) {
    try {
      // Fast contact resolution using cache
      let targetPhoneNumber = phoneNumberOrName;
      let contactName: string | undefined;
      
      const isPhoneNumber = /^\+?[0-9\s\-\(\)\.]+$/.test(phoneNumberOrName);
      
      if (!isPhoneNumber) {
        const matches = await this.findBestContactMatches(phoneNumberOrName, 1);
        if (matches.length === 0) {
          return {
            success: false,
            messages: [],
          };
        }
        
        const bestMatch = matches[0];
        contactName = bestMatch.name;
        
        // Smart phone number selection: prefer normalized formats over parentheses
        const validNumbers = bestMatch.phoneNumbers.filter(num => num && num.trim() !== '');
        if (validNumbers.length === 0) {
          return {
            success: false,
            messages: [],
          };
        }
        
        // Prefer numbers that start with + or are already normalized, then fall back to any valid number
        const preferredNumber = validNumbers.find(num => num.startsWith('+')) || 
                               validNumbers.find(num => /^\d{10,11}$/.test(num.replace(/\D/g, ''))) ||
                               validNumbers[0];
        
        targetPhoneNumber = preferredNumber;
      } else {
        contactName = await contactsCached.findContactByPhone(phoneNumberOrName);
      }

      // Use original implementation for actual message reading (this doesn't involve contact search)
      const messages = await messageOriginal.readMessages(targetPhoneNumber, limit);
      
      // Enhanced messages with fast message type detection
      const enhancedMessages = await Promise.all(
        messages.map(async (msg) => {
          const messageType = await this.detectMessageType(msg.sender);
          return {
            ...msg,
            messageType,
            thread_id: targetPhoneNumber,
          };
        })
      );

      // Get thread context using original implementation
      let threadInfo;
      if (includeContext) {
        const threads = await messageOriginal.getMessageThreads(50);
        const currentThread = threads.find(t => 
          t.phoneNumber === targetPhoneNumber || t.contactName === contactName
        );
        
        if (currentThread) {
          threadInfo = {
            totalMessages: messages.length,
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

  /**
   * Get message threads (delegate to original)
   */
  async getMessageThreads(limit = 20): Promise<MessageThread[]> {
    return await messageOriginal.getMessageThreads(limit);
  }

  /**
   * Legacy functions - delegate to original implementations
   */
  async sendMessage(phoneNumber: string, message: string) {
    return await messageOriginal.sendMessage(phoneNumber, message);
  }

  async readMessages(phoneNumber: string, limit = 10): Promise<Message[]> {
    return await messageOriginal.readMessages(phoneNumber, limit);
  }

  async scheduleMessage(phoneNumber: string, message: string, scheduledTime: Date) {
    return await messageOriginal.scheduleMessage(phoneNumber, message, scheduledTime);
  }

  async getUnreadMessages(limit = 10): Promise<Message[]> {
    return await messageOriginal.getUnreadMessages(limit);
  }

  // Utility methods
  private normalizePhoneNumber(phone: string): string[] {
    if (!phone || typeof phone !== 'string') return [];
    
    console.log(`🔧 DEBUG: Normalizing phone number: "${phone}"`);
    
    // Remove all non-digit characters except + (handles parentheses, dashes, spaces, dots)
    // This regex is more robust and handles (323) 656-8914 format specifically
    const cleaned = phone.replace(/[^\d+]/g, "");
    
    console.log(`🔧 DEBUG: Cleaned phone number: "${cleaned}"`);
    
    // Handle various formats
    const formats = new Set<string>();

    if (cleaned.length === 10) {
      // US number without country code: 3236568914
      formats.add(`+1${cleaned}`);
      formats.add(cleaned);
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      // US number with country code: 13236568914
      formats.add(`+${cleaned}`);
      formats.add(cleaned.substring(1));
    } else if (cleaned.startsWith('+1') && cleaned.length === 12) {
      // International format: +13236568914
      formats.add(cleaned);
      formats.add(cleaned.substring(2));
    } else if (cleaned.startsWith('+') && cleaned.length > 10) {
      // Other international formats
      formats.add(cleaned);
    } else if (cleaned.length > 0) {
      // Fallback: add the cleaned number as-is if it has any digits
      formats.add(cleaned);
      // Also try adding +1 prefix if it's not already there
      if (!cleaned.startsWith('+') && !cleaned.startsWith('1')) {
        formats.add(`+1${cleaned}`);
      }
    }

    const result = Array.from(formats);
    console.log(`🔧 DEBUG: Normalized formats: ${JSON.stringify(result)}`);
    
    return result;
  }

  // Cache management
  async getCacheStatus() {
    const cacheAge = await this.cacheManager.getCacheAge();
    const isStale = await this.cacheManager.isCacheStale();
    const allContacts = await this.cacheManager.getAllContacts();

    return {
      age: Math.floor(cacheAge / (1000 * 60 * 60)), // Hours
      stale: isStale,
      contactsCount: allContacts.length,
      capabilitiesCount: this.cacheManager.capabilities ? this.cacheManager.capabilities.size : 0
    };
  }

  async refreshCache(): Promise<void> {
    console.error("🔄 Manually refreshing message cache...");
    await this.cacheManager.fullUpdate();
  }
}

// Create and export singleton instance
const messageCached = new MessageCachedWrapper();

export default {
  // Enhanced functions
  sendMessageEnhanced: (phoneNumberOrName: string, message: string, options?: SendMessageOptions) => 
    messageCached.sendMessageEnhanced(phoneNumberOrName, message, options),
  sendMessageConfirmed: (confirmationTokenOrRecipient: string, validatedPhoneNumberOrConfirmation?: string, message?: string, validatedMessageType?: 'imessage' | 'sms' | 'unknown') =>
    messageCached.sendMessageConfirmed(confirmationTokenOrRecipient, validatedPhoneNumberOrConfirmation, message, validatedMessageType),
  readMessagesEnhanced: (phoneNumberOrName: string, limit?: number, includeContext?: boolean) =>
    messageCached.readMessagesEnhanced(phoneNumberOrName, limit, includeContext),
  findBestContactMatches: (searchTerm: string, limit?: number) =>
    messageCached.findBestContactMatches(searchTerm, limit),
  getMessageThreads: (limit?: number) =>
    messageCached.getMessageThreads(limit),
  detectMessageType: (phoneNumber: string) =>
    messageCached.detectMessageType(phoneNumber),
  
  // Legacy functions for compatibility
  sendMessage: (phoneNumber: string, message: string) =>
    messageCached.sendMessage(phoneNumber, message),
  readMessages: (phoneNumber: string, limit?: number) =>
    messageCached.readMessages(phoneNumber, limit),
  scheduleMessage: (phoneNumber: string, message: string, scheduledTime: Date) =>
    messageCached.scheduleMessage(phoneNumber, message, scheduledTime),
  getUnreadMessages: (limit?: number) =>
    messageCached.getUnreadMessages(limit),

  // Cache management
  getCacheStatus: () => messageCached.getCacheStatus(),
  refreshCache: () => messageCached.refreshCache(),
};

import ContactsCacheManager from "../cache-manager";
import messageOriginal from "./message-enhanced";
import contactsCached from "./contacts-cached";

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

class MessageCachedWrapper {
  private cacheManager: ContactsCacheManager;

  constructor() {
    this.cacheManager = new ContactsCacheManager();
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

      const { runAppleScript } = await import("run-applescript");
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
        
        const validPhoneNumber = bestMatch.phoneNumbers.find(num => num && num.trim() !== '');
        if (!validPhoneNumber) {
          return {
            success: false,
            message: `Contact "${bestMatch.name}" found but has no valid phone numbers.`
          };
        }
        
        targetPhoneNumber = validPhoneNumber;
        
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
      
      // Step 4: Delegate to original enhanced version for token management
      return await messageOriginal.sendMessageEnhanced(phoneNumberOrName, message, options);
      
    } catch (error) {
      return {
        success: false,
        message: `Failed to prepare message: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Send confirmed message - supports both new token-based and legacy parameter-based systems
   */
  async sendMessageConfirmed(
    confirmationTokenOrRecipient: string,
    validatedPhoneNumberOrConfirmation?: string,
    message?: string,
    validatedMessageType: 'imessage' | 'sms' | 'unknown' = 'auto'
  ) {
    // Check if this is the new token-based system (single string parameter that looks like a token)
    if (confirmationTokenOrRecipient.startsWith('confirm_') && !validatedPhoneNumberOrConfirmation) {
      // New token-based system
      return await messageOriginal.sendMessageConfirmed(confirmationTokenOrRecipient);
    } else if (confirmationTokenOrRecipient.startsWith('confirm_') && validatedPhoneNumberOrConfirmation) {
      // New token-based system with user confirmation
      return await messageOriginal.sendMessageConfirmed(confirmationTokenOrRecipient, validatedPhoneNumberOrConfirmation);
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
   * Enhanced message reading with cache-aware contact resolution
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
        
        const validPhoneNumber = bestMatch.phoneNumbers.find(num => num && num.trim() !== '');
        if (!validPhoneNumber) {
          return {
            success: false,
            messages: [],
          };
        }
        
        targetPhoneNumber = validPhoneNumber;
      } else {
        contactName = await contactsCached.findContactByPhone(phoneNumberOrName);
      }

      // Use original implementation for actual message reading
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
    
    const cleaned = phone.replace(/[^0-9+]/g, "");
    if (cleaned.length < 10) return [];

    const formats = new Set<string>();

    if (/^\+1\d{10}$/.test(cleaned)) {
      formats.add(cleaned);
      formats.add(cleaned.substring(2));
    } else if (/^1\d{10}$/.test(cleaned)) {
      formats.add(`+${cleaned}`);
      formats.add(cleaned.substring(1));
    } else if (/^\d{10}$/.test(cleaned)) {
      formats.add(`+1${cleaned}`);
      formats.add(cleaned);
    }

    return Array.from(formats);
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

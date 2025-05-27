#!/usr/bin/env bun
import { runAppleScript } from "run-applescript";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = __dirname;
const CONTACTS_CACHE_FILE = join(CACHE_DIR, "contacts-cache.json");
const MESSAGE_CAPABILITIES_CACHE_FILE = join(CACHE_DIR, "message-capabilities-cache.json");
const CACHE_METADATA_FILE = join(CACHE_DIR, "cache-metadata.json");

interface CachedContact {
  name: string;
  phoneNumbers: string[];
  emails?: string[];
  lastUpdated: number;
}

interface MessageCapability {
  phoneNumber: string;
  type: 'imessage' | 'sms' | 'unknown';
  lastTested: number;
  confidence: number; // 0-1 scale
}

interface CacheMetadata {
  lastFullUpdate: number;
  contactsCount: number;
  capabilitiesCount: number;
  version: string;
}

export class ContactsCacheManager {
  private contacts: Map<string, CachedContact> = new Map();
  private capabilities: Map<string, MessageCapability> = new Map();
  private metadata: CacheMetadata = {
    lastFullUpdate: 0,
    contactsCount: 0,
    capabilitiesCount: 0,
    version: "1.0.0"
  };

  constructor() {
    console.error("🚀 ContactsCacheManager initialized");
  }

  async loadExistingCache(): Promise<boolean> {
    try {
      if (existsSync(CONTACTS_CACHE_FILE)) {
        const contactsData = await readFile(CONTACTS_CACHE_FILE, 'utf8');
        const contactsArray = JSON.parse(contactsData) as CachedContact[];
        this.contacts.clear();
        contactsArray.forEach(contact => {
          this.contacts.set(contact.name.toLowerCase(), contact);
        });
        console.error(`📂 Loaded ${contactsArray.length} contacts from cache`);
      }

      if (existsSync(MESSAGE_CAPABILITIES_CACHE_FILE)) {
        const capabilitiesData = await readFile(MESSAGE_CAPABILITIES_CACHE_FILE, 'utf8');
        const capabilitiesArray = JSON.parse(capabilitiesData) as MessageCapability[];
        this.capabilities.clear();
        capabilitiesArray.forEach(cap => {
          this.capabilities.set(cap.phoneNumber, cap);
        });
        console.error(`📱 Loaded ${capabilitiesArray.length} message capabilities from cache`);
      }

      if (existsSync(CACHE_METADATA_FILE)) {
        const metadataData = await readFile(CACHE_METADATA_FILE, 'utf8');
        this.metadata = JSON.parse(metadataData);
        console.error(`ℹ️ Cache last updated: ${new Date(this.metadata.lastFullUpdate).toLocaleString()}`);
      }

      return true;
    } catch (error) {
      console.error("❌ Error loading existing cache:", error);
      return false;
    }
  }

  async extractAllContacts(): Promise<void> {
    console.error("🔄 Starting full contacts extraction...");
    const startTime = Date.now();

    try {
      const contactsScript = `
tell application "Contacts"
    set resultList to {}
    set peopleList to every person
    set totalPeople to count of peopleList
    
    repeat with i from 1 to totalPeople
        try
            set currentPerson to item i of peopleList
            set personName to name of currentPerson
            set phoneList to {}
            set emailList to {}
            
            -- Extract phone numbers
            repeat with phoneRecord in phones of currentPerson
                try
                    set phoneValue to value of phoneRecord
                    if phoneValue is not missing value and phoneValue is not "" then
                        set end of phoneList to phoneValue
                    end if
                on error
                    -- Skip invalid phone entries
                end try
            end repeat
            
            -- Extract emails
            repeat with emailRecord in emails of currentPerson
                try
                    set emailValue to value of emailRecord
                    if emailValue is not missing value and emailValue is not "" then
                        set end of emailList to emailValue
                    end if
                on error
                    -- Skip invalid email entries
                end try
            end repeat
            
            if (count of phoneList) > 0 then
                set phoneString to ""
                repeat with phoneNum in phoneList
                    if phoneString is "" then
                        set phoneString to phoneNum
                    else
                        set phoneString to phoneString & "|" & phoneNum
                    end if
                end repeat
                
                set emailString to ""
                repeat with emailAddr in emailList
                    if emailString is "" then
                        set emailString to emailAddr
                    else
                        set emailString to emailString & "|" & emailAddr
                    end if
                end repeat
                
                set contactData to personName & ":" & phoneString & ":" & emailString
                set end of resultList to contactData
            end if
            
            -- Progress indicator every 100 contacts
            if i mod 100 = 0 then
                log "Processed " & i & " of " & totalPeople & " contacts"
            end if
            
        on error
            -- Skip contacts that can't be processed
        end try
    end repeat
    
    -- Convert list to string with newlines
    set resultString to ""
    repeat with resultItem in resultList
        if resultString is "" then
            set resultString to resultItem as string
        else
            set resultString to resultString & "\n" & (resultItem as string)
        end if
    end repeat
    
    return resultString
end tell`;

      const result = await runAppleScript(contactsScript);
      console.error("📞 AppleScript completed, parsing results...");

      // Parse and store contacts
      this.contacts.clear();
      const now = Date.now();
      
      if (result && result.trim() !== '') {
        const contactEntries = result.split('\n');
        
        for (const entry of contactEntries) {
          if (entry.trim() === '') continue;
          
          const parts = entry.split(':');
          if (parts.length < 2) continue;
          
          const name = parts[0].trim();
          const phonesString = parts[1].trim();
          const emailsString = parts.length > 2 ? parts[2].trim() : '';
          
          if (name && phonesString) {
            const phoneNumbers = phonesString.split('|').map(phone => phone.trim()).filter(phone => phone !== '');
            const emails = emailsString ? emailsString.split('|').map(email => email.trim()).filter(email => email !== '') : [];
            
            if (phoneNumbers.length > 0) {
              const contact: CachedContact = {
                name,
                phoneNumbers,
                emails,
                lastUpdated: now
              };
              
              this.contacts.set(name.toLowerCase(), contact);
            }
          }
        }
      }

      console.error(`✅ Extracted ${this.contacts.size} contacts in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error("❌ Error extracting contacts:", error);
      throw error;
    }
  }

  async testMessageCapabilities(): Promise<void> {
    console.error("🔄 Testing message capabilities for all phone numbers...");
    const startTime = Date.now();

    // Collect all unique phone numbers
    const allPhoneNumbers = new Set<string>();
    for (const contact of this.contacts.values()) {
      contact.phoneNumbers.forEach(phone => {
        // Normalize phone number
        const normalized = this.normalizePhoneNumber(phone);
        if (normalized) allPhoneNumbers.add(normalized);
      });
    }

    console.error(`📱 Testing capabilities for ${allPhoneNumbers.size} unique phone numbers...`);

    // Test capabilities in batches to avoid overwhelming the system
    const phoneArray = Array.from(allPhoneNumbers);
    const batchSize = 10;
    const now = Date.now();

    for (let i = 0; i < phoneArray.length; i += batchSize) {
      const batch = phoneArray.slice(i, i + batchSize);
      console.error(`🔄 Testing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(phoneArray.length / batchSize)} (${batch.length} numbers)`);

      // Test each number in the batch
      for (const phoneNumber of batch) {
        try {
          const capability = await this.testSingleMessageCapability(phoneNumber);
          this.capabilities.set(phoneNumber, {
            phoneNumber,
            type: capability,
            lastTested: now,
            confidence: this.calculateConfidence(capability)
          });
        } catch (error) {
          console.error(`⚠️ Error testing ${phoneNumber}:`, error);
          // Store as unknown with low confidence
          this.capabilities.set(phoneNumber, {
            phoneNumber,
            type: 'unknown',
            lastTested: now,
            confidence: 0.1
          });
        }
      }

      // Small delay between batches to be nice to the system
      if (i + batchSize < phoneArray.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.error(`✅ Completed capability testing in ${Date.now() - startTime}ms`);
  }

  private async testSingleMessageCapability(phoneNumber: string): Promise<'imessage' | 'sms' | 'unknown'> {
    try {
      const script = `
tell application "Messages"
    try
        -- First check if we have an existing conversation with this number
        set existingChats to every text chat
        repeat with currentChat in existingChats
            try
                set participants to participants of currentChat
                repeat with participant in participants
                    if id of participant contains "${phoneNumber}" then
                        set chatService to service of currentChat
                        if service type of chatService is iMessage then
                            return "imessage"
                        else if service type of chatService is SMS then
                            return "sms"
                        end if
                    end if
                end repeat
            on error
                -- Skip problematic chats
            end try
        end repeat
        
        -- If no existing chat, try to determine capability by service
        try
            set targetService to 1st service whose service type = iMessage
            set targetBuddy to buddy "${phoneNumber}" of targetService
            if targetBuddy exists then
                return "imessage"
            end if
        on error
            -- iMessage service not available or buddy doesn't exist
        end try
        
        try
            set targetService to 1st service whose service type = SMS
            set targetBuddy to buddy "${phoneNumber}" of targetService
            if targetBuddy exists then
                return "sms"
            end if
        on error
            -- SMS service not available or buddy doesn't exist
        end try
        
        -- If no existing buddy, make educated guess based on number format
        if "${phoneNumber}" starts with "+1" then
            return "imessage" -- US numbers more likely to support iMessage
        else
            return "sms" -- International numbers default to SMS
        end if
        
    on error
        return "unknown"
    end try
end tell`;

      const result = await runAppleScript(script);
      return result.trim() as 'imessage' | 'sms' | 'unknown';
    } catch (error) {
      console.error(`Error testing message capability for ${phoneNumber}:`, error);
      return 'unknown';
    }
  }

  private normalizePhoneNumber(phone: string): string | null {
    if (!phone || typeof phone !== 'string') return null;
    
    // Remove all non-numeric characters except +
    const cleaned = phone.replace(/[^0-9+]/g, "");
    
    // Validate input
    if (cleaned.length < 10) return null;
    
    // Handle different input formats
    if (/^\+1\d{10}$/.test(cleaned)) {
      return cleaned;
    } else if (/^1\d{10}$/.test(cleaned)) {
      return `+${cleaned}`;
    } else if (/^\d{10}$/.test(cleaned)) {
      return `+1${cleaned}`;
    }
    
    return cleaned; // Return as-is for international numbers
  }

  private calculateConfidence(type: 'imessage' | 'sms' | 'unknown'): number {
    switch (type) {
      case 'imessage': return 0.9; // High confidence if detected as iMessage
      case 'sms': return 0.8; // Good confidence if detected as SMS
      case 'unknown': return 0.3; // Low confidence if unknown
      default: return 0.1;
    }
  }

  async saveCache(): Promise<void> {
    console.error("💾 Saving cache to disk...");

    try {
      // Ensure cache directory exists
      if (!existsSync(CACHE_DIR)) {
        await mkdir(CACHE_DIR, { recursive: true });
      }

      // Save contacts
      const contactsArray = Array.from(this.contacts.values());
      await writeFile(CONTACTS_CACHE_FILE, JSON.stringify(contactsArray, null, 2));

      // Save capabilities
      const capabilitiesArray = Array.from(this.capabilities.values());
      await writeFile(MESSAGE_CAPABILITIES_CACHE_FILE, JSON.stringify(capabilitiesArray, null, 2));

      // Update and save metadata
      this.metadata = {
        lastFullUpdate: Date.now(),
        contactsCount: this.contacts.size,
        capabilitiesCount: this.capabilities.size,
        version: "1.0.0"
      };
      await writeFile(CACHE_METADATA_FILE, JSON.stringify(this.metadata, null, 2));

      console.error(`✅ Cache saved successfully:`);
      console.error(`   📂 ${contactsArray.length} contacts`);
      console.error(`   📱 ${capabilitiesArray.length} message capabilities`);
      console.error(`   📊 ${(await this.getCacheSize()).toFixed(2)} MB total`);
    } catch (error) {
      console.error("❌ Error saving cache:", error);
      throw error;
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      const files = [CONTACTS_CACHE_FILE, MESSAGE_CAPABILITIES_CACHE_FILE, CACHE_METADATA_FILE];
      let totalSize = 0;
      
      for (const file of files) {
        if (existsSync(file)) {
          const content = await readFile(file, 'utf8');
          totalSize += Buffer.byteLength(content, 'utf8');
        }
      }
      
      return totalSize / (1024 * 1024); // Convert to MB
    } catch (error) {
      return 0;
    }
  }

  async fullUpdate(): Promise<void> {
    console.error("🔄 Starting full cache update...");
    const startTime = Date.now();

    try {
      // Load existing cache first
      await this.loadExistingCache();

      // Extract all contacts
      await this.extractAllContacts();

      // Test message capabilities
      await this.testMessageCapabilities();

      // Save everything
      await this.saveCache();

      const duration = Date.now() - startTime;
      console.error(`✅ Full cache update completed in ${(duration / 1000).toFixed(2)} seconds`);
      console.error(`   📊 ${this.contacts.size} contacts, ${this.capabilities.size} capabilities`);
    } catch (error) {
      console.error("❌ Full cache update failed:", error);
      throw error;
    }
  }

  // Quick access methods for the MCP
  async findContactByName(name: string): Promise<CachedContact | null> {
    if (this.contacts.size === 0) {
      await this.loadExistingCache();
    }

    const normalizedName = name.toLowerCase();
    
    // Exact match first
    if (this.contacts.has(normalizedName)) {
      return this.contacts.get(normalizedName)!;
    }

    // IMPROVED: Proper fuzzy search with scoring (fixes Ana->Liliana bug)
    let bestMatch: CachedContact | null = null;
    let bestScore = 0;

    for (const [key, contact] of this.contacts) {
      let score = 0;
      
      // Scoring system (higher = better):
      if (key === normalizedName) {
        score = 100; // Exact match
      } else if (key.startsWith(normalizedName + ' ')) {
        score = 90; // Starts with search term + space (e.g., "ana samat")
      } else if (key.startsWith(normalizedName)) {
        score = 80; // Starts with search term
      } else if (key.includes(' ' + normalizedName + ' ')) {
        score = 70; // Full word in middle
      } else if (key.endsWith(' ' + normalizedName)) {
        score = 60; // Full word at end
      } else if (key.includes(normalizedName)) {
        score = 20; // Contains as substring (much lower priority)
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = contact;
      }
    }

    // Only return matches with reasonable scores (prevents Ana->Liliana)
    return bestScore >= 60 ? bestMatch : null;
  }

  async getMessageCapability(phoneNumber: string): Promise<MessageCapability | null> {
    if (this.capabilities.size === 0) {
      await this.loadExistingCache();
    }

    const normalized = this.normalizePhoneNumber(phoneNumber);
    if (!normalized) return null;

    return this.capabilities.get(normalized) || null;
  }

  async getAllContacts(): Promise<CachedContact[]> {
    if (this.contacts.size === 0) {
      await this.loadExistingCache();
    }

    return Array.from(this.contacts.values());
  }

  async getCacheAge(): Promise<number> {
    if (this.metadata.lastFullUpdate === 0) {
      await this.loadExistingCache();
    }

    return Date.now() - this.metadata.lastFullUpdate;
  }

  async isCacheStale(maxAgeHours = 24): Promise<boolean> {
    const ageMs = await this.getCacheAge();
    return ageMs > (maxAgeHours * 60 * 60 * 1000);
  }
}

// CLI interface for manual cache management
async function main() {
  const command = process.argv[2];
  const manager = new ContactsCacheManager();

  switch (command) {
    case 'update':
      console.error("🚀 Starting manual cache update...");
      await manager.fullUpdate();
      break;

    case 'status':
      await manager.loadExistingCache();
      const cacheAge = await manager.getCacheAge();
      const cacheSize = await manager.getCacheSize();
      const isStale = await manager.isCacheStale();
      
      console.error("📊 Cache Status:");
      console.error(`   📂 Contacts: ${(await manager.getAllContacts()).length}`);
      console.error(`   📱 Capabilities: ${manager.capabilities.size}`);
      console.error(`   🕐 Age: ${(cacheAge / (1000 * 60 * 60)).toFixed(1)} hours`);
      console.error(`   📏 Size: ${cacheSize.toFixed(2)} MB`);
      console.error(`   ⚠️ Stale: ${isStale ? 'YES' : 'NO'}`);
      break;

    case 'test':
      await manager.loadExistingCache();
      const testName = process.argv[3] || 'Ana';
      const contact = await manager.findContactByName(testName);
      
      if (contact) {
        console.error(`✅ Found contact: ${contact.name}`);
        console.error(`   📞 Phone numbers: ${contact.phoneNumbers.join(', ')}`);
        
        for (const phone of contact.phoneNumbers) {
          const capability = await manager.getMessageCapability(phone);
          if (capability) {
            console.error(`   📱 ${phone}: ${capability.type} (confidence: ${capability.confidence})`);
          }
        }
      } else {
        console.error(`❌ Contact "${testName}" not found`);
      }
      break;

    default:
      console.error("📖 Usage:");
      console.error("   bun cache-manager.ts update   - Update the cache");
      console.error("   bun cache-manager.ts status   - Show cache status");
      console.error("   bun cache-manager.ts test [name] - Test contact lookup");
      break;
  }
}

// Run CLI if called directly
if (import.meta.main) {
  main().catch(console.error);
}

export default ContactsCacheManager;

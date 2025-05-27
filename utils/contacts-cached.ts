import ContactsCacheManager from "../cache-manager";
import contactsOriginal from "./contacts";

// Cache-aware wrapper for contacts functionality
class ContactsCachedWrapper {
  private cacheManager: ContactsCacheManager;

  constructor() {
    this.cacheManager = new ContactsCacheManager();
  }

  async getAllNumbers(): Promise<{ [key: string]: string[] }> {
    try {
      // Try cache first
      const cachedContacts = await this.cacheManager.getAllContacts();
      
      if (cachedContacts.length > 0) {
        console.error(`📂 Using cached contacts (${cachedContacts.length} contacts)`);
        
        // Convert to expected format
        const result: { [key: string]: string[] } = {};
        for (const contact of cachedContacts) {
          result[contact.name] = contact.phoneNumbers;
        }
        return result;
      } else {
        console.error("⚠️ Cache empty, falling back to live AppleScript call");
        // Fallback to original implementation
        return await contactsOriginal.getAllNumbers();
      }
    } catch (error) {
      console.error("❌ Cache error, falling back to live AppleScript call:", error);
      // Fallback to original implementation
      return await contactsOriginal.getAllNumbers();
    }
  }

  async findNumber(name: string): Promise<string[]> {
    try {
      // Try cache first with fuzzy matching
      const cachedContact = await this.cacheManager.findContactByName(name);
      
      if (cachedContact) {
        console.error(`📂 Found contact in cache: ${cachedContact.name} -> ${cachedContact.phoneNumbers.length} numbers`);
        return cachedContact.phoneNumbers;
      } else {
        console.error(`⚠️ Contact "${name}" not in cache, falling back to live AppleScript call`);
        // Fallback to original implementation
        return await contactsOriginal.findNumber(name);
      }
    } catch (error) {
      console.error("❌ Cache error, falling back to live AppleScript call:", error);
      // Fallback to original implementation
      return await contactsOriginal.findNumber(name);
    }
  }

  async findContactByPhone(phoneNumber: string): Promise<string | null> {
    try {
      // Try cache first
      const cachedContacts = await this.cacheManager.getAllContacts();
      
      if (cachedContacts.length > 0) {
        // Normalize the search number
        const searchNumber = phoneNumber.replace(/[^0-9+]/g, "");
        
        // Search through cached contacts
        for (const contact of cachedContacts) {
          const normalizedNumbers = contact.phoneNumbers.map((num) =>
            num.replace(/[^0-9+]/g, "")
          );
          
          const found = normalizedNumbers.some(
            (num) =>
              num === searchNumber ||
              num === `+${searchNumber}` ||
              num === `+1${searchNumber}` ||
              `+1${num}` === searchNumber
          );
          
          if (found) {
            console.error(`📂 Found contact by phone in cache: ${phoneNumber} -> ${contact.name}`);
            return contact.name;
          }
        }
        
        console.error(`📂 Phone number ${phoneNumber} not found in cache`);
        return null;
      } else {
        console.error("⚠️ Cache empty, falling back to live AppleScript call");
        // Fallback to original implementation
        return await contactsOriginal.findContactByPhone(phoneNumber);
      }
    } catch (error) {
      console.error("❌ Cache error, falling back to live AppleScript call:", error);
      // Fallback to original implementation
      return await contactsOriginal.findContactByPhone(phoneNumber);
    }
  }

  // Enhanced fuzzy search using cache
  async findBestMatches(searchTerm: string, limit = 5): Promise<Array<{
    name: string;
    phoneNumbers: string[];
    emails?: string[];
    matchScore: number;
  }>> {
    try {
      const cachedContacts = await this.cacheManager.getAllContacts();
      
      if (cachedContacts.length === 0) {
        console.error("⚠️ Cache empty, falling back to simple search");
        const numbers = await contactsOriginal.findNumber(searchTerm);
        return numbers.length > 0 ? [{
          name: searchTerm,
          phoneNumbers: numbers,
          matchScore: 100
        }] : [];
      }

      console.error(`📂 Performing fuzzy search in cache (${cachedContacts.length} contacts)`);

      // Score and rank contacts
      const scoredContacts = cachedContacts.map(contact => {
        const score = this.calculateMatchScore(searchTerm.toLowerCase(), contact.name.toLowerCase());
        return { 
          ...contact, 
          matchScore: score 
        };
      });

      // Filter and sort by score
      const results = scoredContacts
        .filter(contact => contact.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);

      console.error(`📂 Found ${results.length} fuzzy matches for "${searchTerm}"`);
      return results;
    } catch (error) {
      console.error("❌ Cache error during fuzzy search:", error);
      return [];
    }
  }

  private calculateMatchScore(searchTerm: string, contactName: string): number {
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
    
    // Fuzzy matching for typos
    const similarity = this.calculateSimilarity(searchTerm, contactName);
    if (similarity > 0.6) return Math.floor(similarity * 50);
    
    return 0;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const matches = shorter.split('').filter((char, i) => char === longer[i]).length;
    return matches / longer.length;
  }

  // Cache management methods
  async getCacheStatus(): Promise<{
    age: number;
    stale: boolean;
    contactsCount: number;
    size: number;
  }> {
    const age = await this.cacheManager.getCacheAge();
    const stale = await this.cacheManager.isCacheStale();
    const contacts = await this.cacheManager.getAllContacts();
    const size = await this.cacheManager.getCacheSize();

    return {
      age: Math.floor(age / (1000 * 60 * 60)), // Hours
      stale,
      contactsCount: contacts.length,
      size: Math.round(size * 100) / 100 // MB
    };
  }

  async refreshCache(): Promise<void> {
    console.error("🔄 Manually refreshing contacts cache...");
    await this.cacheManager.fullUpdate();
  }
}

// Create and export singleton instance
const contactsCached = new ContactsCachedWrapper();

export default {
  getAllNumbers: () => contactsCached.getAllNumbers(),
  findNumber: (name: string) => contactsCached.findNumber(name),
  findContactByPhone: (phoneNumber: string) => contactsCached.findContactByPhone(phoneNumber),
  findBestMatches: (searchTerm: string, limit?: number) => contactsCached.findBestMatches(searchTerm, limit),
  getCacheStatus: () => contactsCached.getCacheStatus(),
  refreshCache: () => contactsCached.refreshCache(),
};

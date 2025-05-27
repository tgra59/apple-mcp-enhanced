import { run } from "@jxa/run";
import { runAppleScript } from "run-applescript";

async function checkContactsAccess(): Promise<boolean> {
  try {
    // Try to get the count of contacts as a simple test
    await runAppleScript(`
tell application "Contacts"
    count every person
end tell`);
    return true;
  } catch (error) {
    throw new Error(
      "Cannot access Contacts app. Please grant access in System Preferences > Security & Privacy > Privacy > Contacts.",
    );
  }
}

async function getAllNumbers() {
  try {
    if (!(await checkContactsAccess())) {
      return {};
    }

    const nums: { [key: string]: string[] } = await run(() => {
      const Contacts = Application("Contacts");
      const people = Contacts.people();
      const phoneNumbers: { [key: string]: string[] } = {};

      for (const person of people) {
        try {
          const name = person.name();
          const phones = person
            .phones()
            .map((phone: unknown) => (phone as { value: string }).value);

          if (!phoneNumbers[name]) {
            phoneNumbers[name] = [];
          }
          phoneNumbers[name] = [...phoneNumbers[name], ...phones];
        } catch (error) {
          // Skip contacts that can't be processed
        }
      }

      return phoneNumbers;
    });

    return nums;
  } catch (error) {
    throw new Error(
      `Error accessing contacts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function findNumber(name: string) {
  try {
    if (!(await checkContactsAccess())) {
      return [];
    }

    console.error(`🔍 Fast contact search for: "${name}"`);
    const searchStart = Date.now();

    // FAST approach: Multiple targeted searches with scoring (no getAllNumbers!)
    const searchResults = await run((searchName: string) => {
      const Contacts = Application("Contacts");
      const results: Array<{ name: string; phones: string[]; score: number }> = [];
      
      // Strategy 1: Exact name match
      try {
        const exactPeople = Contacts.people.whose({ name: searchName });
        for (const person of exactPeople) {
          const phones = person.phones().map((phone: any) => phone.value()).filter((p: string) => p);
          if (phones.length > 0) {
            results.push({ name: person.name(), phones, score: 100 });
          }
        }
      } catch (e) { /* ignore */ }
      
      // Strategy 2: First name exact match  
      if (results.length === 0) {
        try {
          const firstNamePeople = Contacts.people.whose({ firstName: searchName });
          for (const person of firstNamePeople) {
            const phones = person.phones().map((phone: any) => phone.value()).filter((p: string) => p);
            if (phones.length > 0) {
              results.push({ name: person.name(), phones, score: 90 });
            }
          }
        } catch (e) { /* ignore */ }
      }
      
      // Strategy 3: Last name exact match
      if (results.length === 0) {
        try {
          const lastNamePeople = Contacts.people.whose({ lastName: searchName });
          for (const person of lastNamePeople) {
            const phones = person.phones().map((phone: any) => phone.value()).filter((p: string) => p);
            if (phones.length > 0) {
              results.push({ name: person.name(), phones, score: 85 });
            }
          }
        } catch (e) { /* ignore */ }
      }
      
      // Strategy 4: Name starts with search term
      if (results.length === 0) {
        try {
          const allPeople = Contacts.people();
          let foundCount = 0;
          for (const person of allPeople) {
            if (foundCount >= 10) break; // Limit to first 10 to avoid performance issues
            
            const fullName = person.name();
            if (fullName && fullName.toLowerCase().startsWith(searchName.toLowerCase() + " ")) {
              const phones = person.phones().map((phone: any) => phone.value()).filter((p: string) => p);
              if (phones.length > 0) {
                results.push({ name: fullName, phones, score: 80 });
                foundCount++;
              }
            }
          }
        } catch (e) { /* ignore */ }
      }
      
      // Strategy 5: Limited contains search (only if no better matches)
      if (results.length === 0) {
        try {
          const containsPeople = Contacts.people.whose({ name: { _contains: searchName } });
          let processedCount = 0;
          for (const person of containsPeople) {
            if (processedCount >= 5) break; // Limit to 5 results max
            
            const phones = person.phones().map((phone: any) => phone.value()).filter((p: string) => p);
            if (phones.length > 0) {
              const fullName = person.name();
              
              // Score based on match quality
              let score = 10; // Base score for contains
              const lowerName = fullName.toLowerCase();
              const lowerSearch = searchName.toLowerCase();
              
              if (lowerName.includes(" " + lowerSearch + " ")) score = 70; // Full word in middle
              else if (lowerName.endsWith(" " + lowerSearch)) score = 60; // Full word at end
              else if (lowerName.startsWith(lowerSearch)) score = 50; // Starts with
              
              results.push({ name: fullName, phones, score });
              processedCount++;
            }
          }
        } catch (e) { /* ignore */ }
      }
      
      // Sort by score (highest first) and return
      results.sort((a, b) => b.score - a.score);
      return results;
      
    }, name);

    const searchTime = Date.now() - searchStart;
    
    if (searchResults.length > 0) {
      const winner = searchResults[0];
      console.error(`🏆 Found "${winner.name}" (score: ${winner.score}) in ${searchTime}ms`);
      
      if (searchResults.length > 1) {
        console.error(`📋 Other matches: ${searchResults.slice(1).map(r => `"${r.name}" (${r.score})`).join(', ')}`);
      }
      
      return winner.phones;
    } else {
      console.error(`❌ No contact found for "${name}" in ${searchTime}ms`);
      return [];
    }

  } catch (error) {
    console.error("Error in findNumber:", error);
    throw new Error(
      `Error finding contact: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function findContactByPhone(phoneNumber: string): Promise<string | null> {
  try {
    if (!(await checkContactsAccess())) {
      return null;
    }

    // Normalize the phone number for comparison
    const searchNumber = phoneNumber.replace(/[^0-9+]/g, "");

    // Get all contacts and their numbers
    const allContacts = await getAllNumbers();

    // Look for a match
    for (const [name, numbers] of Object.entries(allContacts)) {
      const normalizedNumbers = numbers.map((num) =>
        num.replace(/[^0-9+]/g, ""),
      );
      if (
        normalizedNumbers.some(
          (num) =>
            num === searchNumber ||
            num === `+${searchNumber}` ||
            num === `+1${searchNumber}` ||
            `+1${num}` === searchNumber,
        )
      ) {
        return name;
      }
    }

    return null;
  } catch (error) {
    // Return null instead of throwing to handle gracefully
    return null;
  }
}

export default { getAllNumbers, findNumber, findContactByPhone };

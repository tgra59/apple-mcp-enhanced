#!/usr/bin/env bun

import ContactsCacheManager from "./cache-manager";
import contactsCached from "./utils/contacts-cached";

async function debugContactSearch() {
  console.log("🔍 Debugging Contact Search Issue");
  console.log("=====================================");

  const manager = new ContactsCacheManager();
  await manager.loadExistingCache();

  const testNames = ["Ana", "ana", "Ana Samat", "Winston"];

  for (const testName of testNames) {
    console.log(`\n🧪 Testing: "${testName}"`);
    console.log("-----------------------------");

    // Test 1: Direct cache manager method
    console.log("1️⃣ Cache Manager findContactByName:");
    const directResult = await manager.findContactByName(testName);
    if (directResult) {
      console.log(`   ✅ Found: ${directResult.name}`);
      console.log(`   📞 Numbers: ${directResult.phoneNumbers.join(", ")}`);
    } else {
      console.log(`   ❌ Not found`);
    }

    // Test 2: Cached wrapper findNumber method
    console.log("2️⃣ Contacts Cached findNumber:");
    try {
      const numbersResult = await contactsCached.findNumber(testName);
      if (numbersResult.length > 0) {
        console.log(`   ✅ Found numbers: ${numbersResult.join(", ")}`);
      } else {
        console.log(`   ❌ No numbers found`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }

    // Test 3: Cached wrapper findBestMatches method
    console.log("3️⃣ Contacts Cached findBestMatches:");
    try {
      const matchesResult = await contactsCached.findBestMatches(testName, 3);
      if (matchesResult.length > 0) {
        console.log(`   ✅ Found ${matchesResult.length} matches:`);
        matchesResult.forEach((match, i) => {
          console.log(`      ${i + 1}. ${match.name} (score: ${match.matchScore})`);
          console.log(`         📞 ${match.phoneNumbers.join(", ")}`);
        });
      } else {
        console.log(`   ❌ No matches found`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  }

  // Test 4: Check cache state
  console.log("\n🗃️ Cache State:");
  console.log("================");
  const allContacts = await manager.getAllContacts();
  console.log(`Total contacts in cache: ${allContacts.length}`);
  
  // Find Ana specifically
  const anaContacts = allContacts.filter(contact => 
    contact.name.toLowerCase().includes("ana")
  );
  console.log(`Contacts containing "ana": ${anaContacts.length}`);
  anaContacts.forEach(contact => {
    console.log(`   - ${contact.name}: ${contact.phoneNumbers.join(", ")}`);
  });
}

// Run the debug
debugContactSearch().catch(console.error);
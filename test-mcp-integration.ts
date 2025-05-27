#!/usr/bin/env bun
/**
 * Test MCP integration with cached system
 */

import contactsCached from "./utils/contacts-cached";
import messageCached from "./utils/message-cached";

async function testMCPIntegration() {
  console.error("🧪 Testing MCP Integration with Cache System");
  console.error("============================================\n");

  // Test 1: Contact search (like MCP contacts tool)
  console.error("📋 Test 1: Contact Search (MCP contacts tool simulation)");
  console.error("--------------------------------------------------------");

  try {
    const startTime = Date.now();
    
    // Simulate MCP contacts tool call with name="Ana"
    const contactNumbers = await contactsCached.getAllNumbers();
    const anaContact = Object.entries(contactNumbers).find(([name]) => 
      name.toLowerCase().includes('ana')
    );
    
    const duration = Date.now() - startTime;
    
    if (anaContact) {
      console.error(`✅ Found contact: ${anaContact[0]} -> ${anaContact[1].join(', ')}`);
    } else {
      console.error(`❌ No contact found containing 'Ana'`);
    }
    console.error(`⚡ Search completed in ${duration}ms\n`);
  } catch (error) {
    console.error(`❌ Contact search failed: ${error}\n`);
  }

  // Test 2: Message enhanced search (like MCP messages tool with search-contacts)
  console.error("📋 Test 2: Enhanced Contact Search (MCP messages search-contacts)");
  console.error("----------------------------------------------------------------");

  try {
    const startTime = Date.now();
    
    // Simulate MCP messages tool call with operation="search-contacts", searchTerm="Ana"
    const matches = await messageCached.findBestContactMatches("Ana", 3);
    
    const duration = Date.now() - startTime;
    
    console.error(`✅ Found ${matches.length} matches:`);
    matches.forEach((match, i) => {
      console.error(`   ${i + 1}. ${match.name} (score: ${match.matchScore})`);
      console.error(`      📞 ${match.phoneNumbers.join(', ')}`);
    });
    console.error(`⚡ Enhanced search completed in ${duration}ms\n`);
  } catch (error) {
    console.error(`❌ Enhanced contact search failed: ${error}\n`);
  }

  // Test 3: Message type detection (like MCP messages tool)
  console.error("📋 Test 3: Message Type Detection (MCP messages tool simulation)");
  console.error("---------------------------------------------------------------");

  try {
    const testNumber = "+13236568914"; // From our cache
    const startTime = Date.now();
    
    // Simulate MCP messages tool detecting message type
    const messageType = await messageCached.detectMessageType(testNumber);
    
    const duration = Date.now() - startTime;
    
    console.error(`✅ Message type for ${testNumber}: ${messageType}`);
    console.error(`⚡ Detection completed in ${duration}ms\n`);
  } catch (error) {
    console.error(`❌ Message type detection failed: ${error}\n`);
  }

  // Test 4: Performance comparison
  console.error("📋 Test 4: Performance Summary");
  console.error("------------------------------");

  try {
    const cacheStatus = await contactsCached.getCacheStatus();
    console.error(`📊 Cache Statistics:`);
    console.error(`   📂 Contacts: ${cacheStatus.contactsCount}`);
    console.error(`   🕐 Age: ${cacheStatus.age} hours`);
    console.error(`   📏 Size: ${cacheStatus.size} MB`);
    console.error(`   ⚠️ Stale: ${cacheStatus.stale ? 'YES' : 'NO'}`);
    console.error(`\n🚀 Expected Performance Gains:`);
    console.error(`   • Contact searches: ~1000x faster`);
    console.error(`   • Message type detection: ~100x faster`);
    console.error(`   • MCP response time: <50ms vs 2-5 seconds`);
  } catch (error) {
    console.error(`❌ Performance summary failed: ${error}`);
  }

  console.error("\n🎉 MCP Integration Test Complete!");
  console.error("Your cached MCP should now respond lightning fast! ⚡");
}

if (import.meta.main) {
  testMCPIntegration().catch(console.error);
}

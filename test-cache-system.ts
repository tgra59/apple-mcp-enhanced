#!/usr/bin/env bun
/**
 * Quick test script to verify the cache system works
 */

import ContactsCacheManager from "./cache-manager";
import contactsCached from "./utils/contacts-cached";
import messageCached from "./utils/message-cached";

async function testCacheSystem() {
  console.error("🧪 Testing Apple MCP Enhanced Cache System");
  console.error("===========================================\n");

  const manager = new ContactsCacheManager();

  // Test 1: Cache Manager Direct
  console.error("📋 Test 1: Cache Manager Direct Access");
  console.error("--------------------------------------");

  try {
    const allContacts = await manager.getAllContacts();
    console.error(`✅ Cache loaded: ${allContacts.length} contacts`);
    
    if (allContacts.length > 0) {
      const firstContact = allContacts[0];
      console.error(`📞 Sample contact: ${firstContact.name} (${firstContact.phoneNumbers.length} numbers)`);
    }
  } catch (error) {
    console.error(`❌ Cache manager test failed: ${error}`);
  }

  console.error("");

  // Test 2: Cached Contacts Wrapper
  console.error("📋 Test 2: Cached Contacts Wrapper");
  console.error("----------------------------------");

  try {
    const startTime = Date.now();
    const allNumbers = await contactsCached.getAllNumbers();
    const duration = Date.now() - startTime;
    
    const contactCount = Object.keys(allNumbers).length;
    console.error(`✅ getAllNumbers(): ${contactCount} contacts in ${duration}ms`);
    
    // Test search
    const searchStart = Date.now();
    const matches = await contactsCached.findBestMatches("Ana", 3);
    const searchDuration = Date.now() - searchStart;
    
    console.error(`✅ findBestMatches('Ana'): ${matches.length} results in ${searchDuration}ms`);
    if (matches.length > 0) {
      console.error(`   Best match: ${matches[0].name} (score: ${matches[0].matchScore})`);
    }
  } catch (error) {
    console.error(`❌ Contacts wrapper test failed: ${error}`);
  }

  console.error("");

  // Test 3: Message Type Detection
  console.error("📋 Test 3: Message Type Detection");
  console.error("---------------------------------");

  try {
    const testNumbers = ["+1234567890", "+13236568914"];
    
    for (const number of testNumbers) {
      const startTime = Date.now();
      const messageType = await messageCached.detectMessageType(number);
      const duration = Date.now() - startTime;
      
      console.error(`✅ detectMessageType(${number}): ${messageType} in ${duration}ms`);
    }
  } catch (error) {
    console.error(`❌ Message type detection test failed: ${error}`);
  }

  console.error("");

  // Test 4: Cache Status
  console.error("📋 Test 4: Cache Status");
  console.error("-----------------------");

  try {
    const cacheStatus = await contactsCached.getCacheStatus();
    console.error(`✅ Cache Status:`);
    console.error(`   📂 Contacts: ${cacheStatus.contactsCount}`);
    console.error(`   🕐 Age: ${cacheStatus.age} hours`);
    console.error(`   📏 Size: ${cacheStatus.size} MB`);
    console.error(`   ⚠️ Stale: ${cacheStatus.stale ? 'YES' : 'NO'}`);
  } catch (error) {
    console.error(`❌ Cache status test failed: ${error}`);
  }

  console.error("");

  // Test 5: Performance Comparison
  console.error("📋 Test 5: Performance Comparison");
  console.error("---------------------------------");

  try {
    // Import original for comparison
    const contactsOriginal = (await import("./utils/contacts")).default;
    
    console.error("🔄 Testing search performance...");
    
    // Test cached version
    const cachedStart = Date.now();
    const cachedResults = await contactsCached.findBestMatches("Ana", 1);
    const cachedDuration = Date.now() - cachedStart;
    
    // Test original version
    const originalStart = Date.now();
    const originalResults = await contactsOriginal.findNumber("Ana");
    const originalDuration = Date.now() - originalStart;
    
    console.error(`✅ Cached version: ${cachedResults.length} results in ${cachedDuration}ms`);
    console.error(`✅ Original version: ${originalResults.length} results in ${originalDuration}ms`);
    
    if (originalDuration > 0 && cachedDuration > 0) {
      const speedup = Math.round(originalDuration / cachedDuration);
      console.error(`🚀 Performance improvement: ${speedup}x faster`);
    }
  } catch (error) {
    console.error(`❌ Performance comparison failed: ${error}`);
  }

  console.error("");
  console.error("🎉 Cache system test completed!");
}

if (import.meta.main) {
  testCacheSystem().catch(console.error);
}

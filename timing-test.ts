#!/usr/bin/env bun

console.log("🕐 Starting contact search timing test...");

async function testContactSearch() {
  try {
    const totalStart = Date.now();
    console.log("1. Importing contacts module...");
    
    const importStart = Date.now();
    const contactsModule = await import('./utils/contacts.ts');
    const contacts = contactsModule.default;
    console.log(`   ✅ Module imported in: ${Date.now() - importStart}ms`);
    
    console.log("2. Testing contact search for 'Ana'...");
    const searchStart = Date.now();
    
    const result = await contacts.findNumber("Ana");
    const searchTime = Date.now() - searchStart;
    
    console.log(`   ✅ Search completed in: ${searchTime}ms`);
    console.log(`   📞 Result:`, result);
    console.log(`🏁 Total test time: ${Date.now() - totalStart}ms`);
    
    if (searchTime > 5000) {
      console.log("⚠️  WARNING: Search took longer than 5 seconds - performance issue detected!");
    } else if (searchTime > 1000) {
      console.log("⚡ Moderate speed - could be optimized");
    } else {
      console.log("🚀 Fast search!");
    }
    
  } catch (error) {
    console.error("❌ Error during test:", error);
  }
}

testContactSearch();
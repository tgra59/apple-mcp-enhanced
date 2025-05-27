#!/usr/bin/env bun

import messageCached from "./utils/message-cached";

async function testMessageContactSearch() {
  console.log("🧪 Testing Message Contact Search Fix");
  console.log("=====================================");

  const testCases = [
    { name: "Ana", expectedName: "Ana Samat" },
    { name: "Winston", expectedName: "Winston Johnson" },
    { name: "ana", expectedName: "Ana Samat" },
    { name: "winston", expectedName: "Winston Johnson" }
  ];

  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: "${testCase.name}"`);
    console.log("-".repeat(30));

    try {
      // Test 1: Send message (should show confirmation prompt)
      console.log("1️⃣ Testing sendMessageEnhanced:");
      const sendResult = await messageCached.sendMessageEnhanced(
        testCase.name, 
        "Test message", 
        { verifyContact: true, messageType: 'auto' }
      );

      if (sendResult.success === false && sendResult.needsValidation && sendResult.validationInfo) {
        console.log(`   ✅ Contact found and validation created`);
        console.log(`   📱 Resolved to: ${sendResult.validationInfo.resolvedContact}`);
        console.log(`   📞 Phone: ${sendResult.validationInfo.phoneNumber}`);
        console.log(`   📡 Type: ${sendResult.validationInfo.messageType}`);
        
        if (sendResult.validationInfo.resolvedContact.includes(testCase.expectedName)) {
          console.log(`   ✅ Correct contact resolved!`);
        } else {
          console.log(`   ❌ Wrong contact: expected "${testCase.expectedName}", got "${sendResult.validationInfo.resolvedContact}"`);
        }
      } else {
        console.log(`   ❌ Failed: ${sendResult.message}`);
      }

      // Test 2: Read messages 
      console.log("2️⃣ Testing readMessagesEnhanced:");
      const readResult = await messageCached.readMessagesEnhanced(testCase.name, 5, true);

      if (readResult.success) {
        console.log(`   ✅ Contact found for reading`);
        console.log(`   📱 Resolved to: ${readResult.contactName || "Unknown"}`);
        console.log(`   📨 Messages: ${readResult.messages.length}`);
        
        if (readResult.contactName && readResult.contactName.includes(testCase.expectedName)) {
          console.log(`   ✅ Correct contact resolved for reading!`);
        } else {
          console.log(`   ⚠️ Contact name: expected "${testCase.expectedName}", got "${readResult.contactName}"`);
        }
      } else {
        console.log(`   ❌ Failed to read messages`);
      }

      // Test 3: Direct contact search
      console.log("3️⃣ Testing findBestContactMatches:");
      const matches = await messageCached.findBestContactMatches(testCase.name, 3);
      if (matches.length > 0) {
        console.log(`   ✅ Found ${matches.length} matches`);
        console.log(`   🥇 Best match: ${matches[0].name} (score: ${matches[0].matchScore})`);
        
        if (matches[0].name.includes(testCase.expectedName)) {
          console.log(`   ✅ Correct best match!`);
        } else {
          console.log(`   ❌ Wrong best match: expected "${testCase.expectedName}", got "${matches[0].name}"`);
        }
      } else {
        console.log(`   ❌ No matches found`);
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error}`);
    }
  }

  console.log("\n✅ Contact search testing completed!");
}

// Run the test
testMessageContactSearch().catch(console.error);
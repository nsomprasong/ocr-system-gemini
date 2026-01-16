/**
 * Integration Tests for Thai Name Parser Pipeline
 * 
 * Tests full pipeline: OCR → Normalize → Parse → Map
 */

import { parseThaiNamesFromOcr } from "./parseThaiNamesFromOcr.js"
import { mapThaiNames } from "./mapThaiNames.js"
import { normalizeOcrTokens } from "./normalizeOcrTokens.js"

// ============================================================
// TEST CASES
// ============================================================

function runIntegrationTests() {
  console.log("🧪 Running Thai Name Parser Integration Tests...\n")

  let passed = 0
  let failed = 0

  // Test 1: Clean OCR input (string array)
  console.log("📊 Test 1: Clean OCR input (string array)")
  try {
    const input = ["นาย", "สมชาย", "ใจดี", "น.ส.", "กมล", "วิไล"]
    const result = parseThaiNamesFromOcr(input)
    
    if (result.names.length === 2) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Expected 2 names, got ${result.names.length}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 2: Messy OCR input (split vowels, merged names)
  console.log("\n📊 Test 2: Messy OCR input")
  try {
    const input = ["น.", "ส.", "ยลลดา", "สิงหทอง", "นายรัตนชัย", "แสงจันทร"]
    const result = parseThaiNamesFromOcr(input)
    
    if (result.names.length >= 2) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Expected at least 2 names, got ${result.names.length}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 3: OCR with position data
  console.log("\n📊 Test 3: OCR with position data")
  try {
    const input = [
      { text: "นาย", x: 10, y: 20 },
      { text: "สมชาย", x: 50, y: 20 },
      { text: "ใจดี", x: 120, y: 20 },
      { text: "น.ส.", x: 10, y: 50 },
      { text: "กมล", x: 50, y: 50 },
      { text: "วิไล", x: 100, y: 50 },
    ]
    const result = parseThaiNamesFromOcr(input)
    
    if (result.names.length === 2) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Expected 2 names, got ${result.names.length}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 4: Multiple names per page
  console.log("\n📊 Test 4: Multiple names per page")
  try {
    const input = [
      "นาย", "สมชาย", "ใจดี",
      "น.ส.", "กมล", "วิไล",
      "นาย", "ธีรพงษ์", "สีสาลี",
      "นาง", "มาลี", "ทองดี",
    ]
    const result = parseThaiNamesFromOcr(input)
    
    if (result.names.length === 4) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Expected 4 names, got ${result.names.length}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 5: Missing surname
  console.log("\n📊 Test 5: Missing surname")
  try {
    const input = ["น.ส.", "สิริธร"]
    const result = parseThaiNamesFromOcr(input)
    
    if (result.names.length === 1 && result.names[0].includes("สิริธร")) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Expected 1 name with "สิริธร", got:`, result.names)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 6: Debug mode (leftovers)
  console.log("\n📊 Test 6: Debug mode (leftovers)")
  try {
    const input = ["นาย", "สมชาย", "ใจดี", "NOISE", "OTHER"]
    const result = parseThaiNamesFromOcr(input, { debug: true })
    
    if (result.names.length > 0 && Array.isArray(result.leftovers)) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Debug mode not working correctly`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 7: Map names to records
  console.log("\n📊 Test 7: Map names to records")
  try {
    const names = ["นายสมชาย ใจดี", "น.ส.กมล วิไล", "น.ส.สิริธร"]
    const mapped = mapThaiNames(names)
    
    if (mapped.length === 3) {
      const first = mapped[0]
      if (first.prefix === "นาย" && first.firstName === "สมชาย" && first.lastName === "ใจดี") {
        console.log("   ✅ PASS")
        passed++
      } else {
        console.error(`   ❌ FAIL: Mapping incorrect:`, first)
        failed++
      }
    } else {
      console.error(`   ❌ FAIL: Expected 3 records, got ${mapped.length}`)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Test 8: Normalize tokens
  console.log("\n📊 Test 8: Normalize tokens")
  try {
    const input = ["นาย", "สมชาย", "ใจดี", "น.", "ส.", "กมล"]
    const normalized = normalizeOcrTokens(input)
    
    // Should merge "น." + "ส." → "น.ส."
    if (normalized.includes("น.ส.")) {
      console.log("   ✅ PASS")
      passed++
    } else {
      console.error(`   ❌ FAIL: Prefix merging failed. Got:`, normalized)
      failed++
    }
  } catch (error) {
    console.error(`   ❌ FAIL: ${error.message}`)
    failed++
  }

  // Summary
  console.log("\n" + "=".repeat(50))
  console.log(`📊 Integration Test Summary:`)
  console.log(`   ✅ Passed: ${passed}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📈 Total: ${passed + failed}`)
  
  if (failed === 0) {
    console.log("\n✅ ALL INTEGRATION TESTS PASSED!")
  } else {
    console.log("\n❌ SOME TESTS FAILED")
  }

  return failed === 0
}

// Export for use in test runner
export { runIntegrationTests }

// Auto-run if executed directly
if (typeof window !== "undefined") {
  window.runThaiNameParserIntegrationTests = runIntegrationTests
  console.log("✅ Integration test suite loaded. Run: window.runThaiNameParserIntegrationTests()")
}

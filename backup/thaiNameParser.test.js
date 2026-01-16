/**
 * Comprehensive Test Cases for Thai Name Parser
 * 
 * These tests use REAL OCR OUTPUT and MUST PASS 100%.
 */

import { parseThaiNames } from "./thaiNameParser.js"

// ============================================================
// TEST INPUT (REAL OCR DATA)
// ============================================================

const ocrTokens = [
  'น.', 'ส.ยลลดา', 'สิงหทอง',
  'นายรัตนชัย', 'แสงจันทร',
  'น.ส.', 'ปวีณา', 'แสงจันทร',
  'น.ส.สุชาดา', 'ทับจันทร',
  'นายไชยวัน', 'ทนนานนท',
  'นายอัมพร', 'แชว',
  'นายบุญยอด', 'อินทรประเสริฐ',
  'น.ส.', 'นิตยา', 'เถาทอง',
  'นายณัฐพนธ', 'อินทรประเสริฐ',
  'น.', 'ส.ณัฐพร', 'อินทรประเสริฐ',
  'นายรัฐภูมิ', 'อินทรประเสริฐ',
  'นายทวีศักดิ์', 'หนุนภักดี',
  'นางสุกัญญา', 'หนุนภักดี',
  'น.ส.พศิกาหนุนภักดี',
  'ว่า', 'ที่ร.ต.สุทธิพงษ์', 'เกษมสิทธิ์',
  'นางวันทนา', 'เกษมสิทธิ์',
  'น.ส.พรรษกร', 'เกษมสิทธิ์',
  'นายภูมิกร', 'เกษมสิทธิ์',
  'น.ส.สุนทรี', 'เกษมสิทธิ์',
  'น.ส.', 'สิริธร',
  'นายสายชล', 'แถวสายทอง',
  'นางศิริ', 'ลักษณ', 'แถวสายทอง'
]

// ============================================================
// EXPECTED OUTPUT (STRICT)
// ============================================================

const expectedNames = [
  'น.ส.ยลลดา สิงหทอง',
  'นายรัตนชัย แสงจันทร',
  'น.ส.ปวีณา แสงจันทร',
  'น.ส.สุชาดา ทับจันทร',
  'นายไชยวัน ทนนานนท',
  'นายอัมพร แชว',
  'นายบุญยอด อินทรประเสริฐ',
  'น.ส.นิตยา เถาทอง',
  'นายณัฐพนธ อินทรประเสริฐ',
  'น.ส.ณัฐพร อินทรประเสริฐ',
  'นายรัฐภูมิ อินทรประเสริฐ',
  'นายทวีศักดิ์ หนุนภักดี',
  'นางสุกัญญา หนุนภักดี',
  'น.ส.พศิกา หนุนภักดี',
  'ว่าที่ร.ต.สุทธิพงษ์ เกษมสิทธิ์',
  'นางวันทนา เกษมสิทธิ์',
  'น.ส.พรรษกร เกษมสิทธิ์',
  'นายภูมิกร เกษมสิทธิ์',
  'น.ส.สุนทรี เกษมสิทธิ์',
  'น.ส.สิริธร',
  'นายสายชล แถวสายทอง',
  'นางศิริ ลักษณแถวสายทอง'
]

// ============================================================
// TEST RUNNER
// ============================================================

function runTests() {
  console.log("🧪 Running Thai Name Parser Tests...\n")
  
  // Run the parser
  const result = parseThaiNames(ocrTokens)
  
  // Test 1: Check result length
  console.log(`📊 Test 1: Result Length`)
  console.log(`   Expected: ${expectedNames.length} names`)
  console.log(`   Got: ${result.length} names`)
  
  if (result.length !== expectedNames.length) {
    console.error(`   ❌ FAIL: Length mismatch!`)
    console.error(`   Expected ${expectedNames.length} names, got ${result.length}`)
    console.log("\n📋 Expected names:")
    expectedNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`))
    console.log("\n📋 Got names:")
    result.forEach((name, i) => console.log(`   ${i + 1}. ${name}`))
    return false
  }
  console.log(`   ✅ PASS\n`)
  
  // Test 2: Compare each index exactly
  console.log(`📊 Test 2: Exact String Comparison`)
  let allPassed = true
  
  for (let i = 0; i < expectedNames.length; i++) {
    const expected = expectedNames[i]
    const actual = result[i]
    const passed = expected === actual
    
    if (!passed) {
      console.error(`   ❌ FAIL at index ${i}:`)
      console.error(`      Expected: "${expected}"`)
      console.error(`      Got:      "${actual}"`)
      console.error(`      Match:    ${expected === actual ? "✅" : "❌"}`)
      allPassed = false
    } else {
      console.log(`   ✅ [${i + 1}] "${actual}"`)
    }
  }
  
  if (!allPassed) {
    console.error(`\n❌ TEST SUITE FAILED`)
    console.error(`\n📋 Full Expected Output:`)
    expectedNames.forEach((name, i) => console.log(`   ${i + 1}. ${name}`))
    console.error(`\n📋 Full Actual Output:`)
    result.forEach((name, i) => console.log(`   ${i + 1}. ${name}`))
    return false
  }
  
  console.log(`\n✅ ALL TESTS PASSED!`)
  console.log(`\n📊 Summary:`)
  console.log(`   - Total names parsed: ${result.length}`)
  console.log(`   - All names match expected format`)
  console.log(`   - Prefix handling: ✅`)
  console.log(`   - Name splitting: ✅`)
  console.log(`   - Surname detection: ✅`)
  
  return true
}

// ============================================================
// EDGE CASE TESTS
// ============================================================

function runEdgeCaseTests() {
  console.log("\n🧪 Running Edge Case Tests...\n")
  
  const edgeCases = [
    {
      name: "Broken prefix: น. + ส.",
      input: ['น.', 'ส.', 'ปวีณา', 'แสงจันทร'],
      expected: ['น.ส.ปวีณา แสงจันทร']
    },
    {
      name: "Prefix merged with name",
      input: ['น.ส.ปวีณา', 'แสงจันทร'],
      expected: ['น.ส.ปวีณา แสงจันทร']
    },
    {
      name: "Rank prefix split",
      input: ['ว่า', 'ที่ร.ต.', 'สุทธิพงษ์', 'เกษมสิทธิ์'],
      expected: ['ว่าที่ร.ต.สุทธิพงษ์ เกษมสิทธิ์']
    },
    {
      name: "All merged: prefix + firstName + lastName",
      input: ['น.ส.พศิกาหนุนภักดี'],
      expected: ['น.ส.พศิกา หนุนภักดี']
    },
    {
      name: "Surname split across tokens",
      input: ['นางศิริ', 'ลักษณ', 'แถวสายทอง'],
      expected: ['นางศิริ ลักษณแถวสายทอง']
    },
    {
      name: "Missing surname",
      input: ['น.ส.', 'สิริธร'],
      expected: ['น.ส.สิริธร']
    },
    {
      name: "Multiple names",
      input: ['นายสมชาย', 'ใจดี', 'น.ส.สมหญิง', 'ใจงาม'],
      expected: ['นายสมชาย ใจดี', 'น.ส.สมหญิง ใจงาม']
    }
  ]
  
  let allPassed = true
  
  edgeCases.forEach((testCase, idx) => {
    const result = parseThaiNames(testCase.input)
    const passed = JSON.stringify(result) === JSON.stringify(testCase.expected)
    
    if (!passed) {
      console.error(`   ❌ [${idx + 1}] ${testCase.name}`)
      console.error(`      Input:    ${JSON.stringify(testCase.input)}`)
      console.error(`      Expected: ${JSON.stringify(testCase.expected)}`)
      console.error(`      Got:      ${JSON.stringify(result)}`)
      allPassed = false
    } else {
      console.log(`   ✅ [${idx + 1}] ${testCase.name}`)
    }
  })
  
  if (allPassed) {
    console.log(`\n✅ ALL EDGE CASE TESTS PASSED!`)
  } else {
    console.error(`\n❌ SOME EDGE CASE TESTS FAILED`)
  }
  
  return allPassed
}

// ============================================================
// EXPORT FOR USE IN BROWSER/CONSOLE
// ============================================================

// Run tests if this file is executed directly
if (typeof window !== "undefined") {
  // Browser environment - attach to window
  window.runThaiNameParserTests = () => {
    const mainTest = runTests()
    const edgeTest = runEdgeCaseTests()
    return mainTest && edgeTest
  }
  
  console.log("✅ Thai Name Parser test suite loaded.")
  console.log("   Run: window.runThaiNameParserTests()")
}

// Export for ES modules
export { runTests, runEdgeCaseTests, ocrTokens, expectedNames }

// For Node.js environment (CommonJS)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    runTests,
    runEdgeCaseTests,
    ocrTokens,
    expectedNames
  }
}

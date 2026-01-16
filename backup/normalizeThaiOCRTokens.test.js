/**
 * Unit Tests for normalizeThaiOCRTokens
 * 
 * MANDATORY TEST CASES (ห้ามแก้ expected)
 */

import { normalizeThaiOCRTokens } from "./normalizeThaiOCRTokens.js"

const mandatoryTests = [
  {
    name: "Test 1: น. + ส.กิตนก + แถวสายทอง",
    input: [['น.', 'ส.กิตนก', 'แถวสายทอง']],
    expected: ['น.ส.กิตนก แถวสายทอง']
  },
  {
    name: "Test 2: นาย + หัสดี + ชมอินทร",
    input: [['นาย', 'หัสดี', 'ชมอินทร']],
    expected: ['นายหัสดี ชมอินทร']
  },
  {
    name: "Test 3: นายสนม + ค + เกร็ง",
    input: [['นายสนม', 'ค', 'เกร็ง']],
    expected: ['นายสนมค เกร็ง']
  },
  {
    name: "Test 4: น.ส.สุคนธ์ทิพย์ + บำรุงสุข",
    input: [['น.ส.สุคนธ์ทิพย์', 'บำรุงสุข']],
    expected: ['น.ส.สุคนธ์ทิพย์ บำรุงสุข']
  }
]

console.log('🧪 Running Mandatory Unit Tests for normalizeThaiOCRTokens\n')

let passed = 0
let failed = 0

mandatoryTests.forEach((test, i) => {
  const result = normalizeThaiOCRTokens(test.input)
  const match = JSON.stringify(result) === JSON.stringify(test.expected)
  
  if (match) {
    console.log(`✅ Test ${i + 1}: PASS - ${test.name}`)
    console.log(`   Input: ${JSON.stringify(test.input)}`)
    console.log(`   Output: ${JSON.stringify(result)}\n`)
    passed++
  } else {
    console.log(`❌ Test ${i + 1}: FAIL - ${test.name}`)
    console.log(`   Input: ${JSON.stringify(test.input)}`)
    console.log(`   Expected: ${JSON.stringify(test.expected)}`)
    console.log(`   Got: ${JSON.stringify(result)}\n`)
    failed++
  }
})

console.log(`📊 Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.error('\n❌ SOME TESTS FAILED - DO NOT COMMIT')
  process.exit(1)
} else {
  console.log('\n✅ ALL TESTS PASSED')
}

/**
 * Test Script for Smart OCR with test3page.pdf
 * Tests the complete pipeline: PDF → Firebase → OCR → Gemini → Results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Smart OCR API URL
const SMART_OCR_URL = 'https://us-central1-ocr-system-c3bea.cloudfunctions.net/smartOcr';

// Column definitions based on the PDF structure
const COLUMN_DEFINITIONS = [
  { columnKey: 'houseNumber', label: 'เลขหมายประจำบ้าน' },
  { columnKey: 'idCard', label: 'เลขประจำตัวประชาชน' },
  { columnKey: 'name', label: 'ชื่อตัว - ชื่อสกุล' },
  { columnKey: 'gender', label: 'เพศ' },
  { columnKey: 'sequence', label: 'ลำดับที่' },
  { columnKey: 'signature', label: 'ลายมือชื่อหรือลายพิมพ์นิ้วมือ' },
  { columnKey: 'notes', label: 'หมายเหตุ' },
];

/**
 * Convert file to base64
 */
function fileToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
}

/**
 * Test Smart OCR API
 */
async function testSmartOcr(pdfPath) {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Smart OCR Pipeline');
  console.log('='.repeat(80));
  console.log(`📄 PDF File: ${pdfPath}`);
  
  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ File not found: ${pdfPath}`);
    return false;
  }

  try {
    // Step 1: Convert PDF to base64
    console.log('\n📦 Step 1: Converting PDF to base64...');
    const pdfBase64 = fileToBase64(pdfPath);
    console.log(`✅ PDF converted to base64: ${pdfBase64.length} characters`);
    console.log(`   File size: ${(fs.statSync(pdfPath).size / 1024).toFixed(2)} KB`);

    // Step 2: Prepare request body
    console.log('\n📋 Step 2: Preparing request...');
    const requestBody = {
      pdf_base64: pdfBase64,
      fileName: path.basename(pdfPath),
      columnDefinitions: COLUMN_DEFINITIONS,
    };
    console.log(`✅ Request prepared:`);
    console.log(`   - File name: ${requestBody.fileName}`);
    console.log(`   - Columns: ${COLUMN_DEFINITIONS.length}`);
    console.log(`   - Column keys: ${COLUMN_DEFINITIONS.map(c => c.columnKey).join(', ')}`);

    // Step 3: Send request to Smart OCR API
    console.log('\n🌐 Step 3: Sending request to Smart OCR API...');
    console.log(`   URL: ${SMART_OCR_URL}`);
    console.log(`   ⏱️  This may take 3-8 minutes...`);
    
    const startTime = Date.now();
    const response = await fetch(SMART_OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Request completed in ${duration} seconds`);

    // Step 4: Check response status
    console.log('\n📡 Step 4: Checking response...');
    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error: ${response.status}`);
      console.error(`   Response: ${errorText.substring(0, 500)}`);
      return false;
    }

    // Step 5: Parse response
    console.log('\n📄 Step 5: Parsing response...');
    const responseText = await response.text();
    console.log(`   Response length: ${responseText.length} characters`);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`❌ Failed to parse JSON:`, parseError.message);
      console.error(`   Response preview: ${responseText.substring(0, 500)}`);
      return false;
    }

    // Step 6: Validate response structure
    console.log('\n✅ Step 6: Validating response structure...');
    if (!data.success) {
      console.error(`❌ Smart OCR failed:`, data.error || 'Unknown error');
      return false;
    }

    if (!data.result) {
      console.error(`❌ No result in response`);
      return false;
    }

    const result = data.result;
    console.log(`✅ Response structure valid:`);
    console.log(`   - Success: ${data.success}`);
    console.log(`   - Records count: ${result.recordsCount || 0}`);
    console.log(`   - Confidence: ${result.confidence || 'unknown'}`);
    console.log(`   - Source: ${result.source || 'unknown'}`);
    console.log(`   - Pages: ${result.metadata?.pages || 'unknown'}`);

    // Step 7: Analyze records
    console.log('\n📊 Step 7: Analyzing records...');
    const records = result.records || [];
    
    if (records.length === 0) {
      console.warn(`⚠️  No records extracted!`);
      console.warn(`   This might indicate:`);
      console.warn(`   - Pre-validation failed`);
      console.warn(`   - Gemini API error`);
      console.warn(`   - Column definitions mismatch`);
      
      if (result.preValidation) {
        console.warn(`   Pre-validation:`, result.preValidation);
      }
      
      return false;
    }

    console.log(`✅ Found ${records.length} records`);
    
    // Step 8: Check record completeness
    console.log('\n🔍 Step 8: Checking record completeness...');
    
    // Expected: Based on PDF, there should be around 66 records (ลำดับที่ 1-66)
    // But some records might be missing or incomplete
    const expectedMinRecords = 50; // Minimum expected records
    const expectedMaxRecords = 70; // Maximum expected records
    
    if (records.length < expectedMinRecords) {
      console.warn(`⚠️  Warning: Only ${records.length} records found (expected at least ${expectedMinRecords})`);
    } else if (records.length > expectedMaxRecords) {
      console.warn(`⚠️  Warning: ${records.length} records found (expected at most ${expectedMaxRecords})`);
    } else {
      console.log(`✅ Record count is within expected range (${expectedMinRecords}-${expectedMaxRecords})`);
    }

    // Step 9: Sample records
    console.log('\n📝 Step 9: Sample records (first 5):');
    records.slice(0, 5).forEach((record, index) => {
      console.log(`\n   Record ${index + 1}:`);
      Object.keys(record).forEach(key => {
        const value = record[key];
        if (value && value.toString().trim().length > 0) {
          console.log(`     - ${key}: ${value}`);
        }
      });
    });

    // Step 10: Check for common issues
    console.log('\n🔍 Step 10: Checking for common issues...');
    
    let issues = [];
    
    // Check for empty records
    const emptyRecords = records.filter(r => {
      const hasData = Object.values(r).some(v => v && v.toString().trim().length > 0);
      return !hasData;
    });
    if (emptyRecords.length > 0) {
      issues.push(`Found ${emptyRecords.length} empty records`);
    }
    
    // Check for records with names
    const recordsWithNames = records.filter(r => r.name && r.name.toString().trim().length > 0);
    console.log(`   - Records with names: ${recordsWithNames.length}/${records.length}`);
    
    // Check for records with house numbers
    const recordsWithHouseNumbers = records.filter(r => r.houseNumber && r.houseNumber.toString().trim().length > 0);
    console.log(`   - Records with house numbers: ${recordsWithHouseNumbers.length}/${records.length}`);
    
    // Check for records with sequences
    const recordsWithSequences = records.filter(r => r.sequence && r.sequence.toString().trim().length > 0);
    console.log(`   - Records with sequences: ${recordsWithSequences.length}/${records.length}`);
    
    if (issues.length > 0) {
      console.warn(`   ⚠️  Issues found:`);
      issues.forEach(issue => console.warn(`     - ${issue}`));
    } else {
      console.log(`   ✅ No major issues found`);
    }

    // Step 11: Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    console.log(`✅ Status: SUCCESS`);
    console.log(`📄 File: ${path.basename(pdfPath)}`);
    console.log(`📊 Records extracted: ${records.length}`);
    console.log(`⏱️  Processing time: ${duration} seconds`);
    console.log(`🎯 Confidence: ${result.confidence || 'unknown'}`);
    console.log(`📦 Source: ${result.source || 'unknown'}`);
    console.log(`📄 Pages: ${result.metadata?.pages || 'unknown'}`);
    
    if (records.length >= expectedMinRecords && records.length <= expectedMaxRecords) {
      console.log(`✅ Record count is within expected range`);
    } else {
      console.log(`⚠️  Record count is outside expected range (${expectedMinRecords}-${expectedMaxRecords})`);
    }
    
    console.log('='.repeat(80));
    
    // Save results to file
    const outputPath = path.join(__dirname, 'test-smart-ocr-results.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      testDate: new Date().toISOString(),
      pdfFile: path.basename(pdfPath),
      result: result,
      summary: {
        recordsCount: records.length,
        processingTime: duration,
        confidence: result.confidence,
        source: result.source,
        pages: result.metadata?.pages,
      },
    }, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
    return true;
    
  } catch (error) {
    console.error('\n' + '='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80));
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error('='.repeat(80));
    return false;
  }
}

// Main execution
async function main() {
  const pdfPath = path.join(__dirname, 'test3page.pdf');
  
  console.log('🚀 Starting Smart OCR Test');
  console.log(`📁 Working directory: ${__dirname}`);
  
  const success = await testSmartOcr(pdfPath);
  
  if (success) {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Test failed!');
    process.exit(1);
  }
}

// Run the test
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

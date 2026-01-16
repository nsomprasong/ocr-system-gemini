/**
 * Test script for ocrImageV2 function
 * Tests the normalization pipeline
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

// Function URL from deployment
const FUNCTION_URL = "https://ocrimagev2-3vghmazr7q-uc.a.run.app";

/**
 * Convert file to base64
 */
function fileToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString("base64");
}

/**
 * Make HTTP POST request
 */
function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Test Image OCR
 */
async function testImageOCR(imagePath) {
  console.log(`\n📸 Testing Image OCR: ${imagePath}`);
  
  if (!fs.existsSync(imagePath)) {
    console.log(`⚠️  Image file not found: ${imagePath}`);
    return;
  }

  try {
    const base64 = fileToBase64(imagePath);
    console.log(`✅ Image converted to base64: ${base64.length} chars`);

    const response = await makeRequest(FUNCTION_URL, {
      image_base64: base64,
      fileName: path.basename(imagePath),
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      const result = response.data.result;
      console.log(`✅ OCR Success!`);
      console.log(`   File: ${result.fileName}`);
      console.log(`   Page: ${result.page.width}x${result.page.height}`);
      console.log(`   Words: ${result.words?.length || 0}`);
      
      if (result.words && result.words.length > 0) {
        console.log(`   Sample words (first 5):`);
        result.words.slice(0, 5).forEach((word, i) => {
          console.log(`     ${i + 1}. "${word.text}" at (${Math.round(word.x)}, ${Math.round(word.y)})`);
        });
      }
      
      return true;
    } else {
      console.error(`❌ OCR Failed:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    return false;
  }
}

/**
 * Test PDF OCR
 */
async function testPdfOCR(pdfPath) {
  console.log(`\n📄 Testing PDF OCR: ${pdfPath}`);
  
  if (!fs.existsSync(pdfPath)) {
    console.log(`⚠️  PDF file not found: ${pdfPath}`);
    return;
  }

  try {
    const base64 = fileToBase64(pdfPath);
    console.log(`✅ PDF converted to base64: ${base64.length} chars`);

    const response = await makeRequest(FUNCTION_URL, {
      pdf_base64: base64,
      fileName: path.basename(pdfPath),
    });

    console.log(`📊 Response status: ${response.status}`);
    
    if (response.status === 200 && response.data.success) {
      const result = response.data.result;
      console.log(`✅ OCR Success!`);
      console.log(`   File: ${result.fileName}`);
      console.log(`   Page: ${result.page.width}x${result.page.height}`);
      console.log(`   Words: ${result.words?.length || 0}`);
      
      if (result.words && result.words.length > 0) {
        console.log(`   Sample words (first 5):`);
        result.words.slice(0, 5).forEach((word, i) => {
          console.log(`     ${i + 1}. "${word.text}" at (${Math.round(word.x)}, ${Math.round(word.y)})`);
        });
      }
      
      return true;
    } else {
      console.error(`❌ OCR Failed:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    return false;
  }
}

/**
 * Test function health
 */
async function testHealth() {
  console.log(`\n🏥 Testing Function Health...`);
  console.log(`   URL: ${FUNCTION_URL}`);
  
  try {
    // Test with empty request to check if function is reachable
    const response = await makeRequest(FUNCTION_URL, {});
    
    if (response.status === 400 || response.status === 405) {
      console.log(`✅ Function is reachable (expected error for empty request)`);
      return true;
    } else {
      console.log(`⚠️  Unexpected response: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Function not reachable:`, error.message);
    return false;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log("🧪 Testing ocrImageV2 Function");
  console.log("=" .repeat(50));

  // Test 1: Health check
  const healthOk = await testHealth();

  if (!healthOk) {
    console.log("\n❌ Health check failed. Aborting tests.");
    return;
  }

  // Test 2: Image OCR (if test image exists)
  const testImagePath = path.join(__dirname, "test-image.jpg");
  if (fs.existsSync(testImagePath)) {
    await testImageOCR(testImagePath);
  } else {
    console.log(`\n⚠️  Test image not found: ${testImagePath}`);
    console.log(`   Skipping image OCR test`);
  }

  // Test 3: PDF OCR (if test PDF exists)
  const testPdfPath = path.join(__dirname, "test.pdf");
  if (fs.existsSync(testPdfPath)) {
    await testPdfOCR(testPdfPath);
  } else {
    console.log(`\n⚠️  Test PDF not found: ${testPdfPath}`);
    console.log(`   Skipping PDF OCR test`);
    console.log(`\n💡 To test with your own file:`);
    console.log(`   node test-ocr-v2.js <path-to-image-or-pdf>`);
  }

  // Test with command line argument
  if (process.argv.length > 2) {
    const testFile = process.argv[2];
    if (testFile.toLowerCase().endsWith(".pdf")) {
      await testPdfOCR(testFile);
    } else {
      await testImageOCR(testFile);
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("✅ Tests completed!");
}

// Run tests
runTests().catch(console.error);

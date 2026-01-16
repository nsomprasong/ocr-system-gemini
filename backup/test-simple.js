/**
 * Simple test for ocrImageV2 function
 * Tests with a minimal request
 */

const https = require("https");

const FUNCTION_URL = "https://ocrimagev2-3vghmazr7q-uc.a.run.app";

function testFunction() {
  return new Promise((resolve, reject) => {
    const url = new URL(FUNCTION_URL);
    
    // Test with invalid request (should return 400)
    const testData = JSON.stringify({});
    
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(testData),
      },
    };

    console.log(`🧪 Testing: ${FUNCTION_URL}`);
    console.log(`📤 Sending test request...`);

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        console.log(`📥 Response status: ${res.statusCode}`);
        console.log(`📥 Response headers:`, res.headers);
        
        try {
          const parsed = JSON.parse(data);
          console.log(`📥 Response body:`, JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log(`📥 Response body (raw):`, data.substring(0, 200));
        }
        
        if (res.statusCode === 400) {
          console.log(`\n✅ Function is working! (Expected 400 for empty request)`);
          resolve(true);
        } else {
          console.log(`\n⚠️  Unexpected status code: ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on("error", (error) => {
      console.error(`❌ Request error:`, error.message);
      reject(error);
    });

    req.write(testData);
    req.end();
  });
}

testFunction()
  .then((success) => {
    if (success) {
      console.log(`\n✅ Function test passed!`);
      console.log(`\n💡 To test with actual file:`);
      console.log(`   node test-ocr-v2.js <path-to-file>`);
      process.exit(0);
    } else {
      console.log(`\n❌ Function test failed!`);
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error(`\n❌ Test error:`, error);
    process.exit(1);
  });

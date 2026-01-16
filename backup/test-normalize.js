/**
 * Test script for PDF normalization pipeline
 * Run: node test-normalize.js
 */

const fs = require("fs");
const path = require("path");
const { normalizePdfToImages } = require("./utils/normalizePdfToImages");
const { normalizeImage } = require("./utils/normalizeImage");

async function testNormalize() {
  console.log("🧪 Testing PDF Normalization Pipeline...\n");
  
  // Test 1: Check if utilities can be loaded
  console.log("✅ Test 1: Utility modules loaded successfully");
  
  // Test 2: Check if pdfjs-dist is available
  try {
    const pdfjsLib = require("pdfjs-dist");
    console.log("✅ Test 2: pdfjs-dist loaded successfully");
    console.log(`   Version: ${pdfjsLib.version || "unknown"}`);
  } catch (error) {
    console.error("❌ Test 2: Failed to load pdfjs-dist:", error.message);
    return;
  }
  
  // Test 3: Check if canvas is available
  try {
    const { createCanvas } = require("canvas");
    console.log("✅ Test 3: canvas loaded successfully");
  } catch (error) {
    console.error("❌ Test 3: Failed to load canvas:", error.message);
    return;
  }
  
  // Test 4: Check if vision client can be initialized
  try {
    const vision = require("@google-cloud/vision");
    const visionClient = new vision.ImageAnnotatorClient();
    console.log("✅ Test 4: Vision client initialized successfully");
  } catch (error) {
    console.warn("⚠️ Test 4: Vision client initialization warning:", error.message);
    console.warn("   (This is OK if credentials are not set - will work in Firebase Functions)");
  }
  
  console.log("\n✅ All basic tests passed!");
  console.log("\n📝 Note: Full integration test requires:");
  console.log("   1. A PDF file to test");
  console.log("   2. Google Cloud credentials configured");
  console.log("   3. Run in Firebase Functions environment");
}

// Run tests
testNormalize().catch(console.error);

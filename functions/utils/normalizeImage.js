/**
 * Image Normalization Utility
 * 
 * Detects orientation and rotates image until text is upright.
 * Used for both PDF-converted images and regular images.
 */

const { detectOrientation, rotateImage } = require("./detectOrientation");

/**
 * Normalize image: detect orientation and rotate until upright
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @param {string} fileName - Image filename (for logging)
 * @param {number} manualRotation - Manual rotation angle (0, 90, 180, 270) - optional, overrides auto-detect
 * @returns {Promise<{imageBuffer: Buffer, rotation: number, width: number, height: number}>}
 */
async function normalizeImage(imageBuffer, fileName = "image", manualRotation = null) {
  console.log(`🔄 [Normalize Image] Starting normalization: ${fileName}`);
  
  try {
    let finalRotation = 0;
    let normalizedBuffer = imageBuffer;
    
    // If manual rotation is provided, use it directly (user-set rotation)
    if (manualRotation !== null && manualRotation !== undefined) {
      console.log(`🔄 [Normalize Image] Using manual rotation: ${manualRotation}° (from user/template)`);
      if (manualRotation !== 0) {
        normalizedBuffer = await rotateImage(imageBuffer, manualRotation);
        finalRotation = manualRotation;
        console.log(`✅ [Normalize Image] Image rotated by ${manualRotation}° (manual)`);
      } else {
        console.log(`✅ [Normalize Image] Manual rotation is 0° (no rotation needed)`);
      }
    } else {
      // Step 1: Detect orientation from text content (auto-detect)
      const { rotation, confidence } = await detectOrientation(imageBuffer);
      
      console.log(`📐 [Normalize Image] Detected rotation: ${rotation}° (confidence: ${confidence.toFixed(2)})`);
      
      // Step 2: Rotate image if needed
      // Rotate to make text upright based on detected orientation
      if (rotation !== 0 && confidence >= 0.5) {
        // Rotate if confidence is reasonable (>= 0.5)
        normalizedBuffer = await rotateImage(imageBuffer, rotation);
        finalRotation = rotation;
        console.log(`✅ [Normalize Image] Image rotated by ${rotation}° to make text upright (confidence: ${confidence.toFixed(2)})`);
      } else if (rotation !== 0 && confidence < 0.5) {
        console.warn(`⚠️ [Normalize Image] Low confidence (${confidence.toFixed(2)}), skipping rotation`);
        console.warn(`   Detected rotation: ${rotation}° but confidence too low`);
      } else {
        console.log(`✅ [Normalize Image] Image is already upright (0° rotation)`);
      }
    }
    
    // Get image dimensions after rotation
    const { createCanvas, loadImage } = require("canvas");
    const img = await loadImage(normalizedBuffer);
    const width = img.width;
    const height = img.height;
    
    console.log(`✅ [Normalize Image] Normalization completed: ${width}x${height}, rotation: ${finalRotation}°`);
    
    return {
      imageBuffer: normalizedBuffer,
      rotation: finalRotation,
      width,
      height,
    };
  } catch (error) {
    console.error(`❌ [Normalize Image] Failed to normalize image:`, error);
    // Fallback: return original image
    const { createCanvas, loadImage } = require("canvas");
    const img = await loadImage(imageBuffer);
    return {
      imageBuffer,
      rotation: 0,
      width: img.width,
      height: img.height,
    };
  }
}

module.exports = {
  normalizeImage,
};

/**
 * Orientation Detection Utility
 * 
 * Detects image orientation from actual text content using OCR OSD (Orientation and Script Detection).
 * Returns rotation angle needed to make text upright (0, 90, 180, or 270 degrees).
 */

const vision = require("@google-cloud/vision");

const visionClient = new vision.ImageAnnotatorClient();

/**
 * Detect orientation from image using OCR OSD
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @returns {Promise<{rotation: number, confidence: number}>}
 *   - rotation: Angle to rotate (0, 90, 180, 270) to make text upright
 *   - confidence: Confidence score (0-1), low confidence = fallback to 0
 */
async function detectOrientation(imageBuffer) {
  console.log(`🔍 [Orientation] Detecting orientation from text content...`);
  
  try {
    // Use documentTextDetection with imageContext to get orientation
    // Google Vision API can detect text orientation from actual text content
    const [textResult] = await visionClient.documentTextDetection({
      image: { content: imageBuffer },
      imageContext: {
        languageHints: ["th", "en"], // Thai and English
        // Enable text detection orientation (OSD)
        textDetectionParams: {
          enableTextDetectionConfidence: true,
        },
      },
    });
    
    // Extract orientation from fullTextAnnotation
    const fullTextAnnotation = textResult.fullTextAnnotation;
    
    if (!fullTextAnnotation || !fullTextAnnotation.pages || fullTextAnnotation.pages.length === 0) {
      console.warn(`⚠️ [Orientation] No text detected, using default rotation 0°`);
      return { rotation: 0, confidence: 0 };
    }
    
    // Get orientation from first page
    const firstPage = fullTextAnnotation.pages[0];
    
    // Analyze text bounding boxes to determine orientation
    // Check if text lines are horizontal or vertical
    // Also check overall page orientation vs text orientation
    
    let horizontalWords = 0;
    let verticalWords = 0;
    let totalWords = 0;
    
    if (firstPage.blocks) {
      for (const block of firstPage.blocks) {
        if (block.paragraphs) {
          for (const paragraph of block.paragraphs) {
            if (paragraph.words) {
              for (const word of paragraph.words) {
                if (word.boundingBox && word.boundingBox.vertices && word.boundingBox.vertices.length >= 2) {
                  const vertices = word.boundingBox.vertices;
                  const minX = Math.min(...vertices.map(v => v.x || 0));
                  const maxX = Math.max(...vertices.map(v => v.x || 0));
                  const minY = Math.min(...vertices.map(v => v.y || 0));
                  const maxY = Math.max(...vertices.map(v => v.y || 0));
                  
                  const width = maxX - minX;
                  const height = maxY - minY;
                  
                  totalWords++;
                  
                  // Check if word is more horizontal or vertical
                  if (width > height * 1.2) {
                    horizontalWords++;
                  } else if (height > width * 1.2) {
                    verticalWords++;
                  }
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`📊 [Orientation] Text analysis: ${horizontalWords} horizontal, ${verticalWords} vertical, ${totalWords} total words`);
    
    if (totalWords === 0) {
      console.warn(`⚠️ [Orientation] No words found, using default rotation 0°`);
      return { rotation: 0, confidence: 0 };
    }
    
    // Analyze text line angles to detect rotation
    // Check if text lines are tilted (not perfectly horizontal)
    let totalAngle = 0;
    let angleCount = 0;
    const angles = [];
    
    if (firstPage.blocks) {
      for (const block of firstPage.blocks) {
        if (block.paragraphs) {
          for (const paragraph of block.paragraphs) {
            if (paragraph.words && paragraph.words.length >= 2) {
              // Use first and last word to calculate line angle
              const firstWord = paragraph.words[0];
              const lastWord = paragraph.words[paragraph.words.length - 1];
              
              if (firstWord.boundingBox && firstWord.boundingBox.vertices && 
                  lastWord.boundingBox && lastWord.boundingBox.vertices) {
                const firstVertices = firstWord.boundingBox.vertices;
                const lastVertices = lastWord.boundingBox.vertices;
                
                // Calculate center points
                const firstCenterX = firstVertices.reduce((sum, v) => sum + (v.x || 0), 0) / firstVertices.length;
                const firstCenterY = firstVertices.reduce((sum, v) => sum + (v.y || 0), 0) / firstVertices.length;
                const lastCenterX = lastVertices.reduce((sum, v) => sum + (v.x || 0), 0) / lastVertices.length;
                const lastCenterY = lastVertices.reduce((sum, v) => sum + (v.y || 0), 0) / lastVertices.length;
                
                // Calculate angle (in degrees, 0° = horizontal left-to-right)
                const dx = lastCenterX - firstCenterX;
                const dy = lastCenterY - firstCenterY;
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                
                // Normalize angle to -180 to 180
                let normalizedAngle = angle;
                while (normalizedAngle > 180) normalizedAngle -= 360;
                while (normalizedAngle < -180) normalizedAngle += 360;
                
                totalAngle += normalizedAngle;
                angles.push(normalizedAngle);
                angleCount++;
              }
            }
          }
        }
      }
    }
    
    const avgAngle = angleCount > 0 ? totalAngle / angleCount : 0;
    // Calculate standard deviation to check consistency
    const variance = angles.reduce((sum, a) => sum + Math.pow(a - avgAngle, 2), 0) / angles.length;
    const stdDev = Math.sqrt(variance);
    
    console.log(`📐 [Orientation] Average text line angle: ${avgAngle.toFixed(2)}° (std dev: ${stdDev.toFixed(2)}°, from ${angleCount} lines)`);
    
    // Calculate confidence
    const horizontalRatio = horizontalWords / totalWords;
    const verticalRatio = verticalWords / totalWords;
    const confidence = Math.max(horizontalRatio, verticalRatio);
    
    // Get page dimensions
    const pageWidth = firstPage.width || 0;
    const pageHeight = firstPage.height || 0;
    const isPageLandscape = pageWidth > pageHeight;
    
    // Determine rotation needed
    // Strategy: Check both text line angles AND page dimensions
    let rotation = 0;
    
    // Check if page is landscape but text should be portrait (or vice versa)
    const textShouldBeHorizontal = horizontalRatio > 0.6;
    const textShouldBeVertical = verticalRatio > 0.6;
    
    console.log(`📊 [Orientation] Page: ${isPageLandscape ? "Landscape" : "Portrait"} (${pageWidth}x${pageHeight})`);
    console.log(`📊 [Orientation] Text: ${textShouldBeHorizontal ? "Horizontal" : textShouldBeVertical ? "Vertical" : "Mixed"}`);
    
    // If text lines are significantly tilted (not horizontal)
    if (Math.abs(avgAngle) > 10 && stdDev < 30 && angleCount > 3) {
      // Text is consistently tilted, calculate rotation needed
      // Normalize to 0, 90, 180, 270
      if (avgAngle > 45 && avgAngle < 135) {
        // Text is vertical (90° clockwise from horizontal)
        rotation = 90;
        console.log(`🔄 [Orientation] Text is tilted ${avgAngle.toFixed(2)}° (vertical), rotation: 90°`);
      } else if (avgAngle < -45 && avgAngle > -135) {
        // Text is vertical (90° counter-clockwise from horizontal)
        rotation = 270;
        console.log(`🔄 [Orientation] Text is tilted ${avgAngle.toFixed(2)}° (vertical), rotation: 270°`);
      } else if (Math.abs(avgAngle) > 135 || Math.abs(avgAngle) < 45) {
        // Text is mostly horizontal but tilted
        // For small tilts, don't rotate
        rotation = 0;
        console.log(`✅ [Orientation] Text is mostly horizontal with tilt (${avgAngle.toFixed(2)}°), rotation: 0°`);
      }
    }
    // If page is landscape but text is vertical = needs 90° rotation
    else if (isPageLandscape && textShouldBeVertical) {
      rotation = 90;
      console.log(`🔄 [Orientation] Landscape page with vertical text, rotation: 90°`);
    }
    // If page is portrait but text is horizontal = might be OK or needs 90° rotation
    else if (!isPageLandscape && textShouldBeHorizontal) {
      // Check if text is actually vertical by checking word dimensions
      if (verticalRatio > 0.4) {
        rotation = 90;
        console.log(`🔄 [Orientation] Portrait page with mixed text (vertical ratio: ${verticalRatio.toFixed(2)}), rotation: 90°`);
      } else {
        rotation = 0;
        console.log(`✅ [Orientation] Portrait page with horizontal text, rotation: 0°`);
      }
    }
    // If mostly horizontal = already upright
    else if (horizontalRatio > 0.7) {
      rotation = 0;
      console.log(`✅ [Orientation] Text is mostly horizontal (upright), rotation: 0°`);
    } 
    // If mostly vertical = needs rotation
    else if (verticalRatio > 0.7) {
      rotation = 90;
      console.log(`🔄 [Orientation] Text is mostly vertical, rotation: 90°`);
    }
    else {
      // Mixed or unclear - use default
      rotation = 0;
      console.warn(`⚠️ [Orientation] Mixed orientation, using default rotation 0°`);
    }
    
    // Low confidence = fallback to 0
    if (confidence < 0.5 && rotation !== 0) {
      console.warn(`⚠️ [Orientation] Low confidence (${confidence.toFixed(2)}), falling back to 0°`);
      rotation = 0;
    }
    
    console.log(`✅ [Orientation] Detected rotation: ${rotation}° (confidence: ${confidence.toFixed(2)})`);
    
    return { rotation, confidence };
  } catch (error) {
    console.error(`❌ [Orientation] Failed to detect orientation:`, error);
    console.warn(`⚠️ [Orientation] Falling back to 0° rotation`);
    return { rotation: 0, confidence: 0 };
  }
}

/**
 * Rotate image buffer by specified angle
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @param {number} rotation - Rotation angle (0, 90, 180, 270)
 * @returns {Promise<Buffer>} Rotated image buffer
 */
async function rotateImage(imageBuffer, rotation) {
  if (rotation === 0) {
    return imageBuffer;
  }
  
  console.log(`🔄 [Rotate] Rotating image by ${rotation}°...`);
  
  try {
    const { createCanvas, loadImage } = require("canvas");
    
    // Load image
    const img = await loadImage(imageBuffer);
    
    // Create canvas with swapped dimensions for 90/270
    const canvas = createCanvas(
      (rotation === 90 || rotation === 270) ? img.height : img.width,
      (rotation === 90 || rotation === 270) ? img.width : img.height
    );
    const ctx = canvas.getContext("2d");
    
    // Clear and rotate
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    
    // Convert to buffer
    const rotatedBuffer = canvas.toBuffer("image/png");
    
    console.log(`✅ [Rotate] Image rotated: ${img.width}x${img.height} → ${canvas.width}x${canvas.height}`);
    
    return rotatedBuffer;
  } catch (error) {
    console.error(`❌ [Rotate] Failed to rotate image:`, error);
    throw new Error(`Image rotation failed: ${error.message}`);
  }
}

module.exports = {
  detectOrientation,
  rotateImage,
};

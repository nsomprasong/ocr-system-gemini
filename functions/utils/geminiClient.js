/**
 * Gemini API Client (SDK)
 * 
 * Single source of truth for Gemini API calls via @google/generative-ai SDK.
 * Uses Google AI Studio API (not Vertex AI).
 * 
 * Note: REST API v1/v1beta has limited model support, so we use SDK instead.
 */

const { defineSecret } = require("firebase-functions/params");

// Gemini API configuration
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// Use SDK which supports all models
let GoogleGenerativeAI = null;
try {
  GoogleGenerativeAI = require("@google/generative-ai").GoogleGenerativeAI;
} catch (error) {
  console.warn("⚠️ [Gemini Client] @google/generative-ai not installed. Run: npm install @google/generative-ai");
}

// Model name - Use gemini-2.5-flash (tested and confirmed working with this API key)
const MODEL_NAME = "gemini-2.5-flash"; // Latest stable model that works with SDK

// Singleton Gemini client instance
let genAI = null;

/**
 * Initialize Gemini client (singleton pattern)
 * @returns {GoogleGenerativeAI} Initialized Gemini client
 */
function initializeGeminiClient() {
  if (!GoogleGenerativeAI) {
    throw new Error(
      "@google/generative-ai package is not installed. " +
      "Please run: cd functions && npm install @google/generative-ai"
    );
  }

  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "GEMINI_API_KEY secret is not set or is empty. " +
      "Please set it in Firebase Secret Manager."
    );
  }

  // Initialize client if not already initialized (or if API key changed)
  if (!genAI || genAI._apiKey !== apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    genAI._apiKey = apiKey; // Store for comparison
    console.log(`✅ [Gemini SDK] Initialized with API key (length: ${apiKey.length} chars)`);
  }

  return genAI;
}

/**
 * Generate text from Gemini using SDK
 * This is the ONLY function that calls Gemini in the entire system.
 * 
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @param {number} options.maxOutputTokens - Maximum output tokens (default: 8192)
 * @param {number} options.temperature - Temperature (default: 0)
 * @returns {Promise<string>} Generated text response
 */
async function generateGeminiText(prompt, options = {}) {
  try {
    // Initialize Gemini client
    const client = initializeGeminiClient();

    // Get model
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens || 8192,
        temperature: options.temperature !== undefined ? options.temperature : 0, // Default to 0 for deterministic OCR
      },
    });

    // Generate content
    console.log(`🤖 [Gemini SDK] Calling ${MODEL_NAME} via SDK...`);
    console.log(`📊 [Gemini SDK] Prompt length: ${prompt.length} characters`);
    console.log(`📊 [Gemini SDK] Max output tokens: ${options.maxOutputTokens || 8192}`);
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error("Gemini SDK returned empty response");
    }
    
    console.log(`✅ [Gemini SDK] Generated ${text.length} characters`);
    
    // Check if response might be truncated (Gemini sometimes truncates at maxOutputTokens)
    // Rough estimate: 1 token ≈ 4 characters for Thai text
    const estimatedTokens = Math.ceil(text.length / 4);
    const maxTokens = options.maxOutputTokens || 8192;
    
    if (estimatedTokens >= maxTokens * 0.95) {
      console.warn(`⚠️ [Gemini SDK] Response might be truncated! Estimated tokens: ${estimatedTokens}, Max: ${maxTokens}`);
      console.warn(`⚠️ [Gemini SDK] If records are missing, consider that output was truncated at token limit.`);
    }
    
    return text;
  } catch (error) {
    console.error(`❌ [Gemini SDK] Error generating text:`, error);
    throw new Error(`Gemini SDK generation failed: ${error.message}`);
  }
}

/**
 * Generate text from Gemini Vision API using image input
 * 
 * @param {Buffer} imageBuffer - Image buffer (PNG/JPEG)
 * @param {string} prompt - Prompt text
 * @param {Object} options - Generation options
 * @param {number} options.maxOutputTokens - Maximum output tokens (default: 8192)
 * @param {number} options.temperature - Temperature (default: 0)
 * @returns {Promise<string>} Generated text response
 */
async function generateGeminiVision(imageBuffer, prompt, options = {}) {
  try {
    // Initialize Gemini client
    const client = initializeGeminiClient();

    // Get model
    const model = client.getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens || 8192,
        temperature: options.temperature !== undefined ? options.temperature : 0,
      },
    });

    // Convert image buffer to base64
    const imageBase64 = imageBuffer.toString('base64');
    
    // Detect MIME type from buffer signature
    let mimeType = 'image/png'; // Default
    if (imageBuffer.length >= 4) {
      // PNG signature: 89 50 4E 47
      if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
        mimeType = 'image/png';
      }
      // JPEG signature: FF D8 FF
      else if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8 && imageBuffer[2] === 0xFF) {
        mimeType = 'image/jpeg';
      }
    }

    // Generate content with image
    console.log(`🤖 [Gemini Vision] Calling ${MODEL_NAME} with image input...`);
    console.log(`📊 [Gemini Vision] Image size: ${imageBuffer.length} bytes`);
    console.log(`📊 [Gemini Vision] Prompt length: ${prompt.length} characters`);
    console.log(`📊 [Gemini Vision] Max output tokens: ${options.maxOutputTokens || 8192}`);
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType,
        },
      },
      { text: prompt },
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    if (!text || text.trim().length === 0) {
      throw new Error("Gemini Vision returned empty response");
    }
    
    console.log(`✅ [Gemini Vision] Generated ${text.length} characters`);
    
    return text;
  } catch (error) {
    console.error(`❌ [Gemini Vision] Error generating vision content:`, error);
    throw new Error(`Gemini Vision generation failed: ${error.message}`);
  }
}

/**
 * Pass #1: Analyze document structure
 * 
 * @param {string} text - Normalized text from PDF/OCR
 * @param {string} apiKey - DEPRECATED: Not used (kept for compatibility)
 * @returns {Promise<Object>} Structure analysis result
 */
async function analyzeDocumentStructure(text, apiKey) {
  // Log text length and warn if truncated
  const MAX_TEXT_LENGTH = 1000000; // ~1M chars (Gemini 2.5 Flash supports large context)
  const textLength = text.length;
  const truncated = textLength > MAX_TEXT_LENGTH;
  
  console.log(`📊 [Gemini] Pass #1: Input text length: ${textLength} chars`);
  if (truncated) {
    console.warn(`⚠️ [Gemini] Pass #1: Text truncated from ${textLength} to ${MAX_TEXT_LENGTH} chars (${Math.round((MAX_TEXT_LENGTH / textLength) * 100)}% of original)`);
  }
  
  const prompt = `คุณคือระบบวิเคราะห์โครงสร้างเอกสารราชการภาษาไทย

ข้อมูลด้านล่างคือข้อความดิบจาก OCR
ข้อความอาจไม่มีเส้นตาราง
อาจเรียงบรรทัดไม่สม่ำเสมอ
และอาจมีหัวกระดาษหรือท้ายกระดาษปนอยู่

หน้าที่ของคุณคือ "อธิบายเอกสาร" เท่านั้น
ไม่ต้องแปลงข้อมูล
ไม่ต้องสร้างตาราง
ไม่ต้องจัดกลุ่มเป็น record

**สำคัญ: ต้องวิเคราะห์ข้อมูลทุกบรรทัด ไม่ข้ามบรรทัดใดเลย**

ให้ตอบตามหัวข้อต่อไปนี้:

1) เอกสารนี้เป็นเอกสารประเภทใด  
   (เช่น รายชื่อประชาชน, ทะเบียนบ้าน, บัญชีรายชื่อ, เอกสารราชการ)

2) หนึ่งรายการข้อมูล (1 record) ในเอกสารนี้ แทนข้อมูลของอะไร  
   (เช่น 1 คน, 1 ครัวเรือน, 1 บ้าน)

3) ความสัมพันธ์ของข้อมูลในเอกสาร เช่น  
   - บ้านเลขที่ปรากฏเพียงครั้งเดียวแล้วใช้กับหลายชื่อหรือไม่  
   - รายชื่อเรียงจากบนลงล่างหรือไม่  
   - มีข้อมูลใดที่เป็น header / footer ซึ่งไม่ควรนำมาเป็นข้อมูลจริง

4) อธิบายลำดับการอ่านข้อมูลที่ถูกต้องของเอกสาร  
   (เช่น อ่านจากบนลงล่างตามบรรทัด ไม่ต้องสนใจตำแหน่งซ้ายขวา)

กติกาในการตอบ (สำคัญมาก):
- ตอบเป็น bullet point ภาษาไทยเท่านั้น
- ห้ามสร้างตาราง
- ห้ามสร้าง JSON
- ห้ามจัดกลุ่มข้อมูล
- ห้ามเดาข้อมูล
- ห้ามเพิ่มข้อมูลที่ไม่มีในข้อความ OCR
- ห้ามใช้คำว่า Group หรือ Record
- **ต้องวิเคราะห์ทุกบรรทัด ไม่ข้ามบรรทัดใด**

**คำตอบของคุณต้องเป็น bullet point ภาษาไทยเท่านั้น ไม่มี JSON ไม่มีตาราง**

แต่เพื่อให้ระบบประมวลผลต่อได้ ให้สรุปเป็น JSON structure นี้ (ตอบท้ายสุด):

\`\`\`json
{
  "documentType": "ประเภทเอกสาร",
  "recordDefinition": "คำอธิบายว่า 1 record แทนข้อมูลอะไร",
  "repeatingPatterns": ["รูปแบบที่ซ้ำ"],
  "sharedValues": ["ค่าที่ครอบหลาย record"],
  "headerFooter": "header/footer ที่ไม่ควรนำมา",
  "dataRelationships": "ความสัมพันธ์ของข้อมูล",
  "confidence": "low|medium|high"
}
\`\`\`

ข้อความ OCR:
<<<
${text.substring(0, 1000000)}
>>>`; // Limit to ~1M chars (Gemini 2.5 Flash supports large context)
  
  try {
    console.log(`🤖 [Gemini] Pass #1: Analyzing document structure via SDK...`);
    
    // Call REST API
    const analysisText = await generateGeminiText(prompt, {
      maxOutputTokens: 16384, // เพิ่มจาก 4096 เพื่อให้ได้ข้อมูลครบถ้วน
      temperature: 0, // Deterministic output
    });
    
    // Extract JSON from markdown code block if present
    let analysisJson = analysisText;
    const jsonMatch = analysisText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      analysisJson = jsonMatch[1].trim();
    } else {
      // Try to find JSON object in the text
      const jsonObjectMatch = analysisText.match(/\{[\s\S]*"documentType"[\s\S]*\}/);
      if (jsonObjectMatch) {
        analysisJson = jsonObjectMatch[0];
      }
    }
    
    // Try to parse JSON, with fallback to default structure
    let analysis;
    try {
      analysis = JSON.parse(analysisJson);
    } catch (parseError) {
      console.warn(`⚠️ [Gemini] Pass #1: JSON parse failed, using default structure`);
      console.warn(`⚠️ [Gemini] Pass #1: Parse error: ${parseError.message}`);
      console.warn(`⚠️ [Gemini] Pass #1: Response text (first 1000 chars): ${analysisText.substring(0, 1000)}`);
      
      // Use default structure if JSON parsing fails
      analysis = {
        documentType: "บัญชีรายชื่อ",
        recordDefinition: "1 บรรทัด = 1 record",
        repeatingPatterns: [],
        sharedValues: [],
        headerFooter: "",
        dataRelationships: "",
        confidence: "low",
      };
      
      // Try to extract some information from the text even if JSON is invalid
      if (analysisText.includes("บัญชีรายชื่อ") || analysisText.includes("รายชื่อ")) {
        analysis.documentType = "บัญชีรายชื่อ";
      }
      if (analysisText.includes("บ้านเลขที่")) {
        analysis.sharedValues.push("บ้านเลขที่");
      }
    }
    
    // Validate and set default values for new fields
    if (!analysis.documentType) {
      analysis.documentType = "บัญชีรายชื่อ";
    }
    if (!analysis.headerFooter) {
      analysis.headerFooter = "";
    }
    if (!analysis.dataRelationships) {
      analysis.dataRelationships = "";
    }
    
    console.log(`✅ [Gemini] Pass #1: Structure analysis completed`, {
      documentType: analysis.documentType,
      recordDefinition: analysis.recordDefinition?.substring(0, 100),
      confidence: analysis.confidence,
    });
    
    return analysis;
  } catch (error) {
    console.error(`❌ [Gemini] Pass #1 failed:`, error);
    throw new Error(`Gemini structure analysis failed: ${error.message}`);
  }
}

/**
 * Extract JSON object from text (defensive parsing)
 * Handles multiple formats: markdown code blocks, raw JSON, text with JSON, truncated JSON
 * 
 * @param {string} text - Text that may contain JSON
 * @returns {Object|null} Parsed JSON object or null if not found/invalid
 */
function extractJson(text) {
  if (!text) return null;

  // Strategy 1: Try to find JSON in markdown code block (most common)
  const jsonCodeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?)\s*```/);
  if (jsonCodeBlockMatch) {
    let jsonText = jsonCodeBlockMatch[1].trim();
    
    // Try to find complete JSON by matching braces
    let braceCount = 0;
    let jsonEnd = -1;
    
    for (let i = 0; i < jsonText.length; i++) {
      if (jsonText[i] === '{') braceCount++;
      if (jsonText[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          jsonEnd = i + 1;
          break;
        }
      }
    }
    
    // If we found complete JSON, use it
    if (jsonEnd > 0 && braceCount === 0) {
      jsonText = jsonText.substring(0, jsonEnd);
    } else {
      // JSON might be truncated - try to fix it
      // Add closing braces for incomplete JSON
      while (braceCount > 0) {
        jsonText += '}';
        braceCount--;
      }
      // If rows array is incomplete, try to close it
      if (jsonText.includes('"rows"') && !jsonText.includes(']')) {
        // Find last complete object in array
        const lastCompleteObject = jsonText.lastIndexOf('}');
        if (lastCompleteObject > 0) {
          jsonText = jsonText.substring(0, lastCompleteObject + 1) + ']';
        }
      }
    }
    
    try {
      return JSON.parse(jsonText);
    } catch (e) {
      console.warn("⚠️ [extractJson] Failed to parse JSON from code block:", e.message);
      // Try to fix common issues
      try {
        const fixedJson = jsonText.replace(/,(\s*[}\]])/g, '$1');
        return JSON.parse(fixedJson);
      } catch (e2) {
        console.warn("⚠️ [extractJson] Fixed JSON from code block also failed:", e2.message);
      }
    }
  }

  // Strategy 2: Try to find JSON object with "rows" key (our expected format)
  const rowsJsonMatch = text.match(/\{\s*"rows"\s*:[\s\S]*/);
  if (rowsJsonMatch) {
    try {
      // Find the complete JSON object by matching braces
      let braceCount = 0;
      let bracketCount = 0;
      let jsonStart = rowsJsonMatch.index;
      let jsonEnd = jsonStart;
      let inString = false;
      let escapeNext = false;
      
      for (let i = jsonStart; i < text.length; i++) {
        const char = text[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
          if (char === '[') bracketCount++;
          if (char === ']') bracketCount--;
        }
      }
      
      if (braceCount === 0 && jsonEnd > jsonStart) {
        const jsonText = text.slice(jsonStart, jsonEnd);
        return JSON.parse(jsonText);
      }
    } catch (e) {
      console.warn("⚠️ [extractJson] Failed to parse JSON with rows key:", e.message);
    }
  }

  // Strategy 3: Find first { ... } block (original method)
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    console.warn("⚠️ [extractJson] No JSON braces found in text");
    return null;
  }

  let jsonText = text.slice(start, end + 1);

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("❌ [extractJson] JSON parse failed:", e.message);
    console.error("❌ [extractJson] JSON text (first 500 chars):", jsonText.substring(0, 500));
    console.error("❌ [extractJson] JSON text (last 500 chars):", jsonText.substring(Math.max(0, jsonText.length - 500)));
    
    // Strategy 4: Try to fix common JSON issues and retry
    try {
      // Remove trailing commas before } or ]
      let fixedJson = jsonText.replace(/,(\s*[}\]])/g, '$1');
      // Try to close incomplete arrays/objects
      const openBraces = (fixedJson.match(/\{/g) || []).length;
      const closeBraces = (fixedJson.match(/\}/g) || []).length;
      const openBrackets = (fixedJson.match(/\[/g) || []).length;
      const closeBrackets = (fixedJson.match(/\]/g) || []).length;
      
      // Add missing closing brackets/braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) {
        fixedJson += ']';
      }
      for (let i = 0; i < openBraces - closeBraces; i++) {
        fixedJson += '}';
      }
      
      return JSON.parse(fixedJson);
    } catch (e2) {
      console.error("❌ [extractJson] Fixed JSON also failed:", e2.message);
      return null;
    }
  }
}

/**
 * Pass #2: Convert to JSON table (REBUILT - Production Safe)
 * 
 * @param {string} text - Normalized text from PDF/OCR
 * @param {Object} structureAnalysis - Result from Pass #1 (unused but kept for compatibility)
 * @param {Array} columnDefinitions - Column definitions from template
 * @param {string} apiKey - DEPRECATED: Not used (kept for compatibility)
 * @param {number} maxSequence - Maximum sequence number found in document (optional)
 * @returns {Promise<Array>} JSON array of records
 */
async function convertToJsonTable(text, structureAnalysis, columnDefinitions, apiKey, maxSequence = 0) {
  // Log input
  const MAX_TEXT_LENGTH = 1000000;
  const textLength = text.length;
  const truncated = textLength > MAX_TEXT_LENGTH;
  
  console.log(`📊 [Gemini] Pass #2: Input text length: ${textLength} chars`);
  if (truncated) {
    console.warn(`⚠️ [Gemini] Pass #2: Text truncated from ${textLength} to ${MAX_TEXT_LENGTH} chars`);
  }

  // Build prompt based on original working version (Thai language, semantic rules)
  const columnKeys = columnDefinitions.map(col => col.columnKey || col.key).filter(Boolean);
  const columnsList = columnKeys.length > 0 
    ? columnKeys.map(c => `- ${c}`).join("\n")
    : "- name\n- address\n- age\n- zone\n- province\n- district\n- subDistrict\n- village";
  
  // Add max sequence info to prompt if available
  const maxSequenceInfo = maxSequence > 0 
    ? `\n**ข้อมูลสำคัญ: พบลำดับที่สูงสุดในเอกสารคือ ${maxSequence} ดังนั้นต้องสร้าง records ให้ครบ ${maxSequence} records เท่านั้น (sequence 1, 2, 3, ..., ${maxSequence}) ห้ามสร้างเกิน ${maxSequence} records**`
    : `\n**ข้อมูลสำคัญ: ต้องหาลำดับที่สูงสุดในเอกสารทั้งหมดก่อน แล้วสร้าง records ให้ครบทุกลำดับที่ตั้งแต่ 1 ถึงลำดับที่สูงสุด ห้ามสร้างเกินลำดับที่สูงสุด**`;

  const prompt = `คุณคือระบบแปลงเอกสารราชการเป็นข้อมูลตาราง

โครงสร้างเอกสาร:
${structureAnalysis?.recordDefinition || "1 บรรทัด = 1 record"}
${structureAnalysis?.dataRelationships ? `\nความสัมพันธ์ข้อมูล: ${structureAnalysis.dataRelationships}` : ""}
${maxSequenceInfo}

**กติกาสำคัญที่สุด (อ่านให้ละเอียด):**
- **ต้องสร้าง records ให้ครบ ${maxSequence > 0 ? `**${maxSequence} records เท่านั้น**` : '**จำนวน records เท่ากับลำดับที่สูงสุด**'} (sequence 1, 2, 3, ..., ${maxSequence > 0 ? maxSequence : 'ลำดับที่สูงสุด'})**
- **${maxSequence > 0 ? `**ห้ามสร้างเกิน ${maxSequence} records**` : '**ห้ามสร้างเกินลำดับที่สูงสุด**'}**
- **ห้ามตัดบรรทัดทิ้ง ให้สร้าง record แม้ข้อมูลจะว่าง (ใส่ "" สำหรับข้อมูลที่ว่าง)**
- **1 คน = 1 record เท่านั้น (ห้ามแยกชื่อออกเป็นหลาย records)**
- **ต้องรวมชื่อที่แยกกันให้เป็น record เดียว (เช่น "จินตนา" + "วงษ์" + "ศิลป์" = "จินตนา วงษ์ ศิลป์" ใน record เดียว)**
- **ลำดับที่ (sequence) เป็นตัวบอกจำนวน records ที่ควรมี - ต้องสร้าง record ให้ครบทุกลำดับที่ตั้งแต่ 1 ถึงลำดับที่สูงสุด${maxSequence > 0 ? ` (${maxSequence})` : ''}**
- **ถ้าพบลำดับที่ใหม่ → สร้าง record ใหม่ (1 record ต่อ 1 ลำดับที่)**
- **ถ้าข้อมูลไม่ชัดหรือว่าง → ใส่ "" (string ว่าง) แต่ต้องสร้าง record ให้ครบ**
- **ห้ามข้ามลำดับที่ใดเลย - ต้องมี record ทุกลำดับที่ตั้งแต่ 1 ถึงลำดับที่สูงสุด${maxSequence > 0 ? ` (${maxSequence})` : ''}**
- **ต้องอ่านข้อมูลทุกหน้าในเอกสาร - ห้ามหยุดแค่หน้าแรก**

กติกาเด็ดขาด:
- 1 คน = 1 record เท่านั้น
- 1 record = 1 object
- ห้ามรวมหลายชื่อใน object เดียว
- ห้ามแยกชื่อเดียวกันออกเป็นหลาย records
- ห้ามสร้าง Group
- ห้าม nested object หรือ array
- ห้ามเดาข้อมูล
- **ถ้าข้อมูลว่าง → ใส่ "" (string ว่าง) แต่ต้องสร้าง record**
- ห้ามแก้ไขตัวเลขหรือสะกดชื่อจากที่ปรากฏในเอกสาร
- **ต้องแสดงข้อมูลทุกบรรทัด ไม่ข้ามบรรทัดใด**
- **ห้ามตัดบรรทัดทิ้ง - ถ้าบรรทัดว่างให้สร้าง record ว่างแทน**

Semantic rule สำคัญ:
- บ้านเลขที่อาจปรากฏเพียงครั้งเดียว
- ให้ใช้กับรายชื่อถัดไปทั้งหมด
- จนกว่าจะพบบ้านเลขที่ใหม่
- ถ้าพบลำดับที่ใหม่ → สร้าง record ใหม่ทันที
- **ชื่อที่แยกกันในบรรทัดเดียวกันหรือใกล้กัน ให้รวมเป็น record เดียว**
- **ลำดับที่ (sequence) เป็นตัวบอกจำนวน records ที่ควรมี - ต้องสร้างให้ครบทุกลำดับที่**

**ข้อมูลสำคัญที่ต้อง extract:**
- **ชื่อคน (name) - ต้องรวมชื่อที่แยกกันให้เป็นชื่อเต็ม**
- **บ้านเลขที่ (houseNumber) - ถ้าว่างให้เว้นไว้**
- **ลำดับที่ (sequence) - ใช้เป็นตัวบอกจำนวน records**

column ที่ต้องใช้ (key ของ JSON ต้องตรงตามนี้เท่านั้น):
${columnsList}

กติกาการตอบ:
- ตอบเป็น JSON object ที่มี "rows" array เท่านั้น
- Format: { "rows": [ {...}, {...} ] }
- **จำนวน records ต้องเท่ากับ ${maxSequence > 0 ? `**${maxSequence} records เท่านั้น**` : '**ลำดับที่สูงสุด**'} (sequence 1, 2, 3, ..., ${maxSequence > 0 ? maxSequence : 'ลำดับที่สูงสุด'})**
- **${maxSequence > 0 ? `**ห้ามสร้างเกิน ${maxSequence} records**` : '**ห้ามสร้างเกินลำดับที่สูงสุด**'}**
- **ห้ามแยกชื่อเดียวกันออกเป็นหลาย records**
- **ห้ามตัดบรรทัดทิ้ง - ถ้าบรรทัดว่างให้สร้าง record ว่าง (ใส่ "" ในทุก field)**
- **ห้ามหยุดแค่ลำดับที่ที่พบก่อน - ต้องหาลำดับที่สูงสุดก่อนแล้วสร้างให้ครบ${maxSequence > 0 ? ` (${maxSequence} records)` : ''}**
- ห้ามมีข้อความอื่นก่อนหรือหลัง JSON
- ห้ามอธิบาย ห้ามใส่คำอธิบายประกอบ หรือ comment ใด ๆ
- ห้ามใช้ markdown code block
- Output ต้องเป็น JSON เท่านั้น

===== ข้อความจากเอกสาร (เริ่ม) =====
${text.substring(0, MAX_TEXT_LENGTH)}
===== ข้อความจากเอกสาร (จบ) =====`;
  
  try {
    console.log(`🤖 [Gemini] Pass #2: Converting to JSON table via SDK...`);
    
    // Call Gemini API
    // ใช้ maxOutputTokens สูงสุดที่ Gemini 2.5 Flash รองรับ (81920) เพื่อให้ได้ข้อมูลครบทุกบรรทัด
    const geminiResponse = await generateGeminiText(prompt, {
      maxOutputTokens: 81920, // เพิ่มจาก 32768 เป็น 81920 (สูงสุด) เพื่อให้ได้ข้อมูลครบทุกบรรทัด
      temperature: 0,
    });
    
    // ===== DEBUG MODE: Show raw Gemini response =====
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🔎 [DEBUG] GEMINI RAW RESPONSE (Full):`);
    console.log(`${"=".repeat(80)}`);
    console.log(geminiResponse);
    console.log(`${"=".repeat(80)}\n`);
    
    console.log(`📊 [DEBUG] Response length: ${geminiResponse.length} characters`);
    console.log(`📊 [DEBUG] Response preview (first 500 chars):`);
    console.log(geminiResponse.substring(0, 500));
    console.log(`📊 [DEBUG] Response preview (last 500 chars):`);
    console.log(geminiResponse.substring(Math.max(0, geminiResponse.length - 500)));
    
    // 🔒 JSON Safety Layer: Extract JSON using extractJson (MANDATORY)
    const extractedData = extractJson(geminiResponse);
    
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🔎 [DEBUG] EXTRACTED JSON DATA:`);
    console.log(`${"=".repeat(80)}`);
    if (extractedData) {
      console.log(JSON.stringify(extractedData, null, 2));
      console.log(`\n📊 [DEBUG] Extracted data type:`, typeof extractedData);
      console.log(`📊 [DEBUG] Extracted data keys:`, Object.keys(extractedData));
      
      if (extractedData.rows) {
        console.log(`📊 [DEBUG] rows type:`, typeof extractedData.rows);
        console.log(`📊 [DEBUG] rows is array:`, Array.isArray(extractedData.rows));
        console.log(`📊 [DEBUG] rows length:`, extractedData.rows?.length || 0);
        
        if (Array.isArray(extractedData.rows) && extractedData.rows.length > 0) {
          console.log(`📊 [DEBUG] First record:`, JSON.stringify(extractedData.rows[0], null, 2));
          if (extractedData.rows.length > 1) {
            console.log(`📊 [DEBUG] Last record:`, JSON.stringify(extractedData.rows[extractedData.rows.length - 1], null, 2));
          }
        }
      } else {
        console.log(`⚠️ [DEBUG] No "rows" key found in extracted data`);
      }
    } else {
      console.log(`❌ [DEBUG] extractJson returned null`);
      console.log(`❌ [DEBUG] Raw response (first 1000 chars):`, geminiResponse.substring(0, 1000));
    }
    console.log(`${"=".repeat(80)}\n`);
    
    // Validate and return rows array
    if (!extractedData) {
      console.error(`❌ [Gemini] Pass #2: extractJson returned null`);
      console.error(`❌ [Gemini] Pass #2: Raw response (first 2000 chars):`, geminiResponse.substring(0, 2000));
      console.error(`❌ [Gemini] Pass #2: Raw response (last 1000 chars):`, geminiResponse.substring(Math.max(0, geminiResponse.length - 1000)));
      return [];
    }
    
    if (!extractedData.rows) {
      console.error(`❌ [Gemini] Pass #2: No "rows" key in extracted data`);
      console.error(`❌ [Gemini] Pass #2: Extracted data keys:`, Object.keys(extractedData));
      console.error(`❌ [Gemini] Pass #2: Extracted data:`, JSON.stringify(extractedData, null, 2));
      return [];
    }
    
    if (!Array.isArray(extractedData.rows)) {
      console.error(`❌ [Gemini] Pass #2: "rows" is not an array. Type: ${typeof extractedData.rows}`);
      console.error(`❌ [Gemini] Pass #2: rows value:`, extractedData.rows);
      return [];
    }
    
    const rows = extractedData.rows;
    console.log(`✅ [Gemini] Pass #2: Successfully extracted ${rows.length} records`);
    
    // Log sample records for debugging
    if (rows.length > 0) {
      console.log(`📊 [Gemini] Pass #2: First record:`, JSON.stringify(rows[0], null, 2));
    } else {
      console.warn(`⚠️ [Gemini] Pass #2: rows array is empty!`);
      console.warn(`⚠️ [Gemini] Pass #2: This might indicate that Gemini found no records in the text.`);
    }
    
    return rows;
    
  } catch (error) {
    console.error(`\n${"=".repeat(80)}`);
    console.error(`❌ [DEBUG] GEMINI ERROR:`);
    console.error(`${"=".repeat(80)}`);
    console.error(`Error message:`, error.message);
    console.error(`Error stack:`, error.stack);
    console.error(`${"=".repeat(80)}\n`);
    // Return empty array on error (never throw)
    return [];
  }
}

module.exports = {
  generateGeminiText,
  generateGeminiVision,
  analyzeDocumentStructure,
  convertToJsonTable,
};

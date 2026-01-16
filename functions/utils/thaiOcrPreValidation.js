/**
 * Thai OCR Pre-Validation Module
 * 
 * Determines whether OCR text should enter Gemini table extraction mode.
 * Prevents invalid documents from consuming Gemini API calls.
 * 
 * @param {string} rawText - Raw OCR text from PDF/OCR
 * @returns {Object} Validation result with score and decision
 */
function thaiOcrPreValidation(rawText) {
  // Initialize result
  let score = 0;
  const reasons = [];
  
  if (!rawText || rawText.trim().length === 0) {
    return {
      shouldExtractTable: false,
      score: 0,
      reasons: ['Empty text'],
    };
  }
  
  // Check fragmented lines BEFORE normalizing (to preserve newlines)
  const lines = rawText.split(/\r?\n/);
  let fragmentedLines = 0;
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Count only non-whitespace single characters
    if (trimmedLine.length === 1 && trimmedLine.match(/[^\s]/)) {
      fragmentedLines++;
    }
  }
  if (fragmentedLines > 5) {
    score -= 2;
    reasons.push(`Fragmented OCR detected (${fragmentedLines} single-char lines)`);
  }
  
  // Normalize whitespace for other checks
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  
  // ===== POSITIVE SIGNALS =====
  
  // 1) Thai name prefixes
  const thaiNamePrefixes = /(นาย|นาง|นางสาว|ด\.ช\.|ด\.ญ\.)/g;
  const prefixMatches = normalizedText.match(thaiNamePrefixes);
  if (prefixMatches && prefixMatches.length > 0) {
    score += 3;
    reasons.push(`Thai name prefixes detected (${prefixMatches.length} times)`);
  }
  
  // 2) Thai full names (≥2 chars + space + ≥2 chars)
  // Also check for Thai words that might be names (even without space)
  const thaiNamePattern = /[ก-๙]{2,}\s+[ก-๙]{2,}/g;
  const nameMatches = normalizedText.match(thaiNamePattern);
  if (nameMatches && nameMatches.length >= 2) {
    score += 3;
    reasons.push(`Thai full names detected (${nameMatches.length} times)`);
  } else if (nameMatches && nameMatches.length >= 1) {
    // Give partial credit for at least one name
    score += 2;
    reasons.push(`Thai full names detected (${nameMatches.length} time, partial)`);
  }
  
  // Also check for Thai words (potential names) even if not in full name format
  const thaiWordPattern = /[ก-๙]{3,}/g;
  const thaiWords = normalizedText.match(thaiWordPattern);
  if (thaiWords && thaiWords.length >= 3) {
    score += 1;
    reasons.push(`Thai words detected (${thaiWords.length} words, potential names)`);
  }
  
  // 3) House numbers (12, 12/3, 101/5)
  const houseNumberPattern = /\b\d+\/?\d*\b/g;
  const houseNumberMatches = normalizedText.match(houseNumberPattern);
  if (houseNumberMatches && houseNumberMatches.length > 0) {
    score += 2;
    reasons.push(`House numbers detected (${houseNumberMatches.length} times)`);
  }
  
  // 4) Address keywords
  const addressKeywords = /(บ้านเลขที่|หมู่|ตำบล|ต\.|อำเภอ|อ\.|จังหวัด|จ\.)/g;
  const addressMatches = normalizedText.match(addressKeywords);
  if (addressMatches && addressMatches.length > 0) {
    score += 2;
    reasons.push(`Address keywords detected (${addressMatches.length} times)`);
  }
  
  // ===== NEGATIVE SIGNALS =====
  
  // 5) Mostly numeric text (>60% digits)
  const digitCount = (normalizedText.match(/\d/g) || []).length;
  const totalChars = normalizedText.length;
  const digitRatio = totalChars > 0 ? digitCount / totalChars : 0;
  if (digitRatio > 0.6) {
    score -= 3;
    reasons.push(`Mostly numeric text (${Math.round(digitRatio * 100)}% digits)`);
  }
  
  // ===== DECISION =====
  const shouldExtractTable = score >= 4;
  
  if (!shouldExtractTable) {
    reasons.push(`Score ${score} < 4, skipping table extraction`);
  }
  
  return {
    shouldExtractTable,
    score,
    reasons,
  };
}

module.exports = {
  thaiOcrPreValidation,
};

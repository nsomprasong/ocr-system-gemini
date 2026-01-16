/**
 * Production Logging for Parsed Names
 * 
 * Logs parsing results in JSON format
 * Only logs samples in production mode (not full payloads)
 */

/**
 * Log parsed names (production-safe)
 * @param {Object} data - Log data
 * @param {Array} data.inputSample - Sample of input tokens (max 10)
 * @param {number} data.parsedCount - Number of parsed names
 * @param {number} data.leftoverCount - Number of leftover tokens
 * @param {Array} data.names - Parsed names
 * @param {boolean} data.debug - Debug mode (log more details)
 */
export function logParsedNames(data) {
  const {
    inputSample = [],
    parsedCount = 0,
    leftoverCount = 0,
    names = [],
    debug = false,
  } = data

  const logEntry = {
    timestamp: new Date().toISOString(),
    inputSample: inputSample.slice(0, 10), // Only first 10 tokens
    inputTotal: inputSample.length,
    parsedCount,
    leftoverCount,
    names: debug ? names : names.slice(0, 5), // Only first 5 names in production
    namesTotal: names.length,
  }

  if (debug) {
    console.log("📊 [ThaiNameParser] Full debug log:", JSON.stringify(logEntry, null, 2))
  } else {
    console.log("📊 [ThaiNameParser] Summary:", JSON.stringify(logEntry))
  }

  return logEntry
}

/**
 * Log parsing error
 * @param {Error} error - Error object
 * @param {Array} inputSample - Sample of input that caused error
 */
export function logParsingError(error, inputSample = []) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
    inputSample: inputSample.slice(0, 5),
  }

  console.error("❌ [ThaiNameParser] Error:", JSON.stringify(logEntry))
  return logEntry
}

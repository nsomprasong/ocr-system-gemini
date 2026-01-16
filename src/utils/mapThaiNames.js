/**
 * Data Mapper for Thai Names
 * 
 * Maps parsed names to structured records
 */

const PREFIXES = [
  "นาย",
  "นาง",
  "น.ส.",
  "ว่าที่ร.ต.",
  "ที่ร.ต.",
]

/**
 * Extract prefix from full name
 * @param {string} fullName - Full name (e.g., "นายสมชาย ใจดี")
 * @returns {string|null} Prefix or null
 */
function extractPrefix(fullName) {
  if (!fullName || typeof fullName !== "string") return null

  // Find longest matching prefix
  let longestMatch = null
  let longestLength = 0

  for (const prefix of PREFIXES) {
    if (fullName.startsWith(prefix)) {
      if (prefix.length > longestLength) {
        longestLength = prefix.length
        longestMatch = prefix
      }
    }
  }

  return longestMatch
}

/**
 * Map parsed names to structured records
 * @param {string[]} names - Array of parsed names
 * @returns {Array} Array of { prefix, firstName, lastName, fullName }
 */
export function mapThaiNames(names) {
  if (!names || !Array.isArray(names)) return []

  return names.map(fullName => {
    if (!fullName || typeof fullName !== "string") {
      return {
        prefix: null,
        firstName: "",
        lastName: null,
        fullName: "",
      }
    }

    const prefix = extractPrefix(fullName)
    
    if (!prefix) {
      // No prefix found - treat entire string as first name
      return {
        prefix: null,
        firstName: fullName.trim(),
        lastName: null,
        fullName: fullName.trim(),
      }
    }

    // Remove prefix to get name part
    const namePart = fullName.slice(prefix.length).trim()
    
    // Split by space (first name and last name)
    const parts = namePart.split(/\s+/).filter(p => p)
    
    if (parts.length === 0) {
      return {
        prefix,
        firstName: "",
        lastName: null,
        fullName,
      }
    } else if (parts.length === 1) {
      return {
        prefix,
        firstName: parts[0],
        lastName: null,
        fullName,
      }
    } else {
      // First part is first name, rest is last name (merged)
      const firstName = parts[0]
      const lastName = parts.slice(1).join(" ")
      
      return {
        prefix,
        firstName,
        lastName,
        fullName,
      }
    }
  })
}

/**
 * Map single name to record
 * @param {string} fullName - Full name
 * @returns {Object} { prefix, firstName, lastName, fullName }
 */
export function mapThaiName(fullName) {
  const mapped = mapThaiNames([fullName])
  return mapped[0] || {
    prefix: null,
    firstName: "",
    lastName: null,
    fullName: "",
  }
}

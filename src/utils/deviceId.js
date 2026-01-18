/**
 * Device ID Utility
 * Generates and stores a unique device ID in localStorage
 * This ID persists across sessions and is unique per browser/device
 */

const DEVICE_ID_KEY = 'ocr_system_device_id';

/**
 * Get or create device ID
 * @returns {string} Device ID (UUID format)
 */
export function getDeviceId() {
  try {
    // Try to get existing device ID from localStorage
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    
    if (!deviceId) {
      // Generate new device ID if not exists
      deviceId = generateUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
      console.log(`🆔 [Device] Generated new device ID: ${deviceId}`);
    } else {
      console.log(`🆔 [Device] Using existing device ID: ${deviceId}`);
    }
    
    return deviceId;
  } catch (error) {
    // Fallback if localStorage is not available
    console.warn(`⚠️ [Device] Failed to get device ID from localStorage, using session-based ID:`, error);
    return generateUUID(); // Return session-based ID as fallback
  }
}

/**
 * Generate UUID v4
 * @returns {string} UUID string
 */
function generateUUID() {
  // Generate UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Reset device ID (for testing/debugging)
 */
export function resetDeviceId() {
  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    console.log(`🔄 [Device] Device ID reset`);
  } catch (error) {
    console.warn(`⚠️ [Device] Failed to reset device ID:`, error);
  }
}

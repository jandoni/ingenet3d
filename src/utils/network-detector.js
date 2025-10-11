/**
 * Network Speed Detector
 * Detects network speed and connection quality for adaptive optimization
 */

/**
 * Network speed classifications
 */
export const NetworkSpeed = {
  FAST: 'fast',       // >5 Mbps (Fiber, Fast WiFi, 5G)
  MEDIUM: 'medium',   // 1-5 Mbps (Regular WiFi, 4G)
  SLOW: 'slow'        // <1 Mbps (Slow WiFi, 3G)
};

/**
 * Detect network speed using Network Information API + actual speed test
 * @returns {Promise<{speed: string, type: string, downlink: number, effectiveType: string}>}
 */
export async function detectNetworkSpeed() {
  const result = {
    speed: NetworkSpeed.MEDIUM, // Default to medium
    type: 'unknown',
    downlink: 0,
    effectiveType: 'unknown',
    measuredSpeed: 0
  };

  // 1. Try Network Information API (if available)
  if ('connection' in navigator || 'mozConnection' in navigator || 'webkitConnection' in navigator) {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    if (connection) {
      result.effectiveType = connection.effectiveType || 'unknown';
      result.downlink = connection.downlink || 0; // Mbps
      result.type = connection.type || 'unknown';

      // Classify based on effectiveType
      switch (connection.effectiveType) {
        case 'slow-2g':
        case '2g':
          result.speed = NetworkSpeed.SLOW;
          break;
        case '3g':
          result.speed = NetworkSpeed.MEDIUM;
          break;
        case '4g':
        case '5g':
          result.speed = NetworkSpeed.FAST;
          break;
        default:
          // Use downlink if available
          if (connection.downlink) {
            if (connection.downlink >= 5) {
              result.speed = NetworkSpeed.FAST;
            } else if (connection.downlink >= 1) {
              result.speed = NetworkSpeed.MEDIUM;
            } else {
              result.speed = NetworkSpeed.SLOW;
            }
          }
      }
    }
  }

  // 2. Perform actual speed test for more accuracy
  try {
    const measuredSpeed = await performSpeedTest();
    result.measuredSpeed = measuredSpeed;

    // Override classification based on measured speed
    if (measuredSpeed >= 5) {
      result.speed = NetworkSpeed.FAST;
    } else if (measuredSpeed >= 1) {
      result.speed = NetworkSpeed.MEDIUM;
    } else if (measuredSpeed > 0) {
      result.speed = NetworkSpeed.SLOW;
    }
    // If speed test failed (measuredSpeed = 0), keep the Network API classification
  } catch (error) {
    console.warn('⚠️ Speed test failed, using Network API classification:', error);
  }

  return result;
}

/**
 * Perform actual network speed test like real speed testers (download 1-5 MB files)
 * @returns {Promise<number>} Speed in Mbps
 */
async function performSpeedTest() {
  try {
    // Download Cesium.js library (~2.5 MB) - similar to real speed tests
    const testUrl = 'https://ajax.googleapis.com/ajax/libs/cesiumjs/1.105/Build/Cesium/Cesium.js';

    const startTime = performance.now();

    // Fetch the file with cache-busting (no custom headers to avoid CORS issues)
    const response = await fetch(`${testUrl}?cache_bust=${Date.now()}`, {
      mode: 'cors',
      cache: 'no-store'
      // Don't add custom headers - causes CORS preflight to fail on Google CDN
    });

    if (!response.ok) {
      throw new Error('Speed test fetch failed');
    }

    // Get actual file size from Content-Length header
    const contentLength = response.headers.get('content-length');

    // Download the entire file
    const blob = await response.blob();

    const endTime = performance.now();
    const durationSeconds = (endTime - startTime) / 1000;

    // Use actual blob size if Content-Length not available
    const fileSizeBytes = contentLength ? parseInt(contentLength) : blob.size;

    // Calculate speed: (bytes * 8 bits/byte) / duration / (1024 * 1024) = Mbps
    const fileSizeBits = fileSizeBytes * 8;
    const speedBps = fileSizeBits / durationSeconds;
    const speedMbps = speedBps / (1024 * 1024);

    // Speed test complete - log quietly
    console.log(`📊 Network speed: ${speedMbps.toFixed(2)} Mbps`);

    return speedMbps;
  } catch (error) {
    console.warn('⚠️ Speed test failed, using Network API classification:', error.message);
    return 0; // Return 0 to use Network API fallback
  }
}

/**
 * Get network speed emoji for visual display
 * @param {string} speed - NetworkSpeed classification
 * @returns {string} Emoji representing network speed
 */
export function getNetworkSpeedEmoji(speed) {
  switch (speed) {
    case NetworkSpeed.FAST:
      return '🟢'; // Green circle - fast
    case NetworkSpeed.MEDIUM:
      return '🟡'; // Yellow circle - medium
    case NetworkSpeed.SLOW:
      return '🔴'; // Red circle - slow
    default:
      return '⚪'; // White circle - unknown
  }
}

/**
 * Get network speed label for display
 * @param {string} speed - NetworkSpeed classification
 * @returns {string} Human-readable label
 */
export function getNetworkSpeedLabel(speed) {
  switch (speed) {
    case NetworkSpeed.FAST:
      return 'Conexión rápida';
    case NetworkSpeed.MEDIUM:
      return 'Conexión normal';
    case NetworkSpeed.SLOW:
      return 'Conexión lenta';
    default:
      return 'Detectando conexión...';
  }
}

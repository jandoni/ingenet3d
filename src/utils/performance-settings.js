/**
 * Adaptive Performance Settings
 * Generates optimal settings based on device capabilities and network speed
 */

import { detectNetworkSpeed, NetworkSpeed } from './network-detector.js';

/**
 * Device type detection
 */
const DeviceType = {
  DESKTOP_HIGH: 'desktop-high',
  DESKTOP_STANDARD: 'desktop-standard',
  MOBILE_HIGH: 'mobile-high',
  MOBILE_STANDARD: 'mobile-standard',
  MOBILE_LOW: 'mobile-low'
};

/**
 * Detect device capabilities
 * @returns {string} Device type classification
 */
function detectDevice() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // Get device specs
  const cores = navigator.hardwareConcurrency || 2;
  const memory = navigator.deviceMemory || 4; // GB

  if (!isMobile) {
    // Desktop/Laptop
    if (cores >= 8 && memory >= 8) {
      return DeviceType.DESKTOP_HIGH;
    }
    return DeviceType.DESKTOP_STANDARD;
  } else {
    // Mobile/Tablet
    if (cores >= 8 && memory >= 6) {
      return DeviceType.MOBILE_HIGH;
    } else if (cores >= 4 && memory >= 4) {
      return DeviceType.MOBILE_STANDARD;
    }
    return DeviceType.MOBILE_LOW;
  }
}

/**
 * Performance settings configuration
 */
const SETTINGS_MATRIX = {
  // Fast Network Settings
  [`${DeviceType.DESKTOP_HIGH}-${NetworkSpeed.FAST}`]: {
    resolutionScale: 2.0,
    tileRequests: 18,
    imageBatchSize: 6,
    markerBatchSize: 8,
    targetFrameRate: 60,
    enableOrbit: true,
    description: 'Máxima calidad - Escritorio rápido'
  },
  [`${DeviceType.DESKTOP_STANDARD}-${NetworkSpeed.FAST}`]: {
    resolutionScale: 1.5,
    tileRequests: 15,
    imageBatchSize: 5,
    markerBatchSize: 6,
    targetFrameRate: 60,
    enableOrbit: true,
    description: 'Alta calidad - Escritorio estándar'
  },
  [`${DeviceType.MOBILE_HIGH}-${NetworkSpeed.FAST}`]: {
    resolutionScale: 1.5,
    tileRequests: 12,
    imageBatchSize: 4,
    markerBatchSize: 6,
    targetFrameRate: 30,
    enableOrbit: true,
    description: 'Alta calidad - Móvil potente'
  },
  [`${DeviceType.MOBILE_STANDARD}-${NetworkSpeed.FAST}`]: {
    resolutionScale: 1.25,
    tileRequests: 10,
    imageBatchSize: 4,
    markerBatchSize: 5,
    targetFrameRate: 30,
    enableOrbit: true,
    description: 'Calidad media - Móvil estándar'
  },
  [`${DeviceType.MOBILE_LOW}-${NetworkSpeed.FAST}`]: {
    resolutionScale: 1.0,
    tileRequests: 8,
    imageBatchSize: 3,
    markerBatchSize: 4,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Rendimiento - Móvil básico'
  },

  // Medium Network Settings
  [`${DeviceType.DESKTOP_HIGH}-${NetworkSpeed.MEDIUM}`]: {
    resolutionScale: 1.5,
    tileRequests: 12,
    imageBatchSize: 4,
    markerBatchSize: 6,
    targetFrameRate: 60,
    enableOrbit: true,
    description: 'Optimizado - Conexión normal'
  },
  [`${DeviceType.DESKTOP_STANDARD}-${NetworkSpeed.MEDIUM}`]: {
    resolutionScale: 1.5,
    tileRequests: 10,
    imageBatchSize: 3,
    markerBatchSize: 5,
    targetFrameRate: 60,
    enableOrbit: true,
    description: 'Equilibrado - Conexión normal'
  },
  [`${DeviceType.MOBILE_HIGH}-${NetworkSpeed.MEDIUM}`]: {
    resolutionScale: 1.25,
    tileRequests: 8,
    imageBatchSize: 3,
    markerBatchSize: 4,
    targetFrameRate: 30,
    enableOrbit: true,
    description: 'Optimizado móvil - Conexión normal'
  },
  [`${DeviceType.MOBILE_STANDARD}-${NetworkSpeed.MEDIUM}`]: {
    resolutionScale: 1.0,
    tileRequests: 6,
    imageBatchSize: 2,
    markerBatchSize: 4,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Rendimiento - Conexión normal'
  },
  [`${DeviceType.MOBILE_LOW}-${NetworkSpeed.MEDIUM}`]: {
    resolutionScale: 1.0,
    tileRequests: 6,
    imageBatchSize: 2,
    markerBatchSize: 3,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Básico - Conexión normal'
  },

  // Slow Network Settings (ALL DEVICES - Conservative)
  [`${DeviceType.DESKTOP_HIGH}-${NetworkSpeed.SLOW}`]: {
    resolutionScale: 1.0,
    tileRequests: 6,
    imageBatchSize: 2,
    markerBatchSize: 3,
    targetFrameRate: 60,
    enableOrbit: false,
    description: 'Conexión lenta detectada - Optimizando'
  },
  [`${DeviceType.DESKTOP_STANDARD}-${NetworkSpeed.SLOW}`]: {
    resolutionScale: 1.0,
    tileRequests: 6,
    imageBatchSize: 2,
    markerBatchSize: 3,
    targetFrameRate: 60,
    enableOrbit: false,
    description: 'Conexión lenta detectada - Optimizando'
  },
  [`${DeviceType.MOBILE_HIGH}-${NetworkSpeed.SLOW}`]: {
    resolutionScale: 1.0,
    tileRequests: 4,
    imageBatchSize: 1,
    markerBatchSize: 2,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Conexión lenta - Modo ahorro'
  },
  [`${DeviceType.MOBILE_STANDARD}-${NetworkSpeed.SLOW}`]: {
    resolutionScale: 1.0,
    tileRequests: 4,
    imageBatchSize: 1,
    markerBatchSize: 2,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Conexión lenta - Modo ahorro'
  },
  [`${DeviceType.MOBILE_LOW}-${NetworkSpeed.SLOW}`]: {
    resolutionScale: 1.0,
    tileRequests: 3,
    imageBatchSize: 1,
    markerBatchSize: 2,
    targetFrameRate: 30,
    enableOrbit: false,
    description: 'Conexión lenta - Mínimo'
  }
};

/**
 * Default fallback settings (medium quality)
 */
const DEFAULT_SETTINGS = {
  resolutionScale: 1.5,
  tileRequests: 12,
  imageBatchSize: 4,
  markerBatchSize: 6,
  targetFrameRate: 30,
  enableOrbit: true,
  description: 'Configuración por defecto'
};

/**
 * Global performance settings instance
 */
let performanceSettings = null;

/**
 * Detect and configure optimal performance settings
 * @returns {Promise<Object>} Performance settings object
 */
export async function detectAndConfigurePerformance() {
  // Detect device capabilities
  const deviceType = detectDevice();

  // Detect network speed
  const networkInfo = await detectNetworkSpeed();

  // Get optimal settings for this device + network combination
  const settingsKey = `${deviceType}-${networkInfo.speed}`;
  const settings = SETTINGS_MATRIX[settingsKey] || DEFAULT_SETTINGS;

  // Store settings with additional metadata
  performanceSettings = {
    ...settings,
    deviceType,
    networkSpeed: networkInfo.speed,
    networkInfo,
    timestamp: Date.now()
  };

  console.log(`⚙️ ${settings.description} (${deviceType}, ${networkInfo.measuredSpeed.toFixed(1)} Mbps)`);

  return performanceSettings;
}

/**
 * Get current performance settings
 * @returns {Object|null} Current performance settings or null if not initialized
 */
export function getPerformanceSettings() {
  return performanceSettings;
}

/**
 * Check if current network is slow
 * @returns {boolean} True if network is slow
 */
export function isSlowNetwork() {
  return performanceSettings?.networkSpeed === NetworkSpeed.SLOW;
}

/**
 * Check if current device is mobile
 * @returns {boolean} True if mobile device
 */
export function isMobileDevice() {
  const type = performanceSettings?.deviceType;
  return type === DeviceType.MOBILE_HIGH ||
         type === DeviceType.MOBILE_STANDARD ||
         type === DeviceType.MOBILE_LOW;
}

/**
 * Get network speed classification
 * @returns {string} Network speed (fast/medium/slow)
 */
export function getNetworkSpeed() {
  return performanceSettings?.networkSpeed || NetworkSpeed.MEDIUM;
}

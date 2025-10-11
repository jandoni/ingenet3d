/**
 * Freeze Mode Manager
 * Stops tile loading when viewing a stable location to prevent unnecessary network requests
 *
 * Strategy:
 * 1. When camera becomes stable at a location (no movement for 3 seconds)
 * 2. "Freeze" tile loading - stop requesting new tiles
 * 3. Keep cached tiles for current view
 * 4. Only "unfreeze" if camera moves significantly (>100m or >20% zoom change)
 *
 * This prevents the 2000+ continuous tile requests when just viewing a location
 */

import { cesiumViewer } from './cesium.js';

export class FreezeModeManager {
  constructor(tileset, options = {}) {
    this.tileset = tileset;
    this.viewer = cesiumViewer;

    // Configuration
    this.enabled = options.enabled !== false;
    this.freezeDelay = options.freezeDelay || 3000; // 3 seconds stable = freeze
    this.moveThresholdDistance = options.moveThresholdDistance || 100; // 100 meters
    this.zoomThresholdPercent = options.zoomThresholdPercent || 0.2; // 20% zoom change

    // State
    this.isFrozen = false;
    this.lastMoveTime = Date.now();
    this.frozenCameraState = null;
    this.checkInterval = null;

    // Store original tileset settings
    this.originalMaximumScreenSpaceError = null;
    this.originalSkipLevelOfDetail = null;

    console.log(`❄️ Freeze Mode Manager initialized`);
    console.log(`   - Freeze delay: ${this.freezeDelay}ms`);
    console.log(`   - Move threshold: ${this.moveThresholdDistance}m`);
    console.log(`   - Zoom threshold: ${this.zoomThresholdPercent * 100}%`);
  }

  /**
   * Start monitoring for freeze opportunities
   */
  start() {
    if (!this.enabled || this.checkInterval) return;

    // Store original tileset settings
    this.originalMaximumScreenSpaceError = this.tileset.maximumScreenSpaceError;
    this.originalSkipLevelOfDetail = this.tileset.skipLevelOfDetail;

    // Set up camera move listener
    this.cameraMoveListener = this.viewer.camera.changed.addEventListener(() => {
      this.onCameraMove();
    });

    // Check for freeze opportunities every second
    this.checkInterval = setInterval(() => {
      this.checkForFreeze();
    }, 1000);

    console.log(`▶️ Freeze mode monitoring started`);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.cameraMoveListener) {
      this.cameraMoveListener();
      this.cameraMoveListener = null;
    }

    // Unfreeze if frozen
    if (this.isFrozen) {
      this.unfreeze();
    }

    console.log(`⏸️ Freeze mode monitoring stopped`);
  }

  /**
   * Called when camera moves
   */
  onCameraMove() {
    if (!this.enabled) return;

    this.lastMoveTime = Date.now();

    // If frozen, check if we should unfreeze
    if (this.isFrozen && this.shouldUnfreeze()) {
      this.unfreeze();
    }
  }

  /**
   * Check if we should freeze tile loading
   */
  checkForFreeze() {
    if (!this.enabled || this.isFrozen) return;

    const timeSinceMove = Date.now() - this.lastMoveTime;

    if (timeSinceMove >= this.freezeDelay) {
      this.freeze();
    }
  }

  /**
   * Freeze tile loading
   */
  freeze() {
    if (this.isFrozen) return;

    // Store current camera state
    this.frozenCameraState = this.getCurrentCameraState();

    // Aggressively reduce tile loading
    // Set maximumScreenSpaceError very high to stop new tile requests
    this.tileset.maximumScreenSpaceError = 9999; // Extremely high = no new tiles

    // Disable skip level of detail to prevent refining
    this.tileset.skipLevelOfDetail = false;

    this.isFrozen = true;

    console.log(`❄️ FREEZE MODE ACTIVATED - Tile loading stopped`);
    console.log(`   - Current height: ${Math.round(this.frozenCameraState.height)}m`);
    console.log(`   - Tiles in cache: ${this.tileset.statistics.numberOfTilesTotal}`);
  }

  /**
   * Unfreeze tile loading
   */
  unfreeze() {
    if (!this.isFrozen) return;

    // Restore original tileset settings
    this.tileset.maximumScreenSpaceError = this.originalMaximumScreenSpaceError;
    this.tileset.skipLevelOfDetail = this.originalSkipLevelOfDetail;

    this.isFrozen = false;
    this.frozenCameraState = null;
    this.lastMoveTime = Date.now();

    console.log(`🔥 FREEZE MODE DEACTIVATED - Tile loading resumed`);
  }

  /**
   * Check if we should unfreeze based on camera movement
   */
  shouldUnfreeze() {
    if (!this.frozenCameraState) return true;

    const currentState = this.getCurrentCameraState();

    // Calculate distance moved
    const distance = Cesium.Cartesian3.distance(
      currentState.position,
      this.frozenCameraState.position
    );

    // Calculate height/zoom change percentage
    const heightChangePercent = Math.abs(
      (currentState.height - this.frozenCameraState.height) / this.frozenCameraState.height
    );

    // Unfreeze if moved significantly or zoomed significantly
    const shouldUnfreeze =
      distance > this.moveThresholdDistance ||
      heightChangePercent > this.zoomThresholdPercent;

    if (shouldUnfreeze) {
      console.log(`📍 Significant movement detected:`);
      console.log(`   - Distance: ${Math.round(distance)}m`);
      console.log(`   - Height change: ${Math.round(heightChangePercent * 100)}%`);
    }

    return shouldUnfreeze;
  }

  /**
   * Get current camera state
   */
  getCurrentCameraState() {
    const camera = this.viewer.camera;

    // Use positionCartographic for accurate height above ground
    const cartographic = camera.positionCartographic;

    return {
      position: camera.position.clone(),
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      height: Math.abs(cartographic.height)  // Ensure positive height
    };
  }

  /**
   * Force freeze (useful when user explicitly views a location)
   */
  forceFreeze() {
    this.lastMoveTime = Date.now() - this.freezeDelay - 1000;
    this.freeze();
  }

  /**
   * Force unfreeze
   */
  forceUnfreeze() {
    this.unfreeze();
  }

  /**
   * Get current state
   */
  getState() {
    return {
      enabled: this.enabled,
      isFrozen: this.isFrozen,
      timeSinceMove: Date.now() - this.lastMoveTime,
      tilesInCache: this.tileset.statistics.numberOfTilesTotal,
      frozenState: this.frozenCameraState ? {
        height: Math.round(this.frozenCameraState.height),
        heading: this.frozenCameraState.heading,
        pitch: this.frozenCameraState.pitch
      } : null
    };
  }

  /**
   * Enable/disable freeze mode
   */
  setEnabled(enabled) {
    if (this.enabled === enabled) return;

    this.enabled = enabled;

    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }
}

/**
 * Global instance (created when needed)
 */
let globalFreezeManager = null;

/**
 * Initialize freeze mode manager
 */
export function initFreezeModeManager(tileset, options = {}) {
  if (globalFreezeManager) {
    console.warn('⚠️ Freeze mode manager already initialized');
    return globalFreezeManager;
  }

  globalFreezeManager = new FreezeModeManager(tileset, options);
  globalFreezeManager.start();

  // Make available globally for debugging
  if (typeof window !== 'undefined') {
    window.freezeModeManager = globalFreezeManager;
  }

  return globalFreezeManager;
}

/**
 * Get global instance
 */
export function getFreezeModeManager() {
  return globalFreezeManager;
}

/**
 * Convenience function to force freeze when viewing a location
 */
export function freezeAtLocation() {
  if (globalFreezeManager) {
    globalFreezeManager.forceFreeze();
  }
}

/**
 * Convenience function to unfreeze when navigating
 */
export function unfreezeForNavigation() {
  if (globalFreezeManager) {
    globalFreezeManager.forceUnfreeze();
  }
}

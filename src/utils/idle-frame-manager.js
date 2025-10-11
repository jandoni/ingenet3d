/**
 * Idle Frame Manager (Network-Aware)
 * Dynamically reduces frame rate when BOTH camera AND network are idle
 *
 * Frame Rate Strategy:
 * - Active (camera moving OR tiles loading): 30 FPS
 * - Idle (camera + network quiet > 2s): 15 FPS (minimum for smooth viewing)
 *
 * Key: Network must be quiet (no tile loading) before FPS reduction
 * Minimum FPS is always 15 to maintain smooth visual experience
 */

export class IdleFrameManager {
  constructor(cesiumViewer, targetFrameRate = 30, tileset = null) {
    this.viewer = cesiumViewer;
    this.tileset = tileset;
    this.targetFrameRate = targetFrameRate;
    this.currentFrameRate = targetFrameRate;

    // Idle detection
    this.lastCameraChange = Date.now();
    this.lastNetworkActivity = Date.now();
    this.isIdle = false;
    this.idleLevel = 0; // 0 = active, 1 = idle, 2 = very idle, 3 = deeply idle

    // Camera state tracking
    this.lastCameraPosition = null;
    this.lastCameraHeading = null;
    this.lastCameraPitch = null;

    // Network activity tracking
    this.lastTilesLoading = 0;
    this.networkQuietThreshold = 20000; // 20 seconds of no tile loading before deep idle

    // Frame rate levels (minimum 15 FPS for smooth viewing)
    this.frameRateLevels = {
      0: targetFrameRate,           // Active: full FPS (30)
      1: 15,                        // Idle: 15 FPS
      2: 15,                        // Very idle: 15 FPS
      3: 15                         // Deeply idle: 15 FPS (still smooth)
    };

    // Idle thresholds (milliseconds)
    this.idleThresholds = {
      1: 2000,   // 2 seconds
      2: 5000,   // 5 seconds
      3: 20000   // 20 seconds (network must also be quiet)
    };

    this.enabled = true;
    this.checkInterval = null;

    console.log(`🎬 Idle Frame Manager initialized (target: ${targetFrameRate} FPS, network-aware: ${tileset ? 'YES' : 'NO'})`);
  }

  /**
   * Start monitoring camera for idle detection
   */
  start() {
    if (!this.enabled || this.checkInterval) return;

    // Store initial camera state
    this.updateCameraState();

    // Set up camera move listener
    this.cameraMoveListener = this.viewer.camera.changed.addEventListener(() => {
      this.onCameraMove();
    });

    // Check idle state every 500ms
    this.checkInterval = setInterval(() => {
      this.checkIdleState();
    }, 500);

    console.log(`▶️ Idle detection started`);
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

    // Restore target frame rate
    this.setFrameRate(this.targetFrameRate);

    console.log(`⏸️ Idle detection stopped`);
  }

  /**
   * Called when camera moves
   */
  onCameraMove() {
    if (!this.enabled) return;

    // Check if camera actually moved (not just a tiny float drift)
    if (this.hasCameraActuallyMoved()) {
      this.lastCameraChange = Date.now();

      // If we were idle, restore full frame rate immediately
      if (this.isIdle) {
        this.setIdleLevel(0);
      }
    }

    this.updateCameraState();
  }

  /**
   * Check if camera position/orientation actually changed significantly
   */
  hasCameraActuallyMoved() {
    const camera = this.viewer.camera;
    const currentPos = camera.position;
    const currentHeading = camera.heading;
    const currentPitch = camera.pitch;

    if (!this.lastCameraPosition) return true;

    // Calculate distance moved
    const distance = Cesium.Cartesian3.distance(currentPos, this.lastCameraPosition);

    // Calculate angle changes
    const headingChange = Math.abs(currentHeading - this.lastCameraHeading);
    const pitchChange = Math.abs(currentPitch - this.lastCameraPitch);

    // Thresholds to ignore tiny floating-point drift
    const POSITION_THRESHOLD = 0.1; // 10 cm
    const ANGLE_THRESHOLD = 0.001;   // ~0.05 degrees

    return distance > POSITION_THRESHOLD ||
           headingChange > ANGLE_THRESHOLD ||
           pitchChange > ANGLE_THRESHOLD;
  }

  /**
   * Update stored camera state
   */
  updateCameraState() {
    const camera = this.viewer.camera;
    this.lastCameraPosition = camera.position.clone();
    this.lastCameraHeading = camera.heading;
    this.lastCameraPitch = camera.pitch;
  }

  /**
   * Check current idle state and adjust frame rate
   * Now network-aware: considers both camera and tile loading activity
   */
  checkIdleState() {
    if (!this.enabled) return;

    // Check network activity (tile loading)
    if (this.tileset) {
      const currentTilesLoading = this.tileset.tilesLoading || 0;

      if (currentTilesLoading > 0) {
        // Network is active - tiles are loading
        this.lastNetworkActivity = Date.now();

        // If tiles are loading, force active state
        if (this.isIdle) {
          this.setIdleLevel(0);
          console.log(`📡 Network active: ${currentTilesLoading} tiles loading - restoring full FPS`);
        }
      }

      this.lastTilesLoading = currentTilesLoading;
    }

    const cameraIdleTime = Date.now() - this.lastCameraChange;
    const networkIdleTime = Date.now() - this.lastNetworkActivity;

    // Both camera AND network must be idle before reducing frame rate
    const idleTime = Math.min(cameraIdleTime, networkIdleTime);

    // Determine idle level based on combined idle time
    let newIdleLevel = 0;
    if (idleTime > this.idleThresholds[3] && networkIdleTime > this.networkQuietThreshold) {
      newIdleLevel = 3; // Deeply idle (only after 20s of network quiet)
    } else if (idleTime > this.idleThresholds[2]) {
      newIdleLevel = 2; // Very idle
    } else if (idleTime > this.idleThresholds[1]) {
      newIdleLevel = 1; // Idle
    } else {
      newIdleLevel = 0; // Active
    }

    // Update idle level if changed
    if (newIdleLevel !== this.idleLevel) {
      this.setIdleLevel(newIdleLevel);
    }
  }

  /**
   * Set idle level and adjust frame rate
   */
  setIdleLevel(level) {
    if (level === this.idleLevel) return;

    this.idleLevel = level;
    this.isIdle = level > 0;

    const newFrameRate = this.frameRateLevels[level];
    this.setFrameRate(newFrameRate);

    const labels = ['Active', 'Idle', 'Very Idle', 'Deeply Idle'];
    console.log(`🎬 Frame rate adjusted: ${newFrameRate} FPS (${labels[level]})`);
  }

  /**
   * Set frame rate
   */
  setFrameRate(fps) {
    if (this.currentFrameRate === fps) return;

    this.currentFrameRate = fps;
    this.viewer.targetFrameRate = fps;

    // Request a render to apply the change
    this.viewer.scene.requestRender();
  }

  /**
   * Force active state (useful when user interacts with UI)
   */
  forceActive() {
    this.lastCameraChange = Date.now();
    if (this.isIdle) {
      this.setIdleLevel(0);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      enabled: this.enabled,
      isIdle: this.isIdle,
      idleLevel: this.idleLevel,
      currentFrameRate: this.currentFrameRate,
      targetFrameRate: this.targetFrameRate,
      idleTime: Date.now() - this.lastCameraChange
    };
  }

  /**
   * Enable/disable idle detection
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
let globalIdleManager = null;

/**
 * Initialize idle frame manager
 */
export function initIdleFrameManager(cesiumViewer, targetFrameRate = 30, tileset = null) {
  if (globalIdleManager) {
    console.warn('⚠️ Idle frame manager already initialized');
    return globalIdleManager;
  }

  globalIdleManager = new IdleFrameManager(cesiumViewer, targetFrameRate, tileset);
  globalIdleManager.start();

  // Make available globally for debugging
  if (typeof window !== 'undefined') {
    window.idleFrameManager = globalIdleManager;
  }

  return globalIdleManager;
}

/**
 * Get global instance
 */
export function getIdleFrameManager() {
  return globalIdleManager;
}

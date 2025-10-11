/**
 * Loading Manager
 * Manages progressive loading with 5 stages and real-time progress updates
 */

class LoadingManager {
  constructor() {
    this.progressBar = document.getElementById('progress-bar');
    this.statusText = document.querySelector('.loading-status');
    this.percentageText = document.querySelector('.loading-percentage');
    this.currentProgress = 0;
    this.networkIndicator = null; // Will be created on demand

    // Loading stages with progress ranges
    this.stages = {
      INIT: { start: 0, end: 15, message: 'Inicializando visor 3D...' },
      IMAGES: { start: 15, end: 40, message: 'Cargando imágenes...' },
      LOCATIONS: { start: 40, end: 70, message: 'Cargando ubicaciones...' },
      CONTENT: { start: 70, end: 90, message: 'Preparando contenido...' },
      FINALIZE: { start: 90, end: 100, message: 'Casi listo...' }
    };
  }

  /**
   * Show network status indicator (minimal, professional - only for slow connections)
   * @param {string} message - Network warning message
   */
  showNetworkStatus(message) {
    const loadingProgress = document.querySelector('.loading-progress');
    if (!loadingProgress) return;

    // Remove existing indicator if present
    if (this.networkIndicator) {
      this.networkIndicator.remove();
    }

    // Create minimal orange warning (no emojis)
    this.networkIndicator = document.createElement('div');
    this.networkIndicator.className = 'network-warning';
    this.networkIndicator.textContent = message;

    loadingProgress.appendChild(this.networkIndicator);
  }

  /**
   * Update progress to a specific percentage
   * @param {number} progress - Progress percentage (0-100)
   */
  setProgress(progress) {
    this.currentProgress = Math.min(100, Math.max(0, progress));
    this.updateUI();
  }

  /**
   * Start a specific stage
   * @param {string} stageName - Name of the stage (INIT, IMAGES, LOCATIONS, CONTENT, FINALIZE)
   */
  startStage(stageName) {
    const stage = this.stages[stageName];
    if (!stage) {
      console.warn(`Unknown stage: ${stageName}`);
      return;
    }

    this.statusText.textContent = stage.message;
    this.setProgress(stage.start);
  }

  /**
   * Update progress within a stage
   * @param {string} stageName - Name of the stage
   * @param {number} stageProgress - Progress within the stage (0-1)
   * @param {string} customMessage - Optional custom message (e.g., "Cargando imágenes... 12/38")
   */
  updateStage(stageName, stageProgress, customMessage = null) {
    const stage = this.stages[stageName];
    if (!stage) {
      console.warn(`Unknown stage: ${stageName}`);
      return;
    }

    const range = stage.end - stage.start;
    const progress = stage.start + (range * Math.min(1, Math.max(0, stageProgress)));

    if (customMessage) {
      this.statusText.textContent = customMessage;
    } else {
      this.statusText.textContent = stage.message;
    }

    this.setProgress(progress);
  }

  /**
   * Complete a stage (set to end of stage)
   * @param {string} stageName - Name of the stage
   */
  completeStage(stageName) {
    const stage = this.stages[stageName];
    if (!stage) {
      console.warn(`Unknown stage: ${stageName}`);
      return;
    }

    this.setProgress(stage.end);
  }

  /**
   * Update the UI elements
   */
  updateUI() {
    if (this.progressBar) {
      this.progressBar.style.width = `${this.currentProgress}%`;
    }
    if (this.percentageText) {
      this.percentageText.textContent = `${Math.round(this.currentProgress)}%`;
    }
  }

  /**
   * Complete loading and hide the loading screen
   */
  complete() {
    this.setProgress(100);
    this.statusText.textContent = '¡Listo!';

    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
    }, 500);
  }
}

// Create and export a singleton instance
export const loadingManager = new LoadingManager();

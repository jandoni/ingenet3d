/**
 * Google Maps 3D Integration
 * Replaces Cesium.js with native Google Maps 3D API
 *
 * Key benefits:
 * - Native smooth camera animations (flyCameraTo)
 * - Better tile loading during flight
 * - Same cost as Cesium (both use Google 3D Tiles)
 * - Optimized for both low and high resource devices
 */

// Global map instance
export let map3d = null;

// Animation state
let currentAnimation = null;

/**
 * Initialize Google Maps 3D
 * @param {Object} options - Initial camera settings
 * @returns {Promise<HTMLElement>} The initialized map element
 */
export async function initGoogleMaps3D(options = {}) {
  try {
    // Import Maps 3D library
    await google.maps.importLibrary('maps3d');

    // Get the map element
    map3d = document.getElementById('map3d');

    if (!map3d) {
      throw new Error('Map element #map3d not found');
    }

    // Spain overview - default initial view
    const defaultView = {
      lat: 40.0,
      lng: -3.7,
      altitude: 0,
      range: 2000000, // 2000km for country overview
      tilt: 0,        // Looking straight down
      heading: 0      // Facing north
    };

    const view = { ...defaultView, ...options };

    // Set initial camera position
    map3d.center = { lat: view.lat, lng: view.lng, altitude: view.altitude };
    map3d.range = view.range;
    map3d.tilt = view.tilt;
    map3d.heading = view.heading;

    // Performance settings
    map3d.defaultUIHidden = true; // Hide default controls (we have custom)

    // Wait for map to be ready
    await waitForMapReady(map3d);

    // Remove the alpha channel warning banner
    removeAlphaWarning();

    console.log('Google Maps 3D initialized successfully');
    return map3d;
  } catch (error) {
    console.error('Failed to initialize Google Maps 3D:', error);
    throw error;
  }
}

/**
 * Remove the Google Maps alpha channel warning banner
 * Runs periodically to catch dynamically added warnings
 */
function removeAlphaWarning() {
  const removeWarning = () => {
    // Find and remove the warning banner by its text content
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach(div => {
      if (div.textContent &&
          div.textContent.includes('alpha channel') &&
          div.textContent.includes('development purposes')) {
        div.style.display = 'none';
        div.remove();
      }
      // Also check for dismiss button parent
      if (div.querySelector && div.querySelector('[class*="dismiss"]')) {
        const text = div.textContent || '';
        if (text.includes('alpha') || text.includes('development')) {
          div.style.display = 'none';
          div.remove();
        }
      }
    });
  };

  // Run immediately
  removeWarning();

  // Run again after short delays to catch dynamically added elements
  setTimeout(removeWarning, 100);
  setTimeout(removeWarning, 500);
  setTimeout(removeWarning, 1000);
  setTimeout(removeWarning, 2000);

  // Set up a mutation observer to catch any future additions
  const observer = new MutationObserver((mutations) => {
    removeWarning();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Stop observing after 10 seconds to avoid performance impact
  setTimeout(() => observer.disconnect(), 10000);
}

/**
 * Wait for map tiles to load
 * @param {HTMLElement} map - The map element
 * @returns {Promise<void>}
 */
function waitForMapReady(map) {
  return new Promise((resolve) => {
    // Check if map fires steadychange event
    const onSteady = (event) => {
      if (event.detail && event.detail.isSteady) {
        map.removeEventListener('gmp-steadychange', onSteady);
        resolve();
      }
    };

    map.addEventListener('gmp-steadychange', onSteady);

    // Fallback timeout in case event doesn't fire
    setTimeout(() => {
      map.removeEventListener('gmp-steadychange', onSteady);
      resolve();
    }, 3000);
  });
}

/**
 * Calculate animation duration based on distance
 * Longer distances = longer duration for smooth flight
 * @param {Object} startPos - Starting position {lat, lng}
 * @param {Object} endPos - Ending position {lat, lng}
 * @returns {number} Duration in milliseconds
 */
function calculateDuration(startPos, endPos) {
  // Calculate distance using Haversine formula
  const R = 6371000; // Earth's radius in meters
  const lat1 = startPos.lat * Math.PI / 180;
  const lat2 = endPos.lat * Math.PI / 180;
  const deltaLat = (endPos.lat - startPos.lat) * Math.PI / 180;
  const deltaLng = (endPos.lng - startPos.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  // Scale duration by distance
  if (distance < 1000) return 3000;      // < 1km: 3 seconds
  if (distance < 10000) return 5000;     // < 10km: 5 seconds
  if (distance < 100000) return 8000;    // < 100km: 8 seconds
  if (distance < 500000) return 10000;   // < 500km: 10 seconds
  if (distance < 1000000) return 12000;  // < 1000km: 12 seconds
  return 15000;                          // > 1000km: 15 seconds
}

/**
 * Smooth fly to location (Google Earth style)
 * Camera always looks at Earth during flight (never shows sky)
 * @param {Object} destination - {lat, lng, altitude, range, tilt, heading}
 * @param {number} duration - Animation duration in ms (optional, auto-calculated if not provided)
 * @returns {Promise<Object|null>} Resolves with destination when animation completes, null if cancelled
 */
export function flyToLocation(destination, duration = null) {
  return new Promise((resolve) => {
    if (!map3d) {
      console.error('Map not initialized');
      resolve(null);
      return;
    }

    // Cancel any existing animation
    stopAnimation();

    // Get current position for duration calculation
    const startPos = {
      lat: map3d.center?.lat || 40.0,
      lng: map3d.center?.lng || -3.7
    };

    // Auto-calculate duration based on distance if not provided
    const animDuration = duration || calculateDuration(startPos, destination);

    // Prepare the end camera state
    const endCamera = {
      center: {
        lat: destination.lat,
        lng: destination.lng,
        altitude: destination.altitude || 0
      },
      range: destination.range || 1000,
      tilt: destination.tilt !== undefined ? destination.tilt : 60, // 60 for nice 3D view
      heading: destination.heading || 0
    };

    // Use native flyCameraTo for smooth parabolic arc animation
    map3d.flyCameraTo({
      endCamera: endCamera,
      durationMillis: animDuration
    });

    // Track animation state
    currentAnimation = { active: true };

    // Listen for animation end
    const onAnimationEnd = () => {
      map3d.removeEventListener('gmp-animationend', onAnimationEnd);
      currentAnimation = null;
      resolve(destination);
    };

    map3d.addEventListener('gmp-animationend', onAnimationEnd);

    // Fallback timeout (animation duration + buffer)
    setTimeout(() => {
      if (currentAnimation && currentAnimation.active) {
        map3d.removeEventListener('gmp-animationend', onAnimationEnd);
        currentAnimation = null;
        resolve(destination);
      }
    }, animDuration + 1000);
  });
}

/**
 * Set camera position immediately (no animation)
 * @param {Object} position - {lat, lng, altitude, range, tilt, heading}
 */
export function setCamera(position) {
  if (!map3d) return;

  // Stop any running animation first
  stopAnimation();

  map3d.center = {
    lat: position.lat,
    lng: position.lng,
    altitude: position.altitude || 0
  };

  if (position.range !== undefined) {
    map3d.range = position.range;
  }
  if (position.tilt !== undefined) {
    map3d.tilt = position.tilt;
  }
  if (position.heading !== undefined) {
    map3d.heading = position.heading;
  }
}

/**
 * Get current camera position
 * @returns {Object|null} Current camera state
 */
export function getCamera() {
  if (!map3d) return null;

  return {
    lat: map3d.center?.lat,
    lng: map3d.center?.lng,
    altitude: map3d.center?.altitude || 0,
    range: map3d.range,
    tilt: map3d.tilt,
    heading: map3d.heading
  };
}

/**
 * Orbit around current location (drone effect)
 * Uses native flyCameraAround for smooth 360° rotation
 * Note: User interaction is blocked during the animation
 * @param {number} duration - Duration for one full orbit in ms (default 90000 = 90 seconds)
 * @param {number} rounds - Number of orbits (default 1 for single rotation)
 */
export function startOrbit(duration = 90000, rounds = 1) {
  if (!map3d) return;

  // Stop any existing animation
  stopAnimation();

  // Use native flyCameraAround for smooth rotation
  map3d.flyCameraAround({
    camera: {
      center: map3d.center,
      range: map3d.range,
      tilt: map3d.tilt,
      heading: map3d.heading
    },
    durationMillis: duration,
    rounds: rounds
  });

  currentAnimation = { active: true, type: 'orbit' };
}

/**
 * Stop any active animation (fly or orbit)
 */
export function stopAnimation() {
  if (map3d) {
    try {
      map3d.stopCameraAnimation();
    } catch (e) {
      // Ignore errors if no animation is running
    }
  }
  currentAnimation = null;
}

/**
 * Check if an animation is currently running
 * @returns {boolean}
 */
export function isAnimating() {
  return currentAnimation !== null && currentAnimation.active;
}

/**
 * Zoom in (decrease range)
 * @param {number} factor - Zoom factor (default 0.5 = halve the range)
 */
export function zoomIn(factor = 0.5) {
  if (!map3d) return;

  const minRange = 100; // Minimum 100 meters
  const newRange = Math.max(minRange, map3d.range * factor);
  map3d.range = newRange;
}

/**
 * Zoom out (increase range)
 * @param {number} factor - Zoom factor (default 2 = double the range)
 */
export function zoomOut(factor = 2) {
  if (!map3d) return;

  const maxRange = 20000000; // Maximum 20,000 km (Earth diameter ~12,742 km)
  const newRange = Math.min(maxRange, map3d.range * factor);
  map3d.range = newRange;
}

/**
 * Fly to Spain overview (home position)
 * @returns {Promise<Object|null>}
 */
export function flyToSpainOverview() {
  return flyToLocation({
    lat: 40.0,
    lng: -3.7,
    altitude: 0,
    range: 2000000, // 2000km altitude
    tilt: 0,        // Looking straight down
    heading: 0
  }, 8000); // 8 seconds for overview
}

/**
 * Add click handler to map
 * @param {Function} callback - Function to call on click with {lat, lng}
 */
export function addClickHandler(callback) {
  if (!map3d) return;

  map3d.addEventListener('gmp-click', (event) => {
    if (event.position) {
      callback({
        lat: event.position.lat,
        lng: event.position.lng
      });
    }
  });
}

// Make functions globally available for UI controls
if (typeof window !== 'undefined') {
  window.stopOrbitAnimation = stopAnimation;
  window.startOrbitAnimation = startOrbit;
  window.stopDroneOrbit = stopAnimation;
  window.startDroneOrbit = startOrbit;
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
}

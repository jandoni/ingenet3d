/**
 * Google-style smooth camera animation for Cesium
 * Camera always looks at Earth, never at sky
 *
 * Uses lookAt() + clock.onTick to interpolate:
 * - Target position (where camera looks)
 * - Camera offset (range, heading, pitch)
 *
 * This ensures the camera ALWAYS points at the ground during flight,
 * unlike Cesium's flyTo() which can point at the sky.
 */

let activeAnimation = null;

/**
 * Easing function - sine ease out for very gentle deceleration
 * The gentlest ease-out, very smooth ending like Google Earth
 * @param {number} t - Progress from 0 to 1
 * @returns {number} Eased value from 0 to 1
 */
function easeOutSine(t) {
  return Math.sin((t * Math.PI) / 2);
}

/**
 * Interpolate between two values with easing
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Progress from 0 to 1 (will be eased)
 * @returns {number} Interpolated value
 */
function lerp(start, end, t) {
  const easedT = easeOutSine(t);
  return start + (end - start) * easedT;
}

/**
 * Interpolate between two Cartesian3 positions with easing
 * @param {Cesium.Cartesian3} start - Start position
 * @param {Cesium.Cartesian3} end - End position
 * @param {number} t - Progress from 0 to 1 (will be eased)
 * @param {Cesium.Cartesian3} result - Result object to store interpolated position
 * @returns {Cesium.Cartesian3} Interpolated position
 */
function lerpCartesian3(start, end, t, result) {
  const easedT = easeOutSine(t);
  return Cesium.Cartesian3.lerp(start, end, easedT, result);
}

/**
 * Get current camera state as target + offset
 * @param {Cesium.Viewer} viewer - Cesium viewer
 * @returns {Object} Camera state {target, range, heading, pitch}
 */
function getCurrentCameraState(viewer) {
  const camera = viewer.camera;

  // Get the point the camera is looking at (ray intersection with globe)
  const ray = camera.getPickRay(new Cesium.Cartesian2(
    viewer.canvas.clientWidth / 2,
    viewer.canvas.clientHeight / 2
  ));

  let targetCartesian;

  if (ray) {
    const intersection = viewer.scene.globe.pick(ray, viewer.scene);

    if (intersection) {
      targetCartesian = intersection;
    } else {
      // Fallback: use point directly below camera
      const carto = camera.positionCartographic;
      targetCartesian = Cesium.Cartesian3.fromRadians(
        carto.longitude, carto.latitude, 0
      );
    }
  } else {
    // Fallback: use point directly below camera
    const carto = camera.positionCartographic;
    targetCartesian = Cesium.Cartesian3.fromRadians(
      carto.longitude, carto.latitude, 0
    );
  }

  // Calculate offset from target
  const range = Cesium.Cartesian3.distance(camera.position, targetCartesian);
  const heading = camera.heading;
  const pitch = camera.pitch;

  return {
    target: targetCartesian,
    range: range,
    heading: heading,
    pitch: pitch
  };
}

/**
 * Smooth fly to destination - Google Earth style
 * Camera always looks at Earth during the entire flight.
 *
 * @param {Cesium.Viewer} viewer - Cesium viewer
 * @param {Object} endConfig - Destination config {target, distance, heading, pitch, headingPitchRange}
 * @param {number} duration - Animation duration in milliseconds (default 5000)
 * @returns {Promise<Object|null>} Resolves with endConfig when animation completes, null if cancelled
 */
export function smoothFlyTo(viewer, endConfig, duration = 5000) {
  // Cancel any existing animation
  if (activeAnimation) {
    activeAnimation.cancel();
  }

  return new Promise((resolve) => {
    const startState = getCurrentCameraState(viewer);
    const startTime = performance.now();

    // Get end range from config (supports both formats)
    const endRange = endConfig.distance || endConfig.headingPitchRange?.range || 1000;
    const startRange = startState.range;

    // Calculate intermediate "zoom out" height for parabolic arc effect
    // The arc should be higher when traveling longer distances
    const distance = Cesium.Cartesian3.distance(startState.target, endConfig.target);
    const arcMultiplier = Math.min(2.0, 1.0 + (distance / 1000000)); // Scale based on distance
    const maxRange = Math.max(startRange, endRange, distance * 0.3) * arcMultiplier;

    const tickListener = viewer.clock.onTick.addEventListener(() => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1.0);

      if (t >= 1.0) {
        // Animation complete - apply final position
        viewer.camera.lookAt(
          endConfig.target,
          new Cesium.HeadingPitchRange(
            endConfig.heading,
            endConfig.pitch,
            endRange
          )
        );

        // Unlock camera so user can interact
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

        // Cleanup
        tickListener();
        activeAnimation = null;
        resolve(endConfig);
        return;
      }

      // Interpolate target position (where camera looks)
      const currentTarget = new Cesium.Cartesian3();
      lerpCartesian3(startState.target, endConfig.target, t, currentTarget);

      // Use fixed heading (no spin!) - only interpolate pitch
      const currentHeading = endConfig.heading; // Fixed at destination heading
      const currentPitch = lerp(startState.pitch, endConfig.pitch, t);

      // Interpolate range with parabolic arc (zoom out then in)
      // Use sine curve for smooth arc: 0 -> 1 -> 0 over the animation
      const arcFactor = Math.sin(t * Math.PI);
      const baseRange = lerp(startRange, endRange, t);
      const arcBoost = (maxRange - Math.max(startRange, endRange)) * arcFactor;
      const currentRange = baseRange + arcBoost;

      // Apply camera position using lookAt (always looks at Earth!)
      viewer.camera.lookAt(
        currentTarget,
        new Cesium.HeadingPitchRange(currentHeading, currentPitch, currentRange)
      );

      // Force tile loading during animation
      viewer.scene.requestRender();

      // Update globe tiles for current view
      if (viewer.scene.globe) {
        viewer.scene.globe.update(viewer.scene.frameState);
      }

      // Update 3D tileset if available
      if (viewer.scene.primitives) {
        for (let i = 0; i < viewer.scene.primitives.length; i++) {
          const primitive = viewer.scene.primitives.get(i);
          if (primitive && primitive.update) {
            try {
              primitive.update(viewer.scene.frameState);
            } catch (e) {
              // Ignore update errors
            }
          }
        }
      }
    });

    activeAnimation = {
      cancel: () => {
        tickListener();
        activeAnimation = null;
        viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        resolve(null);
      }
    };
  });
}

/**
 * Stop any active camera animation
 */
export function stopAnimation() {
  if (activeAnimation) {
    activeAnimation.cancel();
  }
}

/**
 * Check if an animation is currently running
 * @returns {boolean} True if animation is active
 */
export function isAnimating() {
  return activeAnimation !== null;
}

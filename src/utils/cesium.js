// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//      http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GOOGLE_MAPS_API_KEY } from "../env.js";
import { story } from "../main.js";
import { resolvePlaceToCameraNew, applyCameraConfigNew } from "./places-new-api.js";

/**
 * The radius from the target point to position the camera.
 * @readonly
 * @type {number}
 */
const RADIUS = 800;

/**
 * The base pitch of the camera. Defaults to -30 degrees in radians.
 * @readonly
 * @type {number}
 */
const BASE_PITCH_RADIANS = -0.523599;

/**
 * The base heading of the camera. Defaults to 180 degrees in radians.
 * @readonly
 * @type {number}
 */
const BASE_HEADING_RADIANS = 3.14159;

/**
 * The base roll of the camera. Defaults to 0 degrees in radians.
 * @readonly
 * @type {number}
 */
const BASE_ROLL_RADIANS = 0;

/**
 * The default radius size of the highlighted area
 * @readonly
 */
export const DEFAULT_HIGHLIGHT_RADIUS = 250;

/**
 * An export of the CesiumJS viewer instance to be accessed by other modules.
 * @type {Cesium.Viewer} The CesiumJS viewer instance.
 */
export let cesiumViewer;

/**
 * Helper function to position camera to view an entire country
 * @param {number} lat - Center latitude in degrees
 * @param {number} lng - Center longitude in degrees  
 * @param {number} altitude - Altitude in meters (default 2,000,000 for country view)
 * @returns {Object} Camera configuration
 */
export function getCountryViewCamera(lat, lng, altitude = 2000000) {
  // Convert center point to Cartesian3
  const center = Cesium.Cartesian3.fromDegrees(lng, lat, 0);
  
  // Calculate camera position directly above the center at specified altitude
  const cameraPos = Cesium.Cartesian3.fromDegrees(lng, lat, altitude);
  
  return {
    position: {
      x: cameraPos.x,
      y: cameraPos.y,
      z: cameraPos.z
    },
    heading: 0,
    pitch: -1.57079632679, // -90 degrees (looking straight down)
    roll: 0
  };
}

/**
 * @type {Cesium.Cesium3DTileset} The Google Photorealistic 3D tileset.
 */
let tileset = null;

/**
 * Asynchronously calculates the camera position and orientation based on the given parameters.
 *
 * @param {Object} coords - The coordinates of the target point as an object with properties `lat` (latitude) and `lng` (longitude).
 *
 * @returns {Promise<{
 *   position: Cesium.Cartesian3,
 *   heading: number,
 *   pitch: number,
 *   roll: number
 * }>} A promise that resolves to an object representing the camera position and orientation with properties:
 *   - position: A {@link Cesium.Cartesian3} representing the camera position in Earth-fixed coordinates.
 *   - heading: The heading angle of the camera (in radians).
 *   - pitch: The pitch angle of the camera (in radians).
 *   - roll: The roll angle of the camera (in radians).
 */
export async function calculateCameraPositionAndOrientation(coords) {
  // Convert latitude and longitude to Cartesian3 (Earth-fixed coordinates)
  const center = await adjustCoordinateHeight(coords);

  const headingRadians = BASE_HEADING_RADIANS;
  const pitchRadians = BASE_PITCH_RADIANS;
  const rollRadians = BASE_ROLL_RADIANS;

  // Create a local east-north-up coordinate system at the given center point
  const localEastNorthUp = Cesium.Transforms.eastNorthUpToFixedFrame(center);

  // Calculate the camera's offset in the local east-north-up coordinates
  // - 'radius * Math.sin(headingRadians)' gives the distance in the east direction
  // - 'radius * Math.cos(pitchRadians * -1)' gives the distance in the north direction
  // - 'radius * Math.sin(pitchRadians * -1)' gives the height above the center point
  const cameraOffset = new Cesium.Cartesian3(
    RADIUS * Math.sin(headingRadians),
    RADIUS * Math.cos(pitchRadians * -1),
    RADIUS * Math.sin(pitchRadians * -1)
  );

  // Calculate the camera's final position in Earth-fixed coordinates
  // This is achieved by transforming the local offset to the global coordinate system
  const cameraPosition = new Cesium.Cartesian3();
  Cesium.Matrix4.multiplyByPoint(
    localEastNorthUp,
    cameraOffset,
    cameraPosition
  );

  return {
    position: cameraPosition,
    heading: headingRadians,
    pitch: pitchRadians,
    roll: rollRadians,
  };
}

/**
 * Asynchronously adjusts the height of the given coordinates to the most detailed terrain height.
 *
 * @param {google.maps.LatLngLiteral} coords - The latitude and longitude coordinates.
 * @return {Promise<Cesium.Cartesian3>} A Cartesian3 object with adjusted height.
 */
async function adjustCoordinateHeight(coords) {
  const { lat, lng } = coords;

  const cartesian = Cesium.Cartesian3.fromDegrees(lng, lat);
  const clampedCoords = await cesiumViewer.scene.clampToHeightMostDetailed([
    cartesian,
  ]);

  const cartographic = Cesium.Cartographic.fromCartesian(clampedCoords[0]);

  return Cesium.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    cartographic.height
  );
}

/**
 * @typedef {Object} FlyToOptions - Options for the fly-to animation.
 * @property {Cartesian3} [position] - The final position of the camera in WGS84 (world) coordinates.
 * @property {Object} [orientation] - An object that contains heading, pitch and roll properties.
 * @property {number} [duration] - The duration of the fly-to animation in seconds. If undefined, Cesium calculates an ideal duration based on the distance to be traveled by the flight.
 *
 * Performs a fly-to animation on the Cesium viewer to the specified position.
 * @param {FlyToOptions} options - The "fly-to" options.
 */
export async function performFlyTo(options) {
  const { position, orientation, duration } = options;

  cesiumViewer.camera.flyTo({
    destination: position,
    orientation,
    duration,
  });
}

/**
 * Returns current camera options
 *
 * @return {Object} Object containing height, heading, pitch and roll options.
 */
export function getCameraOptions() {
  const { position, heading, pitch, roll } = cesiumViewer.camera;
  return {
    // spread object to remove reference to cesium camera position
    position: { ...position },
    heading,
    pitch,
    roll,
  };
}

/**
 * The `initializeCesiumViewer` function is responsible for initializing a CesiumJS 3D map viewer,
 * configuring its default camera position and orientation, and adding both a 3D
 * tileset and attribution to the viewer.
 *
 * @param {Object} performanceSettings - Adaptive performance settings (optional)
 */
export async function initCesiumViewer(performanceSettings = null) {
  // Get performance settings or use safe defaults
  const settings = performanceSettings || {
    resolutionScale: 1.5,
    tileRequests: 12,
    targetFrameRate: 30
  };

  // Configure tile requests based on network speed (adaptive!)
  Cesium.RequestScheduler.requestsByServer["tile.googleapis.com:443"] = settings.tileRequests;
  console.log(`📡 Configured ${settings.tileRequests} simultaneous tile requests`);

  // Set the default access token to null to prevent the CesiumJS viewer from requesting an access token
  Cesium.Ion.defaultAccessToken = null;

  // Detect if we're on mobile for performance optimizations
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // most options prevent the creation of certain built-in widgets (cesium ui elements)
  cesiumViewer = new Cesium.Viewer("cesium-container", {
    baseLayerPicker: false,
    imageryProvider: false,
    homeButton: false,        // Disable home button
    fullscreenButton: false,  // Disable fullscreen button
    navigationHelpButton: false, // Disable navigation help
    sceneModePicker: false,
    geocoder: false,
    infoBox: false,
    selectionIndicator: false,
    timeline: false,
    animation: false,
    // Enable request render mode for better performance
    requestRenderMode: true,
    // Adaptive frame rate based on device and network
    targetFrameRate: settings.targetFrameRate
  });

  // disable the default lighting of the globe
  cesiumViewer.scene.globe.baseColor = Cesium.Color.TRANSPARENT;

  // Adaptive resolution scale based on device capabilities and network speed
  cesiumViewer.resolutionScale = settings.resolutionScale;
  console.log(`🎨 Resolution scale: ${settings.resolutionScale}x`);

  // Enable camera controls for user interaction
  cesiumViewer.scene.screenSpaceCameraController.enableLook = true;
  cesiumViewer.scene.screenSpaceCameraController.enableTranslate = true; // Enable panning
  cesiumViewer.scene.screenSpaceCameraController.enableZoom = true;
  cesiumViewer.scene.screenSpaceCameraController.enableRotate = true;
  cesiumViewer.scene.screenSpaceCameraController.enableTilt = true;

  // Configure zoom behavior for better responsiveness
  cesiumViewer.scene.screenSpaceCameraController.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH
  ];
  cesiumViewer.scene.screenSpaceCameraController.minimumZoomDistance = 100; // 100 meters minimum
  cesiumViewer.scene.screenSpaceCameraController.maximumZoomDistance = 20000000; // 20,000 km maximum

  // Configure mouse controls for better UX
  // Left mouse = Rotate
  // Shift + Left mouse = Pan (move around)
  // Right mouse = Tilt
  // Scroll = Zoom

  // Set up translate (pan) with Shift modifier
  cesiumViewer.scene.screenSpaceCameraController.translateEventTypes = [
    {
      eventType: Cesium.CameraEventType.LEFT_DRAG,
      modifier: Cesium.KeyboardEventModifier.SHIFT
    }
  ];

  // Left-click + drag for rotation (default behavior)
  cesiumViewer.scene.screenSpaceCameraController.rotateEventTypes = Cesium.CameraEventType.LEFT_DRAG;

  // For Spain overview, use epic Earth-to-Spain zoom animation on initial load
  if (story.properties.placeName === "Spain" && story.properties.cameraStyle === "overview") {
    // Use the epic zoom animation on first load
    animateEarthToSpain();
  } else if (story.properties.placeName) {
    try {
      // Check if Google Maps services are available
      if (typeof google !== 'undefined' && google.maps) {
        const cameraConfig = await resolvePlaceToCameraNew(
          story.properties.placeName, 
          story.properties.cameraStyle || 'overview'
        );
        // Use immediate mode for initial overview to avoid any zoom animations
        applyCameraConfigNew(cameraConfig, true);
      } else {
        console.warn('Google Maps not available, using default Spain view');
        setDefaultSpainView();
      }
    } catch (error) {
      console.error('Error setting initial camera from place:', error);
      // Fallback to default Spain view
      setDefaultSpainView();
    }
  } else {
    // Fallback to default Spain view
    setDefaultSpainView();
  }

  function setSpainOverviewFromGoogleEarth() {
    setSpainOverviewFromGoogleEarthExported();
  }

  function setDefaultSpainView() {
    // Default overview of Spain (fallback)
    cesiumViewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-3.7492, 40.4637, 2000000), // 2000km altitude
      orientation: {
        heading: 0,
        pitch: -1.2,
        roll: 0,
      },
    });
  }

  await createTileset();
  createAttribution();
}

/**
 * Asynchronously creates a Google Photorealistic 3D tileset using a provided Google Maps API key
 * and adds it to a CesiumJS viewer's scene.
 *
 * @throws {Error} If an error occurs during tileset creation, an error message is logged to the console.
 * @returns {Promise<void>} A Promise that resolves when the tileset has been successfully added to the viewer's scene.
 */
async function createTileset() {
  try {
    tileset = await Cesium.Cesium3DTileset.fromUrl(
      "https://tile.googleapis.com/v1/3dtiles/root.json?key=" +
        GOOGLE_MAPS_API_KEY
    );
    
    // This property is required to properly display attributions
    tileset.showCreditsOnScreen = true;

    // Add tileset to the scene
    cesiumViewer.scene.primitives.add(tileset);
  } catch (error) {
    console.error(`Error creating tileset: ${error}`);
  }
}

/**
 * Creates an attribution element for the Cesium viewer.
 */
function createAttribution() {
  if (!cesiumViewer) {
    console.error("Error creating attribution: `cesiumViewer` is undefined");
    return;
  }

  const cesiumCredits = cesiumViewer.scene.frameState.creditDisplay.container;

  // Create attribution text element
  const text = document.createTextNode(
    "Google • Landsat / Copernicus • IBCAO • Data SIO, NOAA, U.S. Navy, NGA, GEBCO • U.S. Geological Survey"
  );
  text.className = "cesium-credits__text";

  cesiumCredits.prepend(text);

  // Create image element for Google's logo
  const img = document.createElement("img");
  img.src = "assets/google-attribution.png";
  img.alt = "Google";

  cesiumCredits.prepend(img);
}

/**
 * Removes the custom radius shader from the tileset.
 */
export function removeCustomRadiusShader() {
  if (tileset.customShader) {
    tileset.customShader = undefined;
  }
}

/**
 * Set Spain overview using exact Google Earth coordinates (exported function)
 */
export function setSpainOverviewFromGoogleEarthExported() {
  if (!cesiumViewer) {
    console.error('Cesium viewer not initialized');
    return;
  }

  // Spain overview - top-down view centered on Spain and Canary Islands
  // Centered between mainland Spain and Canary Islands
  const latitude = 38.5; // Adjusted to include Canary Islands
  const longitude = -5.0; // Adjusted to center better
  const altitude = 0;
  const range = 6000000; // 6 million meters to show Spain + Canary Islands with extra space (zoomed out further)

  // Fully vertical view (top-down)
  const heading = 0; // North up
  const pitch = Cesium.Math.toRadians(-90); // Straight down (90 degrees)
  const roll = 0;

  // Set camera position using lookAt for top-down view
  const center = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
  const headingPitchRange = new Cesium.HeadingPitchRange(heading, pitch, range);

  cesiumViewer.camera.lookAt(center, headingPitchRange);
}

/**
 * Animate from Earth view to Spain overview (epic zoom effect)
 * Shows the entire Earth, then zooms into Spain smoothly
 */
export function animateEarthToSpain() {
  if (!cesiumViewer) {
    console.error('Cesium viewer not initialized');
    return;
  }

  // Final Spain position (same as setSpainOverviewFromGoogleEarthExported)
  const latitude = 38.5;
  const longitude = -5.0;
  const altitude = 0;
  const finalRange = 6000000; // 6 million meters

  // Start from Earth view (show entire planet)
  const earthCenter = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
  const earthRange = 20000000; // 20 million meters (view entire Earth)
  const earthHeading = 0;
  const earthPitch = Cesium.Math.toRadians(-90); // Top-down
  const earthRoll = 0;

  // First, immediately set camera to Earth view
  cesiumViewer.camera.lookAt(
    earthCenter,
    new Cesium.HeadingPitchRange(earthHeading, earthPitch, earthRange)
  );

  // Then, animate smooth zoom to Spain (3.5 seconds)
  setTimeout(() => {
    const spainCenter = Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude);
    const spainHeading = 0;
    const spainPitch = Cesium.Math.toRadians(-90);
    const spainRoll = 0;

    // Use flyTo for smooth animation
    cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, finalRange),
      orientation: {
        heading: spainHeading,
        pitch: spainPitch,
        roll: spainRoll
      },
      duration: 3.5, // 3.5 seconds for epic zoom
      easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT
    });
  }, 100); // Small delay to ensure Earth view is set first
}

/**
 * Spain orbit animation (same speed as other locations)
 */
let spainOrbitAnimation = null;

export function stopSpainOrbitEffect() {
  if (spainOrbitAnimation) {
    spainOrbitAnimation();
    spainOrbitAnimation = null;
  }
}

export function startSpainOrbitEffect() {
  stopSpainOrbitEffect(); // Clear any existing orbit

  // Don't check for mobile here - let the pause button control it
  spainOrbitAnimation = cesiumViewer.clock.onTick.addEventListener(() => {
    // Very subtle rotation for overview: 0.00005 radians/tick (minimal movement)
    cesiumViewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.00005);
  });
}

// Make orbit control functions available globally for cross-module access
if (typeof window !== 'undefined') {
  window.stopSpainOrbitEffect = stopSpainOrbitEffect;
  window.startSpainOrbitEffect = startSpainOrbitEffect;
  // Unified naming for consistency
  window.stopOverviewOrbit = stopSpainOrbitEffect;
  window.startOverviewOrbit = startSpainOrbitEffect;
}

/**
 * Zoom in the camera (move closer)
 */
export function zoomIn() {
  if (!cesiumViewer) {
    console.warn('Cesium viewer not initialized');
    return;
  }

  const camera = cesiumViewer.camera;

  // Get current height
  const ellipsoid = cesiumViewer.scene.globe.ellipsoid;
  const cartographic = ellipsoid.cartesianToCartographic(camera.position);
  const height = cartographic.height;

  // Calculate zoom amount (10% closer - reduced for smoother feel)
  const zoomAmount = height * 0.1;

  // Animate the zoom for smooth transition
  const startHeight = height;
  const endHeight = height - zoomAmount;
  const duration = 300; // 300ms animation
  const startTime = Date.now();

  const animate = () => {
    const now = Date.now();
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out function for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    const currentHeight = startHeight - (zoomAmount * easeProgress);

    // Move camera to new height
    const position = camera.position;
    const cartographic = ellipsoid.cartesianToCartographic(position);
    const newPosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      currentHeight
    );
    camera.position = newPosition;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }

    cesiumViewer.scene.requestRender();
  };

  animate();
}

/**
 * Zoom out the camera (move farther away)
 */
export function zoomOut() {
  if (!cesiumViewer) {
    console.warn('Cesium viewer not initialized');
    return;
  }

  const camera = cesiumViewer.camera;

  // Get current height
  const ellipsoid = cesiumViewer.scene.globe.ellipsoid;
  const cartographic = ellipsoid.cartesianToCartographic(camera.position);
  const height = cartographic.height;

  // Calculate zoom amount (10% farther - reduced for smoother feel)
  const zoomAmount = height * 0.1;

  // Animate the zoom for smooth transition
  const startHeight = height;
  const endHeight = height + zoomAmount;
  const duration = 300; // 300ms animation
  const startTime = Date.now();

  const animate = () => {
    const now = Date.now();
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease out function for smooth deceleration
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    const currentHeight = startHeight + (zoomAmount * easeProgress);

    // Move camera to new height
    const position = camera.position;
    const cartographic = ellipsoid.cartesianToCartographic(position);
    const newPosition = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      currentHeight
    );
    camera.position = newPosition;

    if (progress < 1) {
      requestAnimationFrame(animate);
    }

    cesiumViewer.scene.requestRender();
  };

  animate();
}

// Make zoom functions available globally
if (typeof window !== 'undefined') {
  window.zoomIn = zoomIn;
  window.zoomOut = zoomOut;
}

/**
 * Adds a custom shader for the tiles to darken all tiles outside the radius around the center.
 *
 * @param {google.maps.LatLngLiteral} coordinates - The center coordinates.
 * @param {number} radius - The radius in meters.
 */
export function createCustomRadiusShader(coordinates, radius) {
  const { lat, lng } = coordinates;
  const center = Cesium.Cartesian3.fromDegrees(lng, lat);

  tileset.customShader = new Cesium.CustomShader({
    uniforms: {
      u_center: {
        type: Cesium.UniformType.VEC3,
        value: center,
      },
      u_radius: {
        type: Cesium.UniformType.FLOAT,
        value: radius,
      },
      u_darkenAmount: {
        type: Cesium.UniformType.FLOAT,
        value: 0.3, // The amount to darken the tile color from 0 = black to 1 = original color
      },
    },
    fragmentShaderText: `
      // Color tiles by distance to the center
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material)
      {
        float distanceInMeters = length(u_center - fsInput.attributes.positionWC.xyz);
        float range = 10.0 ;
        float min = u_radius - range;
        float max = u_radius + range;

        // Darken the tiles if the distance to the center is greater than the radius
        if(distanceInMeters > min && distanceInMeters < max)
        {
          float ratio = (distanceInMeters - min) / (max - min) * (u_darkenAmount - 1.0) - 1.0 * -1.0; 
          vec3 darkenedColor = material.diffuse * ratio;
          material.diffuse = darkenedColor;
        }

         if(distanceInMeters > max)
        {
          vec3 darkenedColor = material.diffuse * u_darkenAmount;
          material.diffuse = darkenedColor;
        }
      }
    `,
  });
}

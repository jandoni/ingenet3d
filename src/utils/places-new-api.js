// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { cesiumViewer } from "./cesium.js";

/**
 * Service for handling NEW Places API integration with automatic camera positioning
 * Using the new google.maps.places.Place class (2025)
 */

let elevationService;
let geocoder;

// API caching and rate limiting
const apiCache = new Map();
const requestQueue = [];
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // Minimum 100ms between API requests

/**
 * Rate-limited API request wrapper with caching
 */
async function rateLimitedApiCall(cacheKey, apiFunction) {
  // Check cache first
  if (apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }
  
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  
  try {
    lastRequestTime = Date.now();
    const result = await apiFunction();
    
    // Cache the result
    apiCache.set(cacheKey, result);
    
    // Limit cache size to prevent memory issues
    if (apiCache.size > 50) {
      const firstKey = apiCache.keys().next().value;
      apiCache.delete(firstKey);
    }
    
    return result;
  } catch (error) {
    console.error(`API call failed for ${cacheKey}:`, error);
    throw error;
  }
}

/**
 * Initialize Google Maps services (NEW API)
 */
export function initGoogleMapsServicesNew() {
  // Check if Google Maps is loaded
  if (typeof google === 'undefined' || !google.maps) {
    console.error('Google Maps not loaded yet');
    return false;
  }
  
  try {
    // Only need elevation service and geocoder now
    // PlacesService is deprecated, we use Place class directly
    elevationService = new google.maps.ElevationService();
    geocoder = new google.maps.Geocoder();
    return true;
  } catch (error) {
    console.error('Error initializing Google Maps services:', error);
    return false;
  }
}

/**
 * Search for a place using the NEW Place API
 * @param {string} query - The place name to search for
 * @returns {Promise<Object>} Place details
 */
async function searchPlace(query) {
  try {
    // First try NEW API without type restriction for addresses
    let request = {
      textQuery: query,
      fields: ['id', 'displayName', 'location', 'viewport', 'photos', 'editorialSummary', 
               'formattedAddress', 'rating', 'regularOpeningHours', 'internationalPhoneNumber',
               'adrFormatAddress', 'businessStatus', 'priceLevel', 'userRatingCount'],
      language: 'es',
      maxResultCount: 1
    };

    let { places } = await google.maps.places.Place.searchByText(request);
    
    if (places && places.length > 0) {
      return places[0];
    }
    
    // If no results, try Legacy Find Place API (better for addresses)
    console.log(`NEW API failed for ${query}, trying Legacy Find Place API...`);
    return await searchPlaceLegacy(query);
    
  } catch (error) {
    console.error(`Error searching for place ${query}:`, error);
    throw error;
  }
}

/**
 * Search for a place using the Legacy Find Place API (better for addresses)
 * @param {string} query - The place name/address to search for
 * @returns {Promise<Object>} Place object from Google Places API
 */
async function searchPlaceLegacy(query) {
  try {
    console.log(`Trying Legacy Find Place API for: ${query}`);
    
    const service = new google.maps.places.PlacesService(document.createElement('div'));
    
    return new Promise((resolve, reject) => {
      const request = {
        query: query,
        fields: ['place_id', 'name', 'formatted_address', 'geometry', 'photos', 'rating', 'types']
      };
      
      service.findPlaceFromQuery(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];
          console.log(`Legacy Find Place API found: ${place.name} at ${place.formatted_address}`);
          
          // Convert legacy format to NEW API format
          const convertedPlace = {
            id: place.place_id,
            displayName: { text: place.name },
            location: place.geometry.location,
            viewport: place.geometry.viewport,
            formattedAddress: place.formatted_address,
            photos: place.photos || [],
            rating: place.rating
          };
          
          resolve(convertedPlace);
        } else {
          console.error(`Legacy Find Place API failed with status: ${status}`);
          reject(new Error(`Legacy Find Place API failed: ${status}`));
        }
      });
    });
  } catch (error) {
    console.error(`Error in Legacy Find Place API for ${query}:`, error);
    throw error;
  }
}

/**
 * Get photos for a place using NEW API
 * @param {Object} place - The place object
 * @returns {Array} Array of photo URLs
 */
async function getPlacePhotos(place) {
  if (!place.photos || place.photos.length === 0) {
    return [];
  }

  // Get up to 5 photos
  const photoUrls = [];
  for (let i = 0; i < Math.min(5, place.photos.length); i++) {
    const photo = place.photos[i];
    // Get photo URL with specific max width/height
    const photoUrl = photo.getURI({ maxWidth: 800, maxHeight: 600 });
    photoUrls.push(photoUrl);
  }

  return photoUrls;
}

/**
 * Get elevation for a location
 */
async function getElevation(location) {
  return new Promise((resolve, reject) => {
    elevationService.getElevationForLocations({
      locations: [location]
    }, (results, status) => {
      if (status === 'OK' && results[0]) {
        resolve(results[0].elevation || 0);
      } else {
        // Default elevation if service fails
        resolve(10);
      }
    });
  });
}

/**
 * Resolve a place name to camera configuration using NEW Google Places API
 * @param {string} placeName - The place name to search for
 * @param {string} cameraStyle - 'static', 'drone-orbit', or 'overview'
 * @returns {Promise<Object>} Camera configuration with coordinates and settings
 */
export async function resolvePlaceToCameraNew(placeName, cameraStyle = 'static') {
  // Check if services are initialized
  if (!geocoder || !elevationService) {
    throw new Error('Google Maps services not initialized. Call initGoogleMapsServicesNew() first.');
  }
  
  // Use caching for place resolution
  const cacheKey = `place_${placeName}_${cameraStyle}`;
  
  return await rateLimitedApiCall(cacheKey, async () => {
    try {
      // Search for the place using NEW API
      const place = await searchPlace(placeName);
    
    if (!place) {
      throw new Error(`Could not find place: ${placeName}`);
    }

    // Get place details
    const location = place.location;
    const viewport = place.viewport;
    
    // Get photos
    const photos = await getPlacePhotos(place);
    
    // Get elevation for the location
    const elevation = await getElevation(location);
    
    // Calculate optimal camera position
    const cameraConfig = calculateOptimalCamera({ location, viewport }, elevation, cameraStyle);
    
    // Return comprehensive place data
    return {
      ...cameraConfig,
      placeName,
      location,
      viewport,
      elevation,
      placeDetails: {
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        editorialSummary: place.editorialSummary,
        rating: place.rating,
        userRatingCount: place.userRatingCount,
        photos: photos,
        phoneNumber: place.internationalPhoneNumber,
        openingHours: place.regularOpeningHours,
        priceLevel: place.priceLevel
      }
    };
    
    } catch (error) {
      console.error(`Error resolving place ${placeName}:`, error);
      throw error;
    }
  });
}

/**
 * Calculate optimal camera position (same as before but with adjustments)
 */
function calculateOptimalCamera(placeDetails, elevation, cameraStyle) {
  const { location, viewport } = placeDetails;
  
  if (!viewport) {
    // Fallback for places without viewport
    return createDefaultCameraConfig(location, elevation, cameraStyle);
  }

  // Calculate optimal distance based on viewport size
  const ne = viewport.getNorthEast();
  const sw = viewport.getSouthWest();
  
  const distance = Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromDegrees(sw.lng(), sw.lat(), elevation),
    Cesium.Cartesian3.fromDegrees(ne.lng(), ne.lat(), elevation)
  ) / 2;

  // Ensure minimum distance for close-up locations
  const minDistance = 500; // 500 meters minimum
  const maxDistance = 10000; // 10km maximum for buildings
  const adjustedDistance = Math.max(minDistance, Math.min(maxDistance, distance));

  // Camera settings based on style
  let heading = 0;
  let pitch = -Math.PI / 4; // -45 degrees

  switch (cameraStyle) {
    case 'drone-orbit':
      heading = 0; // Always start from front view (north-facing)
      pitch = -Math.PI / 8; // -22.5 degrees for better architectural view (higher tilt)
      break;
    case 'overview':
      pitch = -Math.PI / 2; // -90 degrees (straight down)
      // For country overview, use much higher altitude
      if (adjustedDistance < 200000) { // If less than 200km, increase for country view
        return createCountryOverviewConfig(location, elevation);
      }
      break;
    case 'static':
    default:
      heading = 0;
      pitch = -Math.PI / 4;
      break;
  }

  // Create target position
  const target = Cesium.Cartesian3.fromDegrees(
    location.lng(), 
    location.lat(), 
    elevation
  );

  return {
    target,
    distance: adjustedDistance,
    heading,
    pitch,
    roll: 0,
    cameraStyle,
    headingPitchRange: new Cesium.HeadingPitchRange(heading, pitch, adjustedDistance)
  };
}

/**
 * Country overview camera configuration
 */
function createCountryOverviewConfig(location, elevation) {
  const countryDistance = 2000000; // 2000km altitude for country view
  
  return {
    target: Cesium.Cartesian3.fromDegrees(location.lng(), location.lat(), elevation),
    distance: countryDistance,
    heading: 0,
    pitch: -Math.PI / 2, // -90 degrees (straight down)
    roll: 0,
    cameraStyle: 'overview',
    headingPitchRange: new Cesium.HeadingPitchRange(0, -Math.PI / 2, countryDistance)
  };
}

/**
 * Fallback camera configuration
 */
function createDefaultCameraConfig(location, elevation, cameraStyle) {
  const defaultDistance = cameraStyle === 'overview' ? 2000000 : 1000; // Increased overview distance
  
  return {
    target: Cesium.Cartesian3.fromDegrees(location.lng(), location.lat(), elevation),
    distance: defaultDistance,
    heading: 0,
    pitch: cameraStyle === 'overview' ? -Math.PI / 2 : -Math.PI / 4,
    roll: 0,
    cameraStyle,
    headingPitchRange: new Cesium.HeadingPitchRange(
      0, 
      cameraStyle === 'overview' ? -Math.PI / 2 : -Math.PI / 4, 
      defaultDistance
    )
  };
}

/**
 * Apply camera configuration to Cesium viewer
 * @param {Object} cameraConfig - Camera configuration
 * @param {boolean} immediate - If true, sets camera immediately without animation
 */
export function applyCameraConfigNew(cameraConfig, immediate = false) {
  if (!cesiumViewer) {
    throw new Error('Cesium viewer not initialized');
  }

  if (immediate) {
    // For initial overview, set camera immediately without any animation
    cesiumViewer.camera.setView({
      destination: cameraConfig.target,
      orientation: {
        heading: cameraConfig.heading,
        pitch: cameraConfig.pitch,
        roll: cameraConfig.roll
      }
    });
  } else {
    // Use Cesium's lookAt method for precise positioning
    cesiumViewer.camera.lookAt(
      cameraConfig.target,
      cameraConfig.headingPitchRange
    );
  }

  // Add drone orbit effect if specified (but not for overview)
  if (cameraConfig.cameraStyle === 'drone-orbit') {
    // Check if mobile and if orbit should be paused by default
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (!isMobile || (window.isOrbitPaused === false)) {
      // Only start orbit on desktop or if explicitly unpaused on mobile
      startDroneOrbit();
    } else {
      console.log('📱 Mobile: orbit paused by default for this location');
      stopDroneOrbit();
    }
  } else {
    stopDroneOrbit();
  }
}

/**
 * Drone orbit animation (SLOWER)
 */
let orbitAnimation = null;

function startDroneOrbit() {
  stopDroneOrbit(); // Clear any existing orbit
  stopSpainOrbitIfExists(); // Stop Spain orbit if active

  // Don't check for mobile here - let the pause button control it
  orbitAnimation = cesiumViewer.clock.onTick.addEventListener(() => {
    // Reduced rotation speed for subtle animation (0.0010 - very gentle)
    cesiumViewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.0010);
  });
}

// Function to stop Spain orbit (we'll import this or check if it exists)
function stopSpainOrbitIfExists() {
  // Check if we can access the Spain orbit stop function
  if (typeof window !== 'undefined' && window.stopSpainOrbitEffect) {
    window.stopSpainOrbitEffect();
  }
}

function stopDroneOrbit() {
  if (orbitAnimation) {
    orbitAnimation();
    orbitAnimation = null;
  }
}

// Make orbit control functions available globally with unified names
if (typeof window !== 'undefined') {
  window.stopOrbitAnimation = stopDroneOrbit;
  window.startOrbitAnimation = startDroneOrbit;
  // Also provide legacy compatibility
  window.stopDroneOrbit = stopDroneOrbit;
  window.startDroneOrbit = startDroneOrbit;
}

/**
 * Fly to a place with smooth animation using NEW API
 */
export async function flyToPlaceNew(placeName, cameraStyle = 'static') {
  try {
    const cameraConfig = await resolvePlaceToCameraNew(placeName, cameraStyle);
    
    // Animate to the new position
    cesiumViewer.camera.flyTo({
      destination: cameraConfig.target,
      orientation: {
        heading: cameraConfig.heading,
        pitch: cameraConfig.pitch,
        roll: cameraConfig.roll
      },
      duration: 5.0, // 5 second animation for smoother Google Earth-like travel
      complete: () => {
        // Apply final camera configuration after animation
        applyCameraConfigNew(cameraConfig);
      }
    });
    
    return cameraConfig;
  } catch (error) {
    console.error(`Error flying to place ${placeName}:`, error);
    throw error;
  }
}
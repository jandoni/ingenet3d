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

import { map3d, flyToLocation, setCamera } from "./google-maps-3d.js";

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
    // Import places library first (required for Place.searchByText)
    await google.maps.importLibrary('places');

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
    return await searchPlaceLegacy(query);

  } catch (error) {
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
    const service = new google.maps.places.PlacesService(document.createElement('div'));

    return new Promise((resolve, reject) => {
      const request = {
        query: query,
        fields: ['place_id', 'name', 'formatted_address', 'geometry', 'photos', 'rating', 'types']
      };

      service.findPlaceFromQuery(request, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          const place = results[0];

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
          reject(new Error(`Legacy Find Place API failed: ${status}`));
        }
      });
    });
  } catch (error) {
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
 * Get elevation for a location (with caching)
 */
async function getElevation(location) {
  // Cache key using rounded coordinates (within ~11m accuracy)
  const lat = location.lat().toFixed(4);
  const lng = location.lng().toFixed(4);
  const cacheKey = `elevation_${lat}_${lng}`;

  return await rateLimitedApiCall(cacheKey, async () => {
    return new Promise((resolve, reject) => {
      elevationService.getElevationForLocations({
        locations: [location]
      }, (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve(results[0].elevation || 0);
        } else {
          resolve(10); // Default elevation if API fails
        }
      });
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

  // NOTE: _markerClickCoordinates is ONLY checked in flyToPlaceNew (the navigation function)
  // This function is used for background caching/preloading and should NOT touch _markerClickCoordinates

  // ✅ PRIORITY 1: Check for pre-cached coordinates in chapter config
  // Look for chapter in story configuration
  if (typeof window !== 'undefined' && window.story && window.story.chapters) {
    // Try to find chapter by placeName or title
    let chapter = window.story.chapters.find(ch => ch.placeName === placeName);

    if (!chapter) {
      // Fallback: try matching by title
      chapter = window.story.chapters.find(ch => ch.title === placeName);
    }

    if (!chapter) {
      // Fallback: try partial match on first part of placeName
      chapter = window.story.chapters.find(ch =>
        ch.placeName && placeName && placeName.includes(ch.placeName.split(',')[0])
      );
    }

    if (chapter && chapter.cameraCoordinates) {
      console.log(`✅ Using cameraCoordinates for "${chapter.title}":`, chapter.cameraCoordinates);
      const coords = chapter.cameraCoordinates;

      // Create location object compatible with Google Maps
      const location = {
        lat: () => coords.lat,
        lng: () => coords.lng
      };

      // Skip ALL Google API calls
      const cameraConfig = calculateOptimalCamera(
        { location, viewport: null },
        coords.elevation || 10,
        cameraStyle
      );

      return {
        ...cameraConfig,
        placeName,
        location,
        viewport: null,
        elevation: coords.elevation || 10,
        placeDetails: {
          displayName: { text: placeName },
          formattedAddress: chapter.address || placeName
        }
      };
    } else if (chapter) {
      console.log(`⚠️ Chapter "${chapter.title}" found but no cameraCoordinates`);
    } else {
      console.log(`⚠️ No chapter found for placeName: "${placeName}"`);
    }
  }

  console.log(`🔍 Using Google Places API for: "${placeName}"`);
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
    
    // Photos are stored locally in config.json imageUrl
    // Skip Google Photo API to save costs
    const photos = [];
    
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
        // photos removed - use local imageUrl from config.json
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
 * Calculate optimal camera position for Google Maps 3D
 * Returns {lat, lng, altitude, range, tilt, heading} format
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

  // Calculate distance using simple approximation (in meters)
  const latDiff = Math.abs(ne.lat() - sw.lat()) * 111000; // ~111km per degree
  const lngDiff = Math.abs(ne.lng() - sw.lng()) * 111000 * Math.cos(location.lat() * Math.PI / 180);
  const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) / 2;

  // Ensure minimum distance for close-up locations
  // Reduced for better building visibility
  const minDistance = 400; // 400 meters minimum - close enough to see building
  const maxDistance = 5000; // 5km maximum for buildings
  const adjustedDistance = Math.max(minDistance, Math.min(maxDistance, distance));

  // Camera settings based on style
  // Google Maps 3D uses tilt (0 = down, 90 = horizon) instead of pitch
  let heading = 0;
  let tilt = 45; // 45 degrees for nice 3D view

  // Calculate final range based on style
  let finalRange = adjustedDistance;

  switch (cameraStyle) {
    case 'drone-orbit':
      heading = 0; // Always start from front view (north-facing)
      tilt = 60; // 60 degrees for better architectural view
      // For drone-orbit, close enough to see the building details
      finalRange = Math.max(600, adjustedDistance);
      break;
    case 'overview':
      tilt = 0; // 0 degrees (straight down)
      // For country overview, use much higher altitude
      if (adjustedDistance < 200000) {
        return createCountryOverviewConfig(location, elevation);
      }
      break;
    case 'static':
    default:
      heading = 0;
      tilt = 45;
      break;
  }

  return {
    lat: location.lat(),
    lng: location.lng(),
    altitude: elevation,
    range: finalRange,
    heading,
    tilt,
    cameraStyle
  };
}

/**
 * Country overview camera configuration for Google Maps 3D
 */
function createCountryOverviewConfig(location, elevation) {
  const countryDistance = 2000000; // 2000km altitude for country view

  return {
    lat: location.lat(),
    lng: location.lng(),
    altitude: elevation,
    range: countryDistance,
    heading: 0,
    tilt: 0, // Looking straight down
    cameraStyle: 'overview'
  };
}

/**
 * Fallback camera configuration for Google Maps 3D
 */
function createDefaultCameraConfig(location, elevation, cameraStyle) {
  // Close default distance for building visibility
  const defaultDistance = cameraStyle === 'overview' ? 2000000 : 500;

  return {
    lat: location.lat(),
    lng: location.lng(),
    altitude: elevation,
    range: defaultDistance,
    heading: 0,
    tilt: cameraStyle === 'overview' ? 0 : 60, // 60 degrees for nice 3D view
    cameraStyle
  };
}

/**
 * Apply camera configuration to Google Maps 3D viewer
 * @param {Object} cameraConfig - Camera configuration {lat, lng, altitude, range, heading, tilt}
 * @param {boolean} immediate - If true, sets camera immediately without animation
 */
export function applyCameraConfigNew(cameraConfig, immediate = false) {
  if (!map3d) {
    throw new Error('Google Maps 3D not initialized');
  }

  if (immediate) {
    // Set camera immediately without animation
    setCamera(cameraConfig);
  }
  // If not immediate, the flyToLocation will handle the transition

  // Handle drone orbit effect - auto-start after fly animation
  if (cameraConfig.cameraStyle === 'drone-orbit') {
    window.isOrbitPaused = false;
    if (window.startOrbitAnimation) {
      window.startOrbitAnimation();
    }
    // Update button state to show orbit is active
    const orbitBtn = document.getElementById('orbit-pause-btn');
    if (orbitBtn) orbitBtn.classList.add('active');
  }
}

// Note: Orbit control functions are registered in google-maps-3d.js
// Do NOT register them here to avoid duplicate/conflicting registrations

/**
 * Fly to a place with smooth animation using Google Maps 3D native flyCameraTo
 * Provides smooth parabolic arc animation (Google Earth style)
 */
export async function flyToPlaceNew(placeName, cameraStyle = 'static') {
  try {
    let cameraConfig;

    // PRIORITY: Check for marker click coordinates FIRST (bypasses all caching)
    if (typeof window !== 'undefined' && window._markerClickCoordinates) {
      const markerCoords = window._markerClickCoordinates;
      window._markerClickCoordinates = null; // Clear immediately

      console.log(`Flying to marker coordinates: ${markerCoords.lat}, ${markerCoords.lng}`);

      // Build camera config directly from marker coordinates
      cameraConfig = {
        lat: markerCoords.lat,
        lng: markerCoords.lng,
        altitude: 0,
        range: cameraStyle === 'drone-orbit' ? 600 : 400,
        heading: 0,
        tilt: cameraStyle === 'drone-orbit' ? 60 : 45,
        cameraStyle,
        placeName,
        location: {
          lat: () => markerCoords.lat,
          lng: () => markerCoords.lng
        },
        placeDetails: {
          displayName: { text: placeName }
        }
      };
    } else {
      // Fallback to place resolution (uses Google Places API or cache)
      cameraConfig = await resolvePlaceToCameraNew(placeName, cameraStyle);
    }

    // Use Google Maps 3D native fly animation
    // Duration is auto-calculated based on distance (see flyToLocation)
    await flyToLocation(cameraConfig, 10000);

    // Apply final configuration (handles orbit state)
    applyCameraConfigNew(cameraConfig);

    return cameraConfig;
  } catch (error) {
    console.error(`Error flying to place ${placeName}:`, error);
    throw error;
  }
}
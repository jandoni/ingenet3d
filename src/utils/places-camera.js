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
 * Service for handling Places API integration with automatic camera positioning
 */

let placesService;
let elevationService;
let geocoder;

/**
 * Initialize Google Maps services
 */
export function initGoogleMapsServices() {
  // Check if Google Maps is loaded
  if (typeof google === 'undefined' || !google.maps) {
    console.error('Google Maps not loaded yet');
    return false;
  }
  
  try {
    placesService = new google.maps.places.PlacesService(document.createElement('div'));
    elevationService = new google.maps.ElevationService();
    geocoder = new google.maps.Geocoder();
    console.log('Google Maps services initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing Google Maps services:', error);
    return false;
  }
}

/**
 * Resolve a place name to camera configuration using Google's algorithms
 * @param {string} placeName - The place name to search for
 * @param {string} cameraStyle - 'static', 'drone-orbit', or 'overview'
 * @returns {Promise<Object>} Camera configuration with coordinates and settings
 */
export async function resolvePlaceToCamera(placeName, cameraStyle = 'static') {
  // Check if services are initialized
  if (!geocoder || !elevationService || !placesService) {
    throw new Error('Google Maps services not initialized. Call initGoogleMapsServices() first.');
  }
  
  try {
    // First, geocode the place to get basic location
    const place = await geocodePlace(placeName);
    
    if (!place) {
      throw new Error(`Could not find place: ${placeName}`);
    }

    // Get detailed place information including viewport
    const placeDetails = await getPlaceDetails(place);
    
    // Get elevation for the location
    const elevation = await getElevation(placeDetails.location);
    
    // Calculate optimal camera position using Google's viewport algorithm
    const cameraConfig = calculateOptimalCamera(placeDetails, elevation, cameraStyle);
    
    return {
      ...cameraConfig,
      placeName,
      location: placeDetails.location,
      viewport: placeDetails.viewport,
      elevation
    };
    
  } catch (error) {
    console.error(`Error resolving place ${placeName}:`, error);
    throw error;
  }
}

/**
 * Geocode a place name to get location and viewport
 */
async function geocodePlace(placeName) {
  return new Promise((resolve, reject) => {
    geocoder.geocode({ address: placeName }, (results, status) => {
      if (status === 'OK' && results[0]) {
        resolve(results[0]);
      } else {
        reject(new Error(`Geocoding failed: ${status}`));
      }
    });
  });
}

/**
 * Get detailed place information
 */
async function getPlaceDetails(place) {
  return new Promise((resolve, reject) => {
    const request = {
      query: place.formatted_address,
      fields: ['name', 'geometry', 'place_id']
    };

    placesService.findPlaceFromQuery(request, (results, status) => {
      if (status === 'OK' && results[0]) {
        const result = results[0];
        resolve({
          location: result.geometry.location,
          viewport: result.geometry.viewport || place.geometry.viewport,
          name: result.name
        });
      } else {
        // Fallback to geocoding result
        resolve({
          location: place.geometry.location,
          viewport: place.geometry.viewport,
          name: place.formatted_address
        });
      }
    });
  });
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
 * Calculate optimal camera position using Google's viewport algorithm
 * Based on Google's official examples
 */
function calculateOptimalCamera(placeDetails, elevation, cameraStyle) {
  const { location, viewport } = placeDetails;
  
  if (!viewport) {
    // Fallback for places without viewport
    return createDefaultCameraConfig(location, elevation, cameraStyle);
  }

  // Calculate optimal distance based on viewport size (Google's method)
  const distance = Cesium.Cartesian3.distance(
    Cesium.Cartesian3.fromDegrees(
      viewport.getSouthWest().lng(), 
      viewport.getSouthWest().lat(), 
      elevation
    ),
    Cesium.Cartesian3.fromDegrees(
      viewport.getNorthEast().lng(), 
      viewport.getNorthEast().lat(), 
      elevation
    )
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
      heading = Math.random() * 2 * Math.PI; // Random starting heading for orbit
      pitch = -Math.PI / 6; // -30 degrees for better orbit view
      break;
    case 'overview':
      pitch = -Math.PI / 2; // -90 degrees (straight down)
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
    // Store for Cesium's lookAt method
    headingPitchRange: new Cesium.HeadingPitchRange(heading, pitch, adjustedDistance)
  };
}

/**
 * Fallback camera configuration for places without viewport
 */
function createDefaultCameraConfig(location, elevation, cameraStyle) {
  const defaultDistance = cameraStyle === 'overview' ? 5000 : 1000;
  
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
 */
export function applyCameraConfig(cameraConfig) {
  if (!cesiumViewer) {
    throw new Error('Cesium viewer not initialized');
  }

  // Use Cesium's lookAt method for precise positioning
  cesiumViewer.camera.lookAt(
    cameraConfig.target,
    cameraConfig.headingPitchRange
  );

  // Add drone orbit effect if specified
  if (cameraConfig.cameraStyle === 'drone-orbit') {
    startDroneOrbit();
  } else {
    stopDroneOrbit();
  }
}

/**
 * Drone orbit animation
 */
let orbitAnimation = null;

function startDroneOrbit() {
  stopDroneOrbit(); // Clear any existing orbit
  
  orbitAnimation = cesiumViewer.clock.onTick.addEventListener(() => {
    cesiumViewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, 0.01); // Slow rotation
  });
}

function stopDroneOrbit() {
  if (orbitAnimation) {
    orbitAnimation();
    orbitAnimation = null;
  }
}

/**
 * Fly to a place with smooth animation
 */
export async function flyToPlace(placeName, cameraStyle = 'static') {
  try {
    const cameraConfig = await resolvePlaceToCamera(placeName, cameraStyle);
    
    // Animate to the new position
    cesiumViewer.camera.flyTo({
      destination: cameraConfig.target,
      orientation: {
        heading: cameraConfig.heading,
        pitch: cameraConfig.pitch,
        roll: cameraConfig.roll
      },
      duration: 3.0, // 3 second animation
      complete: () => {
        // Apply final camera configuration after animation
        applyCameraConfig(cameraConfig);
      }
    });
    
    return cameraConfig;
  } catch (error) {
    console.error(`Error flying to place ${placeName}:`, error);
    throw error;
  }
}
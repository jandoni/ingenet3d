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

import { map3d, flyToLocation } from "./google-maps-3d.js";

/**
 * Simple geocoding fallback when Places API is not available
 */

/**
 * Simple geocode using basic coordinates
 * @param {string} placeName - The place name to geocode
 * @param {string} cameraStyle - Camera style (ignored, uses simple positioning)
 * @returns {Promise<Object>} Simple camera configuration
 */
export async function simpleGeocodeToCamera(placeName, cameraStyle = 'static') {
  // Simple fallback coordinates - only Spain as ultimate fallback
  // All specific locations should come from config.json
  const knownPlaces = {
    'spain': { lat: 40.4637, lng: -3.7492, altitude: 2000000 },
    'españa': { lat: 40.4637, lng: -3.7492, altitude: 2000000 }
  };

  // Find matching place (case insensitive, partial match)
  const searchKey = placeName.toLowerCase();
  let coords = null;
  let bestMatch = null;
  let bestMatchLength = 0;
  
  console.log(`Simple geocoder searching for: "${searchKey}"`);
  console.log('Available keywords:', Object.keys(knownPlaces).filter(k => k.includes('alcantarilla') || k.includes('perú') || k.includes('poligono')));
  
  // Find the longest/most specific match instead of first match
  for (const [key, value] of Object.entries(knownPlaces)) {
    if (searchKey.includes(key)) {
      // Prefer longer, more specific matches (avoid matching 'spain' when 'alcantarilla' is available)
      if (key.length > bestMatchLength && key !== 'spain' && key !== 'españa') {
        bestMatch = key;
        bestMatchLength = key.length;
        coords = value;
        console.log(`Simple geocoder found better match: "${key}" (length: ${key.length}) -> ${value.lat}, ${value.lng}`);
      } else if (!bestMatch && (key === 'spain' || key === 'españa')) {
        // Only use 'spain' as absolute fallback
        bestMatch = key;
        bestMatchLength = key.length;
        coords = value;
        console.log(`Simple geocoder found fallback match: "${key}" -> ${value.lat}, ${value.lng}`);
      }
    }
  }
  
  if (!coords) {
    console.log('Simple geocoder: No specific match found, trying word-by-word search...');
    // Try word-by-word matching for complex addresses
    const searchWords = searchKey.split(/[\s,]+/).filter(word => word.length > 2);
    
    for (const word of searchWords) {
      for (const [key, value] of Object.entries(knownPlaces)) {
        if (key.includes(word) || word.includes(key)) {
          if (key.length > bestMatchLength && key !== 'spain' && key !== 'españa') {
            console.log(`Simple geocoder found word match: "${word}" matches "${key}" -> ${value.lat}, ${value.lng}`);
            coords = value;
            bestMatch = key;
            bestMatchLength = key.length;
            break;
          }
        }
      }
      if (coords && bestMatch !== 'spain') break;
    }
  }
  
  if (bestMatch) {
    console.log(`Simple geocoder final choice: "${bestMatch}" -> ${coords.lat}, ${coords.lng}`);
  }

  // Default to Spain if no match found
  if (!coords) {
    coords = knownPlaces['spain'];
  }

  // Create camera configuration for Google Maps 3D format
  // Google Maps 3D uses tilt (0 = down, 90 = horizon) instead of pitch
  let heading = 0;
  let tilt = 45; // 45 degrees for nice 3D view
  let range = coords.altitude;

  switch (cameraStyle) {
    case 'drone-orbit':
      heading = 0; // Start from north-facing
      tilt = 60; // 60 degrees for better architectural view
      range = 2000; // 2km distance for orbit effect (was 1km - too close)
      break;
    case 'overview':
      tilt = 0; // Straight down
      range = 2000000; // 2000km for overview
      break;
    case 'static':
    default:
      heading = 0;
      tilt = 60; // 60 degrees for nice 3D view
      range = Math.max(2000, coords.altitude); // Minimum 2km
      break;
  }

  return {
    lat: coords.lat,
    lng: coords.lng,
    altitude: 0,
    range,
    heading,
    tilt,
    cameraStyle,
    location: {
      lat: () => coords.lat,
      lng: () => coords.lng
    }
  };
}

/**
 * Simple fly to place using basic geocoding
 * @param {string} placeName - Place name to fly to
 * @param {string} cameraStyle - Camera style
 * @returns {Promise<Object>} Camera configuration
 */
export async function simpleFlyToPlace(placeName, cameraStyle = 'static') {
  try {
    const cameraConfig = await simpleGeocodeToCamera(placeName, cameraStyle);

    console.log(`Simple geocoder flying to: ${cameraConfig.lat}, ${cameraConfig.lng} at range ${cameraConfig.range}`);

    // Use Google Maps 3D native flyToLocation
    await flyToLocation(cameraConfig, 8000); // 8 second animation

    return cameraConfig;
  } catch (error) {
    console.error(`Error flying to place ${placeName}:`, error);
    throw error;
  }
}
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

import {
  getChapterIndexFromId,
  updateChapter,
} from "../chapters/chapter-navigation.js";
import { cesiumViewer } from "./cesium.js";
import { resolvePlaceToCameraNew } from "./places-new-api.js";
import { simpleGeocodeToCamera } from "./simple-geocoder.js";

// The size of the marker in relation to the original SVG size.
// We are scaling it down to help preserve clarity when increasing marker size for the selected marker.
const defaultMarkerScale = 0.744;

/**
 * The instance of the click handler, used when clicking a marker on the map
 * This has to be destroyed/reset manually when changing the location and handling new locations
 * @type {Cesium.ScreenSpaceEventHandler}
 */
let markerClickHandler = null;

/**
 * @type {string} The ID of the selected marker
 */
let selectedMarkerId = null;

/**
 * Asynchronously fetches and parses SVG content from a URL.
 * @param {string} url - URL of the SVG resource.
 * @returns {Promise<Element>} A promise resolving to the SVG element.
 * @throws {Error} Throws an error if the fetch request fails.
 */
async function fetchSvgContent(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG from ${url}.`);
  }
  return new DOMParser().parseFromString(await response.text(), "image/svg+xml")
    .documentElement;
}

/**
 * Sets attributes on an SVG element.
 * @param {Element} svgElement - SVG element to modify.
 * @param {Object} attributes - Key-value pairs of attributes.
 */
function setSvgAttributes(svgElement, attributes) {
  Object.entries(attributes).forEach(([key, value]) =>
    svgElement.setAttribute(key, value)
  );
}

/**
 * Encodes an SVG element to a data URI format.
 * @param {Element} svgElement - SVG element to encode.
 * @returns {string} Data URI of the SVG element.
 */
function encodeSvgToDataUri(svgElement) {
  return `data:image/svg+xml,${encodeURIComponent(svgElement.outerHTML)}`;
}

/**
 * Creates a minimalist white dot marker for a location (to be placed at the actual location point).
 * @param {string} markerId - The ID of the marker.
 * @returns {Promise<string>} The marker image data URL.
 */
async function createLocationDot(markerId) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Small dot to mark the actual location
  const size = 20;
  canvas.width = size;
  canvas.height = size;

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 6;

  // Draw subtle shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  // Draw white circle
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Draw subtle border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 0.5, 0, 2 * Math.PI);
  ctx.stroke();

  return canvas.toDataURL();
}

/**
 * Helper function to load an image from a URL with multiple fallbacks.
 * @param {string} url - The URL of the image to load.
 * @param {string} websiteUrl - The website URL for favicon fallback.
 * @returns {Promise<HTMLImageElement>} The loaded image.
 */
function loadImage(url, websiteUrl = null) {
  return new Promise(async (resolve, reject) => {
    // Try to load image - Google Favicons don't support CORS, so we don't use crossOrigin for them
    const tryLoadImage = (imageUrl, useCors = true) => {
      return new Promise((res, rej) => {
        const img = new Image();

        // Only set crossOrigin for non-Google URLs
        if (useCors && !imageUrl.includes('google.com')) {
          img.crossOrigin = 'anonymous';
        }

        img.onload = () => {
          res(img);
        };

        img.onerror = (e) => {
          console.warn(`❌ Failed to load image: ${imageUrl}`, e);
          rej(new Error(`Failed to load image from ${imageUrl}`));
        };

        img.src = imageUrl;

        // Set a timeout to prevent hanging
        setTimeout(() => {
          if (!img.complete) {
            rej(new Error(`Image load timeout for ${imageUrl}`));
          }
        }, 5000);
      });
    };

    try {
      // Check if URL is from Google Favicons - these don't support CORS
      const isGoogleFavicon = url && url.includes('google.com/s2/favicons');
      const img = await tryLoadImage(url, !isGoogleFavicon);
      resolve(img);
    } catch (error) {
      console.warn(`Failed to load logo from ${url}:`, error.message);

      // Try Google Favicon API as fallback if website URL is available
      if (websiteUrl && !url.includes('google.com')) {
        try {
          const domain = new URL(websiteUrl).hostname;
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
          const img = await tryLoadImage(faviconUrl, false); // Google doesn't support CORS
          resolve(img);
        } catch (faviconError) {
          console.warn(`Failed to load favicon for ${websiteUrl}:`, faviconError.message);
          reject(new Error(`All image loading attempts failed`));
        }
      } else {
        reject(error);
      }
    }
  });
}

/**
 * Creates a label with logo inside a white circle using SVG (no CORS issues).
 * @param {string} markerId - The ID of the marker.
 * @param {string} title - The title of the place to display.
 * @param {string} logoUrl - Optional logo URL for the location.
 * @param {string} websiteUrl - Optional website URL for favicon fallback.
 * @returns {Promise<string>} The marker image with logo in circle or initials.
 */
async function createMarkerLabel(markerId, title = '', logoUrl = null, websiteUrl = null) {
  const size = 84;
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = 36;

  let svgContent;

  if (logoUrl) {
    // Try to load the image and convert to data URI to avoid CORS issues
    let logoDataUri = null;
    try {
      const img = await loadImage(logoUrl, websiteUrl);

      // Try to convert to data URI (only works with CORS-enabled images)
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        logoDataUri = canvas.toDataURL('image/png');
      } catch (canvasError) {
        // If canvas conversion fails due to CORS, use the URL directly
        logoDataUri = img.src;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load logo for ${title}:`, error.message);
      // Will fall through to use initials instead
    }

    if (logoDataUri) {
      // Use SVG with embedded data URI or direct URL
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow-${markerId}" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
              <feOffset dx="0" dy="2" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.25"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <clipPath id="circle-clip-${markerId}">
              <circle cx="${centerX}" cy="${centerY}" r="${radius - 4}"/>
            </clipPath>
          </defs>

          <!-- White circle background with shadow -->
          <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="white" fill-opacity="1.0" filter="url(#shadow-${markerId})"/>

          <!-- Logo image (clipped to circle) - fully opaque -->
          <image
            href="${logoDataUri}"
            x="${centerX - (radius - 8)}"
            y="${centerY - (radius - 8)}"
            width="${(radius - 8) * 2}"
            height="${(radius - 8) * 2}"
            clip-path="url(#circle-clip-${markerId})"
            preserveAspectRatio="xMidYMid meet"
          />
        </svg>
      `;
    } else {
      // If logo failed to load, fall through to initials
      logoUrl = null;
    }
  }

  if (!logoUrl) {
    // Draw initials as fallback
    const initials = title
      .split(' ')
      .map(word => word[0])
      .filter(letter => letter)
      .join('')
      .substring(0, 2)
      .toUpperCase();

    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow-${markerId}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.25"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- White circle background with shadow -->
        <circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="white" fill-opacity="1.0" filter="url(#shadow-${markerId})"/>

        <!-- Initials text -->
        <text
          x="${centerX}"
          y="${centerY}"
          font-family="Arial, sans-serif"
          font-size="20"
          font-weight="bold"
          fill="#3b82f6"
          text-anchor="middle"
          dominant-baseline="central"
        >${initials}</text>
      </svg>
    `;
  }

  // Convert SVG to proper data URI for Cesium
  const encodedSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
  return encodedSvg;
}

/**
 * Helper function to adjust entity height.
 * @param {Cesium.Cartesian3} coord - The original coordinate.
 * @param {number} heightOffset - The height to add to the original coordinate.
 * @returns {Cesium.Cartesian3} The adjusted coordinate.
 */
function addHeightOffset(coord, heightOffset) {
  const cartographic = Cesium.Cartographic.fromCartesian(coord);
  return Cesium.Cartesian3.fromRadians(
    cartographic.longitude,
    cartographic.latitude,
    cartographic.height + heightOffset
  );
}

/**
 * Helper function to create a polyline entity configuration.
 * Creates a minimalist white dashed line extending from the location outward.
 * @param {Cesium.Cartesian3} options.locationPoint - The actual location point.
 * @param {Cesium.Cartesian3} options.labelPoint - The point where the label will be placed.
 * @returns {Object} Polyline entity configuration.
 */
function getPolylineConfiguration({ locationPoint, labelPoint }) {
  return {
    polyline: {
      positions: [locationPoint, labelPoint],
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.7),
        dashLength: 12.0,
      }),
      width: 1.5,
      followSurface: false,
      clampToGround: false,
      depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString('#ffffff').withAlpha(0.25),
        dashLength: 12.0,
      }),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, Number.MAX_VALUE),
    },
  };
}

/**
 * Helper function to create a location dot entity configuration.
 * @param {Cesium.Cartesian3} options.position - The position to place the dot.
 * @param {number} options.id - ID for the marker.
 * @param {string} options.dotImage - Data URI for the location dot.
 * @param {string} options.title - Title for the marker.
 * @returns {Cesium.Entity.ConstructorOptions} Dot marker entity configuration.
 */
function getDotMarkerConfiguration({ position, id, dotImage, title }) {
  return {
    position,
    id: `dot-${id}`,
    name: title,
    billboard: {
      image: dotImage,
      scale: 1.0,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      scaleByDistance: new Cesium.NearFarScalar(100000, 1.5, 5000000, 0.3),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  };
}

/**
 * Helper function to create a label entity configuration (at the end of the line).
 * @param {Cesium.Cartesian3} options.position - The position to place the label.
 * @param {number} options.id - ID for the marker.
 * @param {string} options.labelImage - Data URI for the label.
 * @param {string} options.title - Title for the marker.
 * @returns {Cesium.Entity.ConstructorOptions} Label entity configuration.
 */
function getLabelMarkerConfiguration({ position, id, labelImage, title }) {
  return {
    position,
    id,
    name: title,
    billboard: {
      image: labelImage,
      scale: 1.0,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      scaleByDistance: new Cesium.NearFarScalar(100000, 1.2, 5000000, 0.5),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      pixelOffset: new Cesium.Cartesian2(0, 0),
    },
  };
}

/**
 * Sets the selected marker and scales it to 1 while scaling the previous marker back to the default scale.
 * @param {number | null} markerId - The id given to the entity object representing the selected marker.
 */
export function setSelectedMarker(markerId) {
  // If no markerID is provided, the getter returns undefined
  const newMarker = cesiumViewer.entities.getById(markerId);

  // Get the currently still selected marker
  const currentMarker =
    !isNaN(Number(selectedMarkerId)) &&
    cesiumViewer.entities.getById(selectedMarkerId);

  // Scale the previous selected marker back to the default scale
  if (currentMarker) {
    currentMarker.billboard.scale = 1.0; // Reset to normal size
  }

  // Scale the new selected marker to be larger
  if (newMarker) {
    newMarker.billboard.scale = 1.3; // Scale up selected bubble marker
  }

  // Update the selected marker ID
  selectedMarkerId = markerId;
}

/**
 * Remove single marker billboard.
 * @param {number} markerId - The entity ID for the marker billboard
 */
export function removeMarker(markerId) {
  cesiumViewer.entities.removeById(markerId);
}

/**
 * Hide marker billboard.
 * @param {number} markerId - The entity ID for the marker billboard
 */
export function hideMarker(markerId) {
  // If no markerID is provided, the getter returns undefined
  const marker = cesiumViewer.entities.getById(markerId);

  if (!marker) {
    return;
  }

  marker.show = false;
}

/**
 * Show marker billboard.
 * @param {number} markerId - The entity ID for the marker billboard
 */
export function showMarker(markerId) {
  // If no markerID is provided, the getter returns undefined
  const marker = cesiumViewer.entities.getById(markerId);

  if (!marker) {
    return;
  }
  marker.show = true;
}

/**
 * Hide all markers (logos, dots, and lines) - used when viewing a specific chapter
 */
export function hideAllMarkers() {
  if (!cesiumViewer) {
    return;
  }

  // Iterate through all entities and hide markers, dots, and lines
  for (let i = 0; i < cesiumViewer.entities.values.length; i++) {
    const entity = cesiumViewer.entities.values[i];
    const entityId = entity.id;

    // Hide if it's a marker (number), dot (dot-X), or line (line-X)
    if (
      typeof entityId === 'number' ||
      (typeof entityId === 'string' && (entityId.startsWith('dot-') || entityId.startsWith('line-')))
    ) {
      entity.show = false;
    }
  }
}

/**
 * Show all markers (logos, dots, and lines) - used when viewing the overview page
 */
export function showAllMarkers() {
  if (!cesiumViewer) {
    return;
  }

  // Iterate through all entities and show markers, dots, and lines
  for (let i = 0; i < cesiumViewer.entities.values.length; i++) {
    const entity = cesiumViewer.entities.values[i];
    const entityId = entity.id;

    // Show if it's a marker (number), dot (dot-X), or line (line-X)
    // But DON'T show location pins (location-pin-X)
    if (
      typeof entityId === 'number' ||
      (typeof entityId === 'string' && (entityId.startsWith('dot-') || entityId.startsWith('line-')))
    ) {
      entity.show = true;
    }
  }

  // Always hide location pins when showing all markers (overview mode)
  hideLocationPin();
}

/**
 * Creates a location pin with company logo at the actual location
 * @param {string} chapterId - The chapter/location ID
 * @param {Object} location - Location coordinates {lat, lng}
 * @param {string} title - The location title
 * @param {string} logoUrl - URL of the company logo
 * @param {string} websiteUrl - Website URL for favicon fallback
 */
export async function showLocationPin(chapterId, location, title, logoUrl, websiteUrl) {
  if (!cesiumViewer) {
    return;
  }

  // Hide any existing location pin first
  hideLocationPin();

  // Create the pin image with logo
  const pinImage = await createLocationPinImage(title, logoUrl, websiteUrl);

  // Handle Google Maps LatLng object (has lng() and lat() methods) or plain object
  let lng, lat;
  if (typeof location.lng === 'function') {
    lng = location.lng();
    lat = location.lat();
  } else {
    lng = location.lng;
    lat = location.lat;
  }

  // Get the location coordinates
  const position = Cesium.Cartesian3.fromDegrees(lng, lat, 0);

  // Add the pin billboard at the actual location
  const pinEntity = cesiumViewer.entities.add({
    id: `location-pin-${chapterId}`,
    position: position,
    billboard: {
      image: pinImage,
      width: 80,
      height: 80,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scale: 1.0,
      show: true,
    },
    show: true,
  });
}

/**
 * Creates the pin image with company logo inside a white circle using SVG
 * @param {string} title - The location title
 * @param {string} logoUrl - URL of the company logo
 * @param {string} websiteUrl - Website URL for favicon fallback
 * @returns {Promise<string>} The pin image with logo in circle or initials
 */
async function createLocationPinImage(title, logoUrl, websiteUrl) {
  const size = 100;
  const centerX = size / 2;
  const centerY = size / 2;
  const circleRadius = 35;

  let svgContent;

  if (logoUrl) {
    // Try to load the image and convert to data URI to avoid CORS issues
    let logoDataUri = null;
    try {
      const img = await loadImage(logoUrl, websiteUrl);

      // Try to convert to data URI (only works with CORS-enabled images)
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        logoDataUri = canvas.toDataURL('image/png');
      } catch (canvasError) {
        // If canvas conversion fails due to CORS, use the URL directly
        logoDataUri = img.src;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to load logo for pin:`, error.message);
      // Will fall through to use initials instead
    }

    if (logoDataUri) {
      // Use SVG with embedded data URI or direct URL
      svgContent = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>
              <feOffset dx="0" dy="3" result="offsetblur"/>
              <feComponentTransfer>
                <feFuncA type="linear" slope="0.4"/>
              </feComponentTransfer>
              <feMerge>
                <feMergeNode/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <clipPath id="pin-circle-clip">
              <circle cx="${centerX}" cy="${centerY}" r="${circleRadius - 5}"/>
            </clipPath>
          </defs>

          <!-- White circle background with shadow -->
          <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="white" fill-opacity="1.0" filter="url(#pin-shadow)"/>

          <!-- Blue border -->
          <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="none" stroke="#3b82f6" stroke-width="3"/>

          <!-- Logo image (clipped to circle) - fully opaque -->
          <image
            href="${logoDataUri}"
            x="${centerX - (circleRadius - 8)}"
            y="${centerY - (circleRadius - 8)}"
            width="${(circleRadius - 8) * 2}"
            height="${(circleRadius - 8) * 2}"
            clip-path="url(#pin-circle-clip)"
            preserveAspectRatio="xMidYMid meet"
          />
        </svg>
      `;
    } else {
      // If logo failed to load, fall through to initials
      logoUrl = null;
    }
  }

  if (!logoUrl) {
    // Draw initials as fallback
    const initials = title
      .split(' ')
      .map(word => word[0])
      .filter(letter => letter)
      .join('')
      .substring(0, 2)
      .toUpperCase();

    svgContent = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5"/>
            <feOffset dx="0" dy="3" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.4"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <!-- White circle background with shadow -->
        <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="white" fill-opacity="1.0" filter="url(#pin-shadow)"/>

        <!-- Blue border -->
        <circle cx="${centerX}" cy="${centerY}" r="${circleRadius}" fill="none" stroke="#3b82f6" stroke-width="3"/>

        <!-- Initials text -->
        <text
          x="${centerX}"
          y="${centerY}"
          font-family="Arial, sans-serif"
          font-size="24"
          font-weight="bold"
          fill="#3b82f6"
          text-anchor="middle"
          dominant-baseline="central"
        >${initials}</text>
      </svg>
    `;
  }

  // Convert SVG to proper data URI for Cesium
  const encodedSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgContent);
  return encodedSvg;
}

/**
 * Hide the location pin
 */
export function hideLocationPin() {
  if (!cesiumViewer) {
    return;
  }

  // Find and remove all location pin entities
  const entitiesToRemove = [];
  for (let i = 0; i < cesiumViewer.entities.values.length; i++) {
    const entity = cesiumViewer.entities.values[i];
    if (typeof entity.id === 'string' && entity.id.startsWith('location-pin-')) {
      entitiesToRemove.push(entity);
    }
  }

  entitiesToRemove.forEach(entity => {
    cesiumViewer.entities.remove(entity);
  });
}

/**
 * Handles the marker click
 * When a marker is clicked, there are multiple things happening:
 * 1. The camera is moved to the marker position
 * 2. The clicked marker is scaled up and the previously clicked marker is scaled down
 *
 * @param {object} click - The click event object
 */
async function handleClickOnMarker(click) {
  // Raycast from click position returning intercepting object
  const pickedObject = cesiumViewer.scene.pick(click.position);
  // check if "primitive" property is available... (not available when clicking sky for example)
  if (!pickedObject || !pickedObject.primitive) {
    return;
  }

  // get primitive from object
  const { primitive } = pickedObject;
  // check if a billboard (marker) was clicked return and do nothing
  if (!(primitive instanceof Cesium.Billboard)) {
    return;
  }

  const marker = primitive.id;
  let markerId = marker.id;

  // If the marker is the dot (has "dot-" prefix), extract the actual chapter ID
  if (typeof markerId === 'string' && markerId.startsWith('dot-')) {
    markerId = parseInt(markerId.replace('dot-', ''));
  }

  // Use the same navigation method as the horizontal bar
  if (typeof window.navigateToChapter === 'function') {
    await window.navigateToChapter(markerId);
  } else {
    // Fallback to the old method if navigateToChapter is not available
    console.warn('navigateToChapter not available, using fallback');
    updateChapter(getChapterIndexFromId(markerId));
  }
}

/**
 * Adds an event handler to the viewer which is used to pick an object that is under the 2d context of the mouse/pointer.
 */
function createMarkerClickHandler() {
  if (markerClickHandler) {
    markerClickHandler.destroy();
  }

  // "Screen" click handler
  markerClickHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.canvas);

  // Disable default double click behaviour for cesium viewer on billboard entities
  cesiumViewer.screenSpaceEventHandler.removeInputAction(
    Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
  );

  // Basically an onClick statement
  markerClickHandler.setInputAction((click) => {
    handleClickOnMarker(click);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK); // This defines that we want to listen for a click event
}

/**
 * Checks if two markers are too close together in 3D space
 * @param {Cesium.Cartesian3} pos1 - First marker position
 * @param {Cesium.Cartesian3} pos2 - Second marker position
 * @param {number} minDistance - Minimum distance in meters (default 150km)
 * @returns {boolean} True if markers are too close
 */
function checkCollision(pos1, pos2, minDistance = 150000) {
  const distance = Cesium.Cartesian3.distance(pos1, pos2);
  return distance < minDistance;
}

/**
 * Resolves marker overlaps by adjusting line lengths and angles
 * @param {Array<{position: Cesium.Cartesian3, coord: Cesium.Cartesian3, direction: Cesium.Cartesian3, index: number}>} markers - Array of marker data
 * @returns {Array<Cesium.Cartesian3>} Adjusted label positions
 */
function resolveCollisions(markers) {
  const maxIterations = 15; // Reduced from 25 to prevent markers going too far
  const adjustmentFactor = 1.2; // Reduced from 1.4 - 20% longer per iteration
  const angleAdjustment = 0.15; // Reduced from 0.2 - ~8.6 degrees
  const maxLineLength = 500000; // Maximum 500km - prevents markers extending into Africa!

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let hasCollisions = false;
    let collisionCount = 0;

    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        if (checkCollision(markers[i].position, markers[j].position)) {
          hasCollisions = true;
          collisionCount++;

          // Adjust BOTH markers to spread them apart more effectively
          const adjustBothMarkers = (marker, rotationDirection) => {
            // Get current distance from location to label
            const currentOffset = new Cesium.Cartesian3();
            Cesium.Cartesian3.subtract(marker.position, marker.coord, currentOffset);
            const currentLength = Cesium.Cartesian3.magnitude(currentOffset);

            // Increase line length but cap at maximum
            let newLength = Math.min(currentLength * adjustmentFactor, maxLineLength);

            // If already at max length, only rotate (don't extend further)
            if (currentLength >= maxLineLength) {
              newLength = currentLength; // Keep same length
            }

            // Rotate direction to spread markers radially
            const rotationAngle = rotationDirection * angleAdjustment;
            const direction2D = new Cesium.Cartesian2(marker.direction.x, marker.direction.y);
            const cos = Math.cos(rotationAngle);
            const sin = Math.sin(rotationAngle);
            const rotatedX = direction2D.x * cos - direction2D.y * sin;
            const rotatedY = direction2D.x * sin + direction2D.y * cos;

            const rotatedDirection = new Cesium.Cartesian3(rotatedX, rotatedY, marker.direction.z);
            Cesium.Cartesian3.normalize(rotatedDirection, rotatedDirection);

            // Calculate new position
            const newOffset = new Cesium.Cartesian3();
            Cesium.Cartesian3.multiplyByScalar(rotatedDirection, newLength, newOffset);
            Cesium.Cartesian3.add(marker.coord, newOffset, marker.position);

            // Update direction for next iteration
            marker.direction = rotatedDirection;
          };

          // Adjust both markers in opposite directions
          adjustBothMarkers(markers[i], 1);
          adjustBothMarkers(markers[j], -1);
        }
      }
    }

    if (!hasCollisions) {
      break;
    }
  }

  return markers.map(m => m.position);
}

/**
 * Creates markers for each chapter's coordinate and attaches them to the viewer.
 * @param {Chapter[]} chapters - the story's chapters.
 */
export async function createMarkers(chapters) {
  if (!cesiumViewer) {
    console.error("Error creating markers: `cesiumViewer` is undefined");
    return;
  }

  // Mobile optimization: reduce number of markers loaded simultaneously
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const maxMarkersOnMobile = 8; // Limit to 8 markers on mobile

  let chaptersToProcess = chapters;
  if (isMobile && chapters.length > maxMarkersOnMobile) {
    chaptersToProcess = chapters.slice(0, maxMarkersOnMobile);
  }

  // Use hardcoded coordinates for fast loading (no API calls needed for initial display)
  const hardcodedCoordinates = {
    1: { lat: 43.4833, lng: -8.2167 },   // Fundación Exponav - Ferrol
    2: { lat: 43.5333, lng: -7.0500 },   // Gondán Shipbuilders - Castropol
    3: { lat: 43.6167, lng: -5.7833 },   // Museo Marítimo de Asturias - Luanco
    4: { lat: 43.4647, lng: -3.8044 },   // Museo Marítimo del Cantábrico - Santander
    5: { lat: 43.3229, lng: -1.9933 },   // Euskal Itsas Museoa - San Sebastián
    6: { lat: 43.4833, lng: -8.2167 },   // Navantia Ferrol
    7: { lat: 43.4817, lng: -8.2206 },   // Campus Industrial de Ferrol - UDC
    8: { lat: 43.5590, lng: -5.9250 },   // Windar Renovables - Avilés
    9: { lat: 43.3500, lng: -2.6833 },   // Murueta Astilleros - Bizkaia
    10: { lat: 43.3000, lng: -2.9333 },  // Cintranaval-Defcar - Loiu
    11: { lat: 41.3788, lng: 2.1894 },   // MB92 Barcelona
    12: { lat: 41.3764, lng: 2.1758 },   // Museu Marítim de Barcelona
    13: { lat: 41.3900, lng: 2.1159 },   // Compass Ingeniería - Barcelona
    14: { lat: 37.6030, lng: -0.9870 },  // Universidad Politécnica de Cartagena (UPCT)
    15: { lat: 37.6500, lng: -0.9800 },  // SAES - Electrónica Submarina - Cartagena
    16: { lat: 37.6000, lng: -0.9833 },  // ARQVA - Museo Arqueología Subacuática - Cartagena
    17: { lat: 37.6000, lng: -0.9833 },  // Museo Naval de Cartagena
    18: { lat: 37.7167, lng: -1.0000 },  // CTN - Centro Tecnológico Naval - Fuente Álamo
    19: { lat: 36.5298, lng: -6.2927 },  // MUCAIN - Museo Carrera de Indias - Cádiz
    20: { lat: 37.9792, lng: -0.6925 },  // Museo del Mar y de la Sal - Torrevieja
    21: { lat: 36.5972, lng: -6.2278 },  // Ghenova Ingeniería - El Puerto de Santa María
    22: { lat: 36.5264, lng: -6.2056 },  // Navantia Seanergies - Puerto Real
    23: { lat: 36.5264, lng: -6.2056 },  // Museo El Dique - Puerto Real
    24: { lat: 28.1024, lng: -15.4130 },  // Universidad de Las Palmas (ULPGC)
    25: { lat: 27.9833, lng: -15.3667 },  // PLOCAN - Plataforma Oceánica de Canarias - Telde
    26: { lat: 28.1500, lng: -15.4333 },  // Museo Naval de Las Palmas
    27: { lat: 28.1500, lng: -15.4167 },  // Astican - Astilleros Canarios - Las Palmas
    28: { lat: 37.3891, lng: -5.9845 },  // Sener - Sevilla
    29: { lat: 42.2406, lng: -8.7207 },  // Soermar - Vigo
    30: { lat: 42.2328, lng: -8.7226 },  // Seaplace - Vigo
    31: { lat: 40.4168, lng: -3.7038 },  // Real Liga Naval Española - Madrid
    32: { lat: 42.1667, lng: -8.6167 },  // AIMEN Centro Tecnológico - O Porriño
    33: { lat: 42.2333, lng: -8.7333 },  // Freire Shipyard - Vigo
    34: { lat: 42.2167, lng: -8.7667 },  // Museo do Mar de Galicia - Vigo
    35: { lat: 40.5167, lng: -3.7667 },  // CEHIPAR - Canal El Pardo - Madrid
    36: { lat: 40.4168, lng: -3.6914 },  // Museo Naval de Madrid
    37: { lat: 37.3828, lng: -5.9964 },  // Reales Atarazanas de Sevilla
    38: { lat: 37.9838, lng: -1.1300 }   // Fundación Excelem - Murcia
  };

  const markerCoordinates = [];
  const chapterLocations = [];

  for (const chapter of chaptersToProcess) {
    const coords = hardcodedCoordinates[chapter.id];
    if (coords) {
      // Use hardcoded coordinates for fast initial display
      const cartesian = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat);
      markerCoordinates.push(cartesian);
      chapterLocations.push(coords);
    } else {
      console.warn(`⚠️ No hardcoded coordinates for chapter ${chapter.id}: ${chapter.title}`);
      // Fallback to default coordinates if no hardcoded coords available
      const fallbackCoord = Cesium.Cartesian3.fromDegrees(-3.7492, 40.4637);
      markerCoordinates.push(fallbackCoord);
      chapterLocations.push({ lat: 40.4637, lng: -3.7492 });
    }
  }

  // Modify the position to be on top of terrain (e.g. Rooftops, trees, etc.)
  // this has to be done with the whole coordinates array, because clamping single
  // coords to the ground terrain like this will not work.
  const coordsWithAdjustedHeight =
    await cesiumViewer.scene.clampToHeightMostDetailed(markerCoordinates);

  // Spain center for calculating line directions (approximate center of Spain)
  const spainCenter = Cesium.Cartesian3.fromDegrees(-3.7492, 40.4637, 0);

  // Calculate initial positions for all markers with varied line lengths
  const markerData = coordsWithAdjustedHeight.map((coord, index) => {
    // Calculate direction vector from Spain center to this location
    const direction = new Cesium.Cartesian3();
    Cesium.Cartesian3.subtract(coord, spainCenter, direction);
    Cesium.Cartesian3.normalize(direction, direction);

    // Calculate angle for variation
    const angle = Math.atan2(direction.y, direction.x);
    const angleVariation = Math.sin(angle * 3) * 0.2; // -0.2 to +0.2
    const indexVariation = (index % 5) * 0.1; // 0, 0.1, 0.2, 0.3, 0.4
    const baseLength = 200000; // 200km base (reduced to keep markers closer)
    const lineLength = baseLength * (1 + angleVariation + indexVariation); // 160km to 280km range

    // Calculate initial label position
    const labelOffset = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(direction, lineLength, labelOffset);
    const labelPosition = new Cesium.Cartesian3();
    Cesium.Cartesian3.add(coord, labelOffset, labelPosition);

    return {
      position: labelPosition,
      coord: coord,
      direction: direction,
      index: index
    };
  });

  // Apply collision resolution to spread overlapping markers
  const resolvedPositions = resolveCollisions(markerData);

  // Create markers with resolved positions
  for (let index = 0; index < coordsWithAdjustedHeight.length; index++) {
    const coord = coordsWithAdjustedHeight[index];
    const labelPosition = resolvedPositions[index];
    const { id, title, logoUrl, website } = chaptersToProcess[index];

    const isMarkerVisible = chaptersToProcess[index].focusOptions?.showLocationMarker;

    // Store the resolved coordinates on the chapter for other uses
    chaptersToProcess[index].coords = chapterLocations[index];

    // Create location dot image
    const dotImage = await createLocationDot(id);

    // Create marker label image with company logo
    const labelImage = await createMarkerLabel(id, title, logoUrl, website);

    // Add the connecting line from location to label
    const lineEntity = cesiumViewer.entities.add({
      id: `line-${id}`,
      ...getPolylineConfiguration({
        locationPoint: coord,
        labelPoint: labelPosition
      }),
      show: isMarkerVisible,
    });

    // Add the location dot at the actual location
    cesiumViewer.entities.add({
      ...getDotMarkerConfiguration({
        position: coord,
        id: `dot-${id}`,
        dotImage,
        title,
      }),
      show: isMarkerVisible,
    });

    // Add the label at the end of the line
    cesiumViewer.entities.add({
      ...getLabelMarkerConfiguration({
        position: labelPosition,
        id,
        labelImage,
        title,
      }),
      show: isMarkerVisible,
    });

    // Select the marker if it was rerendered and already selected before
    if (selectedMarkerId === id) {
      setSelectedMarker(id);
    }
  }

  // add a click handler to the viewer which handles the click only when clicking on a billboard (Marker) instance
  createMarkerClickHandler();
}

export default createMarkers;

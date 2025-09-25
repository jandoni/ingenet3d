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
 * Creates a bubble-style marker canvas for a given location.
 * @param {string} markerId - The ID of the marker.
 * @param {string} title - The title of the place to display in the bubble.
 * @returns {Promise<string>} The marker image data URL.
 */
async function createMarkerBubble(markerId, title = '') {
  console.log(`Creating bubble marker for ID ${markerId}: ${title}`);

  // Create a canvas element
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Truncate title if too long
  const displayTitle = title.length > 20 ? title.substring(0, 17) + '...' : title;

  // Set font for text measurement
  ctx.font = 'bold 14px Arial, sans-serif';
  const textMetrics = ctx.measureText(displayTitle);

  // Calculate bubble dimensions
  const padding = 16;
  const bubbleWidth = Math.max(textMetrics.width + padding * 2, 80);
  const bubbleHeight = 36;
  const arrowSize = 8;

  // Set canvas size
  canvas.width = bubbleWidth + 4; // Extra space for border
  canvas.height = bubbleHeight + arrowSize + 4; // Extra space for border and arrow

  // Draw bubble background with border
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;

  // Draw rounded rectangle (bubble)
  const radius = 16;
  const x = 2;
  const y = 2;

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + bubbleWidth - radius, y);
  ctx.quadraticCurveTo(x + bubbleWidth, y, x + bubbleWidth, y + radius);
  ctx.lineTo(x + bubbleWidth, y + bubbleHeight - radius);
  ctx.quadraticCurveTo(x + bubbleWidth, y + bubbleHeight, x + bubbleWidth - radius, y + bubbleHeight);
  ctx.lineTo(x + radius, y + bubbleHeight);
  ctx.quadraticCurveTo(x, y + bubbleHeight, x, y + bubbleHeight - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();

  // Fill and stroke the bubble
  ctx.fill();
  ctx.stroke();

  // Draw arrow pointing down
  const arrowX = bubbleWidth / 2 + 2;
  const arrowY = bubbleHeight + 2;

  ctx.beginPath();
  ctx.moveTo(arrowX - arrowSize, arrowY);
  ctx.lineTo(arrowX + arrowSize, arrowY);
  ctx.lineTo(arrowX, arrowY + arrowSize);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#e5e7eb';
  ctx.stroke();

  // Draw text
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayTitle, bubbleWidth / 2 + 2, bubbleHeight / 2 + 2);

  // Return canvas as data URL
  return canvas.toDataURL();
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
 * @param {Cesium.Cartesian3} options.start - Starting coordinate.
 * @param {Cesium.Cartesian3} options.end - Ending coordinate.
 * @returns {Object} Polyline entity configuration.
 */
function getPolylineConfiguration({ start, end }) {
  return {
    polyline: {
      positions: [start, end],
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.25,
        color: Cesium.Color.WHITE.withAlpha(0.95)
      }),
      width: 8, // Much thicker lines for high altitude visibility
      followSurface: false,
      clampToGround: false,
      granularity: Cesium.Math.RADIANS_PER_DEGREE,
      depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.WHITE.withAlpha(0.7)
      }),
      // Ensure visibility at all distances
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, Number.MAX_VALUE),
    },
  };
}

/**
 * Helper function to create a marker entity configuration.
 * @param {Cesium.Cartesian3} options.position - The position to place the marker.
 * @param {number} options.id - ID for the marker.
 * @param {string} options.markerBubble - Data URI for the marker bubble.
 * @returns {Cesium.Entity.ConstructorOptions} Marker entity configuration.
 */
function getMarkerEntityConfiguration({ position, id, markerBubble, title }) {
  console.log(`Configuring bubble marker ${id}: ${title}`);

  return {
    position,
    id,
    name: title,
    billboard: {
      image: markerBubble,
      scale: 1.0,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM, // Bottom arrow touches the line top
      pixelOffset: new Cesium.Cartesian2(0, 0), // No offset - bubble sits directly on line
      scaleByDistance: new Cesium.NearFarScalar(1000, 1.2, 50000, 0.6), // Scale with zoom distance
      translucencyByDistance: new Cesium.NearFarScalar(1000, 1.0, 100000, 0.7), // Fade at far distances
      disableDepthTestDistance: Number.POSITIVE_INFINITY, // Always visible
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
  const markerId = marker.id;

  if (selectedMarkerId === markerId) {
    return;
  }

  console.log(`🎯 Marker clicked: ${markerId}`);

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
    console.log(`Mobile device: limiting markers to ${maxMarkersOnMobile} for performance`);
    chaptersToProcess = chapters.slice(0, maxMarkersOnMobile);
  }

  // Use hardcoded coordinates for fast loading (no API calls needed for initial display)
  const hardcodedCoordinates = {
    1: { lat: 43.3247, lng: -8.4115 },   // Fundación Exponav - Ferrol
    2: { lat: 37.9838, lng: -1.1300 },   // Fundación Excelem - Murcia
    3: { lat: 36.5298, lng: -6.2927 },   // MUCAIN - Cádiz
    4: { lat: 40.4478, lng: -3.7189 },   // UPM Museum - Madrid
    5: { lat: 41.4036, lng: 2.1744 },    // Sagrada Familia - Barcelona
    6: { lat: 40.4138, lng: -3.6923 },   // Museo del Prado - Madrid
    7: { lat: 41.4145, lng: 2.1527 },    // Park Güell - Barcelona
    8: { lat: 37.1770, lng: -3.5880 },   // Alhambra - Granada
    9: { lat: 37.1770, lng: -3.5880 },   // Alhambra Palace - Granada (same location)
    10: { lat: 43.2630, lng: -2.9350 },  // Guggenheim - Bilbao
    11: { lat: 40.4180, lng: -3.7144 },  // Royal Palace - Madrid
    12: { lat: 42.8805, lng: -8.5446 }   // Santiago Cathedral - Santiago
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
      console.log(`✅ Using hardcoded coordinates for ${chapter.title}: ${coords.lat}, ${coords.lng}`);
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

  // iterate the coordinates
  coordsWithAdjustedHeight.forEach(async (coord, index) => {
    // Determine if we're in overview mode (Spain overview)
    const isOverviewMode = cesiumViewer.camera.positionCartographic.height > 1000000; // Over 1000km altitude
    
    // Use much larger height offset for overview mode so lines are visible from space
    const heightOffset = isOverviewMode ? 200000 : 28; // 200km for overview, 28m for close views
    const coordWithHeightOffset = addHeightOffset(coord, heightOffset);
    const { id, title } = chaptersToProcess[index];
    console.log(`Processing chapter ${index}: ID=${id}, Title="${title}"`);
    const markerBubble = await createMarkerBubble(id, title);

    const isMarkerVisible = chaptersToProcess[index].focusOptions?.showLocationMarker;

    // Store the resolved coordinates on the chapter for other uses
    chaptersToProcess[index].coords = chapterLocations[index];

    // add the line and the marker as separate entities for better visibility
    const lineEntity = cesiumViewer.entities.add({
      id: `line-${id}`,
      ...getPolylineConfiguration({ start: coord, end: coordWithHeightOffset }),
      show: isMarkerVisible,
    });
    
    console.log(`Added line entity for marker ${id}:`, {
      lineId: `line-${id}`,
      start: coord,
      end: coordWithHeightOffset,
      visible: isMarkerVisible,
      lineEntity: lineEntity
    });
    
    cesiumViewer.entities.add({
      ...getMarkerEntityConfiguration({
        position: coordWithHeightOffset,
        id,
        markerBubble,
        title,
      }),
      show: isMarkerVisible,
    });

    // Select the marker if it was rerendered and already selected before
    if (selectedMarkerId === id) {
      setSelectedMarker(id);
    }
  });

  // add a click handler to the viewer which handles the click only when clicking on a billboard (Marker) instance
  createMarkerClickHandler();
}

export default createMarkers;

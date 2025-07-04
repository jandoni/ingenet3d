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
 * Creates a marker SVG for a given location.
 * @param {string} markerId - The ID of the marker.
 * @param {string} title - The title of the place for icon selection.
 * @returns {string} The marker image URL.
 */
async function createMarkerSvg(markerId, title = '') {
  // Determine icon based on place title/type
  let imageUrl;
  const titleLower = title.toLowerCase();
  
  // Churches: Sagrada Familia, Giralda, Santiago de Compostela
  if (titleLower.includes('sagrada') || titleLower.includes('giralda') || titleLower.includes('santiago') || 
      titleLower.includes('cathedral') || titleLower.includes('basilica')) {
    imageUrl = "assets/images/church.png";
  }
  // Museums: Prado, Guggenheim, Exponav, Mucain, Museo historico
  else if (titleLower.includes('museo') || titleLower.includes('museum') || titleLower.includes('prado') || 
           titleLower.includes('guggenheim') || titleLower.includes('exponav') || titleLower.includes('mucain')) {
    imageUrl = "assets/images/museum.png";
  }
  // Parks: Park Güell
  else if (titleLower.includes('park') || titleLower.includes('güell') || titleLower.includes('guell')) {
    imageUrl = "assets/images/park.png";
  }
  // Palaces and others: Alhambra, Royal Palace, etc.
  else {
    imageUrl = "assets/images/palace.png";
  }
  
  console.log(`Creating marker for ID ${markerId} (${title}): using ${imageUrl}`);
  
  // Test if image exists by trying to load it
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to load icon ${imageUrl}, status: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    console.log(`Successfully loaded icon: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error(`Error loading icon ${imageUrl}:`, error);
    // Fall back to default marker
    console.log("Falling back to default SVG marker");
    const baseSvgElement = await fetchSvgContent("assets/icons/marker.svg");
    const baseConfig = {
      height: "60",
      width: "60",
      stroke: "white", 
      fill: "#13B5C7",
    };
    setSvgAttributes(baseSvgElement, baseConfig);
    return encodeSvgToDataUri(baseSvgElement);
  }
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
 * @param {string} options.markerSvg - Data URI for the marker SVG or image URL.
 * @returns {Cesium.Entity.ConstructorOptions} Marker entity configuration.
 */
function getMarkerEntityConfiguration({ position, id, markerSvg, title }) {
  // Check if it's a PNG image (custom icon) or SVG (default marker)
  const isCustomIcon = markerSvg.includes('assets/images/') && markerSvg.endsWith('.png');
  
  console.log(`Configuring marker ${id}: isCustomIcon=${isCustomIcon}, image=${markerSvg}, title=${title}`);
  
  // Helper function to truncate text
  const truncateText = (text, maxLength) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  };
  
  return {
    position,
    id,
    name: title,
    billboard: {
      image: markerSvg,
      scale: isCustomIcon ? 1.0 : defaultMarkerScale, // Much larger scale for custom icons
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM, // Bottom of icon touches the line top
      width: isCustomIcon ? 64 : undefined, // Larger width for good visibility
      height: isCustomIcon ? 64 : undefined, // Larger height for good visibility
      pixelOffset: new Cesium.Cartesian2(0, 0), // No offset - icon sits directly on line
      scaleByDistance: new Cesium.NearFarScalar(1000, 2.0, 50000, 0.5), // Scale with zoom distance
      translucencyByDistance: new Cesium.NearFarScalar(1000, 1.0, 100000, 0.8), // Fade at far distances
    },
    label: {
      text: truncateText(title || 'Unknown', 20), // Truncate long titles
      font: 'bold 13pt Arial, sans-serif',
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE, // White text for better visibility
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3, // Thick outline for better contrast
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, -45), // Position label above marker
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new Cesium.NearFarScalar(1000, 1.0, 12000, 0.6),
      translucencyByDistance: new Cesium.NearFarScalar(1000, 1.0, 15000, 0.2),
      // Solid dark background for maximum readability
      backgroundPadding: new Cesium.Cartesian2(10, 5),
      backgroundColor: new Cesium.Color(0, 0, 0, 0.8), // Dark semi-transparent background
      showBackground: true,
      eyeOffset: new Cesium.Cartesian3(0, 0, -50)
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
    const isCurrentCustom = currentMarker.billboard.image.getValue().includes('assets/images/');
    currentMarker.billboard.scale = isCurrentCustom ? 0.1 : defaultMarkerScale;
    // Reset label scale if it exists
    if (currentMarker.label) {
      currentMarker.label.scale = 1.0;
    }
  }

  // Scale the new selected marker to be larger
  if (newMarker) {
    const isNewCustom = newMarker.billboard.image.getValue().includes('assets/images/');
    newMarker.billboard.scale = isNewCustom ? 0.15 : 1; // Slightly larger for custom icons
    // Scale up label for selected marker
    if (newMarker.label) {
      newMarker.label.scale = 1.1;
    }
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

  updateChapter(getChapterIndexFromId(markerId));
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
    1: { lat: 41.4036, lng: 2.1744 },    // Sagrada Familia, Barcelona
    2: { lat: 40.4138, lng: -3.6923 },   // Prado Museum, Madrid  
    3: { lat: 41.4145, lng: 2.1527 },    // Park Güell, Barcelona
    4: { lat: 37.3826, lng: -5.9930 },   // La Giralda, Seville
    5: { lat: 37.1770, lng: -3.5880 },   // Alhambra, Granada
    6: { lat: 43.2630, lng: -2.9350 },   // Guggenheim, Bilbao
    7: { lat: 40.4180, lng: -3.7144 },   // Royal Palace, Madrid
    8: { lat: 42.8805, lng: -8.5446 },   // Santiago Cathedral
    9: { lat: 43.3247, lng: -8.4115 },   // Exponav, Ferrol
    10: { lat: 37.9838, lng: -1.1300 },  // Excelem, Murcia
    11: { lat: 36.5298, lng: -6.2927 },  // Mucain, Cádiz
    12: { lat: 40.4478, lng: -3.7189 }   // UPM Museum, Madrid
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
    const markerSvg = await createMarkerSvg(id, title);

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
        markerSvg,
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

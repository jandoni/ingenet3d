/**
 * Google Maps 3D Markers
 * Replaces Cesium billboards with native Google Maps 3D markers
 *
 * Supports:
 * - Interactive markers with click handlers
 * - Custom logo images inside circular markers
 * - Show/hide individual markers and filtered sets
 * - Marker highlighting
 */

import { map3d } from './google-maps-3d.js';
import {
  getChapterIndexFromId,
  updateChapter,
} from "../chapters/chapter-navigation.js";

// Store all markers by ID
const markers = new Map();

// Selected marker state
let selectedMarkerId = null;

// Hardcoded coordinates for fast loading (verified December 2025)
const hardcodedCoordinates = {
  1: { lat: 43.4824, lng: -8.2316 },   // Fundacion Exponav - Ferrol
  2: { lat: 43.5384, lng: -7.0233 },   // Gondan Shipbuilders - Castropol
  3: { lat: 43.6136, lng: -5.7931 },   // Museo Maritimo de Asturias - Luanco
  4: { lat: 43.4685, lng: -3.7873 },   // Museo Maritimo del Cantabrico - Santander
  5: { lat: 43.3230, lng: -1.9911 },   // Euskal Itsas Museoa - San Sebastian
  6: { lat: 43.4833, lng: -8.2333 },   // Navantia Ferrol
  7: { lat: 43.4820, lng: -8.2235 },   // Campus Industrial de Ferrol - UDC
  8: { lat: 43.5595, lng: -5.9029 },   // Windar Renovables - Aviles
  9: { lat: 43.3500, lng: -2.6700 },   // Murueta Astilleros - Bizkaia
  10: { lat: 43.3060, lng: -2.9410 },  // Cintranaval-Defcar - Loiu
  11: { lat: 41.3750, lng: 2.1830 },   // MB92 Barcelona
  12: { lat: 41.3756, lng: 2.1758 },   // Museu Maritim de Barcelona
  13: { lat: 41.3890, lng: 2.1126 },   // Compass Ingenieria - Barcelona
  14: { lat: 37.6025, lng: -0.9865 },  // Universidad Politecnica de Cartagena (UPCT)
  15: { lat: 37.5800, lng: -0.9750 },  // SAES - Electronica Submarina - Cartagena
  16: { lat: 37.5967, lng: -0.9839 },  // ARQVA - Museo Arqueologia Subacuatica - Cartagena
  17: { lat: 37.5983, lng: -0.9863 },  // Museo Naval de Cartagena
  18: { lat: 37.7180, lng: -1.1530 },  // CTN - Centro Tecnologico Naval - Fuente Alamo
  19: { lat: 40.9136, lng: -4.0611 },  // MUCAIN - Museo Virtual - Palazuelos de Eresma, Segovia
  20: { lat: 37.9784, lng: -0.6826 },  // Museo del Mar y de la Sal - Torrevieja
  21: { lat: 36.6010, lng: -6.2290 },  // Ghenova Ingenieria - El Puerto de Santa Maria
  22: { lat: 36.5328, lng: -6.2053 },  // Navantia Seanergies - Puerto Real
  23: { lat: 36.5328, lng: -6.2053 },  // Museo El Dique - Puerto Real
  24: { lat: 28.0706, lng: -15.4532 },  // Universidad de Las Palmas (ULPGC) - Tafira
  25: { lat: 27.9922, lng: -15.3683 },  // PLOCAN - Plataforma Oceanica de Canarias - Telde
  26: { lat: 28.1400, lng: -15.4270 },  // Museo Naval de Las Palmas
  27: { lat: 28.1558, lng: -15.4089 },  // Astican - Astilleros Canarios - Las Palmas
  28: { lat: 37.3660, lng: -5.9987 },  // Sener - Sevilla
  29: { lat: 40.4570, lng: -3.6910 },  // Soermar - Madrid (Paseo Castellana)
  30: { lat: 42.2350, lng: -8.7250 },  // Seaplace - Vigo
  31: { lat: 40.4156, lng: -3.7073 },  // Real Liga Naval Espanola - Madrid
  32: { lat: 42.1541, lng: -8.6315 },  // AIMEN Centro Tecnologico - O Porrino
  33: { lat: 42.2256, lng: -8.7450 },  // Freire Shipyard - Vigo
  34: { lat: 42.2180, lng: -8.7770 },  // Museo do Mar de Galicia - Vigo
  35: { lat: 40.5264, lng: -3.7781 },  // CEHIPAR - Canal El Pardo - Madrid
  36: { lat: 40.4178, lng: -3.6927 },  // Museo Naval de Madrid
  37: { lat: 37.3847, lng: -5.9954 },  // Reales Atarazanas de Sevilla
  38: { lat: 37.9694, lng: -1.2247 }   // Fundacion Excelem - Avda Descubrimiento, Alcantarilla, Murcia
};

// Store calculated altitudes for marker staggering (prevents visual overlap)
let markerAltitudes = new Map();

/**
 * Calculate altitude offsets for overlapping markers to spread them vertically
 * Keeps lat/lng exact (stem touches building) but staggers height to prevent overlap
 * Uses higher base altitude to reduce flickering from terrain LOD changes
 * @param {Array} chapters - Array of chapter objects with coordinates
 * @returns {Map} Map of chapterId -> altitude (in meters)
 */
function calculateMarkerAltitudes(chapters) {
  const altitudes = new Map();
  const threshold = 0.05; // ~5km - markers closer than this get staggered
  const baseAltitude = 100; // Base altitude (higher = less terrain LOD flickering)
  const altitudeStep = 80; // 80 meters between stacked markers

  // Track which markers have been assigned
  const assigned = new Set();

  for (const chapter of chapters) {
    if (assigned.has(chapter.id)) continue;

    const coords = hardcodedCoordinates[chapter.id];
    if (!coords) continue;

    // Find nearby markers
    const nearby = [chapter];
    for (const other of chapters) {
      if (other.id === chapter.id || assigned.has(other.id)) continue;
      const otherCoords = hardcodedCoordinates[other.id];
      if (!otherCoords) continue;

      const dist = Math.sqrt(
        Math.pow(coords.lat - otherCoords.lat, 2) +
        Math.pow(coords.lng - otherCoords.lng, 2)
      );

      if (dist < threshold) {
        nearby.push(other);
      }
    }

    // Sort by ID to ensure deterministic altitude assignment (prevents flickering)
    nearby.sort((a, b) => a.id - b.id);

    // Assign staggered altitudes to nearby markers
    // Base altitude + stagger offset reduces terrain LOD flickering
    nearby.forEach((ch, index) => {
      altitudes.set(ch.id, baseAltitude + (index * altitudeStep));
      assigned.add(ch.id);
    });
  }

  console.log(`Calculated altitudes for ${altitudes.size} markers (staggered to prevent overlap)`);
  return altitudes;
}

/**
 * Create a marker image with company logo inside a circular container
 * @param {string} title - The location title
 * @param {string} logoUrl - URL of the company logo
 * @returns {Promise<string>} Data URL of the marker image
 */
async function createMarkerImage(title, logoUrl) {
  const circleSize = 56;  // Clean, modern size
  const stemHeight = 60;  // Longer stem to clearly point to building
  const stemWidth = 3;    // Thinner stem for cleaner look
  const totalHeight = circleSize + stemHeight;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = circleSize;
  canvas.height = totalHeight;

  const centerX = circleSize / 2;
  const centerY = circleSize / 2;  // Circle center
  const radius = (circleSize / 2) - 4;

  // Draw stem first (behind circle) with shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = '#ffffff';  // White stem
  ctx.beginPath();
  // Tapered stem - wider at top, pointed at bottom
  ctx.moveTo(centerX - stemWidth, centerY + radius - 2);
  ctx.lineTo(centerX + stemWidth, centerY + radius - 2);
  ctx.lineTo(centerX, totalHeight - 2);  // Point at bottom
  ctx.closePath();
  ctx.fill();

  // Modern subtle shadow for circle
  ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  // White circle background
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Reset shadow for border
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Thin, clean border (light gray for modern look)
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Try to load and draw logo
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      const logoSize = radius * 1.5;  // Slightly larger logo
      const logoX = centerX - logoSize / 2;
      const logoY = centerY - logoSize / 2;

      // Clip to circle with padding
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 2, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, logoX, logoY, logoSize, logoSize);
      ctx.restore();
    } catch (error) {
      // Draw initials if logo fails
      drawInitials(ctx, title, centerX, centerY);
    }
  } else {
    // Draw initials if no logo URL
    drawInitials(ctx, title, centerX, centerY);
  }

  return canvas.toDataURL();
}

/**
 * Draw initials in the center of the marker
 */
function drawInitials(ctx, title, centerX, centerY) {
  const initials = title
    .split(' ')
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase();

  // Modern blue color, clean font
  ctx.fillStyle = '#3b82f6';
  ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, centerX, centerY);
}

/**
 * Load an image from URL
 * @param {string} url - Image URL
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));

    img.src = url;

    // Timeout
    setTimeout(() => {
      if (!img.complete) {
        reject(new Error('Image load timeout'));
      }
    }, 10000);
  });
}

/**
 * Create a single marker on the 3D map
 * @param {Object} options - Marker options
 * @returns {Promise<HTMLElement>}
 */
async function createMarker(options) {
  const {
    id,
    lat,
    lng,
    altitude = 0,  // Default to ground level
    title,
    logoUrl,
    onClick
  } = options;

  // Use Marker3DInteractiveElement for click support + template for custom visuals
  const { Marker3DInteractiveElement } = await google.maps.importLibrary('maps3d');

  // Create the marker image (canvas-generated circular logo)
  const markerImage = await createMarkerImage(title, logoUrl);

  // Create image element for the marker
  // Height is 116px (56px circle + 60px stem), offset so stem tip is at marker position
  const img = document.createElement('img');
  img.src = markerImage;
  img.alt = title;
  // Added will-change and backface-visibility for smoother rendering and reduced flickering
  img.style.cssText = `
    width: 56px;
    height: 116px;
    cursor: pointer;
    transform: translateY(-58px);
    will-change: transform;
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  `.replace(/\s+/g, ' ').trim();

  // Wrap in template element (required by Marker3DInteractiveElement)
  const template = document.createElement('template');
  template.content.append(img);

  // Create interactive marker element
  const markerElement = new Marker3DInteractiveElement();
  markerElement.position = { lat, lng, altitude };
  markerElement.altitudeMode = 'RELATIVE_TO_GROUND';
  markerElement.collisionBehavior = 'REQUIRED';  // Force all markers to show
  markerElement.drawsWhenOccluded = true;  // Show even when behind buildings
  markerElement.sizePreserved = true;  // Keep consistent size at all zoom levels
  markerElement.id = `marker-${id}`;
  // Set explicit zIndex based on ID for deterministic render order (reduces flickering)
  markerElement.zIndex = 1000 + id;

  // Append template to marker (custom circular logo)
  markerElement.append(template);

  // Add click handler using gmp-click (works with Marker3DInteractiveElement)
  if (onClick) {
    markerElement.addEventListener('gmp-click', (e) => {
      e.stopPropagation();
      console.log(`Marker clicked: ${id} - ${title}`);
      onClick(id, { lat, lng, title });
    });
  }

  // Add to map if available
  if (map3d) {
    map3d.append(markerElement);
  }

  // Store reference
  markers.set(id, {
    element: markerElement,
    content: img,
    lat,
    lng,
    title
  });

  return markerElement;
}

/**
 * Create markers for all chapters
 * @param {Array} chapters - Array of chapter objects
 */
export async function createMarkers(chapters) {
  if (!map3d) {
    console.error('Map not initialized');
    return;
  }

  console.log(`Creating ${chapters.length} markers...`);

  // Calculate staggered altitudes for nearby markers (prevents visual overlap)
  // Markers stay at exact lat/lng but get different heights when close together
  markerAltitudes = calculateMarkerAltitudes(chapters);

  for (const chapter of chapters) {
    const coords = hardcodedCoordinates[chapter.id] || chapter.cameraCoordinates;

    if (!coords) {
      console.warn(`No coordinates for chapter ${chapter.id}: ${chapter.title}`);
      continue;
    }

    // Place marker at exact coordinates (no horizontal offset)
    const displayLat = coords.lat;
    const displayLng = coords.lng;

    // Get staggered altitude for this marker (0 if not near other markers)
    const altitude = markerAltitudes.get(chapter.id) || 0;

    await createMarker({
      id: chapter.id,
      lat: displayLat,
      lng: displayLng,
      altitude: altitude,  // Staggered altitude - higher for overlapping markers
      title: chapter.title,
      logoUrl: chapter.logoUrl || chapter.imageUrl,
      onClick: (markerId, location) => {
        handleMarkerClick(markerId, chapter);
      }
    });
  }

  console.log(`Created ${markers.size} markers`);
}

/**
 * Handle marker click - navigate to chapter using marker's exact coordinates
 * @param {number} markerId - The marker/chapter ID
 * @param {Object} chapter - The chapter object
 */
function handleMarkerClick(markerId, chapter) {
  console.log(`Marker clicked: ${markerId} - ${chapter.title}`);

  // Get the marker's exact coordinates
  const markerCoords = hardcodedCoordinates[markerId];

  if (markerCoords) {
    // Store marker coordinates globally so flyToPlaceNew can use them
    window._markerClickCoordinates = {
      lat: markerCoords.lat,
      lng: markerCoords.lng,
      chapterId: markerId
    };
  }

  // Use global navigation function if available
  if (typeof window.navigateToChapter === 'function') {
    window.navigateToChapter(markerId);
  } else {
    // Fallback to direct navigation
    const chapterIndex = getChapterIndexFromId(markerId);
    if (chapterIndex !== -1) {
      updateChapter(chapterIndex);
    }
  }

  // Set this marker as selected
  setSelectedMarker(markerId);
}

/**
 * Set the selected marker (scale up)
 * @param {number} markerId - The marker ID to select
 */
export function setSelectedMarker(markerId) {
  // Base transform that all markers need for proper positioning
  const baseTransform = 'translateY(-58px)';

  // Reset previous marker
  if (selectedMarkerId !== null && markers.has(selectedMarkerId)) {
    const prevMarker = markers.get(selectedMarkerId);
    if (prevMarker.content && prevMarker.content.style) {
      prevMarker.content.style.transform = `${baseTransform} scale(1)`;
    }
  }

  // Scale up new marker
  if (markerId !== null && markers.has(markerId)) {
    const marker = markers.get(markerId);
    if (marker.content && marker.content.style) {
      marker.content.style.transform = `${baseTransform} scale(1.3)`;
    }
  }

  selectedMarkerId = markerId;
}

/**
 * Remove a marker
 * @param {number} markerId - The marker ID to remove
 */
export function removeMarker(markerId) {
  const marker = markers.get(markerId);
  if (marker && marker.element) {
    marker.element.remove();
    markers.delete(markerId);
  }
}

/**
 * Hide a marker
 * @param {number} markerId - The marker ID to hide
 */
export function hideMarker(markerId) {
  const marker = markers.get(markerId);
  if (marker && marker.element) {
    marker.element.style.display = 'none';
  }
}

/**
 * Show a marker
 * @param {number} markerId - The marker ID to show
 */
export function showMarker(markerId) {
  const marker = markers.get(markerId);
  if (marker && marker.element) {
    marker.element.style.display = '';
  }
}

/**
 * Hide all markers
 */
export function hideAllMarkers() {
  markers.forEach((marker) => {
    if (marker.element) {
      marker.element.style.display = 'none';
    }
  });
}

/**
 * Show all markers
 */
export function showAllMarkers() {
  markers.forEach((marker) => {
    if (marker.element) {
      marker.element.style.display = '';
    }
  });
}

/**
 * Show only markers for specific chapter IDs
 * @param {Array<number>} chapterIds - Array of chapter IDs to show
 */
export function showFilteredMarkers(chapterIds) {
  markers.forEach((marker, id) => {
    if (marker.element) {
      marker.element.style.display = chapterIds.includes(id) ? '' : 'none';
    }
  });
}

/**
 * Get marker by ID
 * @param {number} markerId - The marker ID
 * @returns {Object|null} The marker object or null
 */
export function getMarker(markerId) {
  return markers.get(markerId) || null;
}

/**
 * Get all markers
 * @returns {Map} All markers
 */
export function getAllMarkers() {
  return markers;
}

/**
 * Show location pin at a specific location (for current chapter)
 * @param {number} chapterId - The chapter ID
 * @param {Object} location - Location {lat, lng}
 * @param {string} title - The location title
 * @param {string} logoUrl - URL of the company logo
 */
export function showLocationPin(chapterId, location, title, logoUrl) {
  // For Google Maps 3D, we can use the same marker system
  // The marker is already created, just highlight it
  setSelectedMarker(chapterId);
}

/**
 * Hide the location pin
 */
export function hideLocationPin() {
  // Reset selection if needed
  if (selectedMarkerId !== null) {
    const marker = markers.get(selectedMarkerId);
    if (marker && marker.content) {
      // Preserve base transform while resetting scale
      marker.content.style.transform = 'translateY(-58px) scale(1)';
    }
  }
}

export default createMarkers;

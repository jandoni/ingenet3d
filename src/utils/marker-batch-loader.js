/**
 * Marker Batch Loader
 * Loads markers in batches with progress tracking
 */

import { loadingManager } from './loading-manager.js';
import { cesiumViewer } from './cesium.js';

/**
 * Batch create markers with progress tracking
 * This is a wrapper around the createMarkers function that processes markers in batches
 *
 * @param {Array} chapters - Array of chapter objects
 * @param {Function} createSingleMarker - Function to create a single marker
 * @param {number} batchSize - Number of markers to create per batch (default: 8)
 */
export async function createMarkersInBatches(
  chapters,
  createSingleMarkerFn,
  batchSize = 8
) {
  loadingManager.startStage('LOCATIONS');

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  const maxMarkersOnMobile = 8;

  let chaptersToProcess = chapters;
  if (isMobile && chapters.length > maxMarkersOnMobile) {
    chaptersToProcess = chapters.slice(0, maxMarkersOnMobile);
  }

  const totalMarkers = chaptersToProcess.length;
  let processedCount = 0;

  // Process markers in batches
  for (let i = 0; i < chaptersToProcess.length; i += batchSize) {
    const batch = chaptersToProcess.slice(i, i + batchSize);

    // Process this batch
    await processBatch(batch, createSingleMarkerFn);

    processedCount += batch.length;
    const progress = processedCount / totalMarkers;

    // Update loading manager with progress
    loadingManager.updateStage(
      'LOCATIONS',
      progress,
      `Cargando ubicaciones... ${processedCount}/${totalMarkers}`
    );
  }

  loadingManager.completeStage('LOCATIONS');
}

/**
 * Process a single batch of markers
 * @param {Array} batch - Batch of chapters to process
 * @param {Function} createSingleMarkerFn - Function to create markers
 */
async function processBatch(batch, createSingleMarkerFn) {
  if (!cesiumViewer) {
    console.error("Error creating markers: `cesiumViewer` is undefined");
    return;
  }

  // Use the provided function to create markers for this batch
  await createSingleMarkerFn(batch);

  // Allow UI to update between batches
  await new Promise(resolve => setTimeout(resolve, 50));
}

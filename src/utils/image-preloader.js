/**
 * Image Preloader
 * Batch preloads images with progress tracking
 */

import { loadingManager } from './loading-manager.js';

/**
 * Preload a single image
 * @param {string} src - Image source URL
 * @returns {Promise<HTMLImageElement>}
 */
function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`Failed to preload image: ${src}`);
      // Resolve anyway to not block the loading process
      resolve(img);
    };

    img.src = src;
  });
}

/**
 * Preload images in batches with progress tracking
 * @param {Array<string>} imageSources - Array of image source URLs
 * @param {number} batchSize - Number of images to load concurrently (default: 6)
 * @returns {Promise<void>}
 */
export async function preloadImagesInBatches(imageSources, batchSize = 6) {
  const totalImages = imageSources.length;
  let loadedCount = 0;

  // Process images in batches
  for (let i = 0; i < imageSources.length; i += batchSize) {
    const batch = imageSources.slice(i, i + batchSize);

    // Load batch concurrently
    await Promise.all(batch.map(src => preloadImage(src)));

    loadedCount += batch.length;
    const progress = loadedCount / totalImages;

    // Update loading manager with progress
    loadingManager.updateStage(
      'IMAGES',
      progress,
      `Cargando imágenes... ${loadedCount}/${totalImages}`
    );
  }

  loadingManager.completeStage('IMAGES');
}

/**
 * Extract all image URLs from chapters data
 * @param {Array} chapters - Array of chapter objects
 * @returns {Array<string>} - Array of image URLs
 */
export function extractImageUrls(chapters) {
  const imageUrls = [];

  chapters.forEach(chapter => {
    // Add main chapter image if exists
    if (chapter.image) {
      imageUrls.push(chapter.image);
    }

    // Add gallery images if they exist
    if (chapter.gallery && Array.isArray(chapter.gallery)) {
      chapter.gallery.forEach(galleryItem => {
        if (galleryItem.image) {
          imageUrls.push(galleryItem.image);
        }
      });
    }
  });

  // Remove duplicates
  return [...new Set(imageUrls)];
}

/**
 * Preload chapter images with progress tracking
 * @param {Array} chapters - Array of chapter objects
 * @param {number} batchSize - Number of images to load concurrently (default: 6)
 * @returns {Promise<void>}
 */
export async function preloadChapterImages(chapters, batchSize = 6) {
  loadingManager.startStage('IMAGES');

  const imageUrls = extractImageUrls(chapters);

  if (imageUrls.length === 0) {
    loadingManager.completeStage('IMAGES');
    return;
  }

  await preloadImagesInBatches(imageUrls, batchSize);
}

// Google Maps 3D API (replaces Cesium)
import { initGoogleMaps3D, map3d, flyToLocation, startOrbit, stopAnimation, zoomIn, zoomOut, flyToSpainOverview } from "./utils/google-maps-3d.js";
import createMarkers, { hideAllMarkers, showAllMarkers, showFilteredMarkers, setSelectedMarker } from "./utils/google-markers-3d.js";

import { loadConfig } from "./utils/config.js";
import { initChapterNavigation, updateChapter, resetToIntro, getCurrentChapterIndex, showSearchResultsOnMap } from "./chapters/chapter-navigation.js";
import { initGoogleMapsServicesNew, resolvePlaceToCameraNew } from "./utils/places-new-api.js";
import { simpleGeocodeToCamera } from "./utils/simple-geocoder.js";
import { initChatbot } from "./utils/chatbot.js";
import { loadingManager } from "./utils/loading-manager.js";
import { preloadChapterImages } from "./utils/image-preloader.js";
import { detectAndConfigurePerformance } from "./utils/performance-settings.js";

/**
 * The story configuration object
 * @type {Story}
 */
export const story = await loadConfig("./config.json");
const { chapters } = story;

// Make story available globally for places-new-api.js to use cameraCoordinates
window.story = story;

/**
 * Load detailed data for a specific chapter when needed
 * This only runs when user clicks on a place
 */
async function loadChapterDetails(chapterId) {
  const chapter = chapters.find(ch => ch.id === chapterId);
  if (!chapter) {
    console.error(`🚨 Chapter not found for ID: ${chapterId}`);
    return null;
  }
  
  if (chapter.detailsLoaded) {
    return chapter;
  }

  try {
    // Ensure Google Maps services are initialized
    // This should already be loaded during app startup, but check just in case
    if (typeof google === 'undefined' || !google.maps) {
      console.warn('⚠️ Google Maps API not loaded yet');
      return chapter;
    }

    if (!window.googleMapsLoaded) {
      initGoogleMapsServicesNew();
      window.googleMapsLoaded = true;
    }

    let cameraConfig;

    // Try NEW Places API first, fallback to simple geocoder
    try {
      cameraConfig = await resolvePlaceToCameraNew(chapter.placeName, chapter.cameraStyle || 'static');
    } catch (placesError) {
      console.warn(`⚠️ NEW Places API failed for ${chapter.title}, trying simple geocoder...`);
      cameraConfig = await simpleGeocodeToCamera(chapter.placeName, chapter.cameraStyle || 'static');
    }

    // Store camera configuration and place details
    if (cameraConfig) {
      chapter.cameraConfig = cameraConfig;

      if (cameraConfig.placeDetails) {
        chapter.placeDetails = cameraConfig.placeDetails;

        // Optionally update content with Google's editorial summary
        if (cameraConfig.placeDetails.editorialSummary && !chapter.content) {
          chapter.content = cameraConfig.placeDetails.editorialSummary;
        }
      }
    }

    chapter.detailsLoaded = true;
    
  } catch (error) {
    console.error(`💥 FAILED to load details for ${chapter.title}:`, error);
    console.trace('Error stack:');
  }
  
  return chapter;
}

/**
 * Truncate text to specified length with ellipsis
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Preload camera configs for all chapters (background task)
 * This caches Google Places API responses so navigation is instant
 */
async function preloadCameraConfigs(chaptersToPreload) {
  const preloadPromises = [];

  for (const chapter of chaptersToPreload) {
    // Skip chapters that already have cached coordinates
    if (chapter.cameraCoordinates) {
      continue;
    }

    // Add slight delay between requests to avoid rate limiting
    const promise = new Promise(async (resolve) => {
      try {
        await resolvePlaceToCameraNew(chapter.placeName || chapter.title, chapter.cameraStyle || 'drone-orbit');
        resolve({ success: true, title: chapter.title });
      } catch (error) {
        resolve({ success: false, title: chapter.title, error: error.message });
      }
    });

    preloadPromises.push(promise);

    // Small delay between starting requests to be nice to the API
    await new Promise(r => setTimeout(r, 50));
  }

  // Wait for all preloads to complete
  const results = await Promise.all(preloadPromises);
  return results;
}

/**
 * The main function. This function is called when the page is loaded.
 * Fast initial load, then background enrichment.
 */
let mainFunctionCalled = false;

async function main() {
  if (mainFunctionCalled) {
    console.error('🚨 CRITICAL: main() function called MULTIPLE TIMES! This should NEVER happen.');
    console.trace('Call stack:');
    return;
  }

  mainFunctionCalled = true;

  try {
    // ==========================================
    // STAGE 1: INITIALIZE 3D VIEWER (0-15%)
    // ==========================================
    loadingManager.startStage('INIT');

    // Detect device and network capabilities FIRST for adaptive optimization
    loadingManager.updateStage('INIT', 0.2, 'Detectando red y dispositivo...');
    const performanceSettings = await detectAndConfigurePerformance();

    // Store globally for other modules to access
    window.performanceSettings = performanceSettings;

    // Show network warning ONLY if slow (minimal, professional)
    const isSlow = performanceSettings.networkSpeed === 'slow';
    if (isSlow) {
      loadingManager.showNetworkStatus('Conexión lenta - Optimizando rendimiento');
    }
    loadingManager.updateStage('INIT', 0.4, `${performanceSettings.description}`);

    // Show initial UI immediately with curated images
    initializeNewUI();

    // Initialize Google Maps 3D
    loadingManager.updateStage('INIT', 0.6, 'Inicializando visor 3D...');
    await initGoogleMaps3D({
      lat: 40.0,
      lng: -3.7,
      range: 2000000, // 2000km for Spain overview
      tilt: 0,        // Looking straight down
      heading: 0
    });

    loadingManager.completeStage('INIT');

    // ==========================================
    // STAGE 2: PRELOAD IMAGES (15-40%)
    // ==========================================
    // Preload all chapter images in batches (adaptive batch size based on network)
    await preloadChapterImages(chapters, performanceSettings.imageBatchSize);

    // ==========================================
    // STAGE 3: CREATE MARKERS (40-70%)
    // ==========================================
    loadingManager.startStage('LOCATIONS');

    // Create unified markers using the advanced marker system
    await createMarkers(chapters);

    loadingManager.completeStage('LOCATIONS');

    // ==========================================
    // STAGE 4: PREPARE CONTENT (70-90%)
    // ==========================================
    loadingManager.startStage('CONTENT');

    // Initialize chapter navigation with basic data
    initChapterNavigation();

    // Initialize category navigation menu
    initCategoryMenu();

    // Initialize the chatbot with story data
    initChatbot(story);

    loadingManager.completeStage('CONTENT');

    // ==========================================
    // STAGE 5: FINALIZE (90-100%)
    // ==========================================
    loadingManager.startStage('FINALIZE');

    // ============================================================
    // Initialize Google Maps services for Places API
    // ============================================================
    // Google Maps API is already loaded via the script tag in index.html
    // We just need to initialize the services for Places API
    // ============================================================
    try {
      initGoogleMapsServicesNew();
      window.googleMapsLoaded = true;

      // Preload camera configs for all chapters (background, non-blocking)
      preloadCameraConfigs(chapters).catch(() => {
        // Silent failure - preloading is optional optimization
      });
    } catch (error) {
      console.error('Failed to initialize Google Maps services:', error);
      window.googleMapsLoaded = false;
    }

    // Give Google Maps 3D time to fully load tiles and become interactive
    // This ensures the map is usable immediately when the loading screen hides
    loadingManager.updateStage('FINALIZE', 0.8, 'Cargando mapa 3D...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    loadingManager.complete();

    // ==========================================
    // PHASE 7A: PERFORMANCE (Google Maps 3D handles this internally)
    // ==========================================
    // Google Maps 3D API manages frame rate and tile loading automatically
    // No manual performance managers needed

  } catch (error) {
    console.error('Critical error during initialization:', error);
    // Hide loading screen even on error
    loadingManager.complete();
  }
}

/**
 * Initialize the new UI components
 */
let isUIInitialized = false;

function initializeNewUI() {
  // Prevent multiple initializations
  if (isUIInitialized) {
    console.warn('⚠️ PREVENTED DUPLICATE UI INITIALIZATION');
    return;
  }
  
  isUIInitialized = true;

  // Clear any existing content to prevent duplicates
  const placesList = document.getElementById('places-list');
  if (placesList.children.length > 0) {
    console.warn('⚠️ PLACES LIST ALREADY HAS CONTENT, CLEARING...');
    placesList.innerHTML = '';
  }

  const chapters = story.chapters;
  
  // Add intro card for "Explorar España"
  const introCard = document.createElement('div');
  introCard.className = 'place-card intro-card';
  introCard.dataset.chapterId = 'intro';
  
  // Add click handler for intro
  introCard.onclick = () => {
    if (typeof resetToIntro === 'function') {
      resetToIntro();
    }
    setActivePlace('intro');
    
    // Show hint for intro as well
    showSheetHint();
  };
  
  // Add intro image (load immediately without delay)
  const introImg = document.createElement('img');
  introImg.alt = 'Explorar España';

  if (story.properties.imageUrl) {
    introImg.src = story.properties.imageUrl;
    introImg.onerror = () => {
      console.warn('⚠️ Failed to load intro image, using fallback');
      introImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="%233b82f6"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="12">Explorar España</text></svg>';
    };
  } else {
    introImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="%233b82f6"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="12">Explorar España</text></svg>';
  }

  introCard.appendChild(introImg);
  
  // Add intro title
  const introTitle = document.createElement('div');
  introTitle.className = 'place-card-title';
  introTitle.textContent = 'Explorar España';
  introCard.appendChild(introTitle);


  placesList.appendChild(introCard);
  
  chapters.forEach((chapter, index) => {
    const placeCard = document.createElement('div');
    placeCard.className = 'place-card';
    placeCard.dataset.chapterId = chapter.id;

    // Add click handler with on-demand loading
    placeCard.onclick = async () => {
      await navigateToChapter(chapter.id, index);

      // Don't auto-open the sheet, just show a subtle hint animation
      showSheetHint();
    };
    
    // Add image with strict error handling to prevent loops
    const img = document.createElement('img');
    img.alt = chapter.title;

    let imageAttempted = false; // Prevent multiple attempts

    // Load image with proper error handling
    if (chapter.imageUrl && !imageAttempted) {
      imageAttempted = true;

      // MOBILE FIX: Reduce delay to ensure images load before menu is shown
      // Desktop can handle simultaneous loads, mobile needs slight delay
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const loadDelay = isMobile ? index * 10 : index * 50; // 10ms on mobile, 50ms on desktop

      setTimeout(() => {
        // Check if image element still exists (hasn't been removed)
        if (!img.parentNode) {
          return;
        }

        img.src = chapter.imageUrl;
      }, loadDelay);
      
      img.onerror = (e) => {
        console.error(`❌ MOBILE/DESKTOP: FAILED to load image for ${chapter.title}:`, chapter.imageUrl);
        console.error('Error type:', e.type, 'Error target:', e.target);
        console.error('Image src attempted:', img.src);

        // Prevent further error attempts by removing error handler
        img.onerror = null;

        // MOBILE FIX: Use chapter.logoUrl as fallback before showing placeholder
        if (chapter.logoUrl && chapter.logoUrl !== chapter.imageUrl) {
          console.log(`🔄 Attempting fallback to logoUrl for ${chapter.title}:`, chapter.logoUrl);
          img.src = chapter.logoUrl;

          // Add one-time error handler for logoUrl
          img.onerror = () => {
            console.error(`❌ Fallback logoUrl also failed for ${chapter.title}`);
            // Final fallback to colorful placeholder with the place name
            const placeholderColor = '#3b82f6';
            img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="${placeholderColor}"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${encodeURIComponent(chapter.title.substring(0, 20))}</text></svg>`;
            img.onerror = null; // Prevent infinite loop
          };
        } else {
          // Fallback to a colorful placeholder with the place name
          const placeholderColor = '#3b82f6';
          img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="${placeholderColor}"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${encodeURIComponent(chapter.title.substring(0, 20))}</text></svg>`;
        }
      };
      
      img.onload = () => {
        // Remove handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
      };
    } else {
      // No image URL, use placeholder
      const placeholderColor = '#3b82f6';
      img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="${placeholderColor}"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${encodeURIComponent(chapter.title.substring(0, 20))}</text></svg>`;
    }
    
    placeCard.appendChild(img);
    
    // Add title
    const title = document.createElement('div');
    title.className = 'place-card-title';
    title.textContent = chapter.title;
    placeCard.appendChild(title);


    placesList.appendChild(placeCard);
  });

  // Initialize bottom sheet state based on page
  // On root page (no chapterId), show it open; on chapter pages, minimize it
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet) {
    const urlParams = new URLSearchParams(window.location.search);
    const isRootPage = !urlParams.get('chapterId');

    if (!isRootPage) {
      // Only minimize on chapter pages, not on root
      bottomSheet.classList.add('minimized');
    }
  }

  // Initialize orbit pause button state (always paused by default)
  // Note: Initial state is already set in HTML, this ensures consistency
  if (isOrbitPaused) {
    const pauseBtn = document.getElementById('orbit-pause-btn');
    const pauseIcon = document.getElementById('pause-icon');
    const playIcon = document.getElementById('play-icon');

    if (pauseBtn) {
      pauseBtn.classList.add('paused');
      if (pauseIcon) pauseIcon.style.display = 'none';
      if (playIcon) playIcon.style.display = 'block';
    }
  }
  
  // Initialize scroll button states
  setTimeout(() => updateScrollButtons(), 100);
}

/**
 * Set active place in top navigation
 */
window.setActivePlace = function(chapterId) {
  document.querySelectorAll('.place-card').forEach(card => {
    card.classList.toggle('active', card.dataset.chapterId == chapterId);
  });

  // Scroll active place into view
  const activeCard = document.querySelector('.place-card.active');
  if (activeCard) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Vertical scrolling on mobile
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } else {
      // Horizontal scrolling on desktop
      activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }
};

/**
 * Go to home/root page (Spain overview)
 * Called by home button and IEE logo click
 */
window.goToHome = function() {
  resetToIntro();
};

/**
 * Show search results on map - navigate to Spain overview and show only matching pins
 * Used by chatbot when search returns results
 */
window.showSearchResultsOnMap = showSearchResultsOnMap;

/**
 * Navigate to a chapter by ID - reusable function for both horizontal bar and markers
 * @param {number} chapterId - The chapter ID to navigate to
 * @param {number} chapterIndex - The chapter index (optional, will be calculated if not provided)
 */
window.navigateToChapter = async function(chapterId, chapterIndex = null) {
  // Calculate index if not provided
  if (chapterIndex === null) {
    chapterIndex = story.chapters.findIndex(ch => ch.id == chapterId);
  }

  if (chapterIndex === -1) {
    console.error(`🚨 Chapter not found for ID: ${chapterId}`);
    return;
  }

  const chapter = story.chapters[chapterIndex];

  // Update active place in horizontal navigation
  setActivePlace(chapterId);

  // Load chapter details on-demand
  await loadChapterDetails(chapterId);

  // Navigate to the chapter
  updateChapter(chapterIndex);

  // Freeze mode will activate automatically after idle detection (8+ seconds)
  // Don't manually trigger freeze - let the idle system handle it
};

/**
 * Toggle bottom sheet
 */
window.toggleBottomSheet = function() {
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet) {
    bottomSheet.classList.toggle('minimized');
  }
};

/**
 * Collapse (minimize) the bottom sheet
 */
window.collapseBottomSheet = function() {
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet && !bottomSheet.classList.contains('minimized')) {
    bottomSheet.classList.add('minimized');
  }
};

/**
 * Expand (open) the bottom sheet
 */
window.expandBottomSheet = function() {
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet && bottomSheet.classList.contains('minimized')) {
    bottomSheet.classList.remove('minimized');
  }
};

/**
 * Orbit pause state
 */
let isOrbitPaused = true; // Always start paused - user can enable via play button
let currentChapterWithPausedOrbit = null;

// Make it globally available
if (typeof window !== 'undefined') {
  window.isOrbitPaused = isOrbitPaused;
}

/**
 * Toggle 360° rotation view
 * Starts a smooth 360° rotation around the current view
 */
window.toggleOrbitPause = function() {
  const orbitBtn = document.getElementById('orbit-pause-btn');

  isOrbitPaused = !isOrbitPaused;
  window.isOrbitPaused = isOrbitPaused;

  if (isOrbitPaused) {
    // Stop rotation
    orbitBtn.classList.remove('active');

    if (window.stopOrbitAnimation) {
      window.stopOrbitAnimation();
    }
  } else {
    // Start 360° rotation
    orbitBtn.classList.add('active');

    if (window.startOrbitAnimation) {
      window.startOrbitAnimation();
    }
  }
};

/**
 * Toggle mobile places panel
 */
window.toggleMobilePlaces = function() {
  const container = document.getElementById('top-navigation-container');
  const toggleBtn = document.getElementById('mobile-places-toggle');
  const overlay = document.getElementById('mobile-overlay');

  if (container && toggleBtn) {
    const wasOpen = container.classList.contains('open');
    container.classList.toggle('open');

    const isOpen = container.classList.contains('open');
    
    // Toggle overlay
    if (overlay) {
      if (isOpen) {
        overlay.style.display = 'block';
        setTimeout(() => overlay.classList.add('active'), 10);
      } else {
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
      }
    }
    
    // Adjust X button position when menu is open
    if (isOpen) {
      toggleBtn.style.right = '15px'; // Adjusted for wider menu
      toggleBtn.style.top = '35px'; // Move down to avoid overlapping with logo
    } else {
      toggleBtn.style.right = '20px';
      toggleBtn.style.top = '20px';
    }
    
    // Change icon based on state
    const svg = toggleBtn.querySelector('svg');
    if (svg) {
      if (isOpen) {
        // Show X icon when open
        svg.innerHTML = '<path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      } else {
        // Show hamburger icon when closed
        svg.innerHTML = '<path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    }
  } else {
    console.error('❌ Could not find mobile navigation elements');
  }
};

/**
 * Show a subtle hint animation for the bottom sheet
 */
function showSheetHint() {
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet && bottomSheet.classList.contains('minimized')) {
    // Add a subtle bounce animation
    bottomSheet.style.animation = 'sheetHint 0.6s ease-out';
    setTimeout(() => {
      bottomSheet.style.animation = '';
    }, 600);
  }
}

/**
 * Check if current chapter should have orbit paused and update pause button
 */
window.updateOrbitPauseState = function updateOrbitPauseState() {
  // Safely get current chapter index
  let currentChapterIndex;
  try {
    currentChapterIndex = getCurrentChapterIndex();
  } catch (error) {
    console.warn('⚠️ Could not get current chapter index:', error);
    currentChapterIndex = -1;
  }
  
  let currentChapterId = 'intro';
  
  if (currentChapterIndex >= 0 && story && story.chapters && story.chapters[currentChapterIndex]) {
    currentChapterId = story.chapters[currentChapterIndex].id;
  }
  
  // If we switched to a different chapter, reset pause state unless it was paused for this specific chapter
  if (currentChapterWithPausedOrbit && currentChapterWithPausedOrbit !== currentChapterId) {
    // Resume orbit for new chapter
    isOrbitPaused = false;
    currentChapterWithPausedOrbit = null;
    
    const pauseBtn = document.getElementById('orbit-pause-btn');
    const pauseIcon = document.getElementById('pause-icon');
    const playIcon = document.getElementById('play-icon');
    
    if (pauseBtn) {
      pauseBtn.classList.remove('paused');
      pauseIcon.style.display = 'block';
      playIcon.style.display = 'none';
    }
    
    // Google Maps 3D handles camera controls automatically
  }
}

/**
 * Scroll places navigation
 */
window.scrollPlaces = function(direction) {
  const container = document.getElementById('places-scroll-container');
  if (!container) return;
  
  const scrollAmount = 150;
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    // Vertical scrolling on mobile
    if (direction === 'prev') {
      container.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    } else {
      container.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    }
  } else {
    // Horizontal scrolling on desktop
    if (direction === 'prev') {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  }
  
  // Update button states after scroll
  setTimeout(() => updateScrollButtons(), 100);
};

/**
 * Update scroll button states based on scroll position
 */
function updateScrollButtons() {
  const container = document.getElementById('places-scroll-container');
  const prevBtn = document.querySelector('.nav-scroll-btn.prev');
  const nextBtn = document.querySelector('.nav-scroll-btn.next');
  
  if (container && prevBtn && nextBtn) {
    const isMobile = window.innerWidth <= 768;
    
    let isAtStart, isAtEnd;
    
    if (isMobile) {
      // Vertical scrolling on mobile
      isAtStart = container.scrollTop <= 0;
      isAtEnd = container.scrollTop >= (container.scrollHeight - container.clientHeight);
    } else {
      // Horizontal scrolling on desktop
      isAtStart = container.scrollLeft <= 0;
      isAtEnd = container.scrollLeft >= (container.scrollWidth - container.clientWidth);
    }
    
    prevBtn.disabled = isAtStart;
    nextBtn.disabled = isAtEnd;
  }
}

/* ============================================
 * GALLERY AND TAB FUNCTIONALITY
 * ============================================ */

// Gallery state
let currentGalleryIndex = 0;
let currentGalleryImages = [];

/**
 * Initialize the photo gallery for a chapter
 */
function initializeGallery(chapter) {
  const galleryTrack = document.getElementById('gallery-track');
  const galleryDots = document.getElementById('gallery-dots');

  if (!galleryTrack || !galleryDots || !chapter) return;

  // Prepare images array
  currentGalleryImages = [];

  // Use chapter.images array if available, otherwise fall back to single imageUrl
  if (chapter.images && chapter.images.length > 0) {
    // Use the images array from chapter data
    chapter.images.forEach(image => {
      currentGalleryImages.push({
        url: image.url,
        credit: image.credit || chapter.imageCredit || ''
      });
    });
  } else if (chapter.gallery && chapter.gallery.length > 0) {
    // Use gallery array (URLs only)
    chapter.gallery.forEach(url => {
      currentGalleryImages.push({
        url: url,
        credit: chapter.imageCredit || ''
      });
    });
  } else if (chapter.imageUrl) {
    // Fallback: use the single imageUrl (logo)
    currentGalleryImages.push({
      url: chapter.imageUrl,
      credit: chapter.imageCredit || ''
    });
  }

  // Clear previous content
  galleryTrack.innerHTML = '';
  galleryDots.innerHTML = '';
  currentGalleryIndex = 0;

  // Create gallery slides
  currentGalleryImages.forEach((image, index) => {
    // Create slide
    const slide = document.createElement('div');
    slide.className = 'gallery-slide';

    // Create image with lazy loading (gallery images aren't immediately visible)
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = chapter.title;
    img.loading = 'lazy'; // Lazy load gallery images

    slide.appendChild(img);
    galleryTrack.appendChild(slide);

    // Create dot
    const dot = document.createElement('div');
    dot.className = `gallery-dot ${index === 0 ? 'active' : ''}`;
    dot.onclick = () => goToGallerySlide(index);
    galleryDots.appendChild(dot);
  });

  // Update gallery transform
  updateGalleryPosition();
  updateImageCredit();

  // Update navigation button visibility
  updateGalleryNavigation();
}

/**
 * Navigate gallery by direction
 */
window.navigateGallery = function(direction) {
  if (currentGalleryImages.length <= 1) return;

  currentGalleryIndex += direction;

  // Handle wraparound
  if (currentGalleryIndex >= currentGalleryImages.length) {
    currentGalleryIndex = 0;
  } else if (currentGalleryIndex < 0) {
    currentGalleryIndex = currentGalleryImages.length - 1;
  }

  updateGalleryPosition();
  updateImageCredit();
  updateGalleryDots();
};

/**
 * Go to specific gallery slide
 */
function goToGallerySlide(index) {
  if (index >= 0 && index < currentGalleryImages.length) {
    currentGalleryIndex = index;
    updateGalleryPosition();
    updateImageCredit();
    updateGalleryDots();
  }
}

/**
 * Update gallery transform position
 */
function updateGalleryPosition() {
  const galleryTrack = document.getElementById('gallery-track');
  if (galleryTrack) {
    const translateX = -currentGalleryIndex * 100;
    galleryTrack.style.transform = `translateX(${translateX}%)`;
  }
}

/**
 * Update gallery dots active state
 */
function updateGalleryDots() {
  const dots = document.querySelectorAll('.gallery-dot');
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === currentGalleryIndex);
  });
}

/**
 * Update image credit display
 */
function updateImageCredit() {
  const creditElement = document.getElementById('image-credit');
  if (creditElement && currentGalleryImages[currentGalleryIndex]) {
    creditElement.textContent = currentGalleryImages[currentGalleryIndex].credit;
  }
}

/**
 * Update gallery navigation button visibility
 */
function updateGalleryNavigation() {
  const prevBtn = document.querySelector('.gallery-prev');
  const nextBtn = document.querySelector('.gallery-next');

  if (prevBtn && nextBtn) {
    const showNavigation = currentGalleryImages.length > 1;
    prevBtn.style.display = showNavigation ? 'flex' : 'none';
    nextBtn.style.display = showNavigation ? 'flex' : 'none';
  }
}

/**
 * Switch between tabs
 */
window.switchTab = function(tabId) {
  // Remove active class from all tabs and panels
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => btn.classList.remove('active'));
  tabPanels.forEach(panel => panel.classList.remove('active'));

  // Add active class to clicked tab and corresponding panel
  const activeTabButton = document.querySelector(`[data-tab="${tabId}"]`);
  const activeTabPanel = document.getElementById(`${tabId}-panel`);

  if (activeTabButton) activeTabButton.classList.add('active');
  if (activeTabPanel) activeTabPanel.classList.add('active');
};

// ============================================
// CATEGORY NAVIGATION MENU
// ============================================

/**
 * Build category index from all chapters
 * Groups entities by their etiquetas (tags)
 */
function buildCategoryIndex() {
  const index = {
    ubicacion: {},
    sector: {},
    profesion: {},
    tipo: {}
  };

  story.chapters.forEach(chapter => {
    if (!chapter.etiquetas) return;

    Object.keys(index).forEach(category => {
      const tags = chapter.etiquetas[category] || [];
      tags.forEach(tag => {
        if (!index[category][tag]) {
          index[category][tag] = [];
        }
        index[category][tag].push({
          id: chapter.id,
          title: chapter.title,
          logoUrl: chapter.logoUrl
        });
      });
    });
  });

  return index;
}

/**
 * Render category content for a specific category tab
 * @param {string} category - The category to render
 * @param {string} filter - Optional search filter
 */
function renderCategoryContent(category, filter = '') {
  const content = document.getElementById('category-content');
  if (!content || !story || !story.chapters) return;

  const index = buildCategoryIndex();
  const groups = index[category] || {};

  // Sort groups alphabetically
  let sortedGroups = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0], 'es'));

  // Apply filter if provided
  if (filter) {
    sortedGroups = sortedGroups.map(([groupName, items]) => {
      // Check if group name matches
      const groupMatches = groupName.toLowerCase().includes(filter);

      // Filter items that match
      const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(filter)
      );

      // Include group if name matches or has matching items
      if (groupMatches || filteredItems.length > 0) {
        return [groupName, groupMatches ? items : filteredItems];
      }
      return null;
    }).filter(Boolean);
  }

  if (sortedGroups.length === 0) {
    content.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8;">No se encontraron resultados</div>';
    return;
  }

  content.innerHTML = sortedGroups.map(([groupName, items]) => {
    // Auto-expand groups when filtering
    const expanded = filter ? 'expanded' : '';
    return `
      <div class="category-group ${expanded}">
        <div class="category-group-header" onclick="toggleCategoryGroup(this)">
          <span class="category-expand-icon">▸</span>
          <span class="category-group-name">${groupName}</span>
          <span class="category-group-count">${items.length}</span>
        </div>
        <div class="category-group-items">
          ${items.map(item => `
            <div class="category-item" onclick="navigateToChapter(${item.id})" title="${item.title}">
              ${item.title}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Switch category tab
 */
window.switchCategoryTab = function(category) {
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === category);
  });
  // Keep current search filter when switching tabs
  renderCategoryContent(category, currentSearchQuery);
};

/**
 * Toggle category group expand/collapse
 */
window.toggleCategoryGroup = function(header) {
  const group = header.parentElement;
  group.classList.toggle('expanded');
};

// Store current search query
let currentSearchQuery = '';

/**
 * Search/filter within current category
 */
window.searchCategories = function(query) {
  currentSearchQuery = query.trim().toLowerCase();

  // Get current active category
  const activeTab = document.querySelector('.category-tab.active');
  const category = activeTab ? activeTab.dataset.category : 'ubicacion';

  // Re-render with filter applied
  renderCategoryContent(category, currentSearchQuery);
};

/**
 * Initialize category menu
 */
function initCategoryMenu() {
  // Render initial content (Ubicación tab is active by default)
  renderCategoryContent('ubicacion');
}

/**
 * Extract URLs from content text
 */
function extractUrls(content) {
  if (!content) return [];

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = content.match(urlRegex);
  return matches || [];
}

// Note: enhancedLocationData removed - addresses now come directly from config.json

/**
 * Populate the information tab
 */
function populateInfoTab(chapter, isIntro = false) {
  // Title
  const titleElement = document.querySelector('.place-title');
  if (titleElement) {
    titleElement.textContent = isIntro ? chapter.title : chapter.title;
  }

  // Address/Location - uses correct address from config.json
  const addressElement = document.querySelector('.place-address');
  if (addressElement) {
    addressElement.textContent = chapter.address || chapter.placeName || 'Ubicación no disponible';
  }

  // Date/Period
  const dateElement = document.querySelector('.place-date');
  if (dateElement) {
    const date = isIntro ? chapter.date : (chapter.dateTime || 'Fecha no disponible');
    dateElement.textContent = date;
  }

  // Description
  const descriptionElement = document.querySelector('.place-description');
  if (descriptionElement) {
    const description = isIntro ? chapter.description : (chapter.content || 'Descripción no disponible');
    // Format the text properly with line breaks
    descriptionElement.innerHTML = description.replace(/\n/g, '<br>');
  }
}

/**
 * Populate the links tab
 */
function populateLinksTab(chapter) {
  const officialLinksContainer = document.getElementById('official-links');
  if (!officialLinksContainer) return;

  // Clear existing content
  officialLinksContainer.innerHTML = '';
  let hasLinks = false;

  // Add chapter website if available
  if (chapter.website) {
    hasLinks = true;
    const domain = new URL(chapter.website).hostname.replace('www.', '');
    const linkElement = document.createElement('a');
    linkElement.href = chapter.website;
    linkElement.target = '_blank';
    linkElement.className = 'link-item';
    linkElement.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M18 13V6A2 2 0 0 0 16 4H4A2 2 0 0 0 2 6V18C2 19.1 2.9 20 4 20H20A2 2 0 0 0 22 18V8H18" stroke="currentColor" stroke-width="2"/>
        <path d="M15 3H21V9M10 14L21 3" stroke="currentColor" stroke-width="2"/>
      </svg>
      <div>
        <span class="link-title">${chapter.title} - Sitio Oficial</span>
        <span class="link-desc">${domain}</span>
      </div>
    `;
    officialLinksContainer.appendChild(linkElement);
  }

  // Also extract URLs from chapter content
  const urls = extractUrls(chapter.content);
  if (urls.length > 0) {
    urls.forEach(url => {
      // Skip if same as chapter website
      if (chapter.website && url === chapter.website) return;

      hasLinks = true;
      try {
        const domain = new URL(url).hostname.replace('www.', '');

        const linkElement = document.createElement('a');
        linkElement.href = url;
        linkElement.target = '_blank';
        linkElement.className = 'link-item';
        linkElement.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 13V6A2 2 0 0 0 16 4H4A2 2 0 0 0 2 6V18C2 19.1 2.9 20 4 20H20A2 2 0 0 0 22 18V8H18" stroke="currentColor" stroke-width="2"/>
            <path d="M15 3H21V9M10 14L21 3" stroke="currentColor" stroke-width="2"/>
          </svg>
          <div>
            <span class="link-title">${domain}</span>
            <span class="link-desc">Información adicional</span>
          </div>
        `;
        officialLinksContainer.appendChild(linkElement);
      } catch (e) {
        // Invalid URL, skip
      }
    });
  }

  // If no links were found, show default message
  if (!hasLinks) {
    officialLinksContainer.innerHTML = `
      <div style="text-align: center; color: #94a3b8; padding: 20px;">
        <p>No hay enlaces oficiales disponibles</p>
      </div>
    `;
  }
}

/**
 * Populate tags tab with chapter tags
 */
function populateTagsTab(chapter) {
  // Clear existing tags
  const tagContainers = {
    'location-tags': 'ubicacion',
    'sector-tags': 'sector',
    'profession-tags': 'profesion',
    'type-tags': 'tipo'
  };

  Object.entries(tagContainers).forEach(([containerId, tagType]) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // Get tags for this category
    const tags = chapter.etiquetas && chapter.etiquetas[tagType] ? chapter.etiquetas[tagType] : [];

    if (tags.length > 0) {
      tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = `tag ${tagType}`;
        tagElement.textContent = tag;
        container.appendChild(tagElement);
      });
    } else {
      // Show placeholder if no tags
      const placeholder = document.createElement('span');
      placeholder.className = 'tag-placeholder';
      placeholder.textContent = 'No disponible';
      placeholder.style.color = '#94a3b8';
      placeholder.style.fontStyle = 'italic';
      placeholder.style.fontSize = '12px';
      container.appendChild(placeholder);
    }
  });
}

/**
 * Update all tab content for a chapter
 */
function updateTabContent(chapter, isIntro = false) {
  populateInfoTab(chapter, isIntro);
  populateLinksTab(chapter);
  populateTagsTab(chapter);

  // Initialize gallery
  initializeGallery(chapter);

  // Reset to info tab
  switchTab('info');
}

// Make updateTabContent available globally
window.updateTabContent = updateTabContent;

/* ============================================
 * FULLSCREEN FUNCTIONALITY
 * ============================================ */

let isFullscreen = false;
let originalStyles = {};

/**
 * Toggle fullscreen mode for the bottom sheet
 */
window.toggleFullscreen = function() {
  const bottomSheet = document.getElementById('bottom-sheet');

  if (!bottomSheet) return;

  if (!isFullscreen) {
    // Store original styles
    const rect = bottomSheet.getBoundingClientRect();
    const computedStyle = getComputedStyle(bottomSheet);

    originalStyles = {
      position: computedStyle.position,
      top: computedStyle.top,
      left: computedStyle.left,
      right: computedStyle.right,
      bottom: computedStyle.bottom,
      width: computedStyle.width,
      height: computedStyle.height,
      zIndex: computedStyle.zIndex
    };

    // Set CSS custom properties for animation
    bottomSheet.style.setProperty('--original-top', rect.top + 'px');
    bottomSheet.style.setProperty('--original-left', rect.left + 'px');
    bottomSheet.style.setProperty('--original-right', (window.innerWidth - rect.right) + 'px');
    bottomSheet.style.setProperty('--original-bottom', (window.innerHeight - rect.bottom) + 'px');
    bottomSheet.style.setProperty('--original-width', rect.width + 'px');
    bottomSheet.style.setProperty('--original-height', rect.height + 'px');

    // Remove minimized class if present
    bottomSheet.classList.remove('minimized');

    // Add fullscreen class
    bottomSheet.classList.add('fullscreen');
    isFullscreen = true;

  } else {
    // Exit fullscreen
    bottomSheet.classList.remove('fullscreen');
    bottomSheet.classList.add('fullscreen-exit');

    // Wait for animation to complete, then restore original styles
    setTimeout(() => {
      bottomSheet.classList.remove('fullscreen-exit');

      // Clear custom properties
      bottomSheet.style.removeProperty('--original-top');
      bottomSheet.style.removeProperty('--original-left');
      bottomSheet.style.removeProperty('--original-right');
      bottomSheet.style.removeProperty('--original-bottom');
      bottomSheet.style.removeProperty('--original-width');
      bottomSheet.style.removeProperty('--original-height');

      isFullscreen = false;
    }, 400); // Match animation duration
  }
};

/**
 * Handle escape key to exit fullscreen
 */
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && isFullscreen) {
    toggleFullscreen();
  }
});

// Call main (UI initialization happens inside main())
await main();

// Handle window resize for responsive scroll buttons
window.addEventListener('resize', () => {
  setTimeout(() => updateScrollButtons(), 100);
});

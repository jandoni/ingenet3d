import { initCesiumViewer, cesiumViewer } from "./utils/cesium.js";
import { loadConfig } from "./utils/config.js";
import createMarkers from "./utils/create-markers.js";
import { addChaptersBar } from "./chapters/chapters.js";
import { initGoogleMaps } from "./utils/places.js";
import { initChapterNavigation, updateChapter, resetToIntro, getCurrentChapterIndex } from "./chapters/chapter-navigation.js";
import { initGoogleMapsServicesNew, resolvePlaceToCameraNew } from "./utils/places-new-api.js";
import { simpleGeocodeToCamera } from "./utils/simple-geocoder.js";

/**
 * The story configuration object
 * @type {Story}
 */
export const story = await loadConfig("./config.json");
const { chapters } = story;

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
    console.log(`✅ Details already loaded for ${chapter.title}`);
    return chapter;
  }
  
  try {
    console.log(`🔄 LOADING DETAILS FOR: ${chapter.title} (ID: ${chapterId})`);
    console.log(`💰 API CALL STARTING - This will cost money!`);
    
    // Initialize Google APIs if not already done
    if (!window.googleMapsLoaded) {
      console.log(`🔑 Initializing Google Maps APIs...`);
      await initGoogleMaps();
      initGoogleMapsServicesNew();
      window.googleMapsLoaded = true;
      console.log(`✅ Google Maps APIs initialized`);
    }
    
    let cameraConfig;
    
    // Try NEW Places API first, fallback to simple geocoder
    try {
      console.log(`🆕 Trying NEW Places API for: ${chapter.placeName}`);
      cameraConfig = await resolvePlaceToCameraNew(chapter.placeName, 'static');
      console.log(`✅ NEW Places API successful for: ${chapter.title}`);
    } catch (placesError) {
      console.warn(`⚠️ NEW Places API failed for ${chapter.title}, trying simple geocoder...`);
      console.log(`🗺️ Trying simple geocoder for: ${chapter.placeName}`);
      cameraConfig = await simpleGeocodeToCamera(chapter.placeName, 'static');
      console.log(`✅ Simple geocoder successful for: ${chapter.title}`);
    }
    
    // Store camera configuration and place details
    if (cameraConfig) {
      chapter.cameraConfig = cameraConfig;
      console.log(`📍 Camera config stored for: ${chapter.title}`);
      
      if (cameraConfig.placeDetails) {
        chapter.placeDetails = cameraConfig.placeDetails;
        console.log(`📋 Place details stored for: ${chapter.title}`);
        
        // Optionally update content with Google's editorial summary
        if (cameraConfig.placeDetails.editorialSummary && !chapter.content) {
          chapter.content = cameraConfig.placeDetails.editorialSummary;
          console.log(`📝 Content updated with editorial summary for: ${chapter.title}`);
        }
      }
    }
    
    chapter.detailsLoaded = true;
    console.log(`✅ DETAILS LOADED SUCCESSFULLY FOR: ${chapter.title}`);
    
  } catch (error) {
    console.error(`💥 FAILED to load details for ${chapter.title}:`, error);
    console.trace('Error stack:');
  }
  
  return chapter;
}

/**
 * Create basic markers from chapter data without API calls
 */
async function createBasicMarkers(chapters) {
  console.log('📍 Creating basic markers for initial display...');
  
  // Simple hardcoded coordinates for Spanish landmarks to avoid API calls
  const basicCoordinates = {
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
  
  try {
    // Only create markers for chapters with known coordinates
    let markerCount = 0;
    
    for (const chapter of chapters) {
      const coords = basicCoordinates[chapter.id];
      if (coords) {
        // Create a simple billboard marker
        const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 100);
        
        cesiumViewer.entities.add({
          id: `marker-${chapter.id}`,
          name: chapter.title,
          position: position,
          billboard: {
            image: 'assets/icons/marker.svg',
            scale: 0.6,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
          },
          properties: {
            chapterId: chapter.id,
            title: chapter.title
          }
        });
        
        markerCount++;
      }
    }
    
    console.log(`✅ Created ${markerCount} basic markers without API calls`);
    
    // Set up click handler for markers
    setupMarkerClickHandler();
    
  } catch (error) {
    console.error('❌ Failed to create basic markers:', error);
  }
}

/**
 * Set up click handler for markers
 */
function setupMarkerClickHandler() {
  // Remove any existing handler
  if (window.markerHandler) {
    window.markerHandler.destroy();
  }
  
  // Create new click handler
  window.markerHandler = new Cesium.ScreenSpaceEventHandler(cesiumViewer.scene.canvas);
  
  window.markerHandler.setInputAction(async function onMouseClick(click) {
    const pickedObject = cesiumViewer.scene.pick(click.position);
    
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
      const chapterId = pickedObject.id.properties.chapterId;
      console.log(`📍 Marker clicked for chapter: ${chapterId}`);
      
      // Find the chapter index
      const chapterIndex = chapters.findIndex(ch => ch.id === chapterId);
      if (chapterIndex >= 0) {
        // Load chapter details first
        await loadChapterDetails(chapterId);
        
        // Now navigate to the location
        updateChapter(chapterIndex);
        setActivePlace(chapterId);
        showSheetHint();
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
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
  console.log('🏁 STARTING MAIN INITIALIZATION...');
  
  try {
    // Show initial UI immediately with curated images
    console.log('📱 Initializing UI...');
    initializeNewUI();
    
    // Initialize Cesium first for fast map display
    console.log('🌍 Initializing Cesium viewer...');
    await initCesiumViewer();
    
    // Hide loading screen after Cesium is ready
    console.log('✨ Hiding loading screen...');
    hideLoadingScreen();
    
    // Initialize chapter navigation with basic data
    console.log('🧭 Initializing chapter navigation...');
    initChapterNavigation();
    
    // Create basic markers from chapter coordinates (no API calls needed)
    console.log('📍 Creating basic markers...');
    await createBasicMarkers(chapters);
    
    console.log('🎉 MAIN INITIALIZATION COMPLETE - NO API CALLS MADE YET');
    
  } catch (error) {
    console.error('💥 Critical error during initialization:', error);
    console.trace('Error stack:');
    // Hide loading screen even on error
    hideLoadingScreen();
  }
}

/**
 * Hide the loading screen after initialization
 */
function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    // Remove from DOM after transition
    setTimeout(() => {
      loadingScreen.remove();
    }, 300);
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
  console.log('🚀 STARTING UI INITIALIZATION...');
  
  // Clear any existing content to prevent duplicates
  const placesList = document.getElementById('places-list');
  if (placesList.children.length > 0) {
    console.warn('⚠️ PLACES LIST ALREADY HAS CONTENT, CLEARING...');
    placesList.innerHTML = '';
  }
  
  const chapters = story.chapters;
  console.log(`📍 Loading ${chapters.length} places...`);
  
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
  
  // Add intro image
  const introImg = document.createElement('img');
  introImg.src = story.properties.imageUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="%233b82f6"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial" font-size="12">Explorar España</text></svg>';
  introImg.alt = 'Explorar España';
  introCard.appendChild(introImg);
  
  // Add intro title
  const introTitle = document.createElement('div');
  introTitle.className = 'place-card-title';
  introTitle.textContent = 'Explorar España';
  introCard.appendChild(introTitle);
  
  placesList.appendChild(introCard);
  
  chapters.forEach((chapter, index) => {
    console.log(`📱 Creating place card for: ${chapter.title} (ID: ${chapter.id})`);
    
    const placeCard = document.createElement('div');
    placeCard.className = 'place-card';
    placeCard.dataset.chapterId = chapter.id;
    
    // Add click handler with on-demand loading
    placeCard.onclick = async () => {
      console.log(`🖱️ User clicked on: ${chapter.title}`);
      setActivePlace(chapter.id);
      
      // Load chapter details on-demand
      await loadChapterDetails(chapter.id);
      
      // Now update the chapter view
      updateChapter(index);
      
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
      console.log(`🖼️ Loading image for ${chapter.title}: ${chapter.imageUrl}`);
      
      // Add a small delay for each image to prevent rate limiting
      setTimeout(() => {
        // Check if image element still exists (hasn't been removed)
        if (!img.parentNode) {
          console.log(`⚠️ Image element removed before loading for ${chapter.title}`);
          return;
        }
        
        img.src = chapter.imageUrl;
      }, index * 50); // 50ms delay between each image
      
      img.onerror = (e) => {
        console.error(`❌ FAILED to load image for ${chapter.title}:`, chapter.imageUrl);
        console.error('Error details:', e);
        
        // Prevent further error attempts by removing error handler
        img.onerror = null;
        
        // Fallback to a colorful placeholder with the place name
        const placeholderColor = '#3b82f6';
        img.src = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="140" height="60" viewBox="0 0 140 60"><rect width="140" height="60" fill="${placeholderColor}"/><text x="70" y="35" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${encodeURIComponent(chapter.title.substring(0, 20))}</text></svg>`;
      };
      
      img.onload = () => {
        console.log(`✅ Successfully loaded image for ${chapter.title}`);
        // Remove handlers to prevent memory leaks
        img.onload = null;
        img.onerror = null;
      };
    } else {
      console.log(`📝 No image URL for ${chapter.title}, using placeholder`);
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
  
  console.log(`✅ UI INITIALIZATION COMPLETE - Created ${chapters.length} place cards`);
  
  // Initialize bottom sheet to minimized state
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet) {
    bottomSheet.classList.add('minimized');
  }
  
  // Initialize orbit pause button state on mobile
  if (isMobile && isOrbitPaused) {
    const pauseBtn = document.getElementById('orbit-pause-btn');
    const pauseIcon = document.getElementById('pause-icon');
    const playIcon = document.getElementById('play-icon');
    
    if (pauseBtn) {
      pauseBtn.classList.add('paused');
      pauseIcon.style.display = 'none';
      playIcon.style.display = 'block';
      console.log('📱 Mobile: orbit pause button initialized to paused state');
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
 * Toggle bottom sheet
 */
window.toggleBottomSheet = function() {
  const bottomSheet = document.getElementById('bottom-sheet');
  if (bottomSheet) {
    bottomSheet.classList.toggle('minimized');
  }
};

/**
 * Orbit pause state
 */
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let isOrbitPaused = isMobile; // Start paused on mobile, playing on desktop
let currentChapterWithPausedOrbit = null;

// Make it globally available
if (typeof window !== 'undefined') {
  window.isOrbitPaused = isOrbitPaused;
}

/**
 * Toggle orbit pause for current chapter
 */
window.toggleOrbitPause = function() {
  const pauseBtn = document.getElementById('orbit-pause-btn');
  const pauseIcon = document.getElementById('pause-icon');
  const playIcon = document.getElementById('play-icon');
  
  isOrbitPaused = !isOrbitPaused;
  window.isOrbitPaused = isOrbitPaused; // Update global state
  console.log(`🎮 Orbit pause toggled: ${isOrbitPaused ? 'PAUSED' : 'PLAYING'}`);
  
  if (isOrbitPaused) {
    // Pause orbit
    pauseBtn.classList.add('paused');
    pauseIcon.style.display = 'none';
    playIcon.style.display = 'block';
    
    // Store which chapter has paused orbit
    try {
      const currentChapterIndex = getCurrentChapterIndex();
      if (currentChapterIndex >= 0 && story && story.chapters && story.chapters[currentChapterIndex]) {
        currentChapterWithPausedOrbit = story.chapters[currentChapterIndex].id;
      }
    } catch (error) {
      console.warn('⚠️ Could not store paused chapter state:', error);
      currentChapterWithPausedOrbit = 'unknown';
    }
    
    // Stop the actual orbit animation
    if (window.stopOrbitAnimation) {
      window.stopOrbitAnimation();
      console.log('✅ Orbit animation stopped');
    } else if (window.stopSpainOrbitEffect) {
      window.stopSpainOrbitEffect();
      console.log('✅ Spain orbit effect stopped');
    }
    
    // Keep camera controls enabled so user can still manually control the camera
    // The orbit pause only stops the automatic rotation, not manual control
  } else {
    // Resume orbit
    pauseBtn.classList.remove('paused');
    pauseIcon.style.display = 'block';
    playIcon.style.display = 'none';
    
    currentChapterWithPausedOrbit = null;
    
    // Resume orbit animation based on current location
    try {
      const currentChapterIndex = getCurrentChapterIndex();
      if (currentChapterIndex >= 0 && story.chapters[currentChapterIndex]) {
        const chapter = story.chapters[currentChapterIndex];
        
        // Check if we should restart an orbit animation
        if (chapter.cameraStyle === 'drone-orbit' && window.startOrbitAnimation) {
          const coords = chapter.cameraConfig?.coordinates || { lat: 40.4168, lng: -3.7038 };
          window.startOrbitAnimation(coords);
          console.log('✅ Orbit animation restarted');
        }
      } else {
        // We're at the intro/Spain overview
        if (window.startSpainOrbitEffect) {
          window.startSpainOrbitEffect();
          console.log('✅ Spain orbit effect restarted');
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not restart orbit:', error);
    }
    
    // Re-enable camera controls
    if (cesiumViewer && cesiumViewer.scene && cesiumViewer.scene.screenSpaceCameraController) {
      cesiumViewer.scene.screenSpaceCameraController.enableRotate = true;
      cesiumViewer.scene.screenSpaceCameraController.enableTilt = true;
      cesiumViewer.scene.screenSpaceCameraController.enableTranslate = true;
      cesiumViewer.scene.screenSpaceCameraController.enableZoom = true;
    }
  }
};

/**
 * Toggle mobile places panel
 */
window.toggleMobilePlaces = function() {
  console.log('🍔 Hamburger menu clicked');
  
  const container = document.getElementById('top-navigation-container');
  const toggleBtn = document.getElementById('mobile-places-toggle');
  const overlay = document.getElementById('mobile-overlay');
  
  if (container && toggleBtn) {
    const wasOpen = container.classList.contains('open');
    container.classList.toggle('open');
    
    const isOpen = container.classList.contains('open');
    console.log(`📱 Mobile menu is now: ${isOpen ? 'OPEN' : 'CLOSED'}`);
    
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
    
    // Resume cesium camera controller
    if (cesiumViewer && cesiumViewer.scene && cesiumViewer.scene.screenSpaceCameraController) {
      cesiumViewer.scene.screenSpaceCameraController.enableRotate = true;
      cesiumViewer.scene.screenSpaceCameraController.enableTilt = true;
      cesiumViewer.scene.screenSpaceCameraController.enableTranslate = true;
      cesiumViewer.scene.screenSpaceCameraController.enableZoom = true;
    } else {
      console.warn('CesiumViewer not available for resuming');
    }
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

// Call main (UI initialization happens inside main())
await main();

// Handle window resize for responsive scroll buttons
window.addEventListener('resize', () => {
  setTimeout(() => updateScrollButtons(), 100);
});

import { initCesiumViewer, cesiumViewer } from "./utils/cesium.js";
import { loadConfig } from "./utils/config.js";
import createMarkers from "./utils/create-markers.js";
import { addChaptersBar } from "./chapters/chapters.js";
import { initGoogleMaps } from "./utils/places.js";
import { initChapterNavigation, updateChapter, resetToIntro, getCurrentChapterIndex } from "./chapters/chapter-navigation.js";
import { initGoogleMapsServicesNew, resolvePlaceToCameraNew } from "./utils/places-new-api.js";
import { simpleGeocodeToCamera } from "./utils/simple-geocoder.js";
import { initChatbot } from "./utils/chatbot.js";

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
 * Truncate text to specified length with ellipsis
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Create basic markers from chapter data without API calls
 */
async function createBasicMarkers(chapters) {
  console.log('📍 Creating basic markers for initial display...');
  
  // Simple hardcoded coordinates for Spanish landmarks to avoid API calls
  const basicCoordinates = {
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
  
  try {
    // Only create markers for chapters with known coordinates
    let markerCount = 0;
    
    for (const chapter of chapters) {
      const coords = basicCoordinates[chapter.id];
      if (coords) {
        // Create a position slightly above ground for better visibility
        const position = Cesium.Cartesian3.fromDegrees(coords.lng, coords.lat, 200);
        
        // Create marker entity with both billboard and label
        const entity = cesiumViewer.entities.add({
          id: `marker-${chapter.id}`,
          name: chapter.title,
          position: position,
          billboard: {
            image: 'data:image/svg+xml;base64,' + btoa(`
              <svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
                  </filter>
                </defs>
                <circle cx="14" cy="14" r="12" fill="white" stroke="rgba(0,0,0,0.2)" stroke-width="1" filter="url(#shadow)"/>
                <circle cx="14" cy="14" r="6" fill="#f1f5f9" stroke="rgba(0,0,0,0.1)" stroke-width="1"/>
                <circle cx="14" cy="14" r="3" fill="#64748b"/>
              </svg>
            `),
            scale: 1.2,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1000, 1.2, 15000, 0.9)
          },
          label: {
            text: truncateText(chapter.title, 20), // Truncate long titles
            font: 'bold 13pt Arial, sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            fillColor: Cesium.Color.WHITE, // White text for better visibility
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 3, // Thicker outline for better contrast
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            pixelOffset: new Cesium.Cartesian2(0, -35), // Position label above marker
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
    
    // Set up hover effects for markers
    setupMarkerHoverEffects();
    
  } catch (error) {
    console.error('❌ Failed to create basic markers:', error);
  }
}

// Note: Marker click handlers are now managed by the unified marker system in create-markers.js

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
    
    // Create unified markers using the advanced marker system
    console.log('📍 Creating unified markers...');
    await createMarkers(chapters);

    // Initialize the chatbot with story data
    console.log('🤖 Initializing chatbot...');
    initChatbot(story);

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
      console.log(`🖱️ User clicked on: ${chapter.title} (index: ${index})`);
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
 * Go to home/root page (Spain overview)
 * Called by home button and IEE logo click
 */
window.goToHome = function() {
  console.log('🏠 Going to home page');
  resetToIntro();
};

/**
 * Navigate to a chapter by ID - reusable function for both horizontal bar and markers
 * @param {number} chapterId - The chapter ID to navigate to
 * @param {number} chapterIndex - The chapter index (optional, will be calculated if not provided)
 */
window.navigateToChapter = async function(chapterId, chapterIndex = null) {
  console.log(`🖱️ Navigating to chapter: ${chapterId}`);

  // Calculate index if not provided
  if (chapterIndex === null) {
    chapterIndex = story.chapters.findIndex(ch => ch.id == chapterId);
  }

  if (chapterIndex === -1) {
    console.error(`🚨 Chapter not found for ID: ${chapterId}`);
    return;
  }

  const chapter = story.chapters[chapterIndex];
  console.log(`📍 Navigating to: ${chapter.title} (index: ${chapterIndex})`);

  // Update active place in horizontal navigation
  setActivePlace(chapterId);

  // Load chapter details on-demand
  await loadChapterDetails(chapterId);

  // Navigate to the chapter
  updateChapter(chapterIndex);
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
    
    // Stop the actual orbit animation - try all possible orbit types
    let orbitStopped = false;
    if (window.stopOrbitAnimation) {
      window.stopOrbitAnimation();
      console.log('✅ Location orbit animation stopped');
      orbitStopped = true;
    }
    if (window.stopSpainOrbitEffect) {
      window.stopSpainOrbitEffect();
      console.log('✅ Spain overview orbit stopped');
      orbitStopped = true;
    }
    if (!orbitStopped) {
      console.warn('⚠️ No orbit animation found to stop');
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
      console.log(`🔄 Current chapter index for orbit restart: ${currentChapterIndex}`);
      
      if (currentChapterIndex >= 0 && story.chapters[currentChapterIndex]) {
        const chapter = story.chapters[currentChapterIndex];
        console.log(`📍 Restarting orbit for chapter: ${chapter.title} (style: ${chapter.cameraStyle})`);
        
        // Check if we should restart an orbit animation
        if (chapter.cameraStyle === 'drone-orbit' && window.startOrbitAnimation) {
          const coords = chapter.cameraConfig?.coordinates || { lat: 40.4168, lng: -3.7038 };
          window.startOrbitAnimation(coords);
          console.log('✅ Location orbit animation restarted');
        }
      } else {
        // We're at the intro/Spain overview - rotation disabled, map stays static
        console.log('🗺️ At Spain overview - rotation disabled');
      }
    } catch (error) {
      console.warn('⚠️ Could not restart orbit:', error);
      console.error('Error details:', error);
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

  // Prepare images array (for now, we'll use the main image multiple times with related images)
  currentGalleryImages = [];

  // Add the main chapter image
  if (chapter.imageUrl) {
    currentGalleryImages.push({
      url: chapter.imageUrl,
      credit: chapter.imageCredit || ''
    });
  }

  // For now, add some placeholder related images (in a real implementation,
  // these would come from an expanded data structure)
  if (chapter.imageUrl) {
    // Add the same image as placeholder for gallery demonstration
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
    slide.innerHTML = `<img src="${image.url}" alt="${chapter.title}" />`;
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

/**
 * Extract URLs from content text
 */
function extractUrls(content) {
  if (!content) return [];

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = content.match(urlRegex);
  return matches || [];
}

/**
 * Enhanced location data with real information
 */
const enhancedLocationData = {
  1: { // Fundación Exponav
    openingHours: "Consultar horarios en el sitio web oficial. Visitas concertadas disponibles",
    ticketInfo: "Entrada gratuita. Visitas guiadas disponibles previa cita. Centro educativo especializado",
    address: "Edificio Herrerías, Cantón de Molins s/n, 15490 Ferrol (A Coruña)",
    officialLinks: [
      { url: "https://exponav.org/", title: "Fundación Exponav", description: "Museo de Construcción Naval - Sitio oficial" }
    ]
  },
  2: { // Fundación Excelem
    openingHours: "Lunes a viernes horario comercial. Consultar para actividades específicas",
    ticketInfo: "Centro de formación y robótica. Participación en concursos y actividades STEAM",
    address: "Polígono Industrial Oeste, Calle Perú, 5, 30820 Alcantarilla, Murcia",
    officialLinks: [
      { url: "https://excelem.org/", title: "Fundación Excelem", description: "Ecosistema de Robótica y Automatización" }
    ]
  },
  3: { // MUCAIN
    openingHours: "Museo virtual disponible 24/7 online. Consultar eventos presenciales",
    ticketInfo: "Acceso gratuito al museo virtual. Contenido audiovisual educativo de alta calidad",
    address: "Plaza de la Catedral, 11005 Cádiz",
    officialLinks: [
      { url: "https://mucain.com/", title: "MUCAIN", description: "Museo Virtual de la Carrera de Indias" }
    ]
  },
  4: { // Museo Histórico Minero UPM
    openingHours: "Visitas concertadas. Consultar en la ETS de Ingenieros de Minas y Energía",
    ticketInfo: "Entrada gratuita con visita guiada. Más de 10,000 minerales, fósiles e instrumentos históricos",
    address: "C. de Ríos Rosas, 21, 28003 Madrid",
    officialLinks: [
      { url: "https://minasyenergia.upm.es/museo/", title: "Museo Histórico-Minero UPM", description: "Universidad Politécnica de Madrid" }
    ]
  },
  5: { // Sagrada Familia
    openingHours: "Nov-Feb: Lun-Sáb 9:00-18:00, Dom 10:30-18:00. Mar-Oct: Lun-Vie 9:00-19:00, Sáb 9:00-18:00, Dom 10:30-19:00. Abr-Sep: Lun-Vie 9:00-20:00, Sáb 9:00-18:00, Dom 10:30-20:00",
    ticketInfo: "Niños menores de 10 años: gratis. Audioguía incluida en app oficial (19 idiomas). Cancelaciones hasta 48h antes.",
    address: "C/ Mallorca, 401, 08013 Barcelona",
    officialLinks: [
      { url: "https://sagradafamilia.org/", title: "Sagrada Família - Sitio Oficial", description: "Web oficial para compra de entradas sin comisiones" }
    ]
  },
  6: { // Prado Museum
    openingHours: "Lun-Sáb: 10:00-20:00. Dom y festivos: 10:00-19:00. Entrada gratuita: Lun-Sáb 18:00-20:00, Dom 17:00-19:00",
    ticketInfo: "Entrada general: 18-20€. Con audioguía: 22-26€. Pase Triángulo del Arte (Prado + Reina Sofía + Thyssen): 40-60€",
    address: "C/ Ruiz de Alarcón, 23, 28014 Madrid",
    officialLinks: [
      { url: "https://www.museodelprado.es/", title: "Museo Nacional del Prado", description: "Sitio web oficial del museo" }
    ]
  },
  7: { // Park Güell
    openingHours: "9:30-19:30 (Jul-Ago: 9:00-19:30). BON DIA BARCELONA: 7:00-9:30 solo residentes",
    ticketInfo: "Adultos: 10-18€. Niños 7-12 años: 7-13.50€. Menores de 7 años: gratis. Compra anticipada obligatoria",
    address: "08024 Barcelona",
    officialLinks: [
      { url: "https://parkguell.barcelona/", title: "Park Güell - Sitio Oficial", description: "Web oficial del parque diseñado por Gaudí" }
    ]
  },
  8: { // Alhambra
    openingHours: "Temporada alta (Abr-Oct): 8:30-20:00. Temporada baja: 8:30-18:00. Cerrado 25 Dic y 1 Ene",
    ticketInfo: "Entrada general diurna, jardines y visitas nocturnas. Reserva hasta 1 año antes. Entrada 1h antes del cierre",
    address: "C/ Real de la Alhambra, s/n, 18009 Granada",
    officialLinks: [
      { url: "https://www.alhambra.org/", title: "Alhambra y Generalife", description: "Portal oficial de la Alhambra de Granada" }
    ]
  },
  10: { // Guggenheim
    openingHours: "Consultar horarios especiales y días cerrados en el sitio oficial. Cerrado 25 Dic y 1 Ene",
    ticketInfo: "Descuentos especiales último día de cada exposición (50% desde las 16:00). Precios variables según visitante",
    address: "Abandoibarra Etorb., 2, 48009 Bilbao, Bizkaia",
    officialLinks: [
      { url: "https://www.guggenheim-bilbao.eus/", title: "Museo Guggenheim Bilbao", description: "Sitio web oficial del museo" }
    ]
  },
  11: { // Royal Palace
    openingHours: "Consultar horarios en el sitio oficial. Cerrado días especiales. Entrada gratuita UE: últimas 2 horas",
    ticketInfo: "Entrada gratuita ciudadanos UE: Lun-Jue últimas 2 horas. Skip-the-line disponible. Llegada recomendada 8:00",
    address: "C. de Bailén, s/n, 28071 Madrid",
    officialLinks: [
      { url: "https://tickets.patrimonionacional.es/", title: "Patrimonio Nacional", description: "Venta oficial de entradas al Palacio Real" }
    ]
  },
  12: { // Santiago Cathedral
    openingHours: "Basílica: 7:00-21:00. Museo: 10:00-20:00. Oficina del Peregrino: 9:00-19:00",
    ticketInfo: "Entrada libre a la basílica. Museo con entrada. Botafumeiro bajo petición. Compostela para peregrinos",
    address: "Praza do Obradoiro, s/n, 15705 Santiago de Compostela, A Coruña",
    officialLinks: [
      { url: "https://catedraldesantiago.es/", title: "Catedral de Santiago", description: "Sitio web oficial de la Catedral" },
      { url: "https://oficinadelperegrino.com/", title: "Oficina del Peregrino", description: "Información oficial para peregrinos" }
    ]
  }
};

/**
 * Populate the information tab
 */
function populateInfoTab(chapter, isIntro = false) {
  // Title
  const titleElement = document.querySelector('.place-title');
  if (titleElement) {
    titleElement.textContent = isIntro ? chapter.title : chapter.title;
  }

  // Address/Location
  const addressElement = document.querySelector('.place-address');
  if (addressElement) {
    let address = chapter.address || chapter.placeName || 'Ubicación no disponible';

    // Use enhanced data if available
    const enhanced = enhancedLocationData[chapter.id];
    if (enhanced && enhanced.address) {
      address = enhanced.address;
    }

    addressElement.textContent = address;
  }

  // Date/Period
  const dateElement = document.querySelector('.place-date');
  if (dateElement) {
    const date = isIntro ? chapter.date : (chapter.dateTime || 'Fecha no disponible');
    dateElement.textContent = date;
  }

  // Description - Enhanced with real information
  const descriptionElement = document.querySelector('.place-description');
  if (descriptionElement) {
    let description = isIntro ? chapter.description : (chapter.content || 'Descripción no disponible');

    // Add enhanced information for specific locations
    const enhanced = enhancedLocationData[chapter.id];
    if (enhanced) {
      description += `\n\nDIRECCIÓN:\n${enhanced.address}\n\nHORARIOS DE APERTURA:\n${enhanced.openingHours}\n\nINFORMACIÓN DE ENTRADAS:\n${enhanced.ticketInfo}`;
    }

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

  // Get enhanced links data
  const enhanced = enhancedLocationData[chapter.id];
  let hasLinks = false;

  // Add enhanced official links
  if (enhanced && enhanced.officialLinks) {
    enhanced.officialLinks.forEach(link => {
      hasLinks = true;
      const linkElement = document.createElement('a');
      linkElement.href = link.url;
      linkElement.target = '_blank';
      linkElement.className = 'link-item';
      linkElement.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M18 13V6A2 2 0 0 0 16 4H4A2 2 0 0 0 2 6V18C2 19.1 2.9 20 4 20H20A2 2 0 0 0 22 18V8H18" stroke="currentColor" stroke-width="2"/>
          <path d="M15 3H21V9M10 14L21 3" stroke="currentColor" stroke-width="2"/>
        </svg>
        <div>
          <span class="link-title">${link.title}</span>
          <span class="link-desc">${link.description}</span>
        </div>
      `;
      officialLinksContainer.appendChild(linkElement);
    });
  }

  // Also extract URLs from chapter content as fallback
  const urls = extractUrls(chapter.content);
  if (urls.length > 0) {
    urls.forEach(url => {
      // Skip if we already added this URL from enhanced data
      const alreadyAdded = enhanced && enhanced.officialLinks &&
        enhanced.officialLinks.some(link => link.url === url);

      if (!alreadyAdded) {
        hasLinks = true;
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
  const expandIcon = document.querySelector('.fullscreen-expand');
  const collapseIcon = document.querySelector('.fullscreen-collapse');

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

    // Update button icons
    if (expandIcon) expandIcon.style.display = 'none';
    if (collapseIcon) collapseIcon.style.display = 'block';

  } else {
    // Exit fullscreen
    bottomSheet.classList.remove('fullscreen');
    bottomSheet.classList.add('fullscreen-exit');

    // Update button icons
    if (expandIcon) expandIcon.style.display = 'block';
    if (collapseIcon) collapseIcon.style.display = 'none';

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

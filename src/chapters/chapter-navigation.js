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

import { story } from "../main.js";
import {
  createCustomRadiusShader,
  performFlyTo,
  removeCustomRadiusShader,
  setSpainOverviewFromGoogleEarthExported,
  animateEarthToSpain,
} from "../utils/cesium.js";
import { flyToPlaceNew } from "../utils/places-new-api.js";
import { simpleFlyToPlace } from "../utils/simple-geocoder.js";
import { setSelectedMarker, hideAllMarkers, showAllMarkers, showLocationPin } from "../utils/create-markers.js";
import { getParams, setParams } from "../utils/params.js";
import { cesiumViewer } from "../utils/cesium.js";
import { loadSvg } from "../utils/svg.js";
import { setTextContent } from "../utils/ui.js";
import {
  getYouTubeVideoId,
  isValidYouTubeUrl,
} from "../utils/youtube-loader.js";

/**
 * The time in seconds between each chapter progression
 * @readonly
 */
const CHAPTER_DURATION = 3;

/**
 * The time in seconds a fly to animation takes
 */
const FLY_TO_DURATION = 2;

// SVG icons
/**
 * Icon shown to pause the autoplay
 */
const PAUSE_ICON = await loadSvg("round-pause-button");
/**
 * Icon shown to pause the autoplay
 */
const PLAY_ICON = await loadSvg("round-play-button");

// Html elements - Updated for new structure
/** The nav element shown on the intro details overlay
 * @type {HTMLNavElement}
 */
const introNavigation = document.querySelector(".intro-navigation");
/** The nav element shown on the story details overlay
 * @type {HTMLNavElement}
 */
const detailNavigation = document.querySelector(".detail-navigation");
/** The button to start the story / leave the intro overlay with
 * @type {HTMLButtonElement}
 */
const startButton = introNavigation ? introNavigation.querySelector("#start-story") : null;
/** The button to play the story chapter by chapter
 * @type {HTMLButtonElement}
 */
const autoplayButton = detailNavigation ? detailNavigation.querySelector("#autoplay-story") : null;
/** The button to progress the story backward with
 * @type {HTMLButtonElement}
 */
const backButton = detailNavigation ? detailNavigation.querySelector("#chapter-backward") : null;
/** The button to progress the story forward with
 * @type {HTMLButtonElement}
 */
const forwardButton = detailNavigation ? detailNavigation.querySelector("#chapter-forward") : null;

/**
 * The id used to identify the timeout instance for the story progression
 * @type {number | null}
 * @default null
 */
let timeoutId = null;

/**
 * The id used to identify the current step of the autoplay
 * @type {number}
 * @default 0
 */
let autoplayStep = 0;

/**
 * Initializes and manages chapter navigation for a story.
 * This function sets up navigation elements for the introduction and chapters of a story.
 * It determines the current chapter based on URL parameters and updates the UI accordingly.
 */
export function initChapterNavigation() {
  // Set up event listeners only if elements exist
  if (startButton) {
    startButton.addEventListener("click", () => {
      activateNavigationElement("details");
      updateChapter(0);
    });
  }

  if (forwardButton) {
    forwardButton.addEventListener("click", () => {
      setNextChapter();
      stopAutoplay();
    });
  }

  if (backButton) {
    backButton.addEventListener("click", () => {
      setPreviousChapter();
      stopAutoplay();
    });
  }

  if (autoplayButton) {
    autoplayButton.addEventListener("click", autoplayClickHandler);
  }

  // Get the current chapter based on URL parameters
  const chapterIndex = getCurrentChapterIndex();

  // Initialize chapter content based on URL parameters
  if (typeof chapterIndex === "number") {
    updateChapter(chapterIndex);
  } else {
    resetToIntro();
  }
}

/**
 * Stops the autoplay chapter progression of the story.
 */
function stopAutoplay() {
  if (autoplayButton) {
    autoplayButton.innerHTML = PLAY_ICON;
  }
  clearTimeout(timeoutId);
  timeoutId = null;
}

/**
 * Progresses to the next chapter and stops progression if the current chapter is the last one.
 */
function setNextAutoplayStep() {
  // Convert from seconds to milliseconds
  const flyToDurationMillis = FLY_TO_DURATION * 1000;
  const chapterDurationMillis = CHAPTER_DURATION * 1000;

  // The interval duration is the sum of the fly to duration and the chapter duration
  // autoplayStep = 0 means the first step, so the wait time is only the chapter duration
  const timeoutDuration =
    autoplayStep === 0
      ? chapterDurationMillis
      : chapterDurationMillis + flyToDurationMillis;

  timeoutId = setTimeout(() => {
    autoplayStep++; // Increment the autoplay step
    setNextChapter(); // Update the chapter content
    setNextAutoplayStep(); // Start the next autoplay step
  }, timeoutDuration);

  // If the current chapter is the last one, stop the autoplay
  if (getCurrentChapterIndex() === story.chapters.length - 1) {
    stopAutoplay();
  }
}

/**
 * Starts the autoplay chapter progression.
 */
function autoplayClickHandler() {
  // If the autoplay is already active, stop it
  if (timeoutId) {
    stopAutoplay();
  } else {
    // If the autoplay is not active, start it
    setNextAutoplayStep();
    if (autoplayButton) {
      autoplayButton.innerHTML = PAUSE_ICON;
    }
  }
}

/**
 * Sets the previous chapter as the current chapter.
 */
const setPreviousChapter = () => {
  const newChapterIndex = getCurrentChapterIndex() - 1;

  // If the new chapter index is positive, update the current chapter
  if (newChapterIndex >= 0) {
    updateChapter(newChapterIndex);
    // when going back further in the chapters, go back to teh intro
  } else {
    resetToIntro();
  }
};

/**
 * Continues to the next chapter in the story.
 */
const setNextChapter = () => {
  const newChapterIndex = getCurrentChapterIndex() + 1;

  // If the new chapter index is less than the total number of chapters, update the current chapter
  // (Then did not reach end of chapters)
  if (newChapterIndex < story.chapters.length) {
    updateChapter(newChapterIndex);
  }
};

/**
 * Resets the application to the introductory state.
 */
export async function resetToIntro() {
  const { placeName, cameraStyle } = story.properties;

  setParams("chapterId", null); // Clear the chapter parameter
  setSelectedMarker(null); // "Deselect" current marker
  setSelectedChapterCard(null, true); // Set the selected chapter card
  updateChapterContent(story.properties); // Update the chapter details content
  activateNavigationElement("intro"); // Activate the introduction navigation
  removeCustomRadiusShader(); // Remove the custom radius shader
  showAllMarkers(); // Show all markers when returning to overview

  // ===================================================================
  // CRITICAL: Stop ALL orbit/rotation animations when returning to root page
  // The root page (Spain overview) should NEVER have any rotation or orbit effect
  // ===================================================================

  // Stop location-specific orbit animation (drone orbit from places)
  if (window.stopOrbitAnimation) {
    window.stopOrbitAnimation();
  }

  // Stop Spain overview orbit effect
  if (window.stopSpainOrbitEffect) {
    window.stopSpainOrbitEffect();
  }

  // Also try stopping drone orbit directly (extra safety)
  if (window.stopDroneOrbit) {
    window.stopDroneOrbit();
  }

  // Ensure no orbit animation is running by removing any clock listeners
  // This is a safety measure to prevent any lingering animations
  try {
    if (cesiumViewer && cesiumViewer.clock && cesiumViewer.clock.onTick) {
      // The clock listeners are already managed by the stop functions above
    }
  } catch (error) {
    console.error('Error checking clock listeners:', error);
  }

  // For Spain overview, use epic Earth-to-Spain zoom animation
  if (placeName === "Spain" && (cameraStyle === "overview" || !cameraStyle)) {
    animateEarthToSpain();
  } else {
    try {
      // Try NEW Places API first, fallback to simple geocoder
      try {
        await flyToPlaceNew(placeName, cameraStyle || 'overview');
      } catch (placesError) {
        console.warn(`NEW Places API failed for intro ${placeName}, using simple geocoder:`, placesError);
        await simpleFlyToPlace(placeName, cameraStyle || 'overview');
      }
    } catch (error) {
      console.error(`Error returning to intro (${placeName}):`, error);
      // Final fallback to manual camera positioning
      performFlyTo({
        position: Cesium.Cartesian3.fromDegrees(-3.7492, 40.4637, 2000000),
        orientation: {
          roll: 0,
          pitch: -1.2,
          heading: 0,
        },
        duration: FLY_TO_DURATION,
      });
    }
  }
}

/**
 * Updates the current chapter of the story based on the given chapter index.
 * @param {number} chapterIndex - The index of the chapter to be updated.
 */
export async function updateChapter(chapterIndex) {
  const chapter = story.chapters.at(chapterIndex);
  const { placeName, cameraStyle, id: chapterId } = chapter;

  setSelectedMarker(chapterId); // Set the selected marker
  setSelectedChapterCard(chapterId); // Set the selected chapter card
  setParams("chapterId", chapterId); // Set the chapter parameter
  updateChapterContent(chapter, false); // Update the chapter details content
  activateNavigationElement("details"); // Activate the details navigation
  hideAllMarkers(); // Hide all markers when viewing a specific chapter

  // Check if the current chapter has a focus and create or remove the custom radius shader accordingly
  const hasFocus = Boolean(
    story.chapters[chapterIndex]?.focusOptions?.showFocus
  );

  try {
    // Check if cesiumViewer is available
    if (!cesiumViewer) {
      console.error(`❌ CesiumViewer not available for navigation to ${placeName}`);
      return;
    }

    let cameraConfig;
    let flySuccessful = false;

    // Try NEW Places API first, fallback to simple geocoder
    try {
      cameraConfig = await flyToPlaceNew(placeName, cameraStyle || 'drone-orbit');
      flySuccessful = true;

      // Show location pin at the actual location with company logo (non-blocking)
      if (cameraConfig && cameraConfig.location) {
        showLocationPin(
          chapterId,
          cameraConfig.location,
          chapter.title,
          chapter.logoUrl,
          chapter.website
        ).catch(err => {
          console.warn('⚠️ Location pin failed to load (non-critical):', err.message);
        });
      }

      // Update chapter with Google Place details if available
      if (cameraConfig && cameraConfig.placeDetails) {
        // Update content with Google's editorial summary if available
        if (cameraConfig.placeDetails.editorialSummary) {
          chapter.content = cameraConfig.placeDetails.editorialSummary;
        }

        // Update image with first Google photo if available (unless preserveCustomImage is true)
        if (cameraConfig.placeDetails.photos && cameraConfig.placeDetails.photos.length > 0) {
          if (!chapter.preserveCustomImage) {
            chapter.imageUrl = cameraConfig.placeDetails.photos[0];
          }
        }

        // Update chapter details in UI
        updateChapterContent(chapter, false);
      }
    } catch (placesError) {
      // Fallback to simple geocoder
      try {
        cameraConfig = await simpleFlyToPlace(placeName, cameraStyle || 'drone-orbit');
        flySuccessful = true;

        // Show location pin at the actual location with company logo (non-blocking)
        if (cameraConfig && cameraConfig.location) {
          showLocationPin(
            chapterId,
            cameraConfig.location,
            chapter.title,
            chapter.logoUrl,
            chapter.website
          ).catch(err => {
            console.warn('⚠️ Location pin failed to load (non-critical):', err.message);
          });
        }
      } catch (geocoderError) {
        console.error(`❌ Both APIs failed for ${placeName}:`, geocoderError);
        flySuccessful = false;
      }
    }

    if (!flySuccessful) {
      console.error(`❌ Camera navigation failed for ${placeName}`);
    }
    
    // Handle focus options after camera is positioned
    if (hasFocus) {
      const radius = story.chapters[chapterIndex].focusOptions.focusRadius;
      // Convert lat/lng from cameraConfig to coords format for shader
      const coords = {
        lat: cameraConfig.location.lat(),
        lng: cameraConfig.location.lng()
      };
      createCustomRadiusShader(coords, radius); // Create the custom radius shader
    } else {
      removeCustomRadiusShader(); // Remove the custom radius shader
    }
    
  } catch (error) {
    console.error(`Error navigating to ${placeName}:`, error);
    removeCustomRadiusShader(); // Remove any existing shader on error
  }
}

/**
 * Sets the active classname on the navigation elements based on chapter presence.
 * @param {'intro' | 'details'} chapterParam - The navigation element to be toggled.
 */
export function activateNavigationElement(navName) {
  // Since we removed the old navigation elements, this function is now a no-op
  // but we keep it for compatibility with existing code
}

/**
 * Returns the index of the current chapter.
 * @returns {number} - The index of the current chapter.
 */
export function getCurrentChapterIndex() {
  const params = getParams();
  const chapterId = params.get("chapterId");
  // Get the index of the current chapter
  return getChapterIndexFromId(chapterId);
}

/**
 * Returns the index of the chapter with the given id.
 * @param {string} chapterId - The id of the chapter to be found.
 * @returns {number | null} - The index of the chapter with the given id.
 */
export function getChapterIndexFromId(chapterId) {
  return chapterId === null
    ? null
    : story.chapters.findIndex((chapter) => chapter.id == chapterId);
}

/**
 * Updates the details navigation. This includes the chapter index and
 * the forward button (if the current chapter is the last).
 */
export function updateDetailsNavigation() {
  // Update chapter index
  const chapterIndex = getCurrentChapterIndex() + 1;

  // Displays the current chapter index if element exists
  if (detailNavigation) {
    const chapterIndexElement = detailNavigation.querySelector("#chapter-index");
    if (chapterIndexElement) {
      chapterIndexElement.textContent = `${chapterIndex} / ${story.chapters.length}`;
    }
  }

  // If the last chapter is reached, disable the forward button
  // Check if the current chapter is the last chapter
  if (forwardButton) {
    if (chapterIndex === story.chapters.length) {
      // Disable the forward button
      forwardButton.disabled = true;
    } else {
      // Enable the forward button
      forwardButton.disabled = false;
    }
  }
}

/**
 * Updates the content of the chapter detail section.
 * @param {Chapter} chapter - The data object containing chapter details
 * @param {boolean} [isIntro=true] - Flag indicating if the current view is the introduction.
 */
export function updateChapterContent(chapter, isIntro = true) {
  // Use the new tab-based content system
  if (typeof window.updateTabContent === 'function') {
    window.updateTabContent(chapter, isIntro);
  } else {
    console.warn('updateTabContent function not available, using fallback');
    // Fallback for legacy content update
    updateLegacyContent(chapter, isIntro);
  }

  // Update active place in top nav
  if (typeof window.setActivePlace === 'function') {
    window.setActivePlace(chapter.id);
  }

  // Update orbit pause state for new chapter
  if (typeof window.updateOrbitPauseState === 'function') {
    window.updateOrbitPauseState();
  }
}

/**
 * Legacy content update for backward compatibility
 */
function updateLegacyContent(chapter, isIntro) {
  setTextContent(".story-title", isIntro ? "" : chapter.title);
  setTextContent(".chapter-detail h2", chapter.title);
  setTextContent(
    ".description",
    isIntro ? chapter.description : chapter.content
  );

  setTextContent(".date", isIntro ? "" : chapter.dateTime);
  setTextContent(".place", chapter.address);

  // Update image or video
  setMediaContent(chapter.imageUrl);

  // Update image or video credit
  const imageCredit = chapter.imageCredit
    ? `Image credit: ${chapter.imageCredit}`
    : "";

  setTextContent(".story-intro-attribution", isIntro ? imageCredit : "");
  setTextContent(".attribution", isIntro ? "" : imageCredit);

  // Update author and date in intro
  setTextContent(
    ".story-intro-author",
    isIntro && chapter.createdBy ? `by: ${chapter.createdBy}` : ""
  );

  setTextContent(".story-intro-date", isIntro ? chapter.date : "");
}

/**
 * Updates the chapter index display and the state of the forward navigation button.
 */
function updateChapterIndexAndNavigation() {
  const chapterIndex = getCurrentChapterIndex();
  const chapterIndexDisplay = `${chapterIndex + 1} / ${story.chapters.length}`;
  setTextContent("#chapter-index", chapterIndexDisplay);

  // Update forward button state if it exists
  if (forwardButton) {
    forwardButton.disabled = chapterIndex + 1 === story.chapters.length;
  }
}

/**
 * Sets the media content in the media container based on the provided URL.
 * If the URL is a valid YouTube URL, it creates an embedded YouTube player.
 * If the URL is not a valid YouTube URL, it displays an image.
 * @param {string} url - The URL of the media content.
 */
function setMediaContent(url) {
  const mediaContainer = document.getElementById("media-container");

  // Clear previous content
  mediaContainer.innerHTML = "";

  if (isValidYouTubeUrl(url)) {
    const iframeElement = document.createElement("div");
    iframeElement.id = "player";
    mediaContainer.appendChild(iframeElement);

    new YT.Player("player", {
      height: "100%",
      width: "100%",
      videoId: getYouTubeVideoId(url),
    });
  } else if (url) {
    const imgElement = document.createElement("img");
    imgElement.src = url;
    mediaContainer.appendChild(imgElement);
  }
}

/**
 * Sets the selected chapter- or story intro card based on the provided chapterId and isIntro flag.
 * @param {string} chapterId - The ID of the chapter card to be selected.
 * @param {boolean} [isIntro=false] - Indicates whether the chapter card is an intro card.
 * @returns {void}
 */
function setSelectedChapterCard(chapterId, isIntro = false) {
  // Updated to work with new top navigation instead of old chapters bar
  // This functionality is now handled by setActivePlace() in main.js
  if (typeof window.setActivePlace === 'function' && chapterId && !isIntro) {
    window.setActivePlace(chapterId);
  }
}

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

import { getPreviewUrl } from "../utils/ui.js";
import {
  getChapterIndexFromId,
  resetToIntro,
  updateChapter,
} from "./chapter-navigation.js";

/**
 * Creates a placeholder with initials for when image fails to load
 * @param {string} title - The title to generate initials from
 * @returns {HTMLElement} The placeholder element
 */
function createPlaceholder(title) {
  const initials = title
    .split(' ')
    .map(word => word[0])
    .filter(letter => letter)
    .join('')
    .substring(0, 3)
    .toUpperCase();

  const placeholder = document.createElement('div');
  placeholder.style.cssText = `
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 28px;
    font-weight: bold;
    font-family: Arial, sans-serif;
  `;
  placeholder.textContent = initials;
  return placeholder;
}

/**
 * Returns a story intro card as HTML element.
 *
 * @param {StoryProperties} storyProperties - The story to create the intro card element for
 * @returns {HTMLElement} The story intro card element
 */
export function createStoryIntroCard(storyProperties) {
  const card = document.createElement("article");
  card.classList.add("card", "story-intro");

  const storyIntroImage = document.createElement("img");

  storyIntroImage.src = getPreviewUrl(storyProperties.imageUrl);
  card.appendChild(storyIntroImage);

  const storyIntroTitle = document.createElement("h1");
  storyIntroTitle.textContent = storyProperties.title;
  card.appendChild(storyIntroTitle);

  // set intro view
  card.addEventListener("click", resetToIntro);

  return card;
}

/**
 * Returns a chapter card as HTML element.
 *
 * @param {Chapter} chapter - The chapter to create the card element for
 * @returns {HTMLElement} The chapter card element
 */
export function createChapterCard(chapter) {
  const card = document.createElement("article");
  card.classList.add("card", "chapter-card");
  card.id = chapter.id;

  // Create image container that will hold either img or placeholder
  const imageContainer = document.createElement("div");
  imageContainer.style.cssText = `
    width: 100%;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ffffff;
    overflow: hidden;
    padding: 8px;
    box-sizing: border-box;
  `;

  // Prioritize logoUrl, then try favicon from website, then fallback to initials
  let imageSources = [];

  // First priority: logoUrl
  if (chapter.logoUrl) {
    imageSources.push({
      url: chapter.logoUrl,
      type: 'logo'
    });
  }

  // Second priority: favicon from website
  if (chapter.website) {
    try {
      const url = chapter.website.startsWith('http') ? chapter.website : 'https://' + chapter.website;
      const domain = new URL(url).hostname;
      const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
      imageSources.push({
        url: faviconUrl,
        type: 'favicon'
      });
    } catch (e) {
      console.warn(`Invalid website URL for ${chapter.title}:`, e);
    }
  }

  if (imageSources.length > 0) {
    let currentSourceIndex = 0;

    const tryLoadImage = () => {
      if (currentSourceIndex >= imageSources.length) {
        // All image sources failed, show initials
        console.warn(`❌ All image sources failed for ${chapter.title}, showing initials`);
        imageContainer.innerHTML = '';
        const placeholder = createPlaceholder(chapter.title);
        imageContainer.appendChild(placeholder);
        return;
      }

      const source = imageSources[currentSourceIndex];
      const chapterImage = document.createElement("img");
      chapterImage.setAttribute("data-input-name", "imageUrl");
      chapterImage.src = source.url;
      chapterImage.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      `;

      // Add error handler to try next source
      chapterImage.onerror = function() {
        console.warn(`⚠️ Failed to load ${source.type} for ${chapter.title}, trying next source`);
        currentSourceIndex++;
        imageContainer.innerHTML = '';
        tryLoadImage();
      };

      chapterImage.onload = function() {
        // Successfully loaded
      };

      imageContainer.appendChild(chapterImage);
    };

    tryLoadImage();
  } else {
    // No image sources available, show initials immediately
    const placeholder = createPlaceholder(chapter.title);
    imageContainer.appendChild(placeholder);
  }

  card.appendChild(imageContainer);

  const chapterTitleContainer = document.createElement("div");
  card.appendChild(chapterTitleContainer);

  const chapterTitle = document.createElement("h2");
  chapterTitle.setAttribute("data-input-name", "title");
  chapterTitle.textContent = chapter.title;
  chapterTitleContainer.appendChild(chapterTitle);

  // set current chapter
  card.addEventListener("click", () =>
    updateChapter(getChapterIndexFromId(chapter.id))
  );

  return card;
}

/**
 * Fills the chapters bar with UI elements.
 *
 * @param {Story} story - The story to create the cards for
 */
export function addChaptersBar(story) {
  const barContainer = document.querySelector("#chapters-bar");

  // Add card elements to the bar container
  const cardsContainer = barContainer.querySelector(".cards");

  const storyIntroCard = createStoryIntroCard(story.properties);
  cardsContainer.appendChild(storyIntroCard);

  for (const chapter of story.chapters) {
    const chapterCard = createChapterCard(chapter);
    cardsContainer.appendChild(chapterCard);
  }

  const barNavigationPreviousButton = barContainer.querySelector(
    ".navigation-button.previous"
  );
  const barNavigationNextButton = barContainer.querySelector(
    ".navigation-button.next"
  );

  // Add click event handlers to the navigation buttons
  const cardElementWidth = cardsContainer.querySelector(".card").offsetWidth;
  const cardsGap = Number(
    getComputedStyle(cardsContainer).getPropertyValue("gap").replace("px", "")
  );
  const cardSectionWidth = cardElementWidth + cardsGap;

  // Check if the length and the width of the cards exceeds the container width.
  // If yes show navigation buttons
  if (
    cardSectionWidth * cardsContainer.children.length >
    cardsContainer.clientWidth
  ) {
    barNavigationNextButton.classList.remove("hidden");
    barNavigationPreviousButton.classList.remove("hidden");
  }

  barNavigationPreviousButton.addEventListener("click", () => {
    // Scroll one card back
    const newScrollLeft = cardsContainer.scrollLeft - cardSectionWidth;
    // Clamp new scroll position to the next full card on the left
    const newClampedScrollLeft =
      newScrollLeft - (newScrollLeft % cardSectionWidth);

    cardsContainer.scrollTo({
      left: newClampedScrollLeft,
      behavior: "smooth",
    });
  });

  barNavigationNextButton.addEventListener("click", () => {
    // Scroll one card further
    const newScrollLeft = cardsContainer.scrollLeft + cardSectionWidth;
    // Clamp new scroll position to the next full card on the left
    const newClampedScrollLeft =
      newScrollLeft - (newScrollLeft % cardSectionWidth);

    cardsContainer.scrollTo({
      left: newClampedScrollLeft,
      behavior: "smooth",
    });
  });
}

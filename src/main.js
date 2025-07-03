import { initCesiumViewer } from "./utils/cesium.js";
import { loadConfig } from "./utils/config.js";
import createMarkers from "./utils/create-markers.js";
import { addChaptersBar } from "./chapters/chapters.js";
import { initGoogleMaps } from "./utils/places.js";
import { initChapterNavigation } from "./chapters/chapter-navigation.js";
import { initGoogleMapsServicesNew, resolvePlaceToCameraNew } from "./utils/places-new-api.js";
import { simpleGeocodeToCamera } from "./utils/simple-geocoder.js";

/**
 * The story configuration object
 * @type {Story}
 */
export const story = await loadConfig("./config.json");
const { chapters } = story;

/**
 * Enrich chapters with Google Places API data (photos, descriptions)
 */
async function enrichChaptersWithPlacesData(chapters) {
  console.log('Enriching chapters with Google Places API data...');
  
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    try {
      let cameraConfig;
      
      // Try NEW Places API first, fallback to simple geocoder
      try {
        cameraConfig = await resolvePlaceToCameraNew(chapter.placeName, 'static');
      } catch (placesError) {
        console.warn(`NEW Places API failed for ${chapter.placeName}, using simple geocoder:`, placesError);
        cameraConfig = await simpleGeocodeToCamera(chapter.placeName, 'static');
      }
      
      // Update chapter with Google Place details if available
      if (cameraConfig.placeDetails) {
        // Update content with Google's editorial summary if available
        if (cameraConfig.placeDetails.editorialSummary) {
          chapter.content = cameraConfig.placeDetails.editorialSummary;
        }
        
        // Update image with first Google photo if available (unless preserveCustomImage is true)
        if (cameraConfig.placeDetails.photos && cameraConfig.placeDetails.photos.length > 0) {
          if (!chapter.preserveCustomImage) {
            chapter.imageUrl = cameraConfig.placeDetails.photos[0];
            console.log(`Updated image for ${chapter.title}: ${chapter.imageUrl}`);
          } else {
            console.log(`Preserving custom image for ${chapter.title}: ${chapter.imageUrl}`);
          }
        }
        
        // Store place details for future use
        chapter.placeDetails = cameraConfig.placeDetails;
      }
      
    } catch (error) {
      console.warn(`Could not enrich chapter ${chapter.title} with Places data:`, error);
    }
  }
  
  console.log('Chapter enrichment complete');
}

/**
 * The main function. This function is called when the page is loaded.
 * It then initializes all necessary parts of the application.
 */
async function main() {
  try {
    // First initialize Google Maps (loads the API)
    await initGoogleMaps();
    
    // Wait a bit for Google Maps to fully load
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Initialize Google Maps services for NEW Places API
    const servicesInitialized = initGoogleMapsServicesNew();
    if (!servicesInitialized) {
      console.warn('Could not initialize Google Maps services, falling back to basic functionality');
    }
    
    // Enrich chapters with Google Places API data BEFORE creating UI
    await enrichChaptersWithPlacesData(chapters);
    
    // Initialize Cesium (now with Places API available)
    await initCesiumViewer();

    // Create markers from chapter coordinates
    await createMarkers(chapters);

    // Create UI with enriched chapter data
    addChaptersBar(story);
    initChapterNavigation();
  } catch (error) {
    console.error(error);
  }
}

await main();

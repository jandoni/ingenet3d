/**
 * News Service - Fetches news from RSS feeds with caching and fallbacks
 *
 * Priority:
 * 1. RSS feed from entity's website (via CORS proxy)
 * 2. Auto-detect RSS from common paths
 * 3. Return empty array (UI shows highlights/placeholder)
 */

const CACHE_KEY_PREFIX = 'ingenet_news_';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Free CORS proxies to try (in order of reliability)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest='
];

/**
 * News item structure
 * @typedef {Object} NewsItem
 * @property {string} title - News title
 * @property {string} link - URL to the full article
 * @property {string} date - Formatted date string
 * @property {string|null} image - Image URL or null
 * @property {string} source - Source identifier ('rss', 'newsapi', etc.)
 */

// Overall timeout for news fetching (prevents infinite loading)
const FETCH_TIMEOUT_MS = 12000; // 12 seconds max

/**
 * Fetch news for a chapter/entity with timeout protection
 * @param {Object} chapter - Chapter object from config
 * @returns {Promise<NewsItem[]>} Array of news items (max 4)
 */
export async function fetchNewsForChapter(chapter) {
  // Check if news is disabled for this entity
  if (chapter.newsConfig?.disabled) {
    return [];
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${chapter.id}`;

  // Check cache first
  const cached = getCachedNews(cacheKey);
  if (cached) {
    return cached;
  }

  // Wrap in timeout to prevent infinite loading
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('News fetch timeout')), FETCH_TIMEOUT_MS)
    );

    const fetchPromise = fetchNewsInternal(chapter, cacheKey);

    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (e) {
    console.warn(`News fetch failed or timed out for ${chapter.title}:`, e.message);
    return [];
  }
}

/**
 * Internal news fetching logic
 */
async function fetchNewsInternal(chapter, cacheKey) {
  let news = [];

  // Strategy 1: Try configured RSS feed
  if (chapter.newsConfig?.rssUrl) {
    news = await tryFetchRSS(chapter.newsConfig.rssUrl, chapter.newsConfig.keywords);
  }

  // Strategy 2: Try auto-detected RSS from website (limited paths for speed)
  if (news.length === 0 && chapter.website) {
    news = await tryAutoDetectRSS(chapter.website, chapter.newsConfig?.keywords);
  }

  // Limit to 4 items and cache
  news = news.slice(0, 4);

  if (news.length > 0) {
    setCachedNews(cacheKey, news);
  }

  return news;
}

/**
 * Clear cached news for a specific chapter or all chapters
 * @param {number|null} chapterId - Chapter ID or null to clear all
 */
export function clearNewsCache(chapterId = null) {
  if (chapterId) {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${chapterId}`);
  } else {
    // Clear all news cache
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * Try to fetch and parse an RSS feed
 * @param {string} rssUrl - URL of the RSS feed
 * @param {string[]} keywords - Optional keywords to filter
 * @returns {Promise<NewsItem[]>}
 */
async function tryFetchRSS(rssUrl, keywords = []) {
  for (const proxy of CORS_PROXIES) {
    try {
      const response = await fetch(proxy + encodeURIComponent(rssUrl), {
        signal: AbortSignal.timeout(3000) // 3 seconds per proxy
      });

      if (!response.ok) continue;

      const text = await response.text();

      // Validate it's actually XML
      if (!text.trim().startsWith('<?xml') && !text.trim().startsWith('<rss') && !text.trim().startsWith('<feed')) {
        continue;
      }

      return parseRSSFeed(text, keywords);
    } catch (e) {
      // Try next proxy
      continue;
    }
  }
  return [];
}

/**
 * Try to auto-detect RSS feed from common URL patterns
 * @param {string} websiteUrl - Website URL
 * @param {string[]} keywords - Optional keywords to filter
 * @returns {Promise<NewsItem[]>}
 */
async function tryAutoDetectRSS(websiteUrl, keywords = []) {
  // Common RSS feed paths including Spanish regional languages
  const possibleFeeds = [
    '/blog-feed.xml',  // Wix
    '/feed',           // WordPress default
    '/rss',            // Common
    '/feed.xml',       // Static sites
    // Spanish regional languages:
    '/noticias/feed',  // Spanish (Castellano)
    '/actualidad/feed',// Spanish
    '/noticies/feed',  // Catalan / Valencian
    '/actualitat/feed',// Catalan
    '/albisteak/feed', // Basque (Euskara)
    '/berriak/feed',   // Basque
    '/novas/feed'      // Galician (Galego)
  ];

  try {
    const baseUrl = new URL(websiteUrl).origin;

    for (const feedPath of possibleFeeds) {
      const news = await tryFetchRSS(baseUrl + feedPath, keywords);
      if (news.length > 0) {
        return news;
      }
    }
  } catch (e) {
    // Invalid URL
  }

  return [];
}

/**
 * Parse RSS/Atom feed XML
 * @param {string} xmlText - Raw XML text
 * @param {string[]} keywords - Keywords to filter by
 * @returns {NewsItem[]}
 */
function parseRSSFeed(xmlText, keywords = []) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');

    // Check for parse errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      return [];
    }

    // Handle both RSS and Atom formats
    const items = doc.querySelectorAll('item, entry');
    const news = [];

    items.forEach(item => {
      const title = getElementText(item, 'title');
      const link = getElementLink(item);
      const pubDate = getElementText(item, 'pubDate, published, updated, dc\\:date');
      const description = getElementText(item, 'description, summary, content, content\\:encoded');

      if (!title || !link) return;

      // Extract image from various sources
      const image = extractImageFromItem(item, description);

      // Filter by keywords if provided
      if (keywords && keywords.length > 0) {
        const content = (title + ' ' + description).toLowerCase();
        const matches = keywords.some(kw => content.includes(kw.toLowerCase()));
        if (!matches) return;
      }

      // Clean and truncate description for excerpt
      let excerpt = cleanHTML(description);
      // Only show excerpt if it has meaningful content (more than just whitespace)
      if (excerpt && excerpt.length > 20) {
        excerpt = excerpt.substring(0, 150) + (excerpt.length > 150 ? '...' : '');
      } else {
        excerpt = ''; // Don't show empty or very short excerpts
      }

      news.push({
        title: cleanHTML(title).substring(0, 120),
        link,
        date: formatDate(pubDate),
        image,
        excerpt,
        source: 'rss'
      });
    });

    return news;
  } catch (e) {
    return [];
  }
}

/**
 * Get text content from first matching element
 * Handles namespaced elements (like content:encoded) properly
 * @param {Element} parent - Parent element
 * @param {string} selectors - CSS selectors or tag names
 * @returns {string}
 */
function getElementText(parent, selectors) {
  const selectorList = selectors.split(',').map(s => s.trim());
  for (const selector of selectorList) {
    // Try querySelector first
    try {
      const el = parent.querySelector(selector);
      if (el?.textContent) {
        return el.textContent.trim();
      }
    } catch (e) {
      // Selector might be invalid, try as tag name
    }

    // Try getElementsByTagName for namespaced elements (like content:encoded)
    const tagName = selector.replace('\\:', ':');
    const elements = parent.getElementsByTagName(tagName);
    if (elements.length > 0 && elements[0].textContent) {
      return elements[0].textContent.trim();
    }
  }
  return '';
}

/**
 * Get link from RSS/Atom item
 * @param {Element} item - Item element
 * @returns {string}
 */
function getElementLink(item) {
  // Try standard link element
  const linkEl = item.querySelector('link');
  if (linkEl) {
    // Atom uses href attribute, RSS uses text content
    const href = linkEl.getAttribute('href');
    if (href) return href;
    if (linkEl.textContent) return linkEl.textContent.trim();
  }

  // Try guid as fallback
  const guidEl = item.querySelector('guid');
  if (guidEl?.textContent && guidEl.textContent.startsWith('http')) {
    return guidEl.textContent.trim();
  }

  return '';
}

/**
 * Extract image from RSS item
 * @param {Element} item - RSS item element
 * @param {string} description - Item description
 * @returns {string|null}
 */
function extractImageFromItem(item, description) {
  // Try enclosure (common in RSS)
  const enclosure = item.querySelector('enclosure[type^="image"]');
  if (enclosure?.getAttribute('url')) {
    return enclosure.getAttribute('url');
  }

  // Try media:content
  const mediaContent = item.querySelector('media\\:content, content[medium="image"]');
  if (mediaContent?.getAttribute('url')) {
    return mediaContent.getAttribute('url');
  }

  // Try media:thumbnail
  const mediaThumbnail = item.querySelector('media\\:thumbnail');
  if (mediaThumbnail?.getAttribute('url')) {
    return mediaThumbnail.getAttribute('url');
  }

  // Try to extract from description HTML
  if (description) {
    const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch?.[1]) {
      return imgMatch[1];
    }
  }

  return null;
}

/**
 * Clean HTML tags from text
 * @param {string} html - HTML string
 * @returns {string}
 */
function cleanHTML(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format date string to Spanish locale
 * @param {string} dateStr - Date string
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Relative time for recent dates
    if (diffDays === 0) {
      return 'Hoy';
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return `Hace ${diffDays} dias`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `Hace ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`;
    } else {
      // Format as date for older items
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  } catch (e) {
    return '';
  }
}

/**
 * Get cached news if not expired
 * @param {string} cacheKey - Cache key
 * @returns {NewsItem[]|null}
 */
function getCachedNews(cacheKey) {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const { news, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return news;
  } catch (e) {
    return null;
  }
}

/**
 * Cache news items
 * @param {string} cacheKey - Cache key
 * @param {NewsItem[]} news - News items to cache
 */
function setCachedNews(cacheKey, news) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      news,
      timestamp: Date.now()
    }));
  } catch (e) {
    // localStorage might be full, ignore
  }
}

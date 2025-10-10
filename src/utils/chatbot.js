import { updateChapter } from '../chapters/chapter-navigation.js';

let chatHistory = [];
let isOpen = false;
let storyData = null;

export function initChatbot(story) {
  storyData = story;

  const welcomeMessage = {
    type: 'bot',
    text: '¡Hola! ¿A qué lugar de España te gustaría ir? Puedo llevarte a la Sagrada Familia, Alhambra, Museo del Prado, o cualquier otro lugar de nuestra lista.',
    timestamp: new Date()
  };

  chatHistory.push(welcomeMessage);

  setTimeout(() => {
    showChatHint();
  }, 3000);
}

function showChatHint() {
  const chatButton = document.getElementById('chat-toggle-btn');
  if (chatButton && !isOpen) {
    chatButton.classList.add('pulse');
    setTimeout(() => {
      chatButton.classList.remove('pulse');
    }, 2000);
  }
}

export function toggleChat() {
  const chatContainer = document.getElementById('chat-container');
  const chatButton = document.getElementById('chat-toggle-btn');
  const chatBubble = chatButton.querySelector('.chat-bubble');

  isOpen = !isOpen;

  if (isOpen) {
    chatContainer.classList.add('open');
    // Keep the robot icon but hide the chat bubble when open
    if (chatBubble) {
      chatBubble.style.display = 'none';
    }

    renderChatHistory();

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.focus();
    }
  } else {
    chatContainer.classList.remove('open');
    // Show the chat bubble again when closed
    if (chatBubble) {
      chatBubble.style.display = 'block';
    }
  }
}

function renderChatHistory() {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  chatMessages.innerHTML = '';

  chatHistory.forEach((message, index) => {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${message.type}`;

    if (message.suggestions) {
      messageDiv.innerHTML = `
        <div class="message-text">${message.text}</div>
        <div class="suggestions">
          ${message.suggestions.map((suggestion, idx) => `
            <button class="suggestion-btn" onclick="window.selectPlace(${suggestion.index})">
              ${suggestion.title}
            </button>
          `).join('')}
        </div>
      `;
    } else if (message.confirmation) {
      messageDiv.innerHTML = `
        <div class="message-text">${message.text}</div>
        <div class="confirmation-buttons">
          <button class="confirm-btn yes" onclick="window.confirmNavigation(${message.confirmation.place.index})">
            Sí, llévame allí
          </button>
          <button class="confirm-btn no" onclick="window.cancelNavigation()">
            No, buscar otra cosa
          </button>
        </div>
      `;
    } else {
      messageDiv.innerHTML = `<div class="message-text">${message.text}</div>`;
    }

    chatMessages.appendChild(messageDiv);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

export function sendMessage() {
  const chatInput = document.getElementById('chat-input');
  const userInput = chatInput.value.trim();

  if (!userInput) return;

  const userMessage = {
    type: 'user',
    text: userInput,
    timestamp: new Date()
  };
  chatHistory.push(userMessage);

  chatInput.value = '';

  const matches = findMatchingPlaces(userInput);

  if (matches.length === 0) {
    const botMessage = {
      type: 'bot',
      text: `No encontré ningún lugar con "${userInput}". Prueba con nombres como "Sagrada", "Prado", "Alhambra", "Palacio Real" o "Santiago".`,
      timestamp: new Date()
    };
    chatHistory.push(botMessage);
  } else if (matches.length === 1) {
    const place = matches[0];
    const botMessage = {
      type: 'bot',
      text: `Encontré: ${place.title}. ¿Quieres que te lleve allí?`,
      confirmation: {
        place: place,
        userInput: userInput
      },
      timestamp: new Date()
    };
    chatHistory.push(botMessage);
  } else {
    const topMatches = matches.slice(0, 4);
    let responseText = `Encontré ${matches.length} lugar${matches.length > 1 ? 'es' : ''} relacionado${matches.length > 1 ? 's' : ''} con "${userInput}".`;

    if (matches.length > 4) {
      responseText += ` Te muestro los ${topMatches.length} más relevantes:`;
    } else {
      responseText += ' ¿Cuál te gustaría visitar?';
    }

    const botMessage = {
      type: 'bot',
      text: responseText,
      suggestions: topMatches,
      timestamp: new Date()
    };
    chatHistory.push(botMessage);
  }

  renderChatHistory();
}

function findMatchingPlaces(input) {
  // Extract keywords from the input query
  const keywords = extractKeywords(input);

  if (keywords.length === 0) {
    return [];
  }

  const matches = [];

  // Enhanced translations and synonyms dictionary
  const translations = {
    // Location variations and synonyms
    'espana': 'españa',
    'andaluza': 'andalucía',
    'andaluz': 'andalucía',
    'sur': 'andalucía',
    'cataluna': 'catalunya',
    'catalan': 'catalunya',
    'vasco': 'país vasco',
    'euskadi': 'país vasco',
    'norte': 'galicia',
    'gallego': 'galicia',
    'gallega': 'galicia',

    // Type variations and plurals
    'museos': 'museo',
    'museo': 'museo',
    'museistico': 'museo',
    'galeria': 'museo',
    'galerias': 'museo',
    'centro cultural': 'museo',
    'centros culturales': 'museo',
    'palacios': 'palacio',
    'palacio': 'palacio',
    'catedrales': 'catedral',
    'catedral': 'catedral',
    'basilicas': 'basilica',
    'basilica': 'basilica',
    'iglesias': 'catedral',
    'iglesia': 'catedral',
    'templos': 'catedral',
    'templo': 'catedral',
    'parques': 'parque',
    'parque': 'parque',
    'jardines': 'parque',
    'jardin': 'parque',
    'fundaciones': 'fundación',
    'fundacion': 'fundación',
    'universidades': 'universidad',
    'universidad': 'universidad',
    'centros': 'centro',
    'centro': 'centro',

    // Sector synonyms and variations
    'robotica': 'robótica',
    'roboticos': 'robótica',
    'automatizacion': 'automatización',
    'automatico': 'automatización',
    'automatica': 'automatización',
    'maritimo': 'marítimo',
    'maritima': 'marítimo',
    'naval': 'naval',
    'navales': 'naval',
    'marino': 'marítimo',
    'marina': 'marítimo',
    'barcos': 'naval',
    'barco': 'naval',
    'mineria': 'minería',
    'minero': 'minería',
    'minera': 'minería',
    'minas': 'minería',
    'mina': 'minería',
    'arte': 'arte',
    'artistico': 'arte',
    'artistica': 'arte',
    'artistas': 'arte',
    'artista': 'arte',
    'historia': 'historia',
    'historico': 'historia',
    'historica': 'historia',
    'historicos': 'historia',
    'historicas': 'historia',
    'arquitectura': 'arquitectura',
    'arquitectonico': 'arquitectura',
    'arquitectonica': 'arquitectura',
    'construccion': 'arquitectura',
    'edificios': 'arquitectura',
    'edificio': 'arquitectura',
    'religion': 'religión',
    'religioso': 'religión',
    'religiosa': 'religión',
    'religioosos': 'religión',
    'religiosas': 'religión',
    'sagrado': 'religión',
    'sagrada': 'religión',
    'santo': 'religión',
    'santa': 'religión',
    'cultura': 'cultura',
    'cultural': 'cultura',
    'culturales': 'cultura',
    'turismo': 'turismo',
    'turistico': 'turismo',
    'turistica': 'turismo',
    'tecnologia': 'tecnología',
    'tecnologico': 'tecnología',
    'tecnologica': 'tecnología',

    // Professional variations
    'ingenieria': 'ingeniería',
    'ingeniero': 'ingeniería',
    'ingeniera': 'ingeniería',
    'ingenieros': 'ingeniería',
    'ingenieras': 'ingeniería',
    'tecnico': 'ingeniería',
    'tecnica': 'ingeniería',
    'tecnicos': 'ingeniería',
    'tecnicas': 'ingeniería',
    'arquitecto': 'arquitectura',
    'arquitecta': 'arquitectura',
    'arquitectos': 'arquitectura',
    'arquitectas': 'arquitectura',
    'historiador': 'historia',
    'historiadora': 'historia',
    'historiadores': 'historia',
    'historiadoras': 'historia',

    // Common search terms and patterns
    'lugares': 'lugar',
    'lugar': 'lugar',
    'sitios': 'lugar',
    'sitio': 'lugar',
    'visitas': 'visitar',
    'visita': 'visitar',
    'visitar': 'visitar',
    'conocer': 'visitar',
    'ver': 'visitar',
    'turístico': 'turismo',
    'turística': 'turismo',
    'turísticos': 'turismo',
    'turísticas': 'turismo'
  };

  // Apply translations to each keyword
  const enhancedKeywords = keywords.map(keyword => {
    for (const [spanish, normalized] of Object.entries(translations)) {
      if (keyword === spanish || keyword.includes(spanish)) {
        return normalized;
      }
    }
    return keyword;
  });

  storyData.chapters.forEach((chapter, index) => {
    const titleMatch = normalizeText(chapter.title);
    const placeNameMatch = normalizeText(chapter.placeName);

    let score = 0;
    let matchedKeywords = 0;
    let categoryMatches = new Set(); // Track which tag categories matched
    let matchDetails = []; // For debugging

    // Check each keyword against this chapter
    [...keywords, ...enhancedKeywords].forEach(keyword => {
      let keywordFound = false;
      let keywordScore = 0;

      // Check title (highest priority)
      if (titleMatch.includes(keyword)) {
        keywordScore = Math.max(keywordScore, 0.9);
        matchDetails.push(`title:"${keyword}"`);
        keywordFound = true;
      }

      // Check placeName
      if (placeNameMatch.includes(keyword)) {
        keywordScore = Math.max(keywordScore, 0.8);
        matchDetails.push(`place:"${keyword}"`);
        keywordFound = true;
      }

      // Check tags
      if (chapter.etiquetas) {
        Object.entries(chapter.etiquetas).forEach(([category, tagArray]) => {
          if (Array.isArray(tagArray)) {
            tagArray.forEach(tag => {
              const normalizedTag = normalizeText(tag);
              if (normalizedTag.includes(keyword) || keyword.includes(normalizedTag)) {
                // Exact matches get higher scores
                const exactMatch = normalizedTag === keyword;
                const tagScore = exactMatch ? 0.75 : 0.6;
                keywordScore = Math.max(keywordScore, tagScore);
                categoryMatches.add(category);
                matchDetails.push(`${category}:"${tag}"→"${keyword}"`);
                keywordFound = true;
              }
            });
          }
        });
      }

      if (keywordFound) {
        matchedKeywords++;
        score += keywordScore;
      }
    });

    // Bonus for matching keywords across different tag categories
    const categoryBonus = Math.min(categoryMatches.size * 0.1, 0.3);

    // Calculate final score
    if (matchedKeywords > 0) {
      const baseScore = score / Math.max(keywords.length, 1); // Average score per keyword
      const completenessBonus = (matchedKeywords / keywords.length) * 0.2; // Bonus for matching more keywords
      const finalScore = Math.min(baseScore + categoryBonus + completenessBonus, 1);

      if (finalScore > 0.3) { // Lower threshold for multi-keyword searches
        matches.push({
          ...chapter,
          index,
          score: finalScore,
          matchedKeywords,
          totalKeywords: keywords.length,
          matchDetails: matchDetails.join(', ')
        });
      }
    }
  });

  // Sort by score (highest first), then by number of keywords matched
  matches.sort((a, b) => {
    if (Math.abs(a.score - b.score) < 0.1) {
      // If scores are very close, prioritize more keyword matches
      return b.matchedKeywords - a.matchedKeywords;
    }
    return b.score - a.score;
  });

  return matches;
}

// Spanish stopwords to filter out from search queries
const spanishStopwords = new Set([
  'algun', 'alguna', 'algunos', 'algunas', 'en', 'de', 'del', 'la', 'el', 'los', 'las',
  'que', 'donde', 'como', 'para', 'por', 'con', 'sin', 'hay', 'tiene', 'tengo',
  'quiero', 'busco', 'ver', 'visitar', 'ir', 'llevame', 'y', 'o', 'un', 'una',
  'unos', 'unas', 'me', 'te', 'se', 'nos', 'le', 'les', 'lo', 'al', 'esta', 'este',
  'estan', 'son', 'es', 'ser', 'esta', 'estar', 'pero', 'si', 'no', 'mas', 'muy',
  'tambien', 'solo', 'cuando', 'quien', 'cual', 'cuales', 'porque', 'hasta', 'desde'
]);

// Function to normalize text by removing accents and special characters
function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents but keep ñ
    .replace(/[^\w\sñÑ]/g, ' ') // Keep letters, numbers, spaces, and ñ
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Function to extract keywords by removing stopwords
function extractKeywords(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(' ')
    .filter(word => word.length > 2) // Remove very short words
    .filter(word => !spanishStopwords.has(word)) // Remove stopwords
    .filter(word => word.trim() !== ''); // Remove empty strings

  // Remove duplicates
  return [...new Set(words)];
}

function navigateToPlace(index) {
  const placeCard = document.querySelector(`.place-card[data-chapter-id="${storyData.chapters[index].id}"]`);
  if (placeCard) {
    placeCard.click();
  } else {
    updateChapter(index);
  }

  const successMessage = {
    type: 'bot',
    text: `¡Bienvenido a ${storyData.chapters[index].title}! Pregúntame por otro lugar cuando quieras.`,
    timestamp: new Date()
  };
  chatHistory.push(successMessage);
}

// Confirmation functions
window.confirmNavigation = function(index) {
  const confirmationMessage = {
    type: 'bot',
    text: '¡Perfecto! Te llevo allí...',
    timestamp: new Date()
  };
  chatHistory.push(confirmationMessage);
  renderChatHistory();

  setTimeout(() => {
    navigateToPlace(index);

    setTimeout(() => {
      toggleChat();
    }, 500);
  }, 1000);
};

window.cancelNavigation = function() {
  const cancelMessage = {
    type: 'bot',
    text: 'De acuerdo. Prueba con otro nombre o ubicación. Puedo buscar por nombre, ciudad, tipo de lugar o sector.',
    timestamp: new Date()
  };
  chatHistory.push(cancelMessage);
  renderChatHistory();
};

window.selectPlace = function(index) {
  navigateToPlace(index);

  setTimeout(() => {
    toggleChat();
  }, 500);
};

window.toggleChat = toggleChat;
window.sendMessage = sendMessage;

document.addEventListener('keypress', function(e) {
  if (e.key === 'Enter' && e.target.id === 'chat-input') {
    sendMessage();
  }
});
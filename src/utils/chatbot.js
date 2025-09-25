import { updateChapter } from '../chapters/chapter-navigation.js';

let chatHistory = [];
let isOpen = false;
let storyData = null;

export function initChatbot(story) {
  console.log('🤖 Initializing chatbot...');
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
      text: `¡Perfecto! Te llevo a ${place.title}...`,
      timestamp: new Date()
    };
    chatHistory.push(botMessage);

    setTimeout(() => {
      navigateToPlace(place.index);

      setTimeout(() => {
        toggleChat();
      }, 500);
    }, 1000);
  } else {
    const botMessage = {
      type: 'bot',
      text: `Encontré ${matches.length} lugares con "${userInput}". ¿Cuál te gustaría visitar?`,
      suggestions: matches.slice(0, 4),
      timestamp: new Date()
    };
    chatHistory.push(botMessage);
  }

  renderChatHistory();
}

function findMatchingPlaces(input) {
  const searchTerm = normalizeText(input.toLowerCase().trim());
  const matches = [];

  // Spanish to English translations for common terms
  const translations = {
    'palacio real': 'royal palace',
    'catedral': 'cathedral',
    'museo': 'museum',
    'parque': 'park',
    'basilica': 'basilica',
    'plaza': 'square',
    'fundacion': 'foundation'
  };

  // Apply translations
  let enhancedSearchTerm = searchTerm;
  for (const [spanish, english] of Object.entries(translations)) {
    if (searchTerm.includes(spanish)) {
      enhancedSearchTerm = searchTerm.replace(spanish, english);
      break;
    }
  }

  storyData.chapters.forEach((chapter, index) => {
    const titleMatch = normalizeText(chapter.title.toLowerCase());
    const placeNameMatch = normalizeText(chapter.placeName.toLowerCase());

    let score = 0;

    // Exact match gets highest score
    if (titleMatch === searchTerm || titleMatch === enhancedSearchTerm) {
      score = 1;
    }
    // Check if search term is contained in title
    else if (titleMatch.includes(searchTerm) || titleMatch.includes(enhancedSearchTerm)) {
      score = 0.9;
    }
    // Check if search term is in placeName
    else if (placeNameMatch.includes(searchTerm) || placeNameMatch.includes(enhancedSearchTerm)) {
      score = 0.8;
    }
    // Check individual words
    else {
      const words = searchTerm.split(' ').filter(w => w.length > 2);
      const enhancedWords = enhancedSearchTerm.split(' ').filter(w => w.length > 2);
      let wordMatchCount = 0;
      let totalWords = words.length;

      words.forEach(word => {
        if (titleMatch.includes(word) || placeNameMatch.includes(word)) {
          wordMatchCount++;
        }
      });

      enhancedWords.forEach(word => {
        if (titleMatch.includes(word) || placeNameMatch.includes(word)) {
          wordMatchCount++;
        }
      });

      if (wordMatchCount > 0 && totalWords > 0) {
        score = wordMatchCount / totalWords * 0.7;
      }
    }

    if (score > 0.2) {
      matches.push({
        ...chapter,
        index,
        score
      });
    }
  });

  matches.sort((a, b) => b.score - a.score);

  return matches;
}

// Function to normalize text by removing accents and special characters
function normalizeText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function navigateToPlace(index) {
  console.log(`🗺️ Navigating to chapter index: ${index}`);

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
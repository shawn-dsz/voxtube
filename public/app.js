/**
 * VoxTube Frontend
 */

// DOM Elements
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const transcriptSection = document.getElementById('transcript-section');
const transcriptText = document.getElementById('transcript-text');
const charCount = document.getElementById('char-count');
const voiceSection = document.getElementById('voice-section');
const voiceSelect = document.getElementById('voice-select');
const generateBtn = document.getElementById('generate-btn');
const playerSection = document.getElementById('player-section');
const audioPlayer = document.getElementById('audio-player');
const cacheStatus = document.getElementById('cache-status');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');
const errorDiv = document.getElementById('error');

// State
let currentVideoId = null;
let voices = [];

// Initialize
async function init() {
  await loadVoices();
  setupEventListeners();
}

// Load available voices
async function loadVoices() {
  try {
    const res = await fetch('/api/voices');
    const data = await res.json();
    voices = data.voices || [];

    voiceSelect.innerHTML = voices
      .map((v) => `<option value="${v.id}">${v.name}</option>`)
      .join('');
  } catch (err) {
    console.error('Failed to load voices:', err);
    showError('Failed to load voices. Is the server running?');
  }
}

// Event listeners
function setupEventListeners() {
  // Fetch transcript
  fetchBtn.addEventListener('click', handleFetchTranscript);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetchTranscript();
  });

  // Generate audio
  generateBtn.addEventListener('click', handleGenerateAudio);

  // Auto-paste from clipboard on focus (optional UX)
  urlInput.addEventListener('focus', async () => {
    if (!urlInput.value && navigator.clipboard) {
      try {
        const text = await navigator.clipboard.readText();
        if (isYouTubeUrl(text)) {
          urlInput.value = text;
        }
      } catch {
        // Clipboard access denied, ignore
      }
    }
  });
}

// Check if string looks like YouTube URL
function isYouTubeUrl(str) {
  return /youtube\.com\/watch|youtu\.be\/|youtube\.com\/embed/.test(str);
}

// Fetch transcript from URL
async function handleFetchTranscript() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please enter a YouTube URL or video ID');
    return;
  }

  hideError();
  showLoading('Fetching transcript...');
  setButtonsDisabled(true);

  try {
    const res = await fetch('/api/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || 'Failed to fetch transcript');
    }

    currentVideoId = data.videoId;
    transcriptText.value = data.transcript;
    updateCharCount();

    // Show transcript and voice sections
    transcriptSection.classList.remove('hidden');
    voiceSection.classList.remove('hidden');
    playerSection.classList.add('hidden');

    // Focus on generate button
    generateBtn.focus();
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
    setButtonsDisabled(false);
  }
}

// Generate audio
async function handleGenerateAudio() {
  if (!currentVideoId) {
    showError('No video loaded. Please fetch a transcript first.');
    return;
  }

  const text = transcriptText.value.trim();
  const voice = voiceSelect.value;

  if (!text) {
    showError('Transcript is empty');
    return;
  }

  if (!voice) {
    showError('Please select a voice');
    return;
  }

  hideError();
  showLoading('Generating audio... (this may take a while for long videos)');
  setButtonsDisabled(true);

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: currentVideoId,
        text,
        voice,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to generate audio');
    }

    // Get cache status from header
    const cacheHit = res.headers.get('X-Cache') === 'HIT';

    // Create blob URL for audio
    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);

    // Set audio source and show player
    audioPlayer.src = audioUrl;
    playerSection.classList.remove('hidden');

    // Show cache status
    cacheStatus.textContent = cacheHit
      ? '📦 Loaded from cache'
      : '🎙️ Freshly generated';
    cacheStatus.className = 'cache-status' + (cacheHit ? ' hit' : '');

    // Auto-play
    audioPlayer.play().catch(() => {
      // Autoplay blocked, user needs to click play
    });
  } catch (err) {
    showError(err.message);
  } finally {
    hideLoading();
    setButtonsDisabled(false);
  }
}

// Update character count
function updateCharCount() {
  const count = transcriptText.value.length;
  charCount.textContent = `${count.toLocaleString()} characters`;
}

// UI Helpers
function showLoading(text) {
  loadingText.textContent = text;
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
}

function hideError() {
  errorDiv.classList.add('hidden');
}

function setButtonsDisabled(disabled) {
  fetchBtn.disabled = disabled;
  generateBtn.disabled = disabled;
}

// Start
init();

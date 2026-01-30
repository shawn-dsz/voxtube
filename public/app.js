/**
 * VoxTube Frontend
 * Fetch YouTube transcript, summarize with Claude, play as audio
 */

// DOM Elements
const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const summarySection = document.getElementById('summary-section');
const summaryText = document.getElementById('summary-text');
const summaryStatus = document.getElementById('summary-status');
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
let currentSummaryForSpeech = null;
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
  // Fetch and summarize
  fetchBtn.addEventListener('click', handleFetchAndSummarize);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleFetchAndSummarize();
  });

  // Generate audio
  generateBtn.addEventListener('click', handleGenerateAudio);

  // Auto-paste from clipboard on focus
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

// Fetch transcript and summarize
async function handleFetchAndSummarize() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please enter a YouTube URL or video ID');
    return;
  }

  hideError();
  showLoading('Fetching transcript...');
  setButtonsDisabled(true);

  try {
    // Step 1: Fetch transcript
    const transcriptRes = await fetch('/api/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const transcriptData = await transcriptRes.json();

    if (!transcriptRes.ok || transcriptData.error) {
      throw new Error(transcriptData.error || 'Failed to fetch transcript');
    }

    currentVideoId = transcriptData.videoId;

    // Step 2: Summarize transcript
    showLoading('Summarizing with Claude... (this may take a moment)');

    const summarizeRes = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: transcriptData.videoId,
        transcript: transcriptData.transcript,
        title: transcriptData.title,
        channel: transcriptData.channel,
        duration: transcriptData.duration,
      }),
    });

    const summarizeData = await summarizeRes.json();

    if (!summarizeRes.ok || summarizeData.error) {
      throw new Error(summarizeData.error || 'Failed to summarize transcript');
    }

    // Store the speech-friendly version for TTS
    currentSummaryForSpeech = summarizeData.summaryForSpeech;

    // Render summary as formatted HTML
    summaryText.innerHTML = renderMarkdown(summarizeData.summary);
    summaryStatus.textContent = summarizeData.cached ? '📦 Cached' : '🤖 Fresh';
    summaryStatus.className = 'summary-status' + (summarizeData.cached ? ' cached' : '');

    // Show summary and voice sections
    summarySection.classList.remove('hidden');
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

// Simple markdown to HTML renderer
function renderMarkdown(md) {
  return md
    // Headers
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    // Checkbox items
    .replace(/^- \[ \] (.+)$/gm, '<li class="task">$1</li>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Paragraphs (lines that don't start with HTML)
    .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
    // Clean up empty paragraphs
    .replace(/<p><\/p>/g, '')
    // Line breaks
    .replace(/\n/g, '');
}

// Generate audio
async function handleGenerateAudio() {
  if (!currentVideoId || !currentSummaryForSpeech) {
    showError('No summary loaded. Please fetch a video first.');
    return;
  }

  const voice = voiceSelect.value;

  if (!voice) {
    showError('Please select a voice');
    return;
  }

  hideError();
  showLoading('Generating audio...');
  setButtonsDisabled(true);

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: currentVideoId + '_summary', // Use different cache key for summary audio
        text: currentSummaryForSpeech,
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

/**
 * background.js — Service worker for LinkedIn Comment AI.
 *
 * Responsibilities:
 *  - Listen for GENERATE_COMMENT messages from content scripts
 *  - Fetch persisted settings from chrome.storage.local
 *  - Build the full prompt from system prompt + knowledge base + post context
 *  - Call the appropriate LLM provider via providers.js
 *  - Return { success, text } or { success: false, error } to the caller
 *
 * Also handles FETCH_MODELS messages so the popup can request model lists
 * through the service worker (avoids any CSP issues in the popup context).
 */

importScripts('/lib/providers.js', '/lib/storage.js');

// ---------------------------------------------------------------------------
// Message Router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_COMMENT') {
    handleGenerateComment(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep port open for async response
  }

  if (message.type === 'FETCH_MODELS') {
    handleFetchModels(message)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ---------------------------------------------------------------------------
// Generate Comment Handler
// ---------------------------------------------------------------------------

async function handleGenerateComment({ postContext, tone, length }) {
  // Load all settings from storage
  const settings = await storageGetAll();

  const {
    provider,
    apiKey,
    baseUrl,
    model,
    systemPrompt,
    knowledgeBase,
    extensionEnabled,
  } = settings;

  if (!extensionEnabled) {
    return { success: false, error: 'Extension is disabled. Enable it from the popup.' };
  }

  if (!apiKey) {
    return { success: false, error: 'No API key set. Open the extension popup to add one.' };
  }

  if (!model) {
    return { success: false, error: 'No model selected. Fetch models in the popup and select one.' };
  }

  // Build length description for the prompt
  const lengthDescriptions = {
    Short: 'very short (1 sentence only)',
    Medium: 'concise (2–3 sentences)',
    Long: 'detailed (4–5 sentences)',
  };
  const lengthDesc = lengthDescriptions[length] || 'concise (2–3 sentences)';

  // ---------------------------------------------------------------------------
  // System message
  // ---------------------------------------------------------------------------
  const baseSystemPrompt = systemPrompt && systemPrompt.trim()
    ? systemPrompt.trim()
    : 'You are a helpful assistant writing LinkedIn comments on behalf of the user.';

  const systemContent = [
    baseSystemPrompt,
    '',
    `Tone: write in a ${tone || 'professional'} tone.`,
    `Length: keep the comment ${lengthDesc}.`,
    'Only output the comment text itself — no preamble, no quotation marks, no explanation, no hashtags unless naturally appropriate.',
  ].join('\n');

  // ---------------------------------------------------------------------------
  // User message
  // ---------------------------------------------------------------------------
  const kbSection = knowledgeBase && knowledgeBase.trim()
    ? `Here is background information about me:\n${knowledgeBase.trim()}\n\n`
    : '';

  // Strict rule: post context is required. If extraction failed, tell the user.
  if (!postContext || !postContext.text) {
    return {
      success: false,
      error: 'Could not read the post content. Try scrolling the post into view and clicking Generate again.',
    };
  }

  const postSection = [
    `Here is the LinkedIn post I want to comment on:`,
    postContext.author   ? `Author: ${postContext.author}`      : null,
    postContext.postType ? `Post type: ${postContext.postType}` : null,
    `Post content:\n${postContext.text}`,
  ].filter(Boolean).join('\n');

  const userContent = `${kbSection}${postSection}\n\nWrite a comment I can post as a reply to this.`;

  const messages = [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];

  // ---------------------------------------------------------------------------
  // Call provider
  // ---------------------------------------------------------------------------
  try {
    const text = await callChatCompletion(
      { provider, apiKey, baseUrl, model },
      messages,
      { maxTokens: 250, temperature: 0.75 }
    );

    if (!text) {
      return {
        success: false,
        error: 'Model returned empty content. Check DevTools console (F12 → Console) for details, or try a different model.',
      };
    }

    return { success: true, text };
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error during generation.' };
  }
}

// ---------------------------------------------------------------------------
// Fetch Models Handler
// ---------------------------------------------------------------------------

async function handleFetchModels({ provider, apiKey, baseUrl }) {
  try {
    const models = await fetchModels(provider, apiKey, baseUrl);
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to fetch models.' };
  }
}

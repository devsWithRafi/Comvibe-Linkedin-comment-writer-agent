/**
 * lib/providers.js — LLM provider configurations, model-fetching, and API call logic.
 *
 * Exported API (used by background.js and popup.js):
 *   fetchModels(provider, apiKey, baseUrl)  → Promise<{id, label}[]>
 *   callChatCompletion(settings, messages)  → Promise<string>
 *   getProviderConfig(provider, baseUrl)    → { name, chatUrl, modelsUrl, headers }
 */

// ---------------------------------------------------------------------------
// Provider Configurations
// ---------------------------------------------------------------------------

const PROVIDER_CONFIGS = {
  openai: {
    name: 'OpenAI',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    modelsUrl: 'https://api.openai.com/v1/models',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    extraHeaders: {},
    modelFilter: (model) => model.id.startsWith('gpt') || model.id.startsWith('o1') || model.id.startsWith('o3'),
    labelFor: (model) => model.id,
  },
  groq: {
    name: 'Groq',
    chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    modelsUrl: 'https://api.groq.com/openai/v1/models',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    extraHeaders: {},
    modelFilter: () => true,
    labelFor: (model) => model.id,
  },
  openrouter: {
    name: 'OpenRouter',
    chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    authHeader: (key) => (key ? { Authorization: `Bearer ${key}` } : {}),
    extraHeaders: {
      'HTTP-Referer': 'https://github.com/linkedin-comment-ai',
      'X-Title': 'LinkedIn Comment AI',
    },
    modelFilter: () => true,
    labelFor: (model) => model.name || model.id,
  },
  custom: {
    name: 'Custom (OpenAI-compatible)',
    // chatUrl and modelsUrl are constructed dynamically from baseUrl
    authHeader: (key) => (key ? { Authorization: `Bearer ${key}` } : {}),
    extraHeaders: {},
    modelFilter: () => true,
    labelFor: (model) => model.id,
  },
};

/**
 * Get the resolved provider configuration, including dynamic URLs for custom.
 * @param {string} provider
 * @param {string} [baseUrl]
 * @returns {object}
 */
function getProviderConfig(provider, baseUrl) {
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.openai;
  if (provider === 'custom' && baseUrl) {
    const cleanBase = baseUrl.replace(/\/$/, '');
    return {
      ...config,
      chatUrl: `${cleanBase}/chat/completions`,
      modelsUrl: `${cleanBase}/models`,
    };
  }
  return config;
}

// ---------------------------------------------------------------------------
// Model Fetching
// ---------------------------------------------------------------------------

/**
 * Fetch available models for a given provider.
 * Returns a normalized array of { id, label } sorted alphabetically by id.
 *
 * @param {string} provider  — 'openai' | 'groq' | 'openrouter' | 'custom'
 * @param {string} apiKey
 * @param {string} [baseUrl] — required for 'custom' provider
 * @returns {Promise<{id: string, label: string}[]>}
 */
async function fetchModels(provider, apiKey, baseUrl) {
  const config = getProviderConfig(provider, baseUrl);

  if (!config.modelsUrl) {
    throw new Error('No models endpoint available for this provider.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...config.authHeader(apiKey),
    ...config.extraHeaders,
  };

  const response = await fetch(config.modelsUrl, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const hint = response.status === 401
      ? 'Invalid API key.'
      : `HTTP ${response.status}`;
    throw new Error(`${hint}${errText ? ': ' + errText.slice(0, 120) : ''}`);
  }

  const data = await response.json();

  // Normalize: OpenAI-compatible schema → { data: [{id, ...}] }
  // OpenRouter returns: { data: [{id, name, ...}] }
  let models = Array.isArray(data)
    ? data
    : Array.isArray(data.data)
      ? data.data
      : [];

  // Apply provider-specific filter
  if (config.modelFilter) {
    models = models.filter(config.modelFilter);
  }

  // Normalize to { id, label }
  const normalized = models.map((m) => ({
    id: m.id,
    label: config.labelFor ? config.labelFor(m) : m.id,
  }));

  // Sort alphabetically by id
  normalized.sort((a, b) => a.id.localeCompare(b.id));

  return normalized;
}

// ---------------------------------------------------------------------------
// Chat Completion
// ---------------------------------------------------------------------------

/**
 * Call the chat completions endpoint for the given provider.
 *
 * @param {object} settings  — { provider, apiKey, baseUrl, model }
 * @param {object[]} messages — [{ role: 'system'|'user'|'assistant', content: string }]
 * @param {object} [options]  — { maxTokens, temperature }
 * @returns {Promise<string>}  — the assistant's reply text (trimmed)
 */
async function callChatCompletion(settings, messages, options = {}) {
  const { provider, apiKey, baseUrl, model } = settings;
  const config = getProviderConfig(provider, baseUrl);

  if (!config.chatUrl) {
    throw new Error('Chat completion URL is not configured.');
  }

  const headers = {
    'Content-Type': 'application/json',
    ...config.authHeader(apiKey),
    ...config.extraHeaders,
  };

  const body = {
    model: model,
    messages,
    max_tokens: options.maxTokens || 400,
    temperature: options.temperature !== undefined ? options.temperature : 0.75,
  };

  const response = await fetch(config.chatUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errData;
    try { errData = await response.json(); } catch (_) { errData = null; }
    // Surface the most informative error message available
    const msg =
      errData?.error?.message ||
      errData?.message ||
      errData?.detail ||
      `HTTP ${response.status} from ${provider}`;
    throw new Error(msg);
  }

  const data = await response.json();

  // Debug log (no API keys, no PII — safe to leave in)
  console.debug('[LinkedIn Comment AI] API response shape:', {
    id: data?.id,
    model: data?.model,
    finish_reason: data?.choices?.[0]?.finish_reason,
    content_type: typeof data?.choices?.[0]?.message?.content,
    usage: data?.usage,
  });

  // ── Extract text from all known response shapes ──────────────────────
  let raw = '';

  const choice = data?.choices?.[0];
  if (choice) {
    const msg = choice.message || choice.delta || {};

    // Standard path: content is a string
    if (typeof msg.content === 'string' && msg.content.trim()) {
      raw = msg.content;

    // Anthropic via OpenRouter: content is an array of blocks
    } else if (Array.isArray(msg.content)) {
      raw = msg.content
        .filter(block => block.type === 'text')
        .map(block => block.text || '')
        .join('');

    // Reasoning models (o1, o3, some Groq): content is null but reasoning_content has text
    } else if (msg.reasoning_content && typeof msg.reasoning_content === 'string') {
      raw = msg.reasoning_content;

    // Last resort: text field (legacy completions format)
    } else if (typeof choice.text === 'string') {
      raw = choice.text;
    }
  }

  // Also check top-level 'text' (some non-standard providers)
  if (!raw && typeof data?.text === 'string') {
    raw = data.text;
  }

  if (!raw) {
    const finishReason = data?.choices?.[0]?.finish_reason || 'unknown';
    console.warn('[LinkedIn Comment AI] Empty content. finish_reason:', finishReason);

    if (finishReason === 'content_filter') {
      throw new Error('Response blocked by content filter. Try rephrasing your system prompt.');
    }
    if (finishReason === 'length') {
      // Got cut off — try to use whatever we have in the raw data
      throw new Error('Response cut off (max_tokens reached). Try a shorter length setting.');
    }
    // Return empty — caller will surface the 'empty response' error
    return '';
  }

  // Strip wrapping quotation marks the model sometimes adds, but only if it
  // won't empty the string (e.g. if the model literally returned `""`).
  const cleaned = raw.trim();
  if (cleaned.length > 2) {
    return cleaned.replace(/^["']|["']$/g, '').trim();
  }
  return cleaned;
}

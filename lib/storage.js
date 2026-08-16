/**
 * lib/storage.js — chrome.storage.local helpers
 * Provides typed get/set wrappers for all persisted settings.
 */

const STORAGE_KEYS = {
  EXTENSION_ENABLED: 'extensionEnabled',
  PROVIDER: 'provider',
  API_KEY: 'apiKey',
  BASE_URL: 'baseUrl',
  MODEL: 'model',
  FETCHED_MODELS: 'fetchedModels',
  SYSTEM_PROMPT: 'systemPrompt',
  KNOWLEDGE_BASE: 'knowledgeBase',
  TONE: 'tone',
  LENGTH: 'length',
};

const DEFAULTS = {
  extensionEnabled: true,
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: '',
  fetchedModels: [],
  systemPrompt: '',
  knowledgeBase: '',
  tone: 'Professional',
  length: 'Medium',
};

/**
 * Get one or more keys from storage. Returns an object with requested keys.
 * @param {string|string[]} keys
 * @returns {Promise<object>}
 */
function storageGet(keys) {
  return new Promise((resolve, reject) => {
    const keysToGet = Array.isArray(keys) ? keys : [keys];
    const defaults = {};
    keysToGet.forEach(k => {
      if (DEFAULTS[k] !== undefined) defaults[k] = DEFAULTS[k];
    });
    chrome.storage.local.get(defaults, (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Get all settings at once.
 * @returns {Promise<object>}
 */
function storageGetAll() {
  return storageGet(Object.keys(DEFAULTS));
}

/**
 * Set one or more keys in storage.
 * @param {object} items
 * @returns {Promise<void>}
 */
function storageSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Clear all extension storage.
 * @returns {Promise<void>}
 */
function storageClear() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

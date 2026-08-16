/**
 * popup/popup.js — Settings popup logic
 *
 * Features:
 *  - Load all saved settings and populate the form on open
 *  - Auto-save with debounce on any change (200ms) + "Saved ✓" toast
 *  - Provider change: update API key label, show/hide base URL field
 *  - Fetch Models: call background.js → FETCH_MODELS, populate dropdown
 *  - API key show/hide toggle
 *  - Character count for knowledge base
 *  - Onboarding state when no API key is configured
 *  - Validation hints (system prompt empty warning)
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Element refs
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const elEnabled        = $('extensionEnabled');
  const elProvider       = $('provider');
  const elBaseUrlField   = $('baseUrlField');
  const elBaseUrl        = $('baseUrl');
  const elApiKeyLabel    = $('apiKeyLabel');
  const elApiKey         = $('apiKey');
  const elToggleApiKey   = $('toggleApiKey');
  const elModel          = $('model');
  const elFetchModels    = $('fetchModelsBtn');
  const elFetchContent   = $('fetchModelsBtnContent');
  const elModelsError    = $('modelsError');
  const elSystemPrompt   = $('systemPrompt');
  const elSystemWarn     = $('systemPromptWarn');
  const elKnowledgeBase  = $('knowledgeBase');
  const elKbCharCount    = $('kbCharCount');
  const elTone           = $('tone');
  const elLength         = $('length');
  const elSaveToast      = $('saveToast');
  const elOnboarding     = $('onboarding');

  // Provider display names for the API key label
  const PROVIDER_KEY_LABELS = {
    openai: 'OpenAI API Key',
    groq: 'Groq API Key',
    openrouter: 'OpenRouter API Key',
    custom: 'API Key (optional)',
  };

  // ---------------------------------------------------------------------------
  // Load settings on popup open
  // ---------------------------------------------------------------------------
  storageGetAll().then((settings) => {
    elEnabled.checked      = settings.extensionEnabled !== false;
    elProvider.value       = settings.provider || 'openai';
    elBaseUrl.value        = settings.baseUrl || '';
    elApiKey.value         = settings.apiKey || '';
    elSystemPrompt.value   = settings.systemPrompt || '';
    elKnowledgeBase.value  = settings.knowledgeBase || '';
    elTone.value           = settings.tone || 'Professional';
    elLength.value         = settings.length || 'Medium';

    updateProviderUI(settings.provider || 'openai');
    updateCharCount();
    updateSystemPromptWarn();
    updateOnboarding(settings.apiKey);

    // Restore fetched models list
    const models = settings.fetchedModels || [];
    if (models.length > 0) {
      populateModelDropdown(models, settings.model);
    }
  });

  // ---------------------------------------------------------------------------
  // Auto-save: debounced on any input change
  // ---------------------------------------------------------------------------
  let saveTimer = null;

  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSettings, 250);
  }

  async function saveSettings() {
    const settings = {
      extensionEnabled: elEnabled.checked,
      provider: elProvider.value,
      baseUrl: elBaseUrl.value.trim(),
      apiKey: elApiKey.value.trim(),
      model: elModel.value,
      systemPrompt: elSystemPrompt.value,
      knowledgeBase: elKnowledgeBase.value,
      tone: elTone.value,
      length: elLength.value,
    };

    try {
      await storageSet(settings);
      showToast('Saved ✓');
    } catch (err) {
      showToast('Save failed ✗', true);
    }

    updateOnboarding(settings.apiKey);
    updateSystemPromptWarn();
  }

  // ---------------------------------------------------------------------------
  // UI: Provider change
  // ---------------------------------------------------------------------------
  function updateProviderUI(provider) {
    // Show/hide base URL field
    elBaseUrlField.hidden = provider !== 'custom';

    // Update API key label
    elApiKeyLabel.textContent = PROVIDER_KEY_LABELS[provider] || 'API Key';

    // Update API key placeholder
    const placeholders = {
      openai: 'sk-…',
      groq: 'gsk_…',
      openrouter: 'sk-or-…',
      custom: 'your-api-key (if required)',
    };
    elApiKey.placeholder = placeholders[provider] || 'API key';
  }

  elProvider.addEventListener('change', () => {
    updateProviderUI(elProvider.value);
    // Clear model list when provider changes
    resetModelDropdown();
    scheduleAutosave();
  });

  // ---------------------------------------------------------------------------
  // UI: Character count
  // ---------------------------------------------------------------------------
  function updateCharCount() {
    const count = elKnowledgeBase.value.length;
    elKbCharCount.textContent = `${count.toLocaleString()} character${count !== 1 ? 's' : ''}`;
  }

  elKnowledgeBase.addEventListener('input', () => {
    updateCharCount();
    scheduleAutosave();
  });

  // ---------------------------------------------------------------------------
  // UI: System prompt warning
  // ---------------------------------------------------------------------------
  function updateSystemPromptWarn() {
    elSystemWarn.hidden = !!elSystemPrompt.value.trim();
  }

  elSystemPrompt.addEventListener('input', () => {
    updateSystemPromptWarn();
    scheduleAutosave();
  });

  // ---------------------------------------------------------------------------
  // UI: Onboarding state
  // ---------------------------------------------------------------------------
  function updateOnboarding(apiKey) {
    elOnboarding.hidden = !!(apiKey && apiKey.trim());
  }

  // ---------------------------------------------------------------------------
  // UI: Show/hide API key
  // ---------------------------------------------------------------------------
  let apiKeyVisible = false;

  elToggleApiKey.addEventListener('click', () => {
    apiKeyVisible = !apiKeyVisible;
    elApiKey.type = apiKeyVisible ? 'text' : 'password';
    // Swap icon: eye vs eye-off
    $('eyeIcon').innerHTML = apiKeyVisible
      ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
      : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
  });

  // ---------------------------------------------------------------------------
  // Fetch Models
  // ---------------------------------------------------------------------------
  elFetchModels.addEventListener('click', handleFetchModels);

  // Auto-trigger fetch on API key paste/blur if it looks valid
  elApiKey.addEventListener('blur', () => {
    const key = elApiKey.value.trim();
    const provider = elProvider.value;
    if (key && (key.length > 10 || provider === 'openrouter')) {
      // Only auto-fetch if no models loaded yet
      if (elModel.options.length <= 1 || elModel.disabled) {
        handleFetchModels();
      }
    }
    scheduleAutosave();
  });

  async function handleFetchModels() {
    const provider = elProvider.value;
    const apiKey   = elApiKey.value.trim();
    const baseUrl  = elBaseUrl.value.trim();

    if (provider === 'custom' && !baseUrl) {
      showModelsError('Please enter a Base URL for the custom provider.');
      return;
    }

    setFetchLoading(true);
    hideModelsError();

    try {
      // Route through background service worker to avoid any popup CSP issues
      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_MODELS',
        provider,
        apiKey,
        baseUrl,
      });

      if (response && response.success && response.models) {
        populateModelDropdown(response.models, null);
        // Persist fetched models
        const savedModel = elModel.value;
        await storageSet({ fetchedModels: response.models, model: savedModel });
        showToast('Models loaded ✓');
      } else {
        const errMsg = response?.error || 'Failed to fetch models.';
        showModelsError(`Couldn't fetch models — ${errMsg}`);
      }
    } catch (err) {
      showModelsError('Extension error: ' + (err.message || 'unknown'));
    } finally {
      setFetchLoading(false);
    }
  }

  function setFetchLoading(isLoading) {
    elFetchModels.disabled = isLoading;
    elModel.disabled = isLoading;
    elFetchContent.innerHTML = isLoading
      ? `<span class="btn-spinner"></span> Fetching…`
      : 'Fetch Models';
  }

  function populateModelDropdown(models, selectedModel) {
    elModel.innerHTML = '';
    elModel.disabled = false;

    if (!models || models.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '— no models found —';
      elModel.appendChild(opt);
      elModel.disabled = true;
      return;
    }

    models.forEach(({ id, label }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label || id;
      if (id === selectedModel) opt.selected = true;
      elModel.appendChild(opt);
    });
  }

  function resetModelDropdown() {
    elModel.innerHTML = '<option value="">— fetch models first —</option>';
    elModel.disabled = true;
    hideModelsError();
  }

  function showModelsError(msg) {
    elModelsError.textContent = msg;
    elModelsError.hidden = false;
  }

  function hideModelsError() {
    elModelsError.hidden = true;
    elModelsError.textContent = '';
  }

  // ---------------------------------------------------------------------------
  // Save toast
  // ---------------------------------------------------------------------------
  let toastTimer = null;

  function showToast(msg, isError = false) {
    clearTimeout(toastTimer);
    elSaveToast.textContent = msg;
    elSaveToast.style.color = isError ? 'var(--text-danger)' : 'var(--text-success)';
    elSaveToast.classList.add('visible');
    toastTimer = setTimeout(() => {
      elSaveToast.classList.remove('visible');
    }, 2500);
  }

  // ---------------------------------------------------------------------------
  // Wire up remaining inputs for auto-save
  // ---------------------------------------------------------------------------
  [elEnabled, elBaseUrl, elModel, elTone, elLength].forEach((el) => {
    el.addEventListener('change', scheduleAutosave);
  });

  [elApiKey, elSystemPrompt].forEach((el) => {
    el.addEventListener('input', scheduleAutosave);
  });

  elModel.addEventListener('change', () => {
    storageSet({ model: elModel.value });
  });

})();

/**
 * content/content.js — LinkedIn DOM injection + Generate flow
 *
 * Responsibilities:
 *  1. Observe the LinkedIn feed for new comment boxes using MutationObserver
 *  2. Inject a "✨ Generate" toolbar into each unprocessed comment box
 *  3. On click: extract post context, send to background, insert generated comment
 *
 * Post context extraction uses a FOUR-STRATEGY waterfall so it stays robust
 * even when LinkedIn renames its CSS classes:
 *   A) Class-name selectors (specific, may break on LinkedIn updates)
 *   B) Data-attribute & wildcard class selectors (more stable)
 *   C) Heuristic: largest text-dense child element in the post container
 *   D) Fallback: nearest large text block above the comment box on the page
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Comment-box selectors — tried in order; first match wins
  // ---------------------------------------------------------------------------
  const COMMENT_BOX_SELECTORS = [
    'div[contenteditable="true"].ql-editor',
    '.comments-comment-box__input div[contenteditable="true"]',
    '.comments-comment-texteditor div[contenteditable="true"]',
    '.comments-comment-box div[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"][aria-label*="comment" i]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];

  const TONES   = ['Professional', 'Casual', 'Witty', 'Supportive', 'Analytical', 'Contrarian'];
  const LENGTHS = ['Short', 'Medium', 'Long'];

  let extensionEnabled = true;
  let defaultTone   = 'Professional';
  let defaultLength = 'Medium';

  // ---------------------------------------------------------------------------
  // Runtime validity guard
  // After an extension reload/update, the old injected content script loses its
  // chrome.runtime connection. Detect this early so we can show a clear message.
  // ---------------------------------------------------------------------------
  function isRuntimeValid() {
    try {
      return !!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  // Load initial state then boot observer
  if (isRuntimeValid()) {
    chrome.storage.local.get({ extensionEnabled: true, tone: 'Professional', length: 'Medium' }, (res) => {
      if (chrome.runtime.lastError) return; // Context already invalidated
      extensionEnabled = res.extensionEnabled;
      defaultTone      = res.tone;
      defaultLength    = res.length;
      if (extensionEnabled) initObserver();
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (!isRuntimeValid()) return;
      if (changes.extensionEnabled) {
        extensionEnabled = changes.extensionEnabled.newValue;
        if (extensionEnabled) initObserver();
      }
      if (changes.tone)   defaultTone   = changes.tone.newValue;
      if (changes.length) defaultLength = changes.length.newValue;
    });
  } else {
    // Runtime already gone on first load — just run with defaults
    initObserver();
  }

  // ---------------------------------------------------------------------------
  // MutationObserver
  // ---------------------------------------------------------------------------
  let observerActive = false;

  function initObserver() {
    if (observerActive) return;
    observerActive = true;

    const observer = new MutationObserver(() => {
      if (extensionEnabled) injectIntoAllCommentBoxes();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    injectIntoAllCommentBoxes();
  }

  function injectIntoAllCommentBoxes() {
    for (const selector of COMMENT_BOX_SELECTORS) {
      document.querySelectorAll(selector).forEach((box) => {
        if (!box.dataset.liAiInjected) injectToolbar(box);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Toolbar injection
  // ---------------------------------------------------------------------------
  function injectToolbar(commentBox) {
    commentBox.dataset.liAiInjected = 'true';

    const container = findCommentContainer(commentBox);
    if (!container) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'li-ai-toolbar';

    const toneSelect = createSelect('Comment tone', TONES, defaultTone);
    const lengthSelect = createSelect('Comment length', LENGTHS, defaultLength);

    const generateBtn = document.createElement('button');
    generateBtn.className = 'li-ai-generate-btn';
    generateBtn.type = 'button';
    generateBtn.innerHTML = `<span class="li-ai-btn-icon">✨</span><span class="li-ai-btn-label">Generate</span>`;

    const statusEl = document.createElement('span');
    statusEl.className = 'li-ai-status';

    toolbar.appendChild(generateBtn);
    toolbar.appendChild(toneSelect);
    toolbar.appendChild(lengthSelect);
    toolbar.appendChild(statusEl);

    container.insertBefore(toolbar, findInsertionPoint(container, commentBox));

    generateBtn.addEventListener('click', () => {
      handleGenerate(commentBox, generateBtn, toneSelect, lengthSelect, statusEl);
    });
  }

  function createSelect(ariaLabel, options, defaultValue) {
    const sel = document.createElement('select');
    sel.className = 'li-ai-select';
    sel.title = ariaLabel;
    sel.setAttribute('aria-label', ariaLabel);
    options.forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      if (val === defaultValue) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function findCommentContainer(commentBox) {
    const containerSelectors = [
      '.comments-comment-box__form',
      '.comments-comment-box',
      '.comments-comment-texteditor',
      '.comments-comment-box-comment__text-editor',
      '.editor-container',
    ];
    let el = commentBox;
    for (let i = 0; i < 8; i++) {
      el = el?.parentElement;
      if (!el) break;
      if (containerSelectors.some(s => { try { return el.matches(s); } catch(_){return false;} })) return el;
    }
    return commentBox.parentElement?.parentElement || commentBox.parentElement;
  }

  function findInsertionPoint(container, commentBox) {
    let el = commentBox;
    while (el && el.parentElement !== container) el = el.parentElement;
    return el || null;
  }

  // ===========================================================================
  // POST CONTEXT EXTRACTION — 3-Tier Zero-Fail Dynamic Extraction Engine
  // ===========================================================================

  function extractPostContext(commentBox) {
    let text     = null;
    let author   = null;
    let postType = null;

    // Tier 1: Targeted container resolution
    const postContainer = findSinglePostContainer(commentBox);
    if (postContainer) {
      tryExpandSeeMore(postContainer);
      author   = extractAuthor(postContainer);
      postType = detectPostType(postContainer);
      text     = extractPostTextFromContainer(postContainer);
    }

    // Tier 2: Step-by-step parent clone scanner
    if (!text || text.length < 5) {
      text = getEnclosingPostText(commentBox);
    }

    // Tier 3: Page-level proximity fallback
    if (!text || text.length < 5) {
      text = fallbackExtractNearestText(commentBox);
    }

    if (text) text = sanitizeText(text);

    console.log('[LinkedIn Comment AI] Extracted post context:', {
      author,
      postType,
      textLength: text ? text.length : 0,
      preview: text ? text.slice(0, 120) + '…' : 'NULL'
    });

    return { text: text || null, author, postType };
  }

  // ---------------------------------------------------------------------------
  // Tier 2 — Step-by-step parent clone scanner
  // Climbs UP parent by parent, clones the parent, strips headers and comment box,
  // and returns whatever post body text is present.
  // ---------------------------------------------------------------------------
  function getEnclosingPostText(commentBox) {
    let el = commentBox;
    const GLOBAL_LAYOUT_TAGS = ['MAIN', 'BODY', 'HTML'];

    for (let i = 0; i < 35; i++) {
      el = el?.parentElement;
      if (!el || GLOBAL_LAYOUT_TAGS.includes(el.tagName)) break;

      const cls = (el.className || '').toString();
      if (/scaffold-layout|feed-outlet|core-rail|scaffold-finite-scroll|feed-shared-update-v2__list/i.test(cls)) {
        break;
      }

      try {
        const clone = el.cloneNode(true);
        clone.querySelectorAll(`
          .update-components-actor,
          .feed-shared-actor,
          .comments-post-meta,
          .feed-shared-social-action-bar,
          .feed-shared-social-counts,
          .social-details-social-counts,
          .update-components-header,
          .comments-comment-box,
          .li-ai-toolbar,
          [contenteditable="true"],
          button,
          [role="button"]
        `).forEach(node => node.remove());

        let t = (clone.innerText || clone.textContent || '').trim();

        t = t.replace(/…\s*see more/gi, '')
             .replace(/\.\.\.\s*more/gi, '')
             .replace(/see more$/gi, '')
             .replace(/\n{3,}/g, '\n\n')
             .replace(/[ \t]{2,}/g, ' ')
             .trim();

        if (t.length >= 5 && !/^(like|comment|repost|send|share|reply|see more|show more|\d+\s*(likes?|comments?|reposts?|reactions?))$/i.test(t)) {
          return t;
        }
      } catch (_) {}
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Tier 3 — Page-level proximity fallback
  // ---------------------------------------------------------------------------
  function fallbackExtractNearestText(commentBox) {
    const boxRect = commentBox.getBoundingClientRect();
    const candidates = [];
    const elements = document.querySelectorAll('p, span, div');

    const excludeSelector = `
      .update-components-actor,
      .feed-shared-actor,
      .comments-post-meta,
      .feed-shared-social-action-bar,
      .feed-shared-social-counts,
      .social-details-social-counts,
      .comments-comment-box,
      .li-ai-toolbar,
      [contenteditable="true"]
    `;

    for (const el of elements) {
      if (el.closest(excludeSelector)) continue;
      if (el.children.length > 5) continue;

      const t = getCleanText(el);
      if (t.length < 5) continue;
      if (/^(like|comment|repost|send|share|reply|see more|show more|\d+\s*(likes?|comments?|reposts?|reactions?))$/i.test(t)) continue;

      const rect = el.getBoundingClientRect();
      const dist = Math.abs(boxRect.top - rect.bottom);

      candidates.push({ el, t, dist, length: t.length });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      const scoreA = a.length / (a.dist + 10);
      const scoreB = b.length / (b.dist + 10);
      return scoreB - scoreA;
    });

    return candidates[0].t;
  }

  // ---------------------------------------------------------------------------
  // Step 1 — Find the SINGLE, SPECIFIC post container for this comment box.
  // Must NOT match comment input wrappers (which carry data-id/data-urn).
  // ---------------------------------------------------------------------------
  function findSinglePostContainer(commentBox) {
    let el = commentBox;
    const GLOBAL_LAYOUT_TAGS = ['MAIN', 'BODY', 'HTML'];

    const postCardSelectors = [
      '.feed-shared-update-v2',
      '.occludable-update',
      'article',
      '[data-urn*="urn:li:activity"]',
      '[data-urn*="urn:li:ugcPost"]',
      '[data-activity-urn]',
      '.comments-comment-item',
      '.artdeco-modal__content',
      '.feed-shared-detail-page'
    ];

    for (let i = 0; i < 45; i++) {
      el = el?.parentElement;
      if (!el || GLOBAL_LAYOUT_TAGS.includes(el.tagName)) break;

      const cls = (el.className || '').toString();

      // STRICT GUARD: Skip all comment input wrappers and toolbar elements!
      if (/comments-comment-box|comments-comment-texteditor|li-ai-toolbar|ql-editor/i.test(cls)) {
        continue;
      }

      // Check if el matches explicit post card selectors
      for (const sel of postCardSelectors) {
        try {
          if (el.matches(sel)) return el;
        } catch (_) {}
      }

      if (/feed-shared-update|occludable-update|update-v2|feed-shared-post/i.test(cls)) {
        return el;
      }

      // Check if el contains a post body text node AND is outside comments wrapper
      if (!cls.includes('comments-container') && !cls.includes('comments-list')) {
        try {
          const hasPostText = el.querySelector('.update-components-text, .feed-shared-update-v2__description, .feed-shared-text, [data-test-id="update-content"]');
          if (hasPostText) return el;
        } catch (_) {}
      }
    }

    // Fallback: walk up past any class containing "comment"
    el = commentBox;
    for (let i = 0; i < 30; i++) {
      el = el?.parentElement;
      if (!el || GLOBAL_LAYOUT_TAGS.includes(el.tagName)) break;
      const cls = (el.className || '').toString();
      if (!cls.includes('comment') && !cls.includes('li-ai-toolbar')) {
        return el;
      }
    }

    return commentBox.parentElement;
  }

  // ---------------------------------------------------------------------------
  // Step 2a — try to expand "See more" links inside the post container
  // ---------------------------------------------------------------------------
  function tryExpandSeeMore(container) {
    const selectors = [
      'button[aria-label*="see more" i]',
      'button[aria-label*="show more" i]',
      '.feed-shared-inline-show-more-text__see-more-less-toggle',
      'button.inline-show-more-text__button',
      '[class*="see-more"] button',
      'span.see-more',
      'button.see-more',
    ];
    for (const sel of selectors) {
      try {
        const btn = container.querySelector(sel);
        if (btn && btn.offsetParent !== null) { btn.click(); break; }
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2b — extract author name
  // ---------------------------------------------------------------------------
  function extractAuthor(container) {
    const selectors = [
      'a[data-control-name="actor_container"] span[aria-hidden="true"]',
      'a[href*="/in/"] span[aria-hidden="true"]:first-child',
      'a[href*="/company/"] span[aria-hidden="true"]:first-child',
      '.update-components-actor__name span[aria-hidden="true"]',
      '.update-components-actor__name',
      '.feed-shared-actor__name',
      '.actor-name',
      '[class*="actor__name"]',
    ];
    for (const sel of selectors) {
      try {
        const el = container.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || '').trim().split('\n')[0];
          if (t.length > 0) return t;
        }
      } catch (_) {}
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Step 2c — extract post body text from container ONLY
  // Prioritizes author's primary commentary without false exclusion of link posts.
  // ---------------------------------------------------------------------------
  function extractPostTextFromContainer(container) {
    if (!container) return null;

    // Strict UI metadata exclusions only (author header, social action counts, comment form)
    const primaryExcludeSelector = `
      .update-components-actor,
      .feed-shared-actor,
      .comments-post-meta,
      .feed-shared-social-action-bar,
      .feed-shared-social-counts,
      .social-details-social-counts,
      .update-components-actor__sub-description,
      .feed-shared-actor__sub-description,
      .comments-comment-box,
      .li-ai-toolbar,
      [contenteditable="true"]
    `;

    // 1. Primary post text selectors
    const primarySelectors = [
      '.update-components-text',
      '.update-components-text__text-view',
      '.feed-shared-update-v2__description',
      '.feed-shared-update-v2__description-wrapper',
      '.feed-shared-text',
      '.feed-shared-inline-show-more-text',
      '.attributed-text-segment-list__content',
      '.comments-comment-item__main-content',
      '.comments-comment-item__inline-show-more-text',
      '[data-test-id="update-content"]',
      'span.break-words',
      '[class*="update-components-text"]',
      '[class*="feed-shared-text"]',
      '[class*="description"]',
      '[class*="commentary"]',
      'p'
    ];

    const candidates = [];

    for (const sel of primarySelectors) {
      try {
        const elements = container.querySelectorAll(sel);
        for (const el of elements) {
          if (el.closest(primaryExcludeSelector)) continue;

          const t = getCleanText(el);
          if (t.length >= 5 && !/^(like|comment|repost|send|share|reply|see more|show more|\d+\s*(likes?|comments?|reposts?|reactions?))$/i.test(t)) {
            candidates.push(t);
          }
        }
      } catch (_) {}
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      return candidates[0];
    }

    // 2. Guaranteed Fallback: clone container, strip UI metadata, extract remaining text
    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll(`
        .update-components-actor,
        .feed-shared-actor,
        .comments-post-meta,
        .feed-shared-social-action-bar,
        .feed-shared-social-counts,
        .social-details-social-counts,
        .update-components-header,
        .comments-comment-box,
        .li-ai-toolbar,
        [contenteditable="true"],
        button,
        [role="button"]
      `).forEach(node => node.remove());

      const fallbackText = (clone.innerText || clone.textContent || '').trim();
      if (fallbackText.length >= 3) {
        return fallbackText;
      }
    } catch (_) {}

    return null;
  }

  // ---------------------------------------------------------------------------
  // Step 3 — Fallback scan strictly scoped to container
  // ---------------------------------------------------------------------------
  function fallbackExtractFromContainer(container) {
    if (!container) return null;
    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll(`
        .update-components-actor,
        .feed-shared-actor,
        .comments-post-meta,
        .feed-shared-social-action-bar,
        .feed-shared-social-counts,
        .social-details-social-counts,
        .update-components-header,
        .comments-comment-box,
        .li-ai-toolbar,
        [contenteditable="true"],
        button,
        [role="button"]
      `).forEach(node => node.remove());

      const t = (clone.innerText || clone.textContent || '').trim();
      if (t.length >= 3) return t;
    } catch (_) {}
    return null;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function getCleanText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);

    // ONLY remove specific see-more toggles, NOT hashtag buttons or mention links!
    clone.querySelectorAll(`
      .feed-shared-inline-show-more-text__see-more-less-toggle,
      button.inline-show-more-text__button,
      .see-more,
      .li-ai-toolbar
    `).forEach(b => b.remove());

    return (clone.innerText || clone.textContent || '').trim();
  }

  function sanitizeText(text) {
    return text
      .replace(/…\s*see more/gi, '')
      .replace(/\.\.\.\s*more/gi, '')
      .replace(/see more$/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim()
      .slice(0, 2500);
  }

  function detectPostType(container) {
    if (container.querySelector('[data-test-id="poll"], [class*="poll"]')) return 'poll';
    if (container.querySelector('.feed-shared-article, [class*="article"]')) return 'article share';
    if (container.querySelector('[class*="image__container"], [class*="image-container"]')) return 'image post';
    if (container.querySelector('video, [class*="video"]')) return 'video post';
    if (container.querySelector('[class*="document"]')) return 'document/PDF';
    return null;
  }

  // ===========================================================================
  // Insert generated text into LinkedIn's contenteditable
  // Must fire proper React-compatible events so LinkedIn enables "Post" button
  // ===========================================================================
  function insertTextIntoCommentBox(commentBox, text) {
    commentBox.focus();
    commentBox.innerHTML = '';

    // Primary: execCommand (works best with React's synthetic event system)
    const inserted = document.execCommand('insertText', false, text);

    if (!inserted || commentBox.innerText.trim() !== text.trim()) {
      // Fallback: direct textContent + synthetic InputEvent
      commentBox.textContent = text;
      commentBox.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true,
        inputType: 'insertText', data: text,
      }));
      commentBox.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Nudge remaining listeners
    ['keydown', 'keyup'].forEach(type =>
      commentBox.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: 'a' }))
    );

    // Move caret to end
    try {
      const range = document.createRange();
      range.selectNodeContents(commentBox);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}
  }

  // ===========================================================================
  // Generate flow
  // ===========================================================================
  async function handleGenerate(commentBox, btn, toneSelect, lengthSelect, statusEl) {
    setButtonLoading(btn, true);
    statusEl.textContent = '';
    statusEl.className = 'li-ai-status';

    // Guard: if the extension was reloaded/updated since this page loaded,
    // chrome.runtime will be undefined. Tell the user to refresh.
    if (!isRuntimeValid()) {
      showStatus(
        statusEl,
        '⚠️ Extension was updated — please refresh this LinkedIn page.',
        'error'
      );
      setButtonLoading(btn, false);
      return;
    }

    const tone        = toneSelect.value;
    const length      = lengthSelect.value;
    const postContext = extractPostContext(commentBox);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_COMMENT',
        postContext,
        tone,
        length,
      });

      // chrome.runtime.lastError must be checked when sendMessage callback fires
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message || 'Runtime error');
      }

      if (response && response.success && response.text) {
        insertTextIntoCommentBox(commentBox, response.text);
        setButtonRegenerate(btn);
        showStatus(statusEl, '✓ Inserted', 'success');
      } else {
        showStatus(statusEl, response?.error || 'Unknown error', 'error');
        setButtonLoading(btn, false);
      }
    } catch (err) {
      // Catch the specific context-invalidated error and give a friendly message
      const msg = err.message || '';
      if (
        msg.includes('Extension context invalidated') ||
        msg.includes('sendMessage') ||
        msg.includes('runtime') ||
        !isRuntimeValid()
      ) {
        showStatus(
          statusEl,
          '⚠️ Extension was updated — please refresh this page (Ctrl+R).',
          'error'
        );
      } else {
        showStatus(statusEl, msg || 'Unknown error', 'error');
      }
      setButtonLoading(btn, false);
    }
  }

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  function setButtonLoading(btn, isLoading) {
    btn.disabled = isLoading;
    btn.classList.toggle('li-ai-loading', isLoading);
    btn.innerHTML = isLoading
      ? `<span class="li-ai-spinner"></span><span class="li-ai-btn-label">Generating…</span>`
      : `<span class="li-ai-btn-icon">✨</span><span class="li-ai-btn-label">Generate</span>`;
  }

  function setButtonRegenerate(btn) {
    btn.disabled = false;
    btn.classList.remove('li-ai-loading');
    btn.classList.add('li-ai-regenerate');
    btn.innerHTML = `<span class="li-ai-btn-icon">↻</span><span class="li-ai-btn-label">Regenerate</span>`;
  }

  function showStatus(statusEl, message, type) {
    statusEl.textContent = message;
    statusEl.className = `li-ai-status li-ai-status--${type}`;
    if (type === 'success') {
      setTimeout(() => {
        statusEl.textContent = '';
        statusEl.className = 'li-ai-status';
      }, 3000);
    }
  }

})();

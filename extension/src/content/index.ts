import { pageDetector } from './page-detector';
import { fieldClassifier } from './field-classifier';
import { evidenceMapper } from './evidence-mapper';
import { reviewOverlay } from './review-overlay';
import { formFiller } from './form-filler';
import { ExtensionMessage } from '../shared/messages';
import { ExtensionState, JobContext } from '../shared/types';

console.log('[RESII Assistant] Content Script Loaded on:', window.location.href);

let cachedState: ExtensionState | null = null;
let currentJobContext: JobContext | null = null;

function initializePageAssistant(forceOpen: boolean = false) {
  try {
    const { adapter, context, isActiveSession } = pageDetector.detectJobContext(window.location.href, document);
    currentJobContext = context;

    if (!isActiveSession && !forceOpen) {
      // Inactive session on non-job page: do not clutter or mount unprompted
      reviewOverlay.remove(document);
      return;
    }

    if (isActiveSession && adapter && context) {
      // Register tab-specific job context with background service worker
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'REGISTER_TAB_CONTEXT',
          payload: { context }
        }).catch(() => {});
      }

      const form = adapter.findForm(document) || document.body;
      const rawFields = fieldClassifier.classifyForm(form, adapter);

      const candidateProfile = cachedState?.profile || {
        name: cachedState?.user?.name || '',
        email: cachedState?.user?.email || '',
        phone: '',
        title: '',
        location: '',
        bio: '',
        website: ''
      };

      const candidateFacts = cachedState?.facts || {};

      const mappedFields = evidenceMapper.mapCandidateEvidence(
        rawFields,
        candidateProfile,
        candidateFacts,
        cachedState?.resumes || []
      );

      const scanId = `resii_${Date.now()}`;

      reviewOverlay.render(
        document,
        context,
        mappedFields,
        cachedState?.resumes || [],
        scanId,
        cachedState,
        (stage: 'draft' | 'applied') => {
          chrome.runtime?.sendMessage?.({
            type: 'TRACK_APPLICATION',
            payload: {
              title: context.title,
              company: context.company,
              job_url: context.url,
              form_provider: context.adapterName,
              stage,
              notes: stage === 'applied'
                ? 'Manually submitted by candidate via RESII Extension.'
                : 'Autofilled and saved as draft in RESII.'
            }
          });
        },
        forceOpen // If forceOpen is false, remains collapsed as subtle cyan tab
      );
    } else if (forceOpen) {
      // User explicitly clicked RESII extension icon on an inactive page (e.g. ChatGPT)
      reviewOverlay.renderInactive(
        document,
        window.location.href,
        cachedState
      );
    }
  } catch (err) {
    console.warn('[RESII Assistant] Initialization note:', err);
  }
}

// 1. Initial State Fetch
if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
    if (response?.success && response.data) {
      cachedState = response.data;
    }
    // Check if on a legitimate job page; mounts subtle launcher tab only if active job detected
    initializePageAssistant(false);
  });
}

// 2. Message Listener (Single Unified Interface)
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case 'TOGGLE_SIDEBAR': {
            if (reviewOverlay.isMountedAndOpen()) {
              reviewOverlay.close();
            } else {
              // Open sidebar; handles both active job pages and inactive general pages gracefully
              initializePageAssistant(true);
            }
            sendResponse({ success: true });
            break;
          }

          case 'STATE_UPDATED': {
            cachedState = message.payload;
            reviewOverlay.updateAccountState(cachedState);
            sendResponse({ success: true });
            break;
          }

          case 'DETECT_PAGE': {
            const { context, isActiveSession } = pageDetector.detectJobContext(window.location.href, document);
            sendResponse({ success: true, data: context, isActiveSession });
            break;
          }

          case 'SCAN_AND_CLASSIFY': {
            const { adapter, context } = pageDetector.detectJobContext(window.location.href, document);
            if (!adapter || !context) {
              sendResponse({ success: false, error: 'No job application form detected on this page.' });
              return;
            }
            const form = adapter.findForm(document) || document.body;
            const rawFields = fieldClassifier.classifyForm(form, adapter);

            const mappedFields = evidenceMapper.mapCandidateEvidence(
              rawFields,
              cachedState?.profile,
              cachedState?.facts,
              cachedState?.resumes
            );

            // Open sidebar on review/fill
            initializePageAssistant(true);
            sendResponse({ success: true, data: { context, fields: mappedFields } });
            break;
          }

          case 'APPLY_AUTOFILL': {
            const result = formFiller.fillApprovedFields(document, message.payload.fields);
            sendResponse({ success: true, data: result });
            break;
          }

          case 'TAB_ACTIVATED': {
            // When returning to this tab, check if it's a supported job page and restore overlay if needed
            const { isActiveSession } = pageDetector.detectJobContext(window.location.href, document);
            if (isActiveSession && !reviewOverlay.isMountedAndOpen()) {
              initializePageAssistant(false);
            }
            sendResponse({ success: true });
            break;
          }

          case 'NAVIGATED_AWAY': {
            // Navigated away to an unrelated site
            reviewOverlay.remove(document);
            currentJobContext = null;
            sendResponse({ success: true });
            break;
          }

          case 'PAGE_TRANSITION': {
            // Re-detect on navigation to another supported job URL
            initializePageAssistant(reviewOverlay.isMountedAndOpen());
            sendResponse({ success: true });
            break;
          }

          default:
            sendResponse({ success: false, error: 'Unknown message type' });
        }
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || 'Error processing content message' });
      }
    })();
    return true; // Keep channel open for async response
  });
}

// 3. Client-Side SPA Navigation & DOM Mutation Observation
let lastObservedUrl = typeof window !== 'undefined' ? window.location.href : '';
let mutationTimeout: any = null;

function setupSpaNavigationObserver() {
  if (typeof window === 'undefined') return;

  // Intercept history.pushState & replaceState
  try {
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      handleUrlOrDomTransition();
    };

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      handleUrlOrDomTransition();
    };

    window.addEventListener('popstate', handleUrlOrDomTransition);
    window.addEventListener('hashchange', handleUrlOrDomTransition);
  } catch (_) {}

  // Debounced DOM mutation observer for dynamic application forms
  try {
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver(() => {
        if (mutationTimeout) clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(() => {
          const currentUrl = window.location.href;
          if (currentUrl !== lastObservedUrl) {
            handleUrlOrDomTransition();
          } else if (currentJobContext && !currentJobContext.formDetected) {
            // Check if an application form has dynamically appeared
            const { adapter, context } = pageDetector.detectJobContext(currentUrl, document);
            if (context && context.formDetected) {
              handleUrlOrDomTransition();
            }
          }
        }, 700);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  } catch (_) {}

  // Page visibility change
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const { isActiveSession } = pageDetector.detectJobContext(window.location.href, document);
        if (isActiveSession) {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
              if (response?.success && response.data) {
                cachedState = response.data;
              }
            });
          }
        } else {
          reviewOverlay.remove(document);
        }
      }
    });
  } catch (_) {}
}

function handleUrlOrDomTransition() {
  const currentUrl = window.location.href;
  lastObservedUrl = currentUrl;
  const isCurrentlyOpen = reviewOverlay.isMountedAndOpen();
  initializePageAssistant(isCurrentlyOpen);
}

setupSpaNavigationObserver();

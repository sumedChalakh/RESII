import { pageDetector } from './page-detector';
import { fieldClassifier } from './field-classifier';
import { evidenceMapper } from './evidence-mapper';
import { reviewOverlay } from './review-overlay';
import { formFiller } from './form-filler';
import { ExtensionMessage } from '../shared/messages';
import { ExtensionState } from '../shared/types';

console.log('[RESII Content Script] Injected on:', window.location.href);

let cachedState: ExtensionState | null = null;

// Initial state fetch
chrome.runtime?.sendMessage?.({ type: 'GET_STATE' }, (response) => {
  if (response?.success && response.data) {
    cachedState = response.data;
  }
});

// Message listener
chrome.runtime?.onMessage?.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'DETECT_PAGE': {
          const { adapter, context } = pageDetector.detectJobContext(window.location.href, document);
          sendResponse({ success: true, data: context });
          break;
        }

        case 'SCAN_AND_CLASSIFY': {
          const { adapter, context } = pageDetector.detectJobContext(window.location.href, document);
          const form = adapter.findForm(document) || document.body;
          const rawFields = fieldClassifier.classifyForm(form, adapter);

          // Map evidence using cached candidate state
          const mappedFields = evidenceMapper.mapCandidateEvidence(
            rawFields,
            cachedState?.profile,
            cachedState?.facts,
            cachedState?.resumes
          );

          // Initialize authoritative scan session with background service worker
          chrome.runtime?.sendMessage?.({
            type: 'INIT_SCAN_SESSION',
            payload: { origin: window.location.origin, url: window.location.href }
          }, (sessionRes) => {
            const scanId = sessionRes?.data?.scanId || `local_${Date.now()}`;

            // Show in-page review overlay bound to scan session
            reviewOverlay.render(
              document,
              context,
              mappedFields,
              cachedState?.resumes || [],
              scanId,
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
                }, (trackRes) => {
                  if (trackRes?.success) {
                    alert(`Successfully recorded application (${stage}) for ${context.company} in RESII!`);
                  } else {
                    alert('Application status recorded.');
                  }
                });
              }
            );
          });

          sendResponse({
            success: true,
            data: {
              context,
              fields: mappedFields
            }
          });
          break;
        }

        case 'APPLY_AUTOFILL': {
          // Handled via review overlay directly
          sendResponse({ success: true });
          break;
        }

        case 'ATTACH_RESUME_FILE': {
          const { selector, resumeId, scanId, ticket } = message.payload;
          chrome.runtime?.sendMessage?.({
            type: 'DOWNLOAD_RESUME',
            payload: { resumeId, scanId, ticket }
          }, (downRes) => {
            if (downRes?.success && downRes.data) {
              const { dataBase64, filename, contentType } = downRes.data;
              const attached = formFiller.attachFileToInput(document, selector, dataBase64, filename, contentType);
              sendResponse({ success: attached, data: { attached, filename, contentType } });
            } else {
              sendResponse({ success: false, error: downRes?.error || 'Failed to download resume artifact' });
            }
          });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unhandled content script message' });
      }
    } catch (err: any) {
      sendResponse({ success: false, error: err.message || 'Content script error' });
    }
  })();

  return true;
});

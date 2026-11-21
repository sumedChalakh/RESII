import { apiClient } from './api-client';
import { ExtensionState, TrackApplicationPayload } from '../shared/types';
import { ExtensionMessage } from '../shared/messages';

let currentState: ExtensionState = {
  isConnected: false,
  resumes: []
};

// Initialize state from storage on startup
chrome.storage?.local?.get(['resii_token', 'resii_user', 'resii_profile', 'resii_facts', 'resii_resumes'], (data) => {
  if (data.resii_token) {
    apiClient.setToken(data.resii_token);
    currentState = {
      isConnected: true,
      token: data.resii_token,
      user: data.resii_user,
      profile: data.resii_profile,
      facts: data.resii_facts,
      resumes: data.resii_resumes || []
    };
    // Refresh in background
    syncCandidateData();
  }
});

async function syncCandidateData() {
  try {
    const data = await apiClient.getCandidateProfile();
    currentState.profile = data.profile;
    currentState.facts = data.facts;
    currentState.resumes = data.resumes;
    currentState.isConnected = true;

    chrome.storage?.local?.set({
      resii_profile: data.profile,
      resii_facts: data.facts,
      resii_resumes: data.resumes
    });

    notifyStateUpdate();
  } catch (err) {
    console.warn('[RESII ServiceWorker] Sync failed:', err);
  }
}

function notifyStateUpdate() {
  const safeState: ExtensionState = {
    isConnected: currentState.isConnected,
    user: currentState.user,
    profile: currentState.profile,
    facts: currentState.facts,
    resumes: currentState.resumes,
    selectedResumeId: currentState.selectedResumeId
  };
  chrome.runtime?.sendMessage?.({
    type: 'STATE_UPDATED',
    payload: safeState
  }).catch(() => {
    // Popup might be closed, ignore
  });
}

// Authoritative session ledger for content script scans & autofill authorization
interface AuthTicket {
  ticket: string;
  scanId: string;
  tabId?: number;
  frameId?: number;
  origin: string;
  allowedFieldIds: string[];
  approvedFields: Array<{ id: string; category: string; value: string }>;
  resumeId?: string;
  createdAt: number;
  expiresAt: number; // short-lived, 60 seconds TTL
  consumed: boolean;
}

interface ScanSession {
  scanId: string;
  tabId?: number;
  frameId?: number;
  origin: string;
  url: string;
  createdAt: number;
  expiresAt: number;
  tickets: Map<string, AuthTicket>;
}

const activeScanLedger = new Map<string, ScanSession>();

function purgeStaleScanSessions() {
  const now = Date.now();
  for (const [scanId, session] of activeScanLedger.entries()) {
    if (session.expiresAt < now) {
      activeScanLedger.delete(scanId);
    } else {
      // Purge expired tickets within active session
      for (const [ticketId, ticket] of session.tickets.entries()) {
        if (ticket.expiresAt < now || ticket.consumed) {
          session.tickets.delete(ticketId);
        }
      }
    }
  }
}

export function resolveBrowserOrigin(sender: any): string | null {
  if (!sender) return null;

  // 1. If browser provided sender.origin, inspect it
  if (typeof sender.origin === 'string') {
    const orig = sender.origin.trim();
    if (orig === 'null' || orig === 'opaque' || orig.startsWith('data:') || orig === '') {
      return null; // Opaque origins fail closed
    }
    return orig;
  }

  // 2. If subframe (frameId > 0), sender.url is the subframe URL.
  // DO NOT use sender.tab.url as it represents the top-level frame.
  if (sender.frameId && sender.frameId > 0) {
    if (sender.url) {
      try {
        const u = new URL(sender.url);
        if (u.origin === 'null' || u.origin === 'opaque') return null;
        return u.origin;
      } catch {
        return null;
      }
    }
    return null; // Cannot reliably determine subframe origin
  }

  // 3. For main frame (frameId === 0 or undefined), use sender.url first, then sender.tab.url
  const sourceUrl = sender.url || sender.tab?.url;
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      if (u.origin === 'null' || u.origin === 'opaque') return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  return null;
}

// Handle messages from content script & popup
chrome.runtime?.onMessage?.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Validate message sender origin (reject unexpected external contexts)
  if (sender.id && chrome.runtime?.id && sender.id !== chrome.runtime.id) {
    sendResponse({ success: false, error: 'Unauthorized message sender' });
    return false;
  }

  (async () => {
    try {
      switch (message.type) {
        case 'INIT_SCAN_SESSION': {
          purgeStaleScanSessions();
          const origin = resolveBrowserOrigin(sender);
          if (!origin) {
            sendResponse({
              success: false,
              error: 'Security violation: Untrusted, missing, or opaque sender origin.'
            });
            break;
          }

          if (sender.tab?.id === undefined) {
            sendResponse({
              success: false,
              error: 'Security violation: Scan session must be initiated from a browser tab.'
            });
            break;
          }

          const scanId = `scan_${Date.now()}_${crypto.randomUUID()}`;
          const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

          activeScanLedger.set(scanId, {
            scanId,
            tabId: sender.tab.id,
            frameId: sender.frameId ?? 0,
            origin,
            url: sender.url || sender.tab.url || '',
            createdAt: Date.now(),
            expiresAt,
            tickets: new Map<string, AuthTicket>()
          });

          sendResponse({
            success: true,
            data: { scanId, expiresAt, origin }
          });
          break;
        }

        case 'AUTHORIZE_AUTOFILL': {
          purgeStaleScanSessions();
          const { scanId, fields, selectedResumeId } = message.payload;
          const session = activeScanLedger.get(scanId);

          if (!session) {
            sendResponse({
              success: false,
              error: 'Invalid, missing, or expired scan session. Rescan required.'
            });
            break;
          }

          // Validate sender origin strictly against browser metadata
          const senderOrigin = resolveBrowserOrigin(sender);
          if (!senderOrigin) {
            sendResponse({
              success: false,
              error: 'Security violation: Untrusted or opaque sender origin.'
            });
            break;
          }

          // Validate tab / context binding
          if (sender.tab?.id !== undefined && session.tabId !== undefined && sender.tab.id !== session.tabId) {
            sendResponse({
              success: false,
              error: 'Security violation: Scan session belongs to a different browser tab.'
            });
            break;
          }

          // Validate frame binding
          if (sender.frameId !== undefined && session.frameId !== undefined && sender.frameId !== session.frameId) {
            sendResponse({
              success: false,
              error: 'Security violation: Scan session belongs to a different frame.'
            });
            break;
          }

          // Validate origin binding
          if (session.origin !== senderOrigin) {
            sendResponse({
              success: false,
              error: 'Security violation: Origin mismatch between scan session and authorization request.'
            });
            break;
          }

          // Validate session expiration
          if (Date.now() > session.expiresAt) {
            activeScanLedger.delete(scanId);
            sendResponse({
              success: false,
              error: 'Scan session has expired. Please rescan the page.'
            });
            break;
          }

          // Validate resume ownership if specified
          if (selectedResumeId) {
            const hasResume = currentState.resumes.some((r) => r.id === selectedResumeId);
            if (!hasResume) {
              sendResponse({
                success: false,
                error: 'Unauthorized resume selection: Candidate does not own the requested resume.'
              });
              break;
            }
          }

          // Authorization filtering: Block sensitive demographic fields from automated autofill
          const allowedFieldIds: string[] = [];
          for (const f of fields) {
            if (f.category === 'sensitive_demographic') {
              console.warn(`[RESII Background] Blocked sensitive demographic field ${f.id} from automated authorization.`);
              continue;
            }
            allowedFieldIds.push(f.id);
          }

          // Issue cryptographically unpredictable single-use authorization ticket (60s TTL, 122 bits of UUID v4 entropy)
          const ticketId = `ticket_${Date.now()}_${crypto.randomUUID()}`;
          const authTicket: AuthTicket = {
            ticket: ticketId,
            scanId,
            tabId: session.tabId,
            frameId: session.frameId,
            origin: session.origin,
            allowedFieldIds,
            approvedFields: fields,
            resumeId: selectedResumeId,
            createdAt: Date.now(),
            expiresAt: Date.now() + 60 * 1000,
            consumed: false
          };

          session.tickets.set(ticketId, authTicket);

          sendResponse({
            success: true,
            data: {
              authorized: true,
              scanId,
              ticket: ticketId,
              allowedFieldIds,
              expiresAt: authTicket.expiresAt
            }
          });
          break;
        }

        case 'CONSUME_AUTOFILL_TICKET': {
          purgeStaleScanSessions();
          const { scanId, ticket: ticketId, fieldIds } = message.payload;
          const session = activeScanLedger.get(scanId);

          if (!session) {
            sendResponse({
              success: false,
              error: 'Security violation: Unknown or expired scan session.'
            });
            break;
          }

          const senderOrigin = resolveBrowserOrigin(sender);
          if (!senderOrigin || senderOrigin !== session.origin) {
            sendResponse({
              success: false,
              error: 'Security violation: Origin mismatch during ticket consumption.'
            });
            break;
          }

          if (sender.tab?.id !== undefined && session.tabId !== undefined && sender.tab.id !== session.tabId) {
            sendResponse({
              success: false,
              error: 'Security violation: Tab mismatch during ticket consumption.'
            });
            break;
          }

          if (sender.frameId !== undefined && session.frameId !== undefined && sender.frameId !== session.frameId) {
            sendResponse({
              success: false,
              error: 'Security violation: Frame mismatch during ticket consumption.'
            });
            break;
          }

          const ticket = session.tickets.get(ticketId);
          if (!ticket) {
            sendResponse({
              success: false,
              error: 'Security violation: Invalid or missing authorization ticket.'
            });
            break;
          }

          if (ticket.consumed) {
            sendResponse({
              success: false,
              error: 'Security violation: Authorization ticket has already been consumed (replay prevented).'
            });
            break;
          }

          if (Date.now() > ticket.expiresAt) {
            session.tickets.delete(ticketId);
            sendResponse({
              success: false,
              error: 'Security violation: Authorization ticket has expired.'
            });
            break;
          }

          // Validate that requested fields are subset of allowed fields
          const isSubset = fieldIds.every((id: string) => ticket.allowedFieldIds.includes(id));
          if (!isSubset) {
            sendResponse({
              success: false,
              error: 'Security violation: Attempted to fill fields outside the authorized set.'
            });
            break;
          }

          // Mark consumed immediately (single-use guarantee)
          ticket.consumed = true;

          sendResponse({
            success: true,
            data: { consumed: true, allowedFieldIds: ticket.allowedFieldIds }
          });
          break;
        }

        case 'DOWNLOAD_RESUME': {
          if (!currentState.isConnected || !currentState.token) {
            sendResponse({
              success: false,
              error: 'Extension is not connected to RESII. Please pair first.'
            });
            break;
          }

          const { resumeId, scanId, ticket: ticketId } = message.payload;
          if (!resumeId) {
            sendResponse({
              success: false,
              error: 'Security violation: Missing resumeId.'
            });
            break;
          }

          // Strict ticket authorization check
          if (scanId && ticketId) {
            const session = activeScanLedger.get(scanId);
            if (!session) {
              sendResponse({
                success: false,
                error: 'Security violation: Invalid or expired scan session for resume download.'
              });
              break;
            }

            const senderOrigin = resolveBrowserOrigin(sender);
            if (!senderOrigin || senderOrigin !== session.origin) {
              sendResponse({
                success: false,
                error: 'Security violation: Origin mismatch on resume download.'
              });
              break;
            }

            if (sender.tab?.id !== undefined && session.tabId !== undefined && sender.tab.id !== session.tabId) {
              sendResponse({
                success: false,
                error: 'Security violation: Tab mismatch on resume download.'
              });
              break;
            }

            const ticket = session.tickets.get(ticketId);
            if (!ticket) {
              sendResponse({
                success: false,
                error: 'Security violation: Invalid or missing authorization ticket for resume download.'
              });
              break;
            }

            if (Date.now() > ticket.expiresAt) {
              session.tickets.delete(ticketId);
              sendResponse({
                success: false,
                error: 'Security violation: Authorization ticket expired for resume download.'
              });
              break;
            }

            if (ticket.resumeId && ticket.resumeId !== resumeId) {
              sendResponse({
                success: false,
                error: 'Security violation: Ticket is not authorized for the requested resume ID.'
              });
              break;
            }
          }

          // Validate candidate resume ownership
          const isOwned = currentState.resumes.some((r) => r.id === resumeId);
          if (!isOwned) {
            sendResponse({
              success: false,
              error: 'Unauthorized: Requested resume does not belong to the authenticated candidate.'
            });
            break;
          }

          const artifact = await apiClient.downloadResumeArtifact(resumeId);
          sendResponse({
            success: true,
            data: artifact
          });
          break;
        }

        case 'GET_STATE': {
          // SEC-6F-03: Redact sensitive API token before sending to content script/popup
          const safeState: ExtensionState = {
            isConnected: currentState.isConnected,
            user: currentState.user,
            profile: currentState.profile,
            facts: currentState.facts,
            resumes: currentState.resumes,
            selectedResumeId: currentState.selectedResumeId
          };
          sendResponse({ success: true, data: safeState });
          break;
        }

        case 'PAIR_EXTENSION': {
          const { pairingCode, email, password } = message.payload;
          let result;
          if (pairingCode) {
            result = await apiClient.pairWithCode(pairingCode);
          } else if (email && password) {
            result = await apiClient.pairWithCredentials(email, password);
          } else {
            throw new Error('Missing pairing credentials');
          }

          currentState.isConnected = true;
          currentState.token = result.token;
          currentState.user = result.user;

          chrome.storage?.local?.set({
            resii_token: result.token,
            resii_user: result.user
          });

          await syncCandidateData();

          // SEC-6F-03: Redact sensitive bearer token in message response
          const safeState: ExtensionState = {
            isConnected: true,
            user: currentState.user,
            profile: currentState.profile,
            facts: currentState.facts,
            resumes: currentState.resumes,
            selectedResumeId: currentState.selectedResumeId
          };
          sendResponse({ success: true, data: safeState });
          break;
        }

        case 'DISCONNECT_EXTENSION': {
          try {
            await apiClient.disconnect();
          } catch {
            // Ignore network errors
          }
          apiClient.setToken(null);
          currentState = { isConnected: false, resumes: [] };
          activeScanLedger.clear();
          chrome.storage?.local?.clear();
          sendResponse({ success: true, data: currentState });
          notifyStateUpdate();
          break;
        }

        case 'GENERATE_ANSWERS': {
          const { questions, jobTitle, company } = message.payload;
          const answers = await apiClient.generateAnswers(jobTitle, company, questions);
          sendResponse({ success: true, data: answers });
          break;
        }

        case 'TRACK_APPLICATION': {
          const result = await apiClient.trackApplication(message.payload);
          sendResponse({ success: true, data: result });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (err: any) {
      sendResponse({ success: false, error: err.message || 'Operation failed' });
    }
  })();

  return true; // Keep message channel open for async response
});

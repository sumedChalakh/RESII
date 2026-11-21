import { ExtensionState, JobContext } from '../shared/types';
import { ExtensionMessage } from '../shared/messages';

let activeContext: JobContext | null = null;

document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  await refreshState();
  await detectActiveTab();
});

function initUI() {
  // Pairing button
  document.getElementById('btn-pair')?.addEventListener('click', async () => {
    const code = (document.getElementById('pairing-code') as HTMLInputElement)?.value.trim();
    if (!code) return;

    chrome.runtime.sendMessage(
      { type: 'PAIR_EXTENSION', payload: { pairingCode: code } },
      (res) => {
        if (res?.success) {
          renderConnected(res.data);
        } else {
          showError(res?.error || 'Failed to connect');
        }
      }
    );
  });

  // Disconnect button
  document.getElementById('btn-disconnect')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DISCONNECT_EXTENSION' }, (res) => {
      renderDisconnected();
    });
  });

  // Scan & Review button
  document.getElementById('btn-scan')?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0]?.id;
      if (!activeTabId) return;

      chrome.tabs.sendMessage(
        activeTabId,
        { type: 'SCAN_AND_CLASSIFY' },
        (res) => {
          if (res?.success) {
            showStatus(`Review drawer opened with ${res.data.fields.length} detected fields!`);
            window.close(); // Close popup so user sees in-page drawer
          } else {
            showStatus('Please navigate to a page with an application form.');
          }
        }
      );
    });
  });

  // Track button
  document.getElementById('btn-track')?.addEventListener('click', () => {
    if (!activeContext) return;
    chrome.runtime.sendMessage(
      {
        type: 'TRACK_APPLICATION',
        payload: {
          title: activeContext.title,
          company: activeContext.company,
          job_url: activeContext.url,
          form_provider: activeContext.adapterName
        }
      },
      (res) => {
        if (res?.success) {
          showStatus('Successfully tracked in RESII!');
        } else {
          showStatus(res?.error || 'Tracking failed');
        }
      }
    );
  });
}

async function refreshState() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
    if (res?.success && res.data?.isConnected) {
      renderConnected(res.data);
    } else {
      renderDisconnected();
    }
  });
}

async function detectActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTabId = tabs[0]?.id;
    if (!activeTabId) return;

    chrome.tabs.sendMessage(activeTabId, { type: 'DETECT_PAGE' }, (res) => {
      if (res?.success && res.data) {
        activeContext = res.data;
        updateTabContext(res.data);
      }
    });
  });
}

function renderConnected(state: ExtensionState) {
  const connPill = document.getElementById('connection-pill');
  if (connPill) {
    connPill.className = 'pill connected';
    connPill.textContent = 'Connected (8100)';
  }

  document.getElementById('pairing-section')?.classList.add('hidden');
  document.getElementById('connected-section')?.classList.remove('hidden');

  const userDisplay = document.getElementById('user-display');
  if (userDisplay && state.user) {
    userDisplay.textContent = state.user.name || state.user.email;
  }

  // Populate resumes
  const select = document.getElementById('resume-select') as HTMLSelectElement;
  if (select && state.resumes) {
    select.innerHTML = state.resumes.map((r) => `
      <option value="${r.id}" ${r.is_primary ? 'selected' : ''}>
        ${r.title} (ATS ${r.ats_score}%)
      </option>
    `).join('');
  }
}

function renderDisconnected() {
  const connPill = document.getElementById('connection-pill');
  if (connPill) {
    connPill.className = 'pill disconnected';
    connPill.textContent = 'Disconnected';
  }

  document.getElementById('pairing-section')?.classList.remove('hidden');
  document.getElementById('connected-section')?.classList.add('hidden');
}

function updateTabContext(ctx: JobContext) {
  const titleEl = document.getElementById('job-title');
  const compEl = document.getElementById('job-company');
  const badgeEl = document.getElementById('adapter-badge');

  if (titleEl) titleEl.textContent = ctx.title;
  if (compEl) compEl.textContent = `${ctx.company} • ${ctx.location || 'Remote'}`;
  if (badgeEl) badgeEl.textContent = ctx.adapterName;
}

function showError(msg: string) {
  const errEl = document.getElementById('pairing-error');
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.remove('hidden');
  }
}

function showStatus(msg: string) {
  const el = document.getElementById('status-message');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }
}

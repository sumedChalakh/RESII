import { ClassifiedField, JobContext, ResumeOption } from '../shared/types';
import { formFiller } from './form-filler';

export class ReviewOverlay {
  private container: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private currentFields: ClassifiedField[] = [];
  private jobContext: JobContext | null = null;
  private resumes: ResumeOption[] = [];
  private selectedResumeId: string | null = null;
  private scanId: string = '';
  private onTrackCallback?: (stage: 'draft' | 'applied') => void;

  render(
    doc: Document,
    context: JobContext,
    fields: ClassifiedField[],
    resumes: ResumeOption[] = [],
    scanId: string = '',
    onTrack?: (stage: 'draft' | 'applied') => void
  ) {
    this.jobContext = context;
    this.currentFields = fields;
    this.resumes = resumes;
    this.selectedResumeId = resumes.find((r) => r.is_primary)?.id || resumes[0]?.id || null;
    this.scanId = scanId;
    this.onTrackCallback = onTrack;

    this.remove(doc);

    this.container = doc.createElement('div');
    this.container.id = 'resii-review-overlay';
    // Attach Shadow DOM for encapsulation against host-page DOM inspection
    this.shadow = this.container.attachShadow({ mode: 'open' });

    this.updateContent(doc);
    doc.body.appendChild(this.container);
  }

  private updateContent(doc: Document) {
    if (!this.shadow || !this.jobContext) return;

    const approvedCount = this.currentFields.filter((f) => f.approved && !f.requiresUserInput && f.proposedValue).length;

    let resumeOptionsHtml = '';
    if (this.resumes.length > 0) {
      resumeOptionsHtml = `
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: 600; margin-bottom: 4px; color: #94a3b8; font-size: 11px; text-transform: uppercase;">
            Target Resume to Reference:
          </label>
          <select id="resii-resume-select" style="width: 100%; background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 6px; padding: 6px 8px; font-size: 12px;">
            ${this.resumes.map((r) => `
              <option value="${r.id}" ${r.id === this.selectedResumeId ? 'selected' : ''}>
                ${r.title} (v${r.version}) — ATS ${r.ats_score}%
              </option>
            `).join('')}
          </select>
        </div>
      `;
    }

    const fieldsHtml = this.currentFields.map((field, idx) => {
      const badgeColor = this.getBadgeColor(field.provenance);
      const badgeLabel = this.getBadgeLabel(field.provenance);

      return `
        <div style="background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <label style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #e2e8f0; cursor: pointer;">
              <input type="checkbox" data-idx="${idx}" class="resii-field-check" ${field.approved && !field.requiresUserInput ? 'checked' : ''} style="cursor: pointer;" />
              <span>${field.label}</span>
            </label>
            <span style="background: ${badgeColor}; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
              ${badgeLabel}
            </span>
          </div>

          <div style="margin-bottom: 4px;">
            ${field.category === 'screening_question' || field.proposedValue.length > 60 ? `
              <textarea data-idx="${idx}" class="resii-field-val" rows="2" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #f1f5f9; padding: 6px; font-size: 12px; resize: vertical;">${this.escapeHtml(field.proposedValue)}</textarea>
            ` : `
              <input type="text" data-idx="${idx}" class="resii-field-val" value="${this.escapeHtml(field.proposedValue)}" placeholder="${field.requiresUserInput ? 'User input required...' : ''}" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #475569; border-radius: 4px; color: #f1f5f9; padding: 6px; font-size: 12px;" />
            `}
          </div>

          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b;">
            <span>Category: <strong style="color: #94a3b8;">${field.category}</strong></span>
            <span>Confidence: <strong style="color: #94a3b8;">${Math.round(field.confidence * 100)}%</strong></span>
          </div>
        </div>
      `;
    }).join('');

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 16px;
          right: 16px;
          width: 450px;
          max-height: calc(100vh - 32px);
          background: #0f172a;
          color: #f8fafc;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          border: 1px solid #334155;
          border-radius: 12px;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
      </style>

      <!-- Header -->
      <div style="padding: 12px 16px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; background: #1e293b;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: #38bdf8; font-size: 14px;">RESII Assistant</span>
            <span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">
              ${this.jobContext.adapterName}
            </span>
          </div>
          <div style="color: #94a3b8; font-size: 12px; margin-top: 2px;">
            ${this.jobContext.title} • ${this.jobContext.company}
          </div>
        </div>
        <button id="resii-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px;">&times;</button>
      </div>

      <!-- Body / Scrollable Content -->
      <div style="padding: 14px 16px; overflow-y: auto; flex: 1;">
        <div style="background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; color: #bae6fd; font-size: 11px;">
          <strong>Human-Supervised Autofill:</strong> Review proposed values below. Approved fields will be populated into the page. <em>RESII never submits applications autonomously.</em>
        </div>

        ${resumeOptionsHtml}

        <div style="margin-bottom: 8px; font-weight: 600; color: #cbd5e1; display: flex; justify-content: space-between;">
          <span>Detected Fields (${this.currentFields.length})</span>
          <span style="color: #38bdf8;">${approvedCount} Approved</span>
        </div>

        <div style="max-height: 340px; overflow-y: auto; padding-right: 4px;">
          ${fieldsHtml}
        </div>
      </div>

      <!-- Footer / Actions -->
      <div style="padding: 12px 16px; border-top: 1px solid #334155; background: #1e293b; display: flex; flex-direction: column; gap: 8px;">
        <button id="resii-fill-btn" style="width: 100%; background: #0284c7; color: white; border: none; border-radius: 6px; padding: 9px 12px; font-weight: 600; cursor: pointer; font-size: 12px;">
          Fill Approved Fields (${approvedCount})
        </button>
        <div style="display: flex; gap: 8px;">
          <button id="resii-draft-btn" style="flex: 1; background: #334155; color: #e2e8f0; border: 1px solid #475569; border-radius: 6px; padding: 7px 10px; font-weight: 500; cursor: pointer; font-size: 11px;">
            Save Draft in RESII
          </button>
          <button id="resii-applied-btn" style="flex: 1; background: #059669; color: #ffffff; border: none; border-radius: 6px; padding: 7px 10px; font-weight: 600; cursor: pointer; font-size: 11px;">
            Mark Submitted
          </button>
        </div>
      </div>
    `;

    this.attachEventListeners(doc);
  }

  private attachEventListeners(doc: Document) {
    if (!this.shadow) return;

    // Close button
    this.shadow.querySelector('#resii-close-btn')?.addEventListener('click', () => {
      this.remove(doc);
    });

    // Checkbox toggles
    this.shadow.querySelectorAll('.resii-field-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-idx') || '0', 10);
        if (this.currentFields[idx]) {
          this.currentFields[idx].approved = (e.target as HTMLInputElement).checked;
          const fillBtn = this.shadow?.querySelector('#resii-fill-btn');
          if (fillBtn) {
            const count = this.currentFields.filter((f) => f.approved && !f.requiresUserInput && f.proposedValue).length;
            fillBtn.textContent = `Fill Approved Fields (${count})`;
          }
        }
      });
    });

    // Inline value edits
    this.shadow.querySelectorAll('.resii-field-val').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-idx') || '0', 10);
        if (this.currentFields[idx]) {
          this.currentFields[idx].proposedValue = (e.target as HTMLInputElement).value;
        }
      });
    });

    // Resume select
    this.shadow.querySelector('#resii-resume-select')?.addEventListener('change', (e) => {
      this.selectedResumeId = (e.target as HTMLSelectElement).value;
    });

    // Fill button: Enforces background service worker authorization boundary
    this.shadow.querySelector('#resii-fill-btn')?.addEventListener('click', () => {
      const candidateFields = this.currentFields
        .filter((f) => f.approved && !f.requiresUserInput && f.proposedValue)
        .map((f) => ({ id: f.id, category: f.category, value: f.proposedValue }));

      if (candidateFields.length === 0) {
        alert('No approved fields ready to fill.');
        return;
      }

      // Check if chrome.runtime is available
      if (chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'AUTHORIZE_AUTOFILL',
          payload: {
            scanId: this.scanId,
            origin: window.location.origin,
            fields: candidateFields,
            selectedResumeId: this.selectedResumeId || undefined
          }
        }, (authRes) => {
          if (authRes?.success && authRes.data?.authorized) {
            const { ticket, allowedFieldIds } = authRes.data;
            const allowedIds = new Set(allowedFieldIds || []);
            const allowedToFill = this.currentFields.filter((f) => allowedIds.has(f.id));

            // Consume authorization ticket with background service worker
            chrome.runtime.sendMessage({
              type: 'CONSUME_AUTOFILL_TICKET',
              payload: {
                scanId: this.scanId,
                ticket,
                fieldIds: allowedToFill.map((f) => f.id)
              }
            }, (consumeRes) => {
              if (consumeRes?.success) {
                const result = formFiller.fillApprovedFields(doc, allowedToFill);
                alert(`RESII filled ${result.filled} background-authorized fields (${result.skipped} skipped). Please inspect all fields before submitting manually.`);
              } else {
                alert(`Autofill blocked: ${consumeRes?.error || 'Ticket consumption failed.'}`);
              }
            });
          } else {
            const errorMsg = authRes?.error || 'Authorization rejected by background security ledger.';
            alert(`Autofill blocked: ${errorMsg}`);
          }
        });
      } else {
        // Fallback for isolated test harnesses without chrome.runtime
        const result = formFiller.fillApprovedFields(doc, this.currentFields);
        alert(`RESII filled ${result.filled} approved fields (${result.skipped} skipped). Please inspect all fields before submitting manually.`);
      }
    });

    // Save Draft button
    this.shadow.querySelector('#resii-draft-btn')?.addEventListener('click', () => {
      if (this.onTrackCallback) {
        this.onTrackCallback('draft');
      }
    });

    // Mark Submitted button
    this.shadow.querySelector('#resii-applied-btn')?.addEventListener('click', () => {
      const confirmed = confirm('Have you completed and submitted the application on the company website?');
      if (confirmed && this.onTrackCallback) {
        this.onTrackCallback('applied');
      }
    });
  }

  remove(doc: Document) {
    const existing = doc.getElementById('resii-review-overlay');
    if (existing) {
      existing.remove();
    }
    this.container = null;
    this.shadow = null;
  }

  private getBadgeColor(provenance: string): string {
    switch (provenance) {
      case 'verified_profile':
        return '#059669'; // Green
      case 'candidate_fact':
        return '#0284c7'; // Blue
      case 'resume_source':
        return '#7c3aed'; // Purple
      case 'ai_grounded':
        return '#d97706'; // Amber
      case 'user_input_required':
      default:
        return '#dc2626'; // Red
    }
  }

  private getBadgeLabel(provenance: string): string {
    switch (provenance) {
      case 'verified_profile':
        return 'Verified Profile';
      case 'candidate_fact':
        return 'Candidate Fact';
      case 'resume_source':
        return 'Resume Data';
      case 'ai_grounded':
        return 'AI Grounded';
      case 'user_input_required':
      default:
        return 'Manual Input';
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

export const reviewOverlay = new ReviewOverlay();

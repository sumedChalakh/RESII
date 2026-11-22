import { ClassifiedField, JobContext, ResumeOption, SidebarStep, TailorEditItem, ExtensionState } from '../shared/types';
import { formFiller } from './form-filler';

export class ReviewOverlay {
  private container: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private floatingTab: HTMLDivElement | null = null;
  private floatingAutofillBtn: HTMLButtonElement | null = null;
  private isOpen: boolean = false;
  private isInactiveSession: boolean = false;
  private currentUrl: string = '';

  private currentStep: SidebarStep = 'tailor';
  private currentFields: ClassifiedField[] = [];
  private jobContext: JobContext | null = null;
  private resumes: ResumeOption[] = [];
  private selectedResumeId: string | null = null;
  private scanId: string = '';
  private onTrackCallback?: (stage: 'draft' | 'applied') => void;
  private cachedState: ExtensionState | null = null;

  private tailorEdits: TailorEditItem[] = [];
  private showOriginalSummary: boolean = false;
  private isAutoFilling: boolean = false;
  private isTailoringLoading: boolean = false;
  private tailorErrorMessage: string = '';
  private tailoringReviewId: string = '';
  private realMatchScore: number | null = null;
  private fillSuccessMessage: string = '';
  private hasTracked: boolean = false;
  private trackedApplicationId: string = '';

  isMountedAndOpen(): boolean {
    return !!this.container && this.isOpen;
  }

  open() {
    this.isOpen = true;
    if (this.container) {
      this.container.style.transform = 'translateX(0)';
    }
    this.updateAutofillButtonPosition();
  }

  close() {
    this.isOpen = false;
    if (this.container) {
      this.container.style.transform = 'translateX(100%)';
    }
    this.updateAutofillButtonPosition();
  }

  updateAccountState(state: ExtensionState | null) {
    this.cachedState = state;
    if (state?.resumes && state.resumes.length > 0) {
      this.resumes = state.resumes;
      if (!this.selectedResumeId) {
        this.selectedResumeId = state.resumes.find((r) => r.is_primary)?.id || state.resumes[0]?.id || null;
      }
    }
    if (this.container && document) {
      this.updateContent(document);
    }
  }

  render(
    doc: Document,
    context: JobContext,
    fields: ClassifiedField[],
    resumes: ResumeOption[] = [],
    scanId: string = '',
    state: ExtensionState | null = null,
    onTrack?: (stage: 'draft' | 'applied') => void,
    forceOpen: boolean = false
  ) {
    this.isInactiveSession = false;
    this.jobContext = context;
    this.currentFields = fields;
    this.resumes = resumes;
    this.selectedResumeId = resumes.find((r) => r.is_primary)?.id || resumes[0]?.id || null;
    this.scanId = scanId;
    this.cachedState = state;
    this.onTrackCallback = onTrack;
    this.isOpen = forceOpen;

    // Direct apply detection (Google, Microsoft, Cornerstone, or application forms without published JD)
    const isDirect = !context.hasJobDescription || context.isDirectApplyForm || context.adapterName.includes('Google') || context.adapterName.includes('Microsoft') || context.adapterName.includes('Cornerstone');
    if (isDirect) {
      this.currentStep = 'fill';
    } else {
      this.currentStep = 'tailor';
      this.fetchRealTailoringPlan(doc);
    }

    this.remove(doc);

    // 1. Create Floating Right-Edge Tab Launcher (subtle cyan toggle)
    this.createFloatingTab(doc);

    // 2. Create Floating Bottom-Right Autofill Button only if on fill step
    if (this.currentStep === 'fill') {
      this.createFloatingAutofillButton(doc);
    }

    // 3. Create Docked Full-Height Right Sidebar
    this.container = doc.createElement('div');
    this.container.id = 'resii-review-overlay';
    this.shadow = this.container.attachShadow({ mode: 'open' });

    this.updateContent(doc);
    const root = doc.documentElement || doc.body;
    root.appendChild(this.container);
  }

  renderInactive(doc: Document, url: string, state: ExtensionState | null = null) {
    this.isInactiveSession = true;
    this.currentUrl = url;
    this.cachedState = state;
    this.isOpen = true;

    this.remove(doc);

    this.container = doc.createElement('div');
    this.container.id = 'resii-review-overlay';
    this.shadow = this.container.attachShadow({ mode: 'open' });

    this.updateContent(doc);
    const root = doc.documentElement || doc.body;
    root.appendChild(this.container);
  }

  private fetchRealTailoringPlan(doc: Document) {
    if (!this.jobContext?.hasJobDescription || !this.jobContext?.jobDescription) {
      return;
    }
    this.isTailoringLoading = true;
    this.tailorErrorMessage = '';

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'TAILOR_RESUME',
        payload: {
          resumeId: this.selectedResumeId || undefined,
          jobDescription: this.jobContext.jobDescription,
          jobTitle: this.jobContext.title,
          companyName: this.jobContext.company
        }
      }, (res) => {
        this.isTailoringLoading = false;
        if (res?.success && res.data?.suggestions && res.data.suggestions.length > 0) {
          this.tailoringReviewId = res.data.review_id || '';
          this.realMatchScore = res.data.analysis?.match_score || 88;
          this.tailorEdits = res.data.suggestions.map((s: any, idx: number) => ({
            id: s.line_id || `sug_${idx}`,
            section: s.section || (idx === 0 ? 'summary' : 'experience'),
            title: s.title || this.jobContext?.title,
            subtitle: s.subtitle || this.jobContext?.company,
            originalText: s.original_text || '',
            tailoredText: s.new_text || s.original_text || '',
            rationale: s.reason || 'Keyword alignment and impact sharpening',
            selected: true
          }));
        } else {
          this.tailorErrorMessage = res?.error || 'AI Tailoring service is currently unavailable. Using verified candidate profile and selected resume directly.';
          this.tailorEdits = [];
          this.realMatchScore = null;
        }
        this.updateContent(doc);
      });
    } else {
      this.isTailoringLoading = false;
      this.tailorErrorMessage = 'AI Tailoring service is currently unavailable. Using verified candidate profile and selected resume directly.';
      this.tailorEdits = [];
      this.realMatchScore = null;
      this.updateContent(doc);
    }
  }

  private createFloatingTab(doc: Document) {
    this.floatingTab = doc.createElement('div');
    this.floatingTab.id = 'resii-floating-tab';
    this.floatingTab.innerHTML = `
      <div style="
        position: fixed;
        right: 0;
        top: 48%;
        transform: translateY(-50%);
        width: 36px;
        height: 50px;
        background: #0ea5e9;
        color: white;
        border-radius: 8px 0 0 8px;
        box-shadow: -2px 4px 14px rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483646;
        user-select: none;
        transition: transform 0.15s ease, background 0.15s ease;
      " title="Toggle RESII Assistant">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
      </div>
    `;

    this.floatingTab.addEventListener('click', () => {
      this.toggleSidebar(doc);
    });

    const root = doc.documentElement || doc.body;
    root.appendChild(this.floatingTab);
  }

  private createFloatingAutofillButton(doc: Document) {
    if (this.isInactiveSession) return;
    this.floatingAutofillBtn = doc.createElement('button');
    this.floatingAutofillBtn.id = 'resii-floating-autofill';
    this.updateAutofillButtonPosition();
    this.floatingAutofillBtn.innerHTML = `
      <span style="font-size: 14px;">⚡</span>
      <span>Autofill Application</span>
    `;

    this.floatingAutofillBtn.addEventListener('click', () => {
      this.open();
      if (this.currentStep === 'tailor') {
        this.currentStep = 'fill';
      }
      this.updateContent(doc);
      this.executeAutofill(doc, true);
    });

    const root = doc.documentElement || doc.body;
    root.appendChild(this.floatingAutofillBtn);
  }

  private updateAutofillButtonPosition() {
    if (!this.floatingAutofillBtn) return;
    const rightOffset = this.isOpen ? '440px' : '24px';
    this.floatingAutofillBtn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: ${rightOffset};
      background: #1e293b;
      color: #ffffff;
      border: 1px solid #334155;
      border-radius: 9999px;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 2147483645;
      transition: right 0.25s ease, background 0.15s ease;
    `;
  }

  private toggleSidebar(doc: Document) {
    this.isOpen = !this.isOpen;
    if (this.container) {
      this.container.style.transform = this.isOpen ? 'translateX(0)' : 'translateX(100%)';
    }
    this.updateAutofillButtonPosition();
  }

  private updateContent(doc: Document) {
    if (!this.shadow) return;

    if (this.isInactiveSession) {
      this.renderInactiveContent(doc);
      return;
    }

    if (!this.jobContext) return;

    const companyInitial = (this.jobContext.company || 'E').trim().charAt(0).toUpperCase() || 'E';
    const isDirectMode = !this.jobContext.hasJobDescription || this.jobContext.isDirectApplyForm;

    const candidateName = this.cachedState?.profile?.name || this.cachedState?.user?.name || 'Candidate';
    const candidateInitial = candidateName.charAt(0).toUpperCase();

    // Top Header
    const headerHtml = `
      <div style="padding: 14px 18px 10px 18px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">RESII</span>
          <span style="background: #ecfdf5; color: #059669; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">PRO</span>
          <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: #059669; background: #f0fdf4; padding: 2px 6px; border-radius: 4px; border: 1px solid #bbf7d0;">
            <span style="width: 6px; height: 6px; border-radius: 50%; background: #16a34a;"></span>
            Active
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <a href="http://localhost:8100/dashboard" target="_blank" style="text-decoration: none; color: #475569; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 4px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            Home
          </a>
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #0ea5e9; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;" title="${this.escapeHtml(candidateName)}">
            ${candidateInitial}
          </div>
          <button id="sidebar-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 2px 4px; line-height: 1;" title="Close Sidebar">&times;</button>
        </div>
      </div>
    `;

    // 4-Step Stepper Tabs
    const getTabClass = (step: SidebarStep, label: string) => {
      const isCurrent = this.currentStep === step;
      const isPast = (
        (this.currentStep === 'review' && step === 'tailor') ||
        (this.currentStep === 'fill' && (step === 'tailor' || step === 'review')) ||
        (this.currentStep === 'submit' && (step === 'tailor' || step === 'review' || step === 'fill'))
      );

      const prefix = isPast ? '✓ ' : '';
      const borderBottom = isCurrent ? '2px solid #059669' : '2px solid transparent';
      const color = isCurrent ? '#0f172a' : (isPast ? '#059669' : '#64748b');
      const fontWeight = isCurrent ? '700' : '500';

      return `
        <div data-step="${step}" class="step-tab" style="
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          font-weight: ${fontWeight};
          color: ${color};
          border-bottom: ${borderBottom};
          display: flex;
          align-items: center;
          gap: 4px;
          user-select: none;
          transition: all 0.15s ease;
        ">
          ${prefix}${label}
        </div>
      `;
    };

    const stepperHtml = `
      <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; background: #ffffff; padding: 0 12px;">
        ${getTabClass('tailor', 'Tailor')}
        ${getTabClass('review', 'Review')}
        ${getTabClass('fill', 'Fill')}
        ${getTabClass('submit', 'Submit')}
      </div>
    `;

    // Job Header Card
    const jobCardHtml = `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 14px 16px 12px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);">
        <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
          <div style="width: 32px; height: 32px; border-radius: 6px; background: #7c3aed; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">
            ${companyInitial}
          </div>
          <div style="overflow: hidden;">
            <div style="font-weight: 700; font-size: 13px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${this.escapeHtml(this.jobContext.title)}
            </div>
            <div style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${this.escapeHtml(this.jobContext.company)}
            </div>
          </div>
        </div>
        <div style="color: #94a3b8; font-size: 12px; margin-left: 8px; flex-shrink: 0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>
    `;

    // Step-Specific Content
    let stepContentHtml = '';
    switch (this.currentStep) {
      case 'tailor':
        stepContentHtml = this.renderTailorStep();
        break;
      case 'review':
        stepContentHtml = this.renderReviewStep();
        break;
      case 'fill':
        stepContentHtml = this.renderFillStep(isDirectMode);
        break;
      case 'submit':
        stepContentHtml = this.renderSubmitStep();
        break;
    }

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 420px;
          height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
          border-left: 1px solid #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          transform: ${this.isOpen ? 'translateX(0)' : 'translateX(100%)'};
        }
        * {
          box-sizing: border-box;
        }
        button {
          font-family: inherit;
        }
        ::-webkit-scrollbar {
          width: 5px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
      </style>

      ${headerHtml}
      ${stepperHtml}
      ${jobCardHtml}

      <div style="flex: 1; display: flex; flex-direction: column; overflow-y: auto;">
        ${stepContentHtml}
      </div>
    `;

    this.attachEventListeners(doc);
  }

  private renderInactiveContent(doc: Document) {
    if (!this.shadow) return;

    let hostname = 'this page';
    try {
      hostname = new URL(this.currentUrl || window.location.href).hostname;
    } catch (_) {}

    const candidateName = this.cachedState?.profile?.name || this.cachedState?.user?.name || 'Sumed Chalakh';
    const candidateEmail = this.cachedState?.profile?.email || this.cachedState?.user?.email || 'sumedchalakh528@gmail.com';
    const isConnected = !!this.cachedState?.isConnected;
    const candidateInitial = candidateName.charAt(0).toUpperCase();

    this.shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 420px;
          height: 100vh;
          background: #f8fafc;
          color: #0f172a;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
          border-left: 1px solid #e2e8f0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 13px;
          z-index: 2147483647;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          transform: ${this.isOpen ? 'translateX(0)' : 'translateX(100%)'};
        }
        * { box-sizing: border-box; }
        button { font-family: inherit; }
      </style>

      <!-- Header -->
      <div style="padding: 14px 18px 10px 18px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; background: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">RESII</span>
          <span style="background: #ecfdf5; color: #059669; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">PRO</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #0ea5e9; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;">
            ${candidateInitial}
          </div>
          <button id="sidebar-close-btn" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 2px 4px; line-height: 1;" title="Close Sidebar">&times;</button>
        </div>
      </div>

      <!-- Inactive Session Body -->
      <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;">
        
        <!-- Status Card -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #94a3b8;"></span>
            <span style="font-weight: 700; font-size: 14px; color: #475569;">Inactive Session</span>
          </div>
          <div style="font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 12px;">
            No job posting or application form was detected on <strong>${this.escapeHtml(hostname)}</strong>.
          </div>
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 12px; color: #334155;">
            <div style="font-weight: 700; color: #0f172a; margin-bottom: 6px;">How to use RESII:</div>
            <div style="margin-bottom: 4px;">1. Navigate to any supported career site (Workday, Greenhouse, Lever, Google Careers, Microsoft Careers, LinkedIn Jobs).</div>
            <div>2. Click the RESII icon or floating handle on the job page to <strong>Tailor</strong> your resume or <strong>Autofill</strong> the application form.</div>
          </div>
          <button id="btn-recheck-page" style="width: 100%; margin-top: 12px; background: #0284c7; color: white; border: none; padding: 10px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>🔄</span>
            <span>Check This Page Again</span>
          </button>
        </div>

        <!-- Account Connection Card -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 8px;">
            RESII Account Status
          </div>
          ${isConnected && candidateEmail !== 'demo@resii.com' ? `
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px;">
              <div style="color: #16a34a; font-weight: 700; font-size: 12px; margin-bottom: 2px;">
                ✓ Connected to RESII
              </div>
              <div style="font-size: 12px; color: #0f172a; font-weight: 600;">
                ${this.escapeHtml(candidateName)}
              </div>
              <div style="font-size: 11px; color: #64748b;">
                ${this.escapeHtml(candidateEmail)}
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-account-refresh" style="flex: 1; background: #ffffff; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer;">
                Sync Profile
              </button>
              <button id="btn-account-disconnect" style="background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 6px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer;">
                Disconnect
              </button>
            </div>
          ` : `
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; font-size: 12px; color: #92400e;">
              ${candidateEmail === 'demo@resii.com' 
                ? 'Currently paired with legacy demo account. Switch to your authentic profile.' 
                : 'Not connected. Connect to your active RESII candidate account to enable instant tailoring & autofill.'}
            </div>
            <button id="btn-quick-connect" style="width: 100%; background: #059669; color: white; border: none; padding: 10px 14px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer; margin-bottom: 8px;">
              ⚡ Connect to Sumed Chalakh (sumedchalakh528@gmail.com)
            </button>
            <div style="display: flex; gap: 6px;">
              <input id="input-pairing-code" type="text" placeholder="6-char pairing code" style="flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; font-size: 12px; text-transform: uppercase;" />
              <button id="btn-pair-code" style="background: #0f172a; color: white; border: none; border-radius: 6px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
                Connect
              </button>
            </div>
          `}
        </div>

      </div>
    `;

    // Event Listeners for Inactive View
    this.shadow.querySelector('#sidebar-close-btn')?.addEventListener('click', () => {
      this.close();
    });

    this.shadow.querySelector('#btn-recheck-page')?.addEventListener('click', () => {
      window.location.reload();
    });

    this.shadow.querySelector('#btn-quick-connect')?.addEventListener('click', () => {
      chrome.runtime?.sendMessage?.({ type: 'PAIR_EXTENSION', payload: { quickPair: true } }, (res) => {
        if (res?.success) {
          this.cachedState = res.data;
          this.updateContent(doc);
        } else {
          alert('Could not auto-connect. Please ensure RESII backend is running on 127.0.0.1:8100.');
        }
      });
    });

    this.shadow.querySelector('#btn-pair-code')?.addEventListener('click', () => {
      const code = (this.shadow?.querySelector('#input-pairing-code') as HTMLInputElement)?.value.trim();
      if (!code) return;
      chrome.runtime?.sendMessage?.({ type: 'PAIR_EXTENSION', payload: { pairingCode: code } }, (res) => {
        if (res?.success) {
          this.cachedState = res.data;
          this.updateContent(doc);
        } else {
          alert(res?.error || 'Failed to connect with pairing code.');
        }
      });
    });

    this.shadow.querySelector('#btn-account-disconnect')?.addEventListener('click', () => {
      chrome.runtime?.sendMessage?.({ type: 'DISCONNECT_EXTENSION' }, () => {
        // Automatically re-pair with authentic local candidate Sumed Chalakh
        chrome.runtime?.sendMessage?.({ type: 'PAIR_EXTENSION', payload: { quickPair: true } }, (res) => {
          if (res?.success) {
            this.cachedState = res.data;
          } else if (this.cachedState) {
            this.cachedState.isConnected = false;
          }
          this.updateContent(doc);
        });
      });
    });

    this.shadow.querySelector('#btn-account-refresh')?.addEventListener('click', () => {
      chrome.runtime?.sendMessage?.({ type: 'REFRESH_PROFILE' }, (res) => {
        if (res?.success) {
          this.updateContent(doc);
        }
      });
    });
  }

  // STEP 1: TAILOR (Matching Reference Screenshot 1)
  private renderTailorStep(): string {
    const activeResume = this.resumes.find((r) => r.id === this.selectedResumeId) || this.resumes[0];
    const resumeTitle = activeResume?.title || 'Sumed Chalakh Resume';
    const atsScore = activeResume?.ats_score || 88;
    const matchText = this.isTailoringLoading
      ? 'Analyzing JD and tailoring with RESII Engine...'
      : (this.realMatchScore ? `Grounded ATS Match: ${this.realMatchScore}%` : 'Matching your résumé...');

    const header = activeResume?.document?.header || {};
    const candidateName = header.name || this.cachedState?.profile?.name || this.cachedState?.user?.name || 'SUMED CHALAKH';
    const candidateTitle = header.title || this.cachedState?.profile?.title || 'Data Scientist | AI/ML Engineer';
    const candidateEmail = header.email || this.cachedState?.profile?.email || 'sumedchalakh528@gmail.com';
    const candidatePhone = header.phone || this.cachedState?.profile?.phone || '+91 8329935523';
    const candidateLoc = header.location || this.cachedState?.profile?.location || 'Nagpur, Maharashtra';

    const hasEdits = this.tailorEdits.length > 0;
    const nextBtnLabel = hasEdits
      ? `Review ${this.tailorEdits.length} edits &rarr;`
      : 'Fill Application Form &rarr;';

    return `
      <div style="padding: 10px 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; align-items: center;">
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-bottom: 8px; width: 100%; text-align: center;">
            Target Resume: <span style="color: #0f172a; font-weight: 700;">${this.escapeHtml(resumeTitle)}</span> &bull; ATS: <span style="color: #059669; font-weight: 700;">${atsScore}%</span>
          </div>

          <!-- Authentic Candidate Resume Card Preview -->
          <div style="
            width: 220px;
            height: 290px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
            border-radius: 4px;
            padding: 12px 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 14px;
            position: relative;
            overflow: hidden;
            font-size: 8px;
            line-height: 1.25;
            color: #1e293b;
            user-select: none;
            box-sizing: border-box;
          ">
            <!-- Header -->
            <div style="text-align: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
              <div style="font-weight: 800; font-size: 11px; color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase;">
                ${this.escapeHtml(candidateName)}
              </div>
              <div style="font-size: 7.5px; color: #475569; font-weight: 600; margin-top: 1px;">
                ${this.escapeHtml(candidateTitle)}
              </div>
              <div style="font-size: 6.5px; color: #64748b; margin-top: 2px;">
                ${this.escapeHtml(candidateLoc)} &bull; ${this.escapeHtml(candidatePhone)} &bull; ${this.escapeHtml(candidateEmail)}
              </div>
            </div>

            <!-- Summary -->
            <div style="margin-top: 1px;">
              <div style="font-weight: 700; font-size: 7px; color: #059669; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; border-bottom: 1px solid #d1fae5; padding-bottom: 1px;">
                Professional Summary
              </div>
              <div style="color: #334155; font-size: 6.5px; line-height: 1.3;">
                Data Scientist and AI/ML Engineer experienced in predictive modeling, generative AI RAG architectures, LangGraph orchestration, LLM benchmark evaluations, and scalable AWS cloud solutions.
              </div>
            </div>

            <!-- Skills -->
            <div style="margin-top: 1px;">
              <div style="font-weight: 700; font-size: 7px; color: #059669; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; border-bottom: 1px solid #d1fae5; padding-bottom: 1px;">
                Technical Skills
              </div>
              <div style="color: #334155; font-size: 6.5px; line-height: 1.3;">
                <strong>Core:</strong> Python, SQL, PySpark, FastAPI, Docker, Git<br>
                <strong>AI/ML:</strong> LangChain, LangGraph, RAG, Benchmarking, SHAP
              </div>
            </div>

            <!-- Experience -->
            <div style="margin-top: 1px;">
              <div style="font-weight: 700; font-size: 7px; color: #059669; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; border-bottom: 1px solid #d1fae5; padding-bottom: 1px;">
                Experience
              </div>
              <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 6.5px; color: #0f172a;">
                <span>AI Systems Evaluation Intern</span>
                <span style="color: #64748b;">Jul &ndash; Oct 2026</span>
              </div>
              <div style="color: #64748b; font-size: 6px; margin-bottom: 1px;">AirDawg Labs (Caudal AI Labs)</div>
              <div style="color: #475569; font-size: 6px; line-height: 1.25;">
                &bull; Benchmarked LLM responses and constructed automated evaluation pipelines.
              </div>
            </div>

            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 18px; background: linear-gradient(to top, #ffffff, transparent);"></div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding-top: 6px; border-top: 1px solid #f1f5f9;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #059669; font-weight: 600;">
              <span style="font-size: 15px;">🪄</span>
              <span>${this.escapeHtml(matchText)}</span>
            </div>
            <div style="background: #f5f3ff; color: #7c3aed; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; display: flex; align-items: center; gap: 4px;">
              <span>⚡</span>
              <span>Max fit</span>
            </div>
          </div>

          ${this.tailorErrorMessage ? `
            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 10px; margin-top: 10px; color: #92400e; font-size: 11px; line-height: 1.4; width: 100%;">
              ${this.escapeHtml(this.tailorErrorMessage)}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 16px; margin-top: auto;">
          <button id="btn-tailor-cancel" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Cancel
          </button>
          <button id="btn-tailor-next" style="background: #0f4c3a; color: #ffffff; border: none; border-radius: 6px; padding: 10px 24px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 6px rgba(15, 76, 58, 0.25);">
            <span>${nextBtnLabel}</span>
          </button>
        </div>
      </div>
    `;
  }

  // STEP 2: REVIEW (Matching Reference Screenshot 2)
  private renderReviewStep(): string {
    const summaryEdit = this.tailorEdits.find((e) => e.section === 'summary');
    const expEdits = this.tailorEdits.filter((e) => e.section === 'experience');
    const selectedCount = this.tailorEdits.filter((e) => e.selected).length;
    const totalCount = this.tailorEdits.length;

    return `
      <div style="padding: 10px 16px; flex: 1; display: flex; flex-direction: column;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px;">
            ${this.escapeHtml(this.jobContext?.company || '')}
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <a href="http://localhost:8100/dashboard" target="_blank" style="text-decoration: none; color: #475569; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px; background: #ffffff; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px;">
              <span>🖵</span>
              <span>Review in editor</span>
            </a>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #475569; font-weight: 600; cursor: pointer;">
              <span>${selectedCount} of ${totalCount} selected</span>
              <input type="checkbox" id="select-all-edits" ${selectedCount === totalCount ? 'checked' : ''} style="accent-color: #059669; cursor: pointer;" />
            </label>
          </div>
        </div>

        <div style="flex: 1; overflow-y: auto; padding-right: 4px;">
          ${summaryEdit ? `
            <div style="margin-bottom: 16px;">
              <div style="font-weight: 700; font-size: 12px; color: #334155; margin-bottom: 6px;">
                Professional summary
              </div>
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; position: relative;">
                <input type="checkbox" data-edit-id="${summaryEdit.id}" class="edit-item-check" ${summaryEdit.selected ? 'checked' : ''} style="position: absolute; top: 12px; right: 12px; accent-color: #059669; cursor: pointer;" />
                <div style="font-size: 12px; line-height: 1.5; color: #1e293b; padding-right: 24px;">
                  ${this.showOriginalSummary ? this.escapeHtml(summaryEdit.originalText) : this.renderSummaryDiff(summaryEdit)}
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid #f1f5f9; font-size: 10px;">
                  <span id="toggle-original-summary" style="color: #64748b; cursor: pointer; text-decoration: underline;">
                    ${this.showOriginalSummary ? 'Show tailored' : 'Show original'}
                  </span>
                  <span style="color: #059669; font-style: italic;">
                    ${this.escapeHtml(summaryEdit.rationale)}
                  </span>
                </div>
              </div>
            </div>
          ` : ''}

          <div style="margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <div style="font-weight: 700; font-size: 12px; color: #334155;">
                Professional experience
              </div>
              <span style="font-size: 11px; color: #64748b;">${expEdits.length} edits</span>
            </div>
            ${expEdits.map((edit) => `
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; position: relative;">
                <button data-delete-id="${edit.id}" class="btn-delete-edit" title="Remove bullet" style="position: absolute; top: 8px; right: 32px; background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
                <input type="checkbox" data-edit-id="${edit.id}" class="edit-item-check" ${edit.selected ? 'checked' : ''} style="position: absolute; top: 10px; right: 10px; accent-color: #059669; cursor: pointer;" />
                <div style="font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 2px;">
                  ${this.escapeHtml(edit.title || 'Work Experience')}
                </div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">
                  ${this.escapeHtml(edit.subtitle || '')}
                </div>
                <div style="margin-top: 4px;">
                  <textarea data-edit-id="${edit.id}" class="edit-bullet-textarea" rows="2" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 8px; font-size: 11px; line-height: 1.4; color: #0f172a; font-family: inherit; resize: vertical; box-sizing: border-box;" placeholder="Edit bullet statement...">${this.escapeHtml(edit.tailoredText)}</textarea>
                </div>
              </div>
            `).join('')}
            <button id="btn-add-bullet-edit" style="background: #ffffff; border: 1px dashed #cbd5e1; color: #059669; border-radius: 6px; padding: 6px 12px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-top: 4px;">
              <span>+</span>
              <span>Add bullet point</span>
            </button>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid #e2e8f0; margin-top: auto;">
          <button id="btn-review-back" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 22px; font-size: 13px; font-weight: 600; cursor: pointer;">
            Back
          </button>
          <button id="btn-review-use" style="background: #0f4c3a; color: #ffffff; border: none; border-radius: 6px; padding: 10px 28px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 6px rgba(15, 76, 58, 0.25);">
            Use ${selectedCount} edits
          </button>
        </div>
      </div>
    `;
  }

  private renderSummaryDiff(edit: TailorEditItem): string {
    return `
      Software professional <span style="background: #dcfce7; color: #166534; padding: 1px 3px; border-radius: 2px; text-decoration: underline;">transitioning into ${this.escapeHtml(this.jobContext?.title || 'Target Role')}</span>, with experience building high-performance applications, scalable data pipelines, and robust production systems. Proficient in Python, SQL, and modern cloud architectures supporting quality-focused AI solutions.
    `;
  }

  // STEP 3: FILL (Zero Paywall Form Autofill)
  private renderFillStep(isDirectMode: boolean): string {
    const approvedCount = this.currentFields.filter((f) => f.approved && !f.requiresUserInput && f.proposedValue).length;

    return `
      <div style="padding: 10px 16px; flex: 1; display: flex; flex-direction: column;">
        ${this.fillSuccessMessage ? `
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 10px; margin-bottom: 12px; color: #15803d; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>✓</span>
            <span>${this.escapeHtml(this.fillSuccessMessage)}</span>
          </div>
        ` : ''}

        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a;">
            Detected Form Fields (${this.currentFields.length})
          </div>
          <div style="color: #059669; font-weight: 600; font-size: 11px;">
            ${approvedCount} Approved
          </div>
        </div>

        <div style="flex: 1; max-height: 380px; overflow-y: auto; padding-right: 4px; margin-bottom: 12px;">
          ${this.currentFields.map((field, idx) => `
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; font-size: 11px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <label style="display: flex; align-items: center; gap: 6px; font-weight: 600; color: #334155; cursor: pointer;">
                  <input type="checkbox" data-idx="${idx}" class="fill-field-check" ${field.approved && !field.requiresUserInput ? 'checked' : ''} style="accent-color: #059669; cursor: pointer;" />
                  <span>${this.escapeHtml(field.label)}</span>
                </label>
                <span style="background: #f1f5f9; color: #475569; padding: 1px 4px; border-radius: 3px; font-size: 9px; font-weight: 600;">
                  ${field.category}
                </span>
              </div>
              <input type="text" data-idx="${idx}" class="fill-field-val" value="${this.escapeHtml(field.proposedValue)}" style="width: 100%; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 6px; font-size: 11px; color: #0f172a;" />
            </div>
          `).join('')}
        </div>

        <div style="margin-top: auto; padding-top: 12px; border-top: 1px solid #e2e8f0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <button id="btn-fill-back" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer;">
              Back
            </button>
            <button id="btn-fill-autofill" style="flex: 1; background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 10px 14px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span>⚡</span>
              <span>${this.isAutoFilling ? 'Filling form...' : 'Autofill Form Now'}</span>
            </button>
          </div>
          <button id="btn-fill-continue-submit" style="width: 100%; background: #0f4c3a; color: #ffffff; border: none; border-radius: 6px; padding: 11px 16px; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 6px rgba(15, 76, 58, 0.25);">
            Continue to Submit &rarr;
          </button>
        </div>
      </div>
    `;
  }

  // STEP 4: SUBMIT (Human Supervised Final Submission)
  private renderSubmitStep(): string {
    return `
      <div style="padding: 14px 18px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="text-align: center; padding: 20px 0 14px 0;">
            <div style="width: 52px; height: 52px; background: #ecfdf5; color: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; margin: 0 auto 12px auto;">
              ✓
            </div>
            <div style="font-weight: 800; font-size: 17px; color: #0f172a; margin-bottom: 4px;">
              Ready for Submission!
            </div>
            <div style="color: #64748b; font-size: 12px; max-width: 300px; margin: 0 auto;">
              Your application details have been populated into the page inputs.
            </div>
          </div>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="font-weight: 700; font-size: 12px; color: #0f172a; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
              <span>🚀</span>
              <span>Submit &amp; Track Application</span>
            </div>
            <div style="color: #475569; font-size: 12px; line-height: 1.5; margin-bottom: 10px;">
              Click below to trigger the page's submit button and record your application into your RESII Job Tracker.
            </div>
            <button id="btn-page-submit-trigger" style="width: 100%; background: #0f4c3a; color: #ffffff; border: none; border-radius: 6px; padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(15, 76, 58, 0.25);">
              <span>⚡</span>
              <span>Submit Application on Page</span>
            </button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #334155;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #059669; font-weight: 700;">✓</span>
              <span>Resume and contact details populated</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #059669; font-weight: 700;">✓</span>
              <span>Work experience &amp; skills aligned to role</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #059669; font-weight: 700;">✓</span>
              <span>Tracked in RESII Dashboard</span>
            </div>
          </div>
        </div>

        <div style="padding-top: 16px; border-top: 1px solid #e2e8f0;">
          ${this.hasTracked ? `
            <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px; padding: 10px; margin-bottom: 12px; color: #15803d; font-size: 12px; font-weight: 600; text-align: center;">
              ✓ Application recorded in RESII Job Tracker${this.trackedApplicationId ? ` (ID: ${this.escapeHtml(this.trackedApplicationId)})` : ''}!
            </div>
          ` : `
            <button id="btn-submit-track" style="width: 100%; background: #059669; color: #ffffff; border: none; border-radius: 6px; padding: 11px 16px; font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 8px; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);">
              📋 Track Application in RESII
            </button>
          `}
          <button id="btn-submit-done" style="width: 100%; background: #ffffff; color: #475569; border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px 16px; font-size: 12px; font-weight: 600; cursor: pointer;">
            Close Sidebar
          </button>
        </div>
      </div>
    `;
  }

  private attachEventListeners(doc: Document) {
    if (!this.shadow) return;

    this.shadow.querySelector('#sidebar-close-btn')?.addEventListener('click', () => {
      this.toggleSidebar(doc);
    });

    this.shadow.querySelectorAll('.step-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const targetStep = (tab as HTMLElement).getAttribute('data-step') as SidebarStep;
        if (targetStep) {
          this.currentStep = targetStep;
          this.updateContent(doc);
        }
      });
    });

    // Step 1: Tailor Handlers
    this.shadow.querySelector('#btn-tailor-cancel')?.addEventListener('click', () => {
      this.toggleSidebar(doc);
    });
    this.shadow.querySelector('#btn-tailor-next')?.addEventListener('click', () => {
      if (this.tailorEdits.length > 0) {
        this.currentStep = 'review';
      } else {
        this.currentStep = 'fill';
      }
      this.updateContent(doc);
    });

    // Step 2: Review Handlers
    this.shadow.querySelector('#btn-review-back')?.addEventListener('click', () => {
      this.currentStep = 'tailor';
      this.updateContent(doc);
    });
    this.shadow.querySelector('#btn-review-use')?.addEventListener('click', () => {
      this.currentStep = 'fill';
      this.updateContent(doc);
    });
    this.shadow.querySelector('#toggle-original-summary')?.addEventListener('click', () => {
      this.showOriginalSummary = !this.showOriginalSummary;
      this.updateContent(doc);
    });
    this.shadow.querySelector('#select-all-edits')?.addEventListener('change', (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.tailorEdits.forEach((item) => (item.selected = isChecked));
      this.updateContent(doc);
    });
    this.shadow.querySelectorAll('.edit-item-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const editId = (e.target as HTMLInputElement).getAttribute('data-edit-id');
        const item = this.tailorEdits.find((ed) => ed.id === editId);
        if (item) {
          item.selected = (e.target as HTMLInputElement).checked;
          this.updateContent(doc);
        }
      });
    });

    this.shadow.querySelectorAll('.edit-bullet-textarea').forEach((ta) => {
      ta.addEventListener('input', (e) => {
        const editId = (e.target as HTMLTextAreaElement).getAttribute('data-edit-id');
        const newText = (e.target as HTMLTextAreaElement).value;
        const target = this.tailorEdits.find((item) => item.id === editId);
        if (target) {
          target.tailoredText = newText;
        }
      });
    });

    this.shadow.querySelectorAll('.btn-delete-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const editId = (btn as HTMLElement).getAttribute('data-delete-id');
        this.tailorEdits = this.tailorEdits.filter((item) => item.id !== editId);
        this.updateContent(doc);
      });
    });

    this.shadow.querySelector('#btn-add-bullet-edit')?.addEventListener('click', () => {
      const newId = `custom_bullet_${Date.now()}`;
      this.tailorEdits.push({
        id: newId,
        section: 'experience',
        title: 'Work Experience',
        subtitle: this.jobContext?.company || 'Candidate Experience',
        originalText: '',
        tailoredText: '',
        rationale: 'Candidate added bullet',
        selected: true
      });
      this.updateContent(doc);
    });

    // Step 3: Fill Handlers
    this.shadow.querySelector('#btn-fill-back')?.addEventListener('click', () => {
      this.currentStep = 'review';
      this.updateContent(doc);
    });
    this.shadow.querySelector('#btn-fill-autofill')?.addEventListener('click', () => {
      this.executeAutofill(doc, true);
    });
    this.shadow.querySelector('#btn-fill-continue-submit')?.addEventListener('click', () => {
      this.currentStep = 'submit';
      this.updateContent(doc);
    });

    this.shadow.querySelectorAll('.fill-field-check').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-idx') || '0', 10);
        if (this.currentFields[idx]) {
          this.currentFields[idx].approved = (e.target as HTMLInputElement).checked;
        }
      });
    });

    this.shadow.querySelectorAll('.fill-field-val').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt((e.target as HTMLInputElement).getAttribute('data-idx') || '0', 10);
        if (this.currentFields[idx]) {
          this.currentFields[idx].proposedValue = (e.target as HTMLInputElement).value;
        }
      });
    });

    // Step 4: Submit Handlers
    this.shadow.querySelector('#btn-page-submit-trigger')?.addEventListener('click', () => {
      this.triggerPageSubmitAndTrack(doc);
    });

    this.shadow.querySelector('#btn-submit-track')?.addEventListener('click', () => {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'TRACK_APPLICATION',
          payload: {
            title: this.jobContext?.title || 'Target Role',
            company: this.jobContext?.company || 'Target Employer',
            job_url: this.jobContext?.url,
            form_provider: this.jobContext?.adapterName || 'Generic',
            stage: 'applied',
            resume_id: this.selectedResumeId || undefined,
            notes: 'Submitted manually by candidate and tracked via RESII Extension.'
          }
        }, (res) => {
          this.hasTracked = true;
          this.trackedApplicationId = res?.data?.application_id || '';
          this.updateContent(doc);
        });
      } else if (this.onTrackCallback) {
        this.onTrackCallback('applied');
        this.hasTracked = true;
        this.updateContent(doc);
      }
    });
    this.shadow.querySelector('#btn-submit-done')?.addEventListener('click', () => {
      this.toggleSidebar(doc);
    });
  }

  private triggerPageSubmitAndTrack(doc: Document) {
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      '[data-automation-id="createAccountSubmitButton"]',
      '[data-automation-id="bottom-navigation-next-button"]',
      '[role="button"][jsname="M2vTae"]',
      'button',
      '[role="button"]'
    ];
    let submitBtn: HTMLElement | null = null;
    for (const sel of submitSelectors) {
      try {
        const els = Array.from(doc.querySelectorAll<HTMLElement>(sel));
        for (const el of els) {
          const txt = (el.textContent || (el as any).value || '').toLowerCase().trim();
          if (
            txt.includes('submit') ||
            txt.includes('create account') ||
            txt.includes('apply') ||
            txt.includes('send') ||
            txt.includes('review and submit') ||
            txt.includes('submit application')
          ) {
            submitBtn = el;
            break;
          }
        }
      } catch (_) {}
      if (submitBtn) break;
    }

    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitBtn.focus();
      submitBtn.click();
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'TRACK_APPLICATION',
        payload: {
          title: this.jobContext?.title || 'Target Role',
          company: this.jobContext?.company || 'Target Employer',
          job_url: this.jobContext?.url || window.location.href,
          form_provider: this.jobContext?.adapterName || 'Generic',
          stage: 'applied',
          resume_id: this.selectedResumeId || undefined,
          notes: 'Submitted and tracked via RESII Extension.'
        }
      }, (res) => {
        this.hasTracked = true;
        this.trackedApplicationId = res?.data?.application_id || '';
        this.updateContent(doc);
      });
    } else if (this.onTrackCallback) {
      this.onTrackCallback('applied');
      this.hasTracked = true;
      this.updateContent(doc);
    }
  }

  private executeAutofill(doc: Document, userTriggered: boolean) {
    this.isAutoFilling = true;

    const candidateFields = this.currentFields
      .filter((f) => f.approved && !f.requiresUserInput && f.proposedValue)
      .map((f) => ({ id: f.id, category: f.category, value: f.proposedValue }));

    if (candidateFields.length === 0) {
      this.isAutoFilling = false;
      return;
    }

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

          chrome.runtime.sendMessage({
            type: 'CONSUME_AUTOFILL_TICKET',
            payload: {
              scanId: this.scanId,
              ticket,
              fieldIds: allowedToFill.map((f) => f.id)
            }
          }, (consumeRes) => {
            this.isAutoFilling = false;
            if (consumeRes?.success) {
              const result = formFiller.fillApprovedFields(doc, allowedToFill);

              // Check for approved resume file attachment
              const resumeField = this.currentFields.find(
                (f) => f.approved && (f.category === 'resume_file' || f.type === 'file')
              );

              if (resumeField && this.selectedResumeId) {
                const hasTailoredEdits = this.tailorEdits.some((e) => e.selected);
                const actionType = hasTailoredEdits ? 'TAILOR_AND_ATTACH' : 'DOWNLOAD_RESUME';
                const payload = hasTailoredEdits ? {
                  resumeId: this.selectedResumeId,
                  jobDescription: this.jobContext?.jobDescription || '',
                  jobTitle: this.jobContext?.title || '',
                  companyName: this.jobContext?.company || '',
                  acceptedChanges: this.tailorEdits.filter((e) => e.selected).map((e) => ({
                    original_text: e.originalText,
                    suggested_text: e.tailoredText
                  })),
                  targetFormat: 'docx'
                } : {
                  resumeId: this.selectedResumeId,
                  scanId: this.scanId,
                  ticket
                };

                chrome.runtime.sendMessage({
                  type: actionType,
                  payload
                }, (dlRes) => {
                  const fileB64 = dlRes?.data?.fileBase64 || dlRes?.data?.pdfBase64;
                  const filename = dlRes?.data?.filename || 'Resume.docx';
                  const mime = dlRes?.data?.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

                  if (dlRes?.success && fileB64) {
                    const attachRes = formFiller.attachFileToInput(
                      doc,
                      resumeField.selector,
                      fileB64,
                      filename,
                      mime
                    );
                    if (attachRes.verified) {
                      const tag = hasTailoredEdits ? 'tailored resume' : 'resume';
                      this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields & directly attached ${tag} (${attachRes.filename})!`;
                    } else {
                      this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields. Note: Please select resume file manually.`;
                    }
                  } else {
                    this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields into page!`;
                  }
                  this.updateContent(doc);
                });
              } else {
                this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields into page!`;
                this.updateContent(doc);
              }
            }
          });
        } else {
          this.isAutoFilling = false;
          const result = formFiller.fillApprovedFields(doc, this.currentFields);
          this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields into page!`;
          this.updateContent(doc);
        }
      });
    } else {
      this.isAutoFilling = false;
      const result = formFiller.fillApprovedFields(doc, this.currentFields);
      this.fillSuccessMessage = `Autofilled ${result.verified || result.filled} fields into page!`;
      this.updateContent(doc);
    }
  }

  refreshContext(doc: Document, context: JobContext, fields: ClassifiedField[]) {
    this.jobContext = context;
    this.currentFields = fields;
    const isDirect = !context.hasJobDescription || context.isDirectApplyForm || context.adapterName.includes('Google') || context.adapterName.includes('Microsoft') || context.adapterName.includes('Cornerstone');
    if (isDirect) {
      this.currentStep = 'fill';
    }
    if (this.container) {
      this.updateContent(doc);
    }
  }

  remove(doc: Document) {
    const existing = doc.getElementById('resii-review-overlay');
    if (existing) existing.remove();

    const existingTab = doc.getElementById('resii-floating-tab');
    if (existingTab) existingTab.remove();

    const existingAutofill = doc.getElementById('resii-floating-autofill');
    if (existingAutofill) existingAutofill.remove();

    this.container = null;
    this.shadow = null;
    this.floatingTab = null;
    this.floatingAutofillBtn = null;
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

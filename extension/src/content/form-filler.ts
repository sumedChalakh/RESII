import { ClassifiedField, AutofillReport, AutofillResultItem } from '../shared/types';
import { FORBIDDEN_SUBMIT_SELECTORS } from '../shared/constants';

export class FormFiller {
  /**
   * Injects approved values into page form elements.
   * Dispatches synthetic native events to trigger React/Angular/Vue change listeners.
   * Verifies each value in the live DOM after dispatch.
   * 
   * NON-NEGOTIABLE INVARIANT: Prohibits any interaction with submit buttons.
   */
  fillApprovedFields(doc: Document, fields: ClassifiedField[]): AutofillReport {
    let filled = 0;
    let skipped = 0;
    let verified = 0;
    const items: AutofillResultItem[] = [];

    for (const field of fields) {
      if (!field.approved || field.requiresUserInput || !field.proposedValue) {
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'skipped',
          reason: 'Field not approved or requires candidate input'
        });
        continue;
      }

      // File inputs handled via attachFileToInput
      if (field.category === 'resume_file' || field.type === 'file') {
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'skipped',
          reason: 'File input handled via resume attachment engine'
        });
        continue;
      }

      const el = this.findElement(doc, field);
      if (!el) {
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'skipped',
          reason: 'Element not found in DOM'
        });
        continue;
      }

      // Check visibility & disabled status
      if (!this.isElementInteractable(el)) {
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'skipped',
          reason: 'Element is hidden or disabled'
        });
        continue;
      }

      // Check invariant: Never touch submit buttons
      if (this.isSubmitElement(el)) {
        console.warn('[RESII Invariant Guard] Prevented interaction with submission button:', el);
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'skipped',
          reason: 'Element is a submit button (prohibited invariant)'
        });
        continue;
      }

      const setResult = this.setElementValueWithVerification(el, field.proposedValue);
      if (setResult.success) {
        filled++;
        if (setResult.verified) {
          verified++;
        }
        this.highlightFilledField(el);
        items.push({
          fieldId: field.id,
          status: 'filled',
          verifiedValue: setResult.actualValue
        });
      } else {
        skipped++;
        items.push({
          fieldId: field.id,
          status: 'failed',
          reason: setResult.error || 'DOM rejected value assignment'
        });
      }
    }

    return { filled, skipped, verified, items };
  }

  /**
   * Attaches a genuine downloaded resume artifact to an ATS file input element
   * using the web-standard DataTransfer API. Dispatches native change & input events.
   * Verifies that the file was accepted into input.files.
   * 
   * NON-NEGOTIABLE INVARIANT: Prohibits form submission or submit-button interaction.
   */
  attachFileToInput(
    doc: Document,
    selector: string,
    dataBase64: string,
    filename: string,
    mimeType: string = 'application/pdf'
  ): { success: boolean; verified: boolean; filename: string; error?: string } {
    const input = doc.querySelector<HTMLInputElement>(selector);
    if (!input || input.type !== 'file') {
      return { success: false, verified: false, filename, error: 'File input element not found' };
    }

    // Check invariant: Never touch submit buttons
    if (this.isSubmitElement(input)) {
      console.warn('[RESII Invariant Guard] Prevented interaction with submission button:', input);
      return { success: false, verified: false, filename, error: 'Target element is a submit button' };
    }

    try {
      const binaryStr = atob(dataBase64);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const file = new File([bytes], filename, { type: mimeType });

      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;

      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Live DOM verification of file attachment
      const hasFile = input.files && input.files.length > 0;
      const verified = hasFile && input.files[0].name === filename;

      if (verified) {
        this.highlightFilledField(input);
      }

      return {
        success: hasFile,
        verified,
        filename
      };
    } catch (err: any) {
      console.warn('[RESII FormFiller] Failed to attach file to input:', err);
      return {
        success: false,
        verified: false,
        filename,
        error: err?.message || 'File attachment failed'
      };
    }
  }

  private isElementInteractable(el: HTMLElement): boolean {
    if ((el as any).disabled) return false;
    // Basic visibility check
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && el.offsetParent === null) {
        // May be offscreen or hidden in an unrendered tab
        const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          return false;
        }
      }
    } catch (_) {}
    return true;
  }

  private findElement(doc: Document, field: ClassifiedField): HTMLElement | null {
    if (field.elementId) {
      const byId = doc.getElementById(field.elementId);
      if (byId) return byId;
    }
    try {
      if (field.selector) {
        const bySel = doc.querySelector<HTMLElement>(field.selector);
        if (bySel) return bySel;
      }
    } catch {
      // Ignore invalid CSS selector query
    }
    if (field.name) {
      try {
        const byName = doc.querySelector<HTMLElement>(`[name="${CSS.escape(field.name)}"]`);
        if (byName) return byName;
      } catch (_) {}
    }
    return null;
  }

  private setElementValueWithVerification(
    el: HTMLElement,
    value: string
  ): { success: boolean; verified: boolean; actualValue?: string; error?: string } {
    try {
      // 1. Text input & Textarea
      if (el instanceof HTMLInputElement && ['text', 'email', 'tel', 'url', 'search', 'password', ''].includes(el.type)) {
        return this.fillTextInput(el, value);
      }
      if (el instanceof HTMLTextAreaElement) {
        return this.fillTextarea(el, value);
      }

      // 2. Radio button
      if (el instanceof HTMLInputElement && el.type === 'radio') {
        return this.fillRadio(el, value);
      }

      // 3. Checkbox
      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        return this.fillCheckbox(el, value);
      }

      // 4. Select dropdown
      if (el instanceof HTMLSelectElement) {
        return this.fillSelect(el, value);
      }

      // 5. Fallback for custom components (contenteditable or custom inputs)
      if (el.isContentEditable) {
        el.textContent = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, verified: el.textContent === value, actualValue: el.textContent || '' };
      }

      // Generic input fallback
      if (el instanceof HTMLInputElement) {
        return this.fillTextInput(el, value);
      }
    } catch (err: any) {
      console.warn('[RESII FormFiller] Error setting value on element:', err);
      return { success: false, verified: false, error: err?.message };
    }
    return { success: false, verified: false, error: 'Unsupported element type' };
  }

  private fillTextInput(el: HTMLInputElement, value: string) {
    try { el.focus(); } catch (_) {}
    if ((el as any)._valueTracker) {
      try { (el as any)._valueTracker.setValue(''); } catch (_) {}
    }
    const prototype = window.HTMLInputElement.prototype;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeValueSetter) {
      nativeValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));

    const verified = el.value === value;
    return { success: true, verified, actualValue: el.value };
  }

  private fillTextarea(el: HTMLTextAreaElement, value: string) {
    try { el.focus(); } catch (_) {}
    if ((el as any)._valueTracker) {
      try { (el as any)._valueTracker.setValue(''); } catch (_) {}
    }
    const prototype = window.HTMLTextAreaElement.prototype;
    const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (nativeValueSetter) {
      nativeValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));

    const verified = el.value === value;
    return { success: true, verified, actualValue: el.value };
  }

  private fillRadio(el: HTMLInputElement, value: string) {
    const valLower = value.toLowerCase().trim();
    // Check if this radio matches value or label
    const isMatch = el.value.toLowerCase() === valLower || valLower === 'yes' || valLower === 'true';
    if (isMatch) {
      el.checked = true;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true, verified: el.checked, actualValue: String(el.checked) };
    }
    return { success: false, verified: false, error: 'Radio option mismatch' };
  }

  private fillCheckbox(el: HTMLInputElement, value: string) {
    const valLower = value.toLowerCase().trim();
    const shouldCheck = ['yes', 'true', '1', 'authorized', 'agree'].includes(valLower);
    el.checked = shouldCheck;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true, verified: el.checked === shouldCheck, actualValue: String(el.checked) };
  }

  private fillSelect(el: HTMLSelectElement, value: string) {
    const valLower = value.toLowerCase().trim();
    let matched = false;
    for (let i = 0; i < el.options.length; i++) {
      const opt = el.options[i];
      if (opt.value.toLowerCase() === valLower || opt.text.toLowerCase().includes(valLower)) {
        el.selectedIndex = i;
        matched = true;
        break;
      }
    }
    if (matched) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        success: true,
        verified: true,
        actualValue: el.options[el.selectedIndex]?.text || el.value
      };
    }
    return { success: false, verified: false, error: `Select option matching "${value}" not found` };
  }

  private isSubmitElement(el: HTMLElement): boolean {
    if (el instanceof HTMLInputElement && ['submit', 'button'].includes(el.type)) return true;
    if (el instanceof HTMLButtonElement) {
      if (el.type === 'submit') return true;
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('submit') || text.includes('apply now') || text.includes('send application')) return true;
    }
    for (const sel of FORBIDDEN_SUBMIT_SELECTORS) {
      if (el.matches(sel)) return true;
    }
    return false;
  }

  private highlightFilledField(el: HTMLElement) {
    const originalOutline = el.style.outline;
    const originalTransition = el.style.transition;
    el.style.transition = 'outline 0.3s ease';
    el.style.outline = '2px solid #10b981'; // Green border indicator

    setTimeout(() => {
      el.style.outline = originalOutline;
      el.style.transition = originalTransition;
    }, 2500);
  }
}

export const formFiller = new FormFiller();

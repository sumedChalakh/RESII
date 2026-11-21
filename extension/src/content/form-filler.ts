import { ClassifiedField } from '../shared/types';
import { FORBIDDEN_SUBMIT_SELECTORS } from '../shared/constants';

export class FormFiller {
  /**
   * Injects approved values into page form elements.
   * Dispatches synthetic native events to trigger React/Angular/Vue change listeners.
   * 
   * NON-NEGOTIABLE INVARIANT: Prohibits any interaction with submit buttons.
   */
  fillApprovedFields(doc: Document, fields: ClassifiedField[]): { filled: number; skipped: number } {
    let filled = 0;
    let skipped = 0;

    for (const field of fields) {
      if (!field.approved || field.requiresUserInput || !field.proposedValue) {
        skipped++;
        continue;
      }

      // Do not attempt to fill file inputs directly via value setter (handled via attachFileToInput)
      if (field.category === 'resume_file') {
        skipped++;
        continue;
      }

      const el = this.findElement(doc, field);
      if (!el) {
        skipped++;
        continue;
      }

      // Check invariant: Never touch submit buttons
      if (this.isSubmitElement(el)) {
        console.warn('[RESII Invariant Guard] Prevented interaction with submission button:', el);
        skipped++;
        continue;
      }

      const success = this.setElementValue(el, field.proposedValue);
      if (success) {
        filled++;
        this.highlightFilledField(el);
      } else {
        skipped++;
      }
    }

    return { filled, skipped };
  }

  /**
   * Attaches a genuine downloaded resume artifact to an ATS file input element
   * using the web-standard DataTransfer API. Dispatches native change & input events.
   * NON-NEGOTIABLE INVARIANT: Prohibits form submission or submit-button interaction.
   */
  attachFileToInput(
    doc: Document,
    selector: string,
    dataBase64: string,
    filename: string,
    mimeType: string = 'application/pdf'
  ): boolean {
    const input = doc.querySelector<HTMLInputElement>(selector);
    if (!input || input.type !== 'file') return false;

    // Check invariant: Never touch submit buttons
    if (this.isSubmitElement(input)) {
      console.warn('[RESII Invariant Guard] Prevented interaction with submission button:', input);
      return false;
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
      this.highlightFilledField(input);
      return true;
    } catch (err) {
      console.warn('[RESII FormFiller] Failed to attach file to input:', err);
      return false;
    }
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
      return doc.querySelector<HTMLElement>(`[name="${CSS.escape(field.name)}"]`);
    }
    return null;
  }

  private setElementValue(el: HTMLElement, value: string): boolean {
    try {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        // Native prototype setter hack for React / Vue controlled inputs
        const prototype = el instanceof HTMLInputElement 
          ? window.HTMLInputElement.prototype 
          : window.HTMLTextAreaElement.prototype;
        const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

        if (nativeValueSetter) {
          nativeValueSetter.call(el, value);
        } else {
          el.value = value;
        }

        // Dispatch input, change, and blur events
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      } else if (el instanceof HTMLSelectElement) {
        // Try matching select option by value or text
        const valLower = value.toLowerCase();
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
          return true;
        }
      }
    } catch (err) {
      console.warn('[RESII FormFiller] Error setting value on element:', err);
    }
    return false;
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

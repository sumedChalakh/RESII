import { ClassifiedField, FieldCategory } from '../shared/types';
import { FIELD_CLASSIFICATION_RULES, SENSITIVE_KEYWORDS, FORBIDDEN_SUBMIT_SELECTORS } from '../shared/constants';
import { FormAdapter } from './adapters/base-adapter';

export class FieldClassifier {
  classifyForm(form: HTMLElement, adapter?: FormAdapter): ClassifiedField[] {
    const fields: ClassifiedField[] = [];
    const elements = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select'
      )
    );

    let idx = 0;
    for (const el of elements) {
      if (this.shouldIgnoreElement(el)) {
        continue;
      }

      idx++;
      const fieldId = el.id || el.name || `field_${idx}`;
      const label = this.extractLabel(el);
      const category = this.categorizeField(el, label, adapter);
      const isSensitive = category === 'sensitive_demographic';

      fields.push({
        id: fieldId,
        elementId: el.id,
        name: el.name,
        type: el.type || el.tagName.toLowerCase(),
        category,
        label: label || el.name || ('placeholder' in el ? (el as any).placeholder : '') || `Field ${idx}`,
        selector: this.generateSelector(el, idx),
        confidence: isSensitive ? 0.0 : this.computeConfidence(category, el, label),
        isRequired: el.required || el.getAttribute('aria-required') === 'true',
        proposedValue: '',
        provenance: isSensitive ? 'user_input_required' : 'verified_profile',
        requiresUserInput: isSensitive,
        approved: !isSensitive
      });
    }

    return fields;
  }

  private shouldIgnoreElement(el: HTMLElement): boolean {
    // 1. Submit or reset buttons
    if (el instanceof HTMLInputElement && ['submit', 'reset', 'button', 'image'].includes(el.type)) {
      return true;
    }
    // 2. Hidden inputs (unless specific file upload or token)
    if (el.style.display === 'none' || el.style.visibility === 'hidden') {
      if (el.getAttribute('type') === 'file') return false;
      return true;
    }
    // 3. Elements matching forbidden submit selectors
    for (const sel of FORBIDDEN_SUBMIT_SELECTORS) {
      if (el.matches(sel)) return true;
    }
    return false;
  }

  private extractLabel(el: HTMLElement): string {
    // 1. Check Google Forms question heading
    const googleFormItem = el.closest('[role="listitem"], .Qr7Oae, .freebirdFormviewerViewNumberedItemContainer');
    if (googleFormItem) {
      const headingEl = googleFormItem.querySelector('.M7eMe, [role="heading"], div[dir="auto"].freebirdFormviewerComponentsQuestionBaseTitle, .hoLwm');
      if (headingEl && headingEl.textContent) {
        return headingEl.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    // 2. Check Microsoft Forms question heading
    const msFormItem = el.closest('[data-automation-id="questionItem"], .office-form-question');
    if (msFormItem) {
      const headingEl = msFormItem.querySelector('[data-automation-id="questionTitle"], .office-form-question-title');
      if (headingEl && headingEl.textContent) {
        return headingEl.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    // 3. Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    // 4. Check label element with "for" matching id
    if (el.id) {
      const labelEl = el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (labelEl && labelEl.textContent) {
        return labelEl.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    // 5. Check closest ancestor label
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent) {
      return parentLabel.textContent.trim().replace(/\s+/g, ' ');
    }

    // 6. Check placeholder
    if ('placeholder' in el && (el as HTMLInputElement).placeholder) {
      return (el as HTMLInputElement).placeholder.trim();
    }

    // 7. Check field container label or preceding sibling
    const fieldContainer = el.closest('.form-group, [class*="field-wrapper" i], [class*="form-group" i], [class*="formField" i], [class*="input-container" i], [class*="inputWrapper" i], [class*="csod" i], [data-tag*="field"]');
    if (fieldContainer) {
      const lbl = fieldContainer.querySelector('label, [class*="label" i], [data-tag*="label"], .title');
      if (lbl && lbl.textContent) {
        return lbl.textContent.trim().replace(/\s+/g, ' ');
      }
    }

    const parent = el.parentElement;
    if (parent) {
      const prev = el.previousElementSibling;
      if (prev && ['LABEL', 'SPAN', 'P', 'H3', 'H4', 'DIV'].includes(prev.tagName)) {
        const text = (prev.textContent || '').trim();
        if (text && text.length < 120) return text;
      }
    }

    return '';
  }

  private categorizeField(el: HTMLElement, label: string, adapter?: FormAdapter): FieldCategory {
    const combinedText = `${label} ${el.getAttribute('name') || ''} ${el.getAttribute('id') || ''} ${el.getAttribute('autocomplete') || ''}`.toLowerCase();

    // 1. Check for sensitive demographic keywords -> NEVER AUTOFILL
    for (const sens of SENSITIVE_KEYWORDS) {
      if (combinedText.includes(sens)) {
        return 'sensitive_demographic';
      }
    }

    // 2. File input -> resume or cover letter
    if (el.getAttribute('type') === 'file') {
      if (combinedText.includes('cover') || combinedText.includes('letter')) {
        return 'cover_letter';
      }
      return 'resume_file';
    }

    // 3. Adapter specific selectors
    if (adapter) {
      const selectors = adapter.getFieldSelectors();
      for (const [cat, selList] of Object.entries(selectors)) {
        for (const sel of selList) {
          try {
            if (el.matches(sel)) {
              return cat as FieldCategory;
            }
          } catch (_) {}
        }
      }
    }

    // 4. Rule-based regex matching
    for (const [cat, rule] of Object.entries(FIELD_CLASSIFICATION_RULES)) {
      if (rule.regex.test(combinedText)) {
        return cat as FieldCategory;
      }
    }

    // 5. HTML5 element types
    if (el instanceof HTMLInputElement) {
      if (el.type === 'email') return 'email';
      if (el.type === 'tel') return 'phone';
      if (el.type === 'url') return 'portfolio_url';
    }

    // 6. Textareas that are not cover letters are likely screening questions
    if (el instanceof HTMLTextAreaElement) {
      return 'screening_question';
    }

    return 'unknown';
  }

  private computeConfidence(cat: FieldCategory, el: HTMLElement, label: string): number {
    if (cat === 'unknown') return 0.2;
    if (cat === 'sensitive_demographic') return 0.0;
    const rule = FIELD_CLASSIFICATION_RULES[cat];
    return rule ? rule.confidence : 0.8;
  }

  private generateSelector(el: HTMLElement, idx: number = 0): string {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.getAttribute('name')) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute('name')!)}"]`;
    const resiiId = `resii_field_${idx}_${Date.now()}`;
    try {
      el.setAttribute('data-resii-id', resiiId);
      return `[data-resii-id="${resiiId}"]`;
    } catch {
      return el.tagName.toLowerCase();
    }
  }
}

export const fieldClassifier = new FieldClassifier();

import { JobContext } from '../../shared/types';

export interface FormAdapter {
  name: string;
  detect(url: string, doc: Document): boolean;
  extractJobContext(url: string, doc: Document): JobContext;
  findForm(doc: Document): HTMLFormElement | HTMLElement | null;
  getFieldSelectors(): Record<string, string[]>;
}

export abstract class BaseAdapter implements FormAdapter {
  abstract name: string;
  abstract detect(url: string, doc: Document): boolean;
  abstract extractJobContext(url: string, doc: Document): JobContext;
  abstract findForm(doc: Document): HTMLFormElement | HTMLElement | null;
  abstract getFieldSelectors(): Record<string, string[]>;

  protected getCleanText(el: Element | null): string {
    return el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '';
  }
}

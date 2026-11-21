import { FormAdapter } from './adapters/base-adapter';
import { GreenhouseAdapter } from './adapters/greenhouse-adapter';
import { LeverAdapter } from './adapters/lever-adapter';
import { WorkdayAdapter } from './adapters/workday-adapter';
import { LinkedInAdapter } from './adapters/linkedin-adapter';
import { GenericFormAdapter } from './adapters/generic-adapter';
import { JobContext } from '../shared/types';

export class PageDetector {
  private adapters: FormAdapter[] = [
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new WorkdayAdapter(),
    new LinkedInAdapter(),
    new GenericFormAdapter()
  ];

  detectAdapter(url: string, doc: Document): FormAdapter {
    for (const adapter of this.adapters) {
      if (adapter.detect(url, doc)) {
        return adapter;
      }
    }
    return this.adapters[this.adapters.length - 1]; // Generic fallback
  }

  detectJobContext(url: string, doc: Document): { adapter: FormAdapter; context: JobContext } {
    const adapter = this.detectAdapter(url, doc);
    const context = adapter.extractJobContext(url, doc);
    return { adapter, context };
  }
}

export const pageDetector = new PageDetector();

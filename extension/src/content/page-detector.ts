import { FormAdapter } from './adapters/base-adapter';
import { GoogleFormsAdapter } from './adapters/google-forms-adapter';
import { MicrosoftFormsAdapter } from './adapters/microsoft-forms-adapter';
import { GoogleAdapter } from './adapters/google-adapter';
import { MicrosoftAdapter } from './adapters/microsoft-adapter';
import { GreenhouseAdapter } from './adapters/greenhouse-adapter';
import { LeverAdapter } from './adapters/lever-adapter';
import { WorkdayAdapter } from './adapters/workday-adapter';
import { LinkedInAdapter } from './adapters/linkedin-adapter';
import { CornerstoneAdapter } from './adapters/cornerstone-adapter';
import { GenericFormAdapter } from './adapters/generic-adapter';
import { JobContext } from '../shared/types';

export class PageDetector {
  private adapters: FormAdapter[] = [
    new GoogleFormsAdapter(),
    new MicrosoftFormsAdapter(),
    new GoogleAdapter(),
    new MicrosoftAdapter(),
    new GreenhouseAdapter(),
    new LeverAdapter(),
    new WorkdayAdapter(),
    new LinkedInAdapter(),
    new CornerstoneAdapter(),
    new GenericFormAdapter()
  ];

  detectAdapter(url: string, doc: Document): FormAdapter | null {
    for (const adapter of this.adapters) {
      if (adapter.detect(url, doc)) {
        return adapter;
      }
    }
    return null;
  }

  detectJobContext(url: string, doc: Document): {
    adapter: FormAdapter | null;
    context: JobContext | null;
    isActiveSession: boolean;
  } {
    const adapter = this.detectAdapter(url, doc);
    if (!adapter) {
      return {
        adapter: null,
        context: null,
        isActiveSession: false
      };
    }

    const context = adapter.extractJobContext(url, doc);
    const isKnownAts = adapter.name !== 'Generic Career Portal';
    const isActiveSession = isKnownAts || !!context.formDetected || !!context.hasJobDescription;

    context.isActiveSession = isActiveSession;

    return {
      adapter,
      context,
      isActiveSession
    };
  }
}

export const pageDetector = new PageDetector();

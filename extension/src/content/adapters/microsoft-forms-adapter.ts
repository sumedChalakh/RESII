import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class MicrosoftFormsAdapter extends BaseAdapter {
  name = 'Microsoft Forms';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('forms.office.com') ||
      url.includes('forms.microsoft.com') ||
      !!doc.querySelector('.office-form') ||
      !!doc.querySelector('[data-automation-id="questionItem"]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('[data-automation-id="formTitle"], .office-form-title, h1');
    const title = this.getCleanText(titleEl) || doc.title.replace(/- Microsoft Forms/i, '').trim();

    let company = 'Target Employer';
    if (title.includes('-')) {
      company = title.split('-')[0].trim();
    } else if (title.includes('—')) {
      company = title.split('—')[0].trim();
    }

    return {
      adapterName: this.name,
      title: title || 'Application / Referral Form',
      company,
      location: 'Remote',
      url,
      formDetected: true,
      jobDescription: '',
      hasJobDescription: false,
      isDirectApplyForm: true,
      isActiveSession: true
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLElement>('.office-form') ||
      doc.querySelector<HTMLFormElement>('form') ||
      doc.body
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      full_name: ['input[aria-label*="Name" i]'],
      first_name: ['input[aria-label*="First name" i]'],
      last_name: ['input[aria-label*="Last name" i]'],
      email: ['input[type="email"]', 'input[aria-label*="Email" i]'],
      phone: ['input[type="tel"]', 'input[aria-label*="Phone" i]'],
      linkedin_url: ['input[aria-label*="LinkedIn" i]'],
      github_url: ['input[aria-label*="GitHub" i]']
    };
  }
}

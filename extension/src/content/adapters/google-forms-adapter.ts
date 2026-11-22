import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class GoogleFormsAdapter extends BaseAdapter {
  name = 'Google Forms';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('docs.google.com/forms') ||
      url.includes('forms.gle') ||
      !!doc.querySelector('form[action*="formResponse"]') ||
      !!doc.querySelector('.freebirdFormviewerViewFormContent')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('.F9N2ud, [role="heading"][aria-level="1"], .freebirdFormviewerViewHeaderTitle, div[dir="auto"].header-title');
    let title = this.getCleanText(titleEl) || doc.title.replace(/- Google Forms/i, '').trim();

    // Extract company name if in title (e.g. "Birlasoft - Referral Form" -> "Birlasoft")
    let company = 'Target Employer';
    if (title.includes('-')) {
      company = title.split('-')[0].trim();
    } else if (title.includes('—')) {
      company = title.split('—')[0].trim();
    } else if (title.includes(':')) {
      company = title.split(':')[0].trim();
    }

    return {
      adapterName: this.name,
      title: title || 'Job Referral / Application Form',
      company,
      location: 'Remote',
      url,
      formDetected: true,
      jobDescription: '',
      hasJobDescription: false,
      isDirectApplyForm: true, // Google Forms are direct application/referral forms
      isActiveSession: true
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLFormElement>('form[action*="formResponse"]') ||
      doc.querySelector<HTMLElement>('.freebirdFormviewerViewFormContent') ||
      doc.querySelector<HTMLFormElement>('form') ||
      doc.body
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: [
        'input[aria-label*="First name" i]',
        'input[aria-label*="First" i]'
      ],
      last_name: [
        'input[aria-label*="Last name" i]',
        'input[aria-label*="Last" i]'
      ],
      full_name: [
        'input[aria-label*="Full name" i]',
        'input[aria-label*="Your Name" i]',
        'input[aria-label*="Name" i]'
      ],
      email: [
        'input[type="email"]',
        'input[aria-label*="Email" i]'
      ],
      phone: [
        'input[type="tel"]',
        'input[aria-label*="Phone" i]',
        'input[aria-label*="Contact" i]',
        'input[aria-label*="Mobile" i]'
      ],
      linkedin_url: [
        'input[aria-label*="LinkedIn" i]'
      ],
      github_url: [
        'input[aria-label*="GitHub" i]'
      ],
      resume_file: [
        'input[type="file"]'
      ]
    };
  }
}

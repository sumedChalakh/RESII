import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class MicrosoftAdapter extends BaseAdapter {
  name = 'Microsoft Careers';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('careers.microsoft.com') ||
      url.includes('jobs.careers.microsoft.com') ||
      !!doc.querySelector('meta[property="og:site_name"][content*="Microsoft Careers" i]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('h1, .job-title, [data-automation-id="job-title"]');
    const locationEl = doc.querySelector('.job-location, [data-automation-id="job-location"]');
    const jdEl = doc.querySelector('.job-description, .css-description, #job-overview, [data-automation-id="job-description"]');

    const jobDescription = jdEl ? this.getCleanText(jdEl) : '';
    const hasJobDescription = jobDescription.length > 50;

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Software Engineer',
      company: 'Microsoft',
      location: this.getCleanText(locationEl) || 'Redmond, WA / Remote',
      url,
      formDetected: !!this.findForm(doc),
      jobDescription,
      hasJobDescription,
      isDirectApplyForm: !hasJobDescription || url.includes('/apply') || url.includes('/application')
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLElement>('form[action*="apply" i]') ||
      doc.querySelector<HTMLElement>('[data-automation-id="application-form"]') ||
      doc.querySelector<HTMLElement>('div[role="form"]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: [
        'input[aria-label*="First name" i]',
        'input[name*="firstName" i]',
        'input[id*="first" i]'
      ],
      last_name: [
        'input[aria-label*="Last name" i]',
        'input[name*="lastName" i]',
        'input[id*="last" i]'
      ],
      full_name: [
        'input[aria-label*="Full name" i]',
        'input[name*="legalName" i]',
        'input[name*="name" i]'
      ],
      email: [
        'input[type="email"]',
        'input[aria-label*="Email" i]',
        'input[name*="email" i]'
      ],
      phone: [
        'input[type="tel"]',
        'input[aria-label*="Phone" i]',
        'input[name*="phone" i]'
      ],
      resume_file: [
        'input[type="file"][name*="resume" i]',
        'input[type="file"]'
      ],
      location: [
        'input[aria-label*="City" i]',
        'input[aria-label*="Location" i]',
        'input[name*="city" i]'
      ],
      linkedin_url: [
        'input[aria-label*="LinkedIn" i]',
        'input[name*="linkedin" i]'
      ],
      github_url: [
        'input[aria-label*="GitHub" i]',
        'input[name*="github" i]'
      ],
      portfolio_url: [
        'input[aria-label*="Website" i]',
        'input[aria-label*="Portfolio" i]'
      ]
    };
  }
}

import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class GoogleAdapter extends BaseAdapter {
  name = 'Google Careers';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('careers.google.com') ||
      url.includes('google.com/about/careers') ||
      url.includes('google.com/jobs') ||
      !!doc.querySelector('meta[property="og:site_name"][content*="Google Careers" i]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('h1, h2[data-automation-id="job-title"], .headline');
    const locationEl = doc.querySelector('.location, [data-automation-id="job-location"]');
    const jdEl = doc.querySelector('.job-description, [itemprop="description"], .role-summary, #job-description');

    const jobDescription = jdEl ? this.getCleanText(jdEl) : '';
    const hasJobDescription = jobDescription.length > 50;

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Software Engineer',
      company: 'Google',
      location: this.getCleanText(locationEl) || 'Mountain View, CA / Remote',
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
      doc.querySelector<HTMLElement>('[data-field-name="legalName"]')?.closest('form') ||
      doc.querySelector<HTMLElement>('div[role="form"]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      full_name: [
        'input[aria-label*="Full name" i]',
        'input[aria-label*="Legal name" i]',
        'input[name*="legalName" i]',
        'input[name*="name" i]'
      ],
      first_name: [
        'input[aria-label*="First name" i]',
        'input[name*="firstName" i]'
      ],
      last_name: [
        'input[aria-label*="Last name" i]',
        'input[name*="lastName" i]'
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
        'input[type="file"][data-field-name="resume"]',
        'input[type="file"]'
      ],
      location: [
        'input[aria-label*="City" i]',
        'input[aria-label*="Address" i]',
        'input[name*="location" i]'
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
        'input[aria-label*="Portfolio" i]',
        'input[name*="portfolio" i]'
      ]
    };
  }
}

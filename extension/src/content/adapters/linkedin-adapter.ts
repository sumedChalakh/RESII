import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class LinkedInAdapter extends BaseAdapter {
  name = 'LinkedIn Easy Apply';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('linkedin.com') ||
      !!doc.querySelector('.jobs-easy-apply-modal, .jobs-easy-apply-content, [data-view-name="job-details-and-apply"]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector(
      '.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, h1'
    );
    const companyEl = doc.querySelector(
      '.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a'
    );
    const locationEl = doc.querySelector(
      '.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .job-details-jobs-unified-top-card__workplace-type'
    );

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Software Role',
      company: this.getCleanText(companyEl) || 'LinkedIn Employer',
      location: this.getCleanText(locationEl) || 'Remote',
      url,
      formDetected: !!this.findForm(doc)
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLElement>('.jobs-easy-apply-modal form') ||
      doc.querySelector<HTMLElement>('.jobs-easy-apply-content') ||
      doc.querySelector<HTMLElement>('[data-test-modal-container]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: ['input[id*="firstName"]', 'input[name*="firstName"]'],
      last_name: ['input[id*="lastName"]', 'input[name*="lastName"]'],
      full_name: ['input[id*="name"]', 'input[name*="name"]'],
      email: ['input[id*="email"]', 'input[type="email"]'],
      phone: ['input[id*="phoneNumber"]', 'input[id*="phone"]', 'input[type="tel"]'],
      location: ['input[id*="city"]', 'input[id*="location"]', 'input[id*="address"]'],
      resume_file: ['input[type="file"]', 'input[id*="resume"]'],
      years_experience: ['input[id*="experience"]', 'input[name*="experience"]']
    };
  }
}

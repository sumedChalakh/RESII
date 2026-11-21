import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class GreenhouseAdapter extends BaseAdapter {
  name = 'Greenhouse';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('greenhouse.io') ||
      !!doc.querySelector('#application_form, #grnhse_app, form#apply_form') ||
      !!doc.querySelector('meta[content*="Greenhouse"]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('.app-title, .job-title, h1.app-title, #header h1');
    const companyEl = doc.querySelector('.company-name, #header .company, .header-company');
    const locationEl = doc.querySelector('.location, .body--metadata');

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Software Role',
      company: this.getCleanText(companyEl) || this.extractCompanyFromUrl(url) || 'Company',
      location: this.getCleanText(locationEl) || 'Remote',
      url,
      formDetected: !!this.findForm(doc)
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLFormElement>('form#application_form') ||
      doc.querySelector<HTMLFormElement>('form#apply_form') ||
      doc.querySelector<HTMLFormElement>('#grnhse_app form') ||
      doc.querySelector<HTMLFormElement>('form[action*="greenhouse"]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: ['#first_name', 'input[name="first_name"]', 'input[autocomplete="given-name"]'],
      last_name: ['#last_name', 'input[name="last_name"]', 'input[autocomplete="family-name"]'],
      email: ['#email', 'input[name="email"]', 'input[type="email"]'],
      phone: ['#phone', 'input[name="phone"]', 'input[type="tel"]'],
      resume_file: ['input[type="file"][id*="resume"]', 'input[type="file"][name*="resume"]', '#resume_file'],
      cover_letter: ['#cover_letter_text', 'textarea[name*="cover_letter"]'],
      linkedin_url: ['input[name*="job_application[answers][1]"]', 'input[autocomplete*="linkedin"]', 'input[name*="linkedin"]'],
      github_url: ['input[name*="github"]'],
      portfolio_url: ['input[name*="portfolio"]', 'input[name*="website"]']
    };
  }

  private extractCompanyFromUrl(url: string): string {
    const match = url.match(/greenhouse\.io\/([^/?#]+)/i);
    return match ? match[1].replace(/[-_]/g, ' ') : '';
  }
}

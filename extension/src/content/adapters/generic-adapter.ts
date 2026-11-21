import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class GenericFormAdapter extends BaseAdapter {
  name = 'Generic Career Portal';

  detect(url: string, doc: Document): boolean {
    const form = this.findForm(doc);
    return !!form;
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('h1, h2.job-title, .title, meta[property="og:title"]');
    const companyEl = doc.querySelector('.company, .employer, meta[property="og:site_name"]');

    let title = '';
    if (titleEl instanceof HTMLMetaElement) {
      title = titleEl.content;
    } else {
      title = this.getCleanText(titleEl);
    }

    let company = '';
    if (companyEl instanceof HTMLMetaElement) {
      company = companyEl.content;
    } else {
      company = this.getCleanText(companyEl) || doc.title.split(/[-|–]/)[0].trim();
    }

    return {
      adapterName: this.name,
      title: title || 'Job Candidate Application',
      company: company || 'Prospective Employer',
      location: 'Remote',
      url,
      formDetected: !!this.findForm(doc)
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    // Look for forms with inputs matching common job application fields
    const forms = Array.from(doc.querySelectorAll('form'));
    for (const form of forms) {
      const text = (form.textContent || '').toLowerCase();
      const hasInputs = form.querySelectorAll('input, textarea, select').length >= 3;
      if (hasInputs && (
        text.includes('resume') ||
        text.includes('cv') ||
        text.includes('apply') ||
        text.includes('application') ||
        text.includes('first name') ||
        text.includes('email')
      )) {
        return form;
      }
    }
    return forms[0] || doc.body;
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: ['input[name*="first" i]', 'input[id*="first" i]'],
      last_name: ['input[name*="last" i]', 'input[id*="last" i]'],
      full_name: ['input[name*="name" i]', 'input[id*="name" i]'],
      email: ['input[type="email"]', 'input[name*="email" i]'],
      phone: ['input[type="tel"]', 'input[name*="phone" i]'],
      resume_file: ['input[type="file"][name*="resume" i]', 'input[type="file"]'],
      linkedin_url: ['input[name*="linkedin" i]'],
      github_url: ['input[name*="github" i]'],
      portfolio_url: ['input[name*="portfolio" i]', 'input[name*="website" i]']
    };
  }
}

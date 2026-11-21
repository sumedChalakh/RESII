import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class LeverAdapter extends BaseAdapter {
  name = 'Lever';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('jobs.lever.co') ||
      !!doc.querySelector('.application-form, .lever-job, .application-page')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('.posting-headline h2, .posting-header h2, .posting-headline');
    const companyEl = doc.querySelector('.main-header-logo img, .posting-headline .company-name');
    const locationEl = doc.querySelector('.posting-categories .location, .sort-by-time');

    let company = '';
    if (companyEl instanceof HTMLImageElement && companyEl.alt) {
      company = companyEl.alt.replace(/logo/i, '').trim();
    } else {
      company = this.getCleanText(companyEl) || this.extractCompanyFromUrl(url) || 'Company';
    }

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Engineering Role',
      company,
      location: this.getCleanText(locationEl) || 'Remote',
      url,
      formDetected: !!this.findForm(doc)
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLFormElement>('form.application-form') ||
      doc.querySelector<HTMLFormElement>('#application-form') ||
      doc.querySelector<HTMLFormElement>('form[action*="lever"]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      full_name: ['input[name="name"]', '#name'],
      email: ['input[name="email"]', '#email'],
      phone: ['input[name="phone"]', '#phone'],
      location: ['input[name="location"]', '#location'],
      resume_file: ['input[type="file"][name="resume"]', '#resume-upload-input'],
      linkedin_url: ['input[name*="urls[LinkedIn]"]', 'input[name*="linkedin"]'],
      github_url: ['input[name*="urls[GitHub]"]', 'input[name*="github"]'],
      portfolio_url: ['input[name*="urls[Portfolio]"]', 'input[name*="urls[Other]"]', 'input[name*="portfolio"]'],
      cover_letter: ['textarea[name="comments"]', 'textarea[name="coverLetter"]']
    };
  }

  private extractCompanyFromUrl(url: string): string {
    const match = url.match(/jobs\.lever\.co\/([^/?#]+)/i);
    return match ? match[1].replace(/[-_]/g, ' ') : '';
  }
}

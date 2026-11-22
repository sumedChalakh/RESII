import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class WorkdayAdapter extends BaseAdapter {
  name = 'Workday';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('myworkdayjobs.com') ||
      !!doc.querySelector('[data-automation-id="workdayApplication"]') ||
      !!doc.querySelector('[data-automation-id="jobPostingHeader"]')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const titleEl = doc.querySelector('[data-automation-id="jobPostingHeader"], h2[data-automation-id]');
    const companyEl = doc.querySelector('[data-automation-id="headerLogo"], header img');
    const locationEl = doc.querySelector('[data-automation-id="locations"], [data-automation-id="job-location"]');

    let company = '';
    if (companyEl instanceof HTMLImageElement && companyEl.alt) {
      company = companyEl.alt.trim();
    } else {
      company = this.extractCompanyFromUrl(url) || 'Enterprise Employer';
    }

    const isApplyWizard = (
      url.includes('/apply') ||
      !!doc.querySelector('[data-automation-id="candidateApplicationPage"]') ||
      !!doc.querySelector('[data-automation-id="createAccountPage"]') ||
      !!doc.querySelector('input[type="password"]') ||
      !!doc.querySelector('[data-automation-id="legalNameSection_firstName"]')
    );

    const jdEl = doc.querySelector('[data-automation-id="jobPostingDescription"], [data-automation-id="job-posting-details"], .job-description');
    const jobDescription = (!isApplyWizard && jdEl) ? this.getCleanText(jdEl) : '';
    const hasJobDescription = !isApplyWizard && jobDescription.length > 50;

    return {
      adapterName: this.name,
      title: this.getCleanText(titleEl) || 'Platform Engineer',
      company,
      location: this.getCleanText(locationEl) || 'Remote',
      url,
      formDetected: !!this.findForm(doc),
      jobDescription,
      hasJobDescription,
      isDirectApplyForm: isApplyWizard || !hasJobDescription,
      isActiveSession: true
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLElement>('[data-automation-id="candidateApplicationPage"]') ||
      doc.querySelector<HTMLElement>('[data-automation-id="workdayApplication"]') ||
      doc.querySelector<HTMLFormElement>('form')
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: [
        'input[data-automation-id="legalNameSection_firstName"]',
        'input[name*="legalNameSection_firstName"]'
      ],
      last_name: [
        'input[data-automation-id="legalNameSection_lastName"]',
        'input[name*="legalNameSection_lastName"]'
      ],
      email: [
        'input[data-automation-id="email"]',
        'input[type="email"]'
      ],
      phone: [
        'input[data-automation-id="phone-number"]',
        'input[data-automation-id="contactInfoPhone-number"]'
      ],
      resume_file: [
        'input[type="file"][data-automation-id="file-upload-input-ref"]',
        'input[type="file"]'
      ],
      location: [
        'input[data-automation-id="addressSection_city"]'
      ]
    };
  }

  private extractCompanyFromUrl(url: string): string {
    const match = url.match(/https?:\/\/([^.]+)\.myworkdayjobs\.com/i);
    return match ? match[1].replace(/[-_]/g, ' ') : '';
  }
}

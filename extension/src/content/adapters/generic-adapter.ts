import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

const EXCLUDED_HOSTS = [
  'chatgpt.com',
  'claude.ai',
  'gemini.google.com',
  'copilot.microsoft.com',
  'youtube.com',
  'google.com',
  'bing.com',
  'yahoo.com',
  'reddit.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'netflix.com',
  'spotify.com',
  'amazon.com',
  'wikipedia.org'
];

export class GenericFormAdapter extends BaseAdapter {
  name = 'Generic Career Portal';

  detect(url: string, doc: Document): boolean {
    try {
      // Do not exclude Google Forms or Microsoft Forms
      if (url.includes('docs.google.com/forms') || url.includes('forms.gle') || url.includes('forms.office.com') || url.includes('forms.microsoft.com') || url.includes('careers.google.com')) {
        return false;
      }
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      // Never activate on excluded general web applications or chat interfaces
      if (EXCLUDED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
        return false;
      }
    } catch (_) {}

    const form = this.findForm(doc);
    return !!form;
  }

  extractJobContext(url: string, doc: Document): JobContext {
    const isJobUrl = /(job|career|apply|application|requisition|candidate|recruiting|vacancy|opening|position|work-with-us)/i.test(url);
    const form = this.findForm(doc);

    const titleEl = doc.querySelector('h1, h2.job-title, .job-title, .title, meta[property="og:title"]');
    const companyEl = doc.querySelector('.company, .employer, .company-name, meta[property="og:site_name"]');

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

    const jdEl = doc.querySelector('.job-description, .description, #job-description, [itemprop="description"], article');
    const jobDescription = jdEl ? this.getCleanText(jdEl) : '';
    const hasJobDescription = jobDescription.length > 50;

    return {
      adapterName: this.name,
      title: title || (isJobUrl ? 'Job Application' : 'Application Form'),
      company: company || 'Employer',
      location: 'Remote',
      url,
      formDetected: !!form,
      jobDescription,
      hasJobDescription,
      isDirectApplyForm: !hasJobDescription || url.includes('/apply') || url.includes('/application'),
      isActiveSession: !!form || (isJobUrl && (hasJobDescription || !!doc.querySelector('input:not([type="hidden"])')))
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    try {
      const host = window.location.hostname.toLowerCase();
      if (EXCLUDED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
        return null;
      }
    } catch (_) {}

    // 1. Look for forms that specifically contain job application signatures
    const forms = Array.from(doc.querySelectorAll('form'));
    for (const form of forms) {
      const text = (form.textContent || '').toLowerCase();
      const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
      if (inputs.length < 2) continue;

      const hasResumeUpload = !!form.querySelector('input[type="file"]');
      const hasJobKeywords = (
        text.includes('resume') ||
        text.includes('curriculum vitae') ||
        text.includes('cover letter') ||
        text.includes('submit application') ||
        text.includes('job application') ||
        text.includes('employment application') ||
        text.includes('work authorization') ||
        text.includes('years of experience') ||
        text.includes('submit your application') ||
        text.includes('recruiting') ||
        text.includes('applicant')
      );

      const hasNameAndEmail = (
        (text.includes('first name') || text.includes('full name') || text.includes('last name') || !!form.querySelector('input[name*="name" i]')) &&
        (text.includes('email') || !!form.querySelector('input[type="email"], input[name*="email" i]'))
      );

      // Must have authentic job signals
      if ((hasResumeUpload && hasNameAndEmail) || (hasJobKeywords && hasNameAndEmail)) {
        return form;
      }
    }

    // 2. Check for container sections with job application markers
    const applySections = Array.from(doc.querySelectorAll('.application-form, #application-form, [data-testid*="application" i], [class*="application" i], [class*="requisition" i]'));
    for (const section of applySections) {
      const inputs = section.querySelectorAll('input:not([type="hidden"]), textarea, select');
      if (inputs.length >= 2) {
        return section as HTMLElement;
      }
    }

    // 3. Fallback for custom SPA applicant forms on legitimate job URLs (e.g. CSOD, SuccessFactors, custom portals)
    const isJobUrl = /(job|career|apply|application|requisition|candidate|recruiting|vacancy|opening)/i.test(window.location.href);
    if (isJobUrl) {
      const allInputs = Array.from(doc.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea'));
      let hasNameField = false;
      let hasEmailField = false;
      for (const inp of allInputs) {
        const str = `${inp.getAttribute('name') || ''} ${inp.getAttribute('id') || ''} ${inp.getAttribute('aria-label') || ''} ${inp.getAttribute('placeholder') || ''}`.toLowerCase();
        if (str.includes('name') || str.includes('first') || str.includes('last')) hasNameField = true;
        if (str.includes('email') || (inp as HTMLInputElement).type === 'email') hasEmailField = true;
      }
      if (hasNameField && hasEmailField) {
        const appContainer = doc.querySelector<HTMLElement>('[class*="application" i], [class*="requisition" i], [class*="form" i], [role="main"], main');
        return appContainer || doc.body;
      }
    }

    // Never return doc.body or random forms on non-job websites
    return null;
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

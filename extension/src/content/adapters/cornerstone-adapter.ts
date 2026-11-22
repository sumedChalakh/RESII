import { BaseAdapter } from './base-adapter';
import { JobContext } from '../../shared/types';

export class CornerstoneAdapter extends BaseAdapter {
  name = 'Cornerstone OnDemand';

  detect(url: string, doc: Document): boolean {
    return (
      url.includes('csod.com') ||
      url.includes('/ux/ats/careersite') ||
      (url.includes('/requisition/') && (url.includes('/application') || url.includes('apply'))) ||
      !!doc.querySelector('.csod-app, [data-tag*="requisition"], #requisitionDescriptionInterface')
    );
  }

  extractJobContext(url: string, doc: Document): JobContext {
    // Extract title: e.g. "Data Scientist - AI Hub"
    const titleEl = doc.querySelector(
      'h1, h2, [data-tag="requisition-title"], .requisition-title, .job-title, [role="heading"][aria-level="1"]'
    );
    let title = this.getCleanText(titleEl);
    if (!title) {
      title = doc.title
        .replace(/^Apply for\s+/i, '')
        .replace(/\s*-\s*Cornerstone.*$/i, '')
        .trim();
    }

    // Extract company name: e.g. "Linde"
    let company = 'Target Employer';
    try {
      const u = new URL(url);
      const cParam = u.searchParams.get('c');
      if (cParam) {
        company = cParam.charAt(0).toUpperCase() + cParam.slice(1);
      } else if (u.hostname.includes('.csod.com')) {
        const sub = u.hostname.split('.')[0];
        if (sub && sub !== 'www') {
          company = sub.charAt(0).toUpperCase() + sub.slice(1);
        }
      }
    } catch (_) {}

    // Check page text for employer name (e.g. "e-Recruiting system of Linde plc")
    if (company === 'Target Employer' || !company) {
      const pageText = doc.body?.textContent || '';
      const match = pageText.match(/system of ([A-Za-z0-9\s]+?)(?:plc|\.|$)/i);
      if (match && match[1]) {
        company = match[1].trim();
      }
    }

    // Check for job description vs direct application form
    const jdEl = doc.querySelector('.requisition-description, [data-tag="job-description"], .job-description, article');
    const jobDescription = jdEl ? this.getCleanText(jdEl) : '';
    const hasJobDescription = jobDescription.length > 80;
    const isDirectApply = url.includes('/application') || !hasJobDescription || url.includes('/apply');

    return {
      adapterName: this.name,
      title: title || 'Job Candidate Application',
      company: company || 'Target Employer',
      location: 'On-site / Hybrid',
      url,
      formDetected: true,
      jobDescription,
      hasJobDescription,
      isDirectApplyForm: isDirectApply,
      isActiveSession: true
    };
  }

  findForm(doc: Document): HTMLFormElement | HTMLElement | null {
    return (
      doc.querySelector<HTMLElement>('[data-tag="application-container"], .application-container, .csod-app, form') ||
      doc.body
    );
  }

  getFieldSelectors(): Record<string, string[]> {
    return {
      first_name: [
        'input[name*="firstName" i]',
        'input[id*="firstName" i]',
        'input[aria-label*="First name" i]',
        'input[aria-label*="First" i]'
      ],
      last_name: [
        'input[name*="lastName" i]',
        'input[id*="lastName" i]',
        'input[aria-label*="Last name" i]',
        'input[aria-label*="Last" i]'
      ],
      full_name: [
        'input[name*="fullName" i]',
        'input[id*="fullName" i]',
        'input[aria-label*="Full name" i]'
      ],
      email: [
        'input[type="email"]',
        'input[name*="email" i]',
        'input[id*="email" i]',
        'input[aria-label*="Email" i]'
      ],
      phone: [
        'input[type="tel"]',
        'input[name*="phone" i]',
        'input[id*="phone" i]',
        'input[aria-label*="Phone" i]',
        'input[aria-label*="Mobile" i]'
      ],
      resume_file: [
        'input[type="file"]'
      ]
    };
  }
}

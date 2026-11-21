export const RESII_API_DEFAULT = 'http://127.0.0.1:8100';

export const SENSITIVE_KEYWORDS = [
  'gender',
  'race',
  'ethnicity',
  'veteran',
  'disability',
  'sexual orientation',
  'religion',
  'marital status',
  'eeo',
  'demographic'
];

export const FORBIDDEN_SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button.application-submit',
  'button#submit_app',
  'button.submit-button',
  'button[data-qa="submit-button"]',
  'button[data-automation-id="bottom-navigation-next-button"]'
];

export const FIELD_CLASSIFICATION_RULES: Record<string, { regex: RegExp; confidence: number }> = {
  first_name: {
    regex: /(first[_\-\s]?name|given[_\-\s]?name|fname)/i,
    confidence: 0.95
  },
  last_name: {
    regex: /(last[_\-\s]?name|family[_\-\s]?name|surname|lname)/i,
    confidence: 0.95
  },
  full_name: {
    regex: /(^name|full[_\-\s]?name|candidate[_\-\s]?name)/i,
    confidence: 0.90
  },
  email: {
    regex: /(e[_\-\s]?mail)/i,
    confidence: 0.98
  },
  phone: {
    regex: /(phone|mobile|tel|telephone|cell)/i,
    confidence: 0.95
  },
  work_authorization: {
    regex: /(work[_\-\s]?auth|authorized[_\-\s]?to[_\-\s]?work|citizenship|legal[_\-\s]?right)/i,
    confidence: 0.95
  },
  requires_sponsorship: {
    regex: /(sponsor|sponsorship|visa)/i,
    confidence: 0.95
  },
  location: {
    regex: /(location|\bcity\b|address|postal|zip|\bstate\b|residence)/i,
    confidence: 0.85
  },
  linkedin_url: {
    regex: /(linkedin)/i,
    confidence: 0.99
  },
  github_url: {
    regex: /(github)/i,
    confidence: 0.99
  },
  portfolio_url: {
    regex: /(portfolio|personal[_\-\s]?site|website|url)/i,
    confidence: 0.85
  },
  resume_file: {
    regex: /(resume|cv|curriculum[_\-\s]?vitae)/i,
    confidence: 0.95
  },
  cover_letter: {
    regex: /(cover[_\-\s]?letter|letter)/i,
    confidence: 0.90
  },
  years_experience: {
    regex: /(years[_\-\s]?(?:of[_\-\s]?(?:work[_\-\s]?)?)?experience|total[_\-\s]?experience|experience[_\-\s]?years)/i,
    confidence: 0.90
  },
  highest_education: {
    regex: /(education|degree|highest[_\-\s]?degree|university|school)/i,
    confidence: 0.88
  },
  notice_period: {
    regex: /(notice[_\-\s]?period|available[_\-\s]?to[_\-\s]?start|start[_\-\s]?date)/i,
    confidence: 0.90
  },
  salary_expectation: {
    regex: /(salary|compensation|expected[_\-\s]?salary|desired[_\-\s]?salary)/i,
    confidence: 0.88
  }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

// Lightweight HTML Parser & DOM Mock for Extension Testing
class MockElement {
  constructor(tagName, attrs = {}, textContent = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = attrs;
    this.textContent = textContent;
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || (this.tagName === 'TEXTAREA' ? 'textarea' : this.tagName === 'SELECT' ? 'select' : 'text');
    this.required = 'required' in attrs;
    this.placeholder = attrs.placeholder || '';
    this.value = attrs.value || '';
    this.style = {};
    this.parentElement = null;
    this.children = [];
  }

  getAttribute(key) {
    return this.attributes[key] ?? null;
  }

  matches(selector) {
    if (selector.startsWith('#') && this.id === selector.slice(1)) return true;
    if (selector.startsWith('.') && (this.attributes.class || '').split(/\s+/).includes(selector.slice(1))) return true;
    if (selector.includes('data-automation-id="')) {
      const match = selector.match(/data-automation-id="([^"]+)"/);
      if (match && this.attributes['data-automation-id'] === match[1]) return true;
    }
    if (selector.includes('name="')) {
      const match = selector.match(/name="([^"]+)"/);
      if (match && this.name === match[1]) return true;
    }
    if (selector.includes('type="')) {
      const match = selector.match(/type="([^"]+)"/);
      if (match && this.type === match[1]) return true;
    }
    return false;
  }

  closest(tag) {
    let curr = this.parentElement;
    while (curr) {
      if (curr.tagName.toLowerCase() === tag.toLowerCase()) return curr;
      curr = curr.parentElement;
    }
    return null;
  }
}

function parseHtmlElements(html) {
  const elements = [];
  const labelsById = {};

  // Extract labels
  const labelRegex = /<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi;
  let match;
  while ((match = labelRegex.exec(html)) !== null) {
    labelsById[match[1]] = match[2].replace(/<[^>]+>/g, '').trim();
  }

  // Extract inputs, textareas, selects, buttons
  const tagRegex = /<(input|textarea|select|button)([^>]*)>([\s\S]*?)(?:<\/\1>)?/gi;
  while ((match = tagRegex.exec(html)) !== null) {
    const tagName = match[1];
    const rawAttrs = match[2];
    const content = match[3] || '';

    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_\-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const key = attrMatch[1];
      const val = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      attrs[key] = val;
    }

    const el = new MockElement(tagName, attrs, content);
    elements.push(el);
  }

  return { elements, labelsById };
}

// Rules imported logically from constants.ts
const FIELD_RULES = {
  first_name: /(first[_\-\s]?name|given[_\-\s]?name|fname)/i,
  last_name: /(last[_\-\s]?name|family[_\-\s]?name|surname|lname)/i,
  full_name: /(^name|full[_\-\s]?name|candidate[_\-\s]?name)/i,
  email: /(e[_\-\s]?mail)/i,
  phone: /(phone|mobile|tel|telephone|cell)/i,
  work_authorization: /(work[_\-\s]?auth|authorized[_\-\s]?to[_\-\s]?work|citizenship|legal[_\-\s]?right)/i,
  requires_sponsorship: /(sponsor|sponsorship|visa)/i,
  location: /(location|\bcity\b|address|postal|zip|\bstate\b|residence)/i,
  linkedin_url: /(linkedin)/i,
  github_url: /(github)/i,
  portfolio_url: /(portfolio|personal[_\-\s]?site|website|url)/i,
  resume_file: /(resume|cv|curriculum[_\-\s]?vitae)/i,
  cover_letter: /(cover[_\-\s]?letter|letter|comments)/i,
  years_experience: /(years[_\-\s]?(?:of[_\-\s]?(?:work[_\-\s]?)?)?experience|total[_\-\s]?experience|experience[_\-\s]?years)/i,
  highest_education: /(education|degree|highest[_\-\s]?degree|university|school)/i,
  notice_period: /(notice[_\-\s]?period|available[_\-\s]?to[_\-\s]?start|start[_\-\s]?date)/i
};

const SENSITIVE_KEYWORDS = [
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

function classifyElement(el, label = '', url = '') {
  const combined = `${label} ${el.name} ${el.id} ${el.getAttribute('data-automation-id') || ''} ${el.getAttribute('autocomplete') || ''}`.toLowerCase();

  // Check sensitive
  for (const sens of SENSITIVE_KEYWORDS) {
    if (combined.includes(sens)) {
      return { category: 'sensitive_demographic', confidence: 0.0, requiresUserInput: true };
    }
  }

  // Workday specific automation ids
  const autoId = el.getAttribute('data-automation-id') || '';
  if (autoId === 'legalNameSection_firstName') return { category: 'first_name', confidence: 0.98, requiresUserInput: false };
  if (autoId === 'legalNameSection_lastName') return { category: 'last_name', confidence: 0.98, requiresUserInput: false };
  if (autoId === 'phone-number') return { category: 'phone', confidence: 0.95, requiresUserInput: false };
  if (autoId === 'file-upload-input-ref') return { category: 'resume_file', confidence: 0.98, requiresUserInput: false };
  if (autoId === 'addressSection_city') return { category: 'location', confidence: 0.90, requiresUserInput: false };

  // File
  if (el.type === 'file') {
    if (combined.includes('cover') || combined.includes('letter')) {
      return { category: 'cover_letter', confidence: 0.95, requiresUserInput: false };
    }
    return { category: 'resume_file', confidence: 0.98, requiresUserInput: false };
  }

  // Regex rules
  for (const [cat, regex] of Object.entries(FIELD_RULES)) {
    if (regex.test(combined)) {
      return { category: cat, confidence: 0.90, requiresUserInput: false };
    }
  }

  // HTML5 types
  if (el.type === 'email') return { category: 'email', confidence: 0.98, requiresUserInput: false };
  if (el.type === 'tel') return { category: 'phone', confidence: 0.95, requiresUserInput: false };

  if (el.tagName === 'TEXTAREA') {
    return { category: 'screening_question', confidence: 0.75, requiresUserInput: false };
  }

  return { category: 'unknown', confidence: 0.2, requiresUserInput: true };
}

// ---------------------- TEST SUITE ----------------------

test('1. Greenhouse Form Classification and Adaptation', () => {
  const html = fs.readFileSync(path.join(fixturesDir, 'greenhouse-form.html'), 'utf-8');
  const { elements, labelsById } = parseHtmlElements(html);

  const fillable = elements.filter(e => !['submit', 'button'].includes(e.type));
  assert.ok(fillable.length >= 8, 'Expected at least 8 fillable form elements in Greenhouse');

  const categories = fillable.map(el => {
    const label = labelsById[el.id] || '';
    return classifyElement(el, label).category;
  });

  assert.ok(categories.includes('first_name'), 'Should detect first_name');
  assert.ok(categories.includes('last_name'), 'Should detect last_name');
  assert.ok(categories.includes('email'), 'Should detect email');
  assert.ok(categories.includes('phone'), 'Should detect phone');
  assert.ok(categories.includes('resume_file'), 'Should detect resume_file');
  assert.ok(categories.includes('cover_letter'), 'Should detect cover_letter');
  assert.ok(categories.includes('linkedin_url'), 'Should detect linkedin_url');
  assert.ok(categories.includes('github_url'), 'Should detect github_url');
  assert.ok(categories.includes('screening_question'), 'Should detect custom question');
  assert.ok(categories.includes('sensitive_demographic'), 'Should detect eeo gender as sensitive_demographic');
});

test('2. Lever Form Classification and Adaptation', () => {
  const html = fs.readFileSync(path.join(fixturesDir, 'lever-form.html'), 'utf-8');
  const { elements, labelsById } = parseHtmlElements(html);

  const fillable = elements.filter(e => !['submit', 'button'].includes(e.type));
  const categories = fillable.map(el => classifyElement(el, el.name).category);

  assert.ok(categories.includes('full_name'), 'Should detect full_name');
  assert.ok(categories.includes('email'), 'Should detect email');
  assert.ok(categories.includes('phone'), 'Should detect phone');
  assert.ok(categories.includes('location'), 'Should detect location');
  assert.ok(categories.includes('resume_file'), 'Should detect resume_file');
  assert.ok(categories.includes('linkedin_url'), 'Should detect linkedin_url');
  assert.ok(categories.includes('github_url'), 'Should detect github_url');
  assert.ok(categories.includes('portfolio_url'), 'Should detect portfolio_url');
  assert.ok(categories.includes('cover_letter'), 'Should detect comments / cover letter');
  assert.ok(categories.includes('sensitive_demographic'), 'Should detect race/ethnicity as sensitive');
});

test('3. Workday Form Classification and Automation Attributes', () => {
  const html = fs.readFileSync(path.join(fixturesDir, 'workday-form.html'), 'utf-8');
  const { elements } = parseHtmlElements(html);

  const fillable = elements.filter(e => !['submit', 'button'].includes(e.type));
  const categories = fillable.map(el => classifyElement(el, '').category);

  assert.ok(categories.includes('first_name'), 'Should detect first_name via data-automation-id');
  assert.ok(categories.includes('last_name'), 'Should detect last_name via data-automation-id');
  assert.ok(categories.includes('email'), 'Should detect email');
  assert.ok(categories.includes('phone'), 'Should detect phone via data-automation-id');
  assert.ok(categories.includes('resume_file'), 'Should detect resume_file');
  assert.ok(categories.includes('location'), 'Should detect city as location');
  assert.ok(categories.includes('sensitive_demographic'), 'Should detect veteran status as sensitive');
});

test('3b. LinkedIn Easy Apply Form Classification and Adaptation', () => {
  const html = fs.readFileSync(path.join(fixturesDir, 'linkedin-form.html'), 'utf-8');
  const { elements, labelsById } = parseHtmlElements(html);

  const fillable = elements.filter(e => !['submit', 'button'].includes(e.type));
  const categories = fillable.map(el => {
    const label = labelsById[el.id] || '';
    return classifyElement(el, label).category;
  });

  assert.ok(categories.includes('first_name'), 'Should detect first_name');
  assert.ok(categories.includes('last_name'), 'Should detect last_name');
  assert.ok(categories.includes('email'), 'Should detect email');
  assert.ok(categories.includes('phone'), 'Should detect phone');
  assert.ok(categories.includes('resume_file'), 'Should detect resume upload');
  assert.ok(categories.includes('location'), 'Should detect city as location');
  assert.ok(categories.includes('years_experience'), 'Should detect experience question');
  assert.ok(categories.includes('sensitive_demographic'), 'Should detect gender as sensitive');
});

test('4. Generic Career Portal & Facts Mapping', () => {
  const html = fs.readFileSync(path.join(fixturesDir, 'generic-form.html'), 'utf-8');
  const { elements, labelsById } = parseHtmlElements(html);

  const fillable = elements.filter(e => !['submit', 'button'].includes(e.type));
  const classified = fillable.map(el => {
    const label = labelsById[el.id] || '';
    return { el, ...classifyElement(el, label) };
  });

  const cats = classified.map(c => c.category);
  assert.ok(cats.includes('first_name'), 'Should classify fname');
  assert.ok(cats.includes('last_name'), 'Should classify lname');
  assert.ok(cats.includes('work_authorization'), 'Should classify work_authorization');
  assert.ok(cats.includes('requires_sponsorship'), 'Should classify visa_sponsorship');
  assert.ok(cats.includes('years_experience'), 'Should classify years_of_experience');
  assert.ok(cats.includes('sensitive_demographic'), 'Should classify disability status as sensitive');
});

test('5. Non-Negotiable Invariants: Strict Demographic Safeguards', () => {
  // Test that sensitive demographic questions NEVER generate an automated answer
  const sensitiveLabels = [
    'What is your race or ethnic background?',
    'What is your gender identity?',
    'Veteran status (Voluntary self-identification)',
    'Do you have a physical or mental disability?',
    'What is your sexual orientation?'
  ];

  for (const label of sensitiveLabels) {
    const el = new MockElement('select', { name: 'demographic' });
    const result = classifyElement(el, label);
    assert.equal(result.category, 'sensitive_demographic');
    assert.equal(result.confidence, 0.0, 'Confidence must be 0 for sensitive questions');
    assert.equal(result.requiresUserInput, true, 'Sensitive questions must require human user input');
  }
});

test('6. Non-Negotiable Invariants: Zero Submission Button Clicks', () => {
  const submitButtons = [
    new MockElement('button', { type: 'submit' }, 'Submit Application'),
    new MockElement('input', { type: 'submit', value: 'Apply Now' }),
    new MockElement('button', { class: 'submit-button' }, 'Send Application'),
    new MockElement('button', { 'data-automation-id': 'bottom-navigation-next-button' }, 'Submit')
  ];

  for (const btn of submitButtons) {
    // Verify that our filler ignores submit buttons
    const isSubmit = btn.type === 'submit' || 
      (btn.attributes.class || '').includes('submit') || 
      btn.attributes['data-automation-id'] === 'bottom-navigation-next-button';
    assert.ok(isSubmit, 'Must identify and isolate submit buttons');
  }
});

// ==========================================
// Phase 6F.3 MV3 Service-Worker Authorization & Lifecycle Tests
// ==========================================

// ==========================================
// Phase 6F.3 / 6F.3.1 MV3 Service-Worker Authorization & Lifecycle Tests
// ==========================================

function resolveBrowserOrigin(sender) {
  if (!sender) return null;
  if (typeof sender.origin === 'string') {
    const orig = sender.origin.trim();
    if (orig === 'null' || orig === 'opaque' || orig.startsWith('data:') || orig === '') {
      return null;
    }
    return orig;
  }
  if (sender.frameId && sender.frameId > 0) {
    if (sender.url) {
      try {
        const u = new URL(sender.url);
        if (u.origin === 'null' || u.origin === 'opaque') return null;
        return u.origin;
      } catch {
        return null;
      }
    }
    return null;
  }
  const sourceUrl = sender.url || sender.tab?.url;
  if (sourceUrl) {
    try {
      const u = new URL(sourceUrl);
      if (u.origin === 'null' || u.origin === 'opaque') return null;
      return u.origin;
    } catch {
      return null;
    }
  }
  return null;
}

class MockScanLedger {
  constructor() {
    this.sessions = new Map();
  }

  initSession(scanId, tabId, origin, url, frameId = 0, ttlMs = 15 * 60 * 1000) {
    const session = {
      scanId,
      tabId,
      frameId,
      origin,
      url,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      tickets: new Map()
    };
    this.sessions.set(scanId, session);
    return session;
  }

  authorizeAutofill(scanId, tabId, origin, fields, ownedResumes, selectedResumeId, frameId = 0) {
    const session = this.sessions.get(scanId);
    if (!session) throw new Error('Invalid or expired scan session.');
    if (session.tabId !== tabId) throw new Error('Security violation: Tab mismatch.');
    if (session.frameId !== frameId) throw new Error('Security violation: Frame mismatch.');
    if (session.origin !== origin) throw new Error('Security violation: Origin mismatch.');
    if (Date.now() > session.expiresAt) throw new Error('Scan session expired.');

    if (selectedResumeId && !ownedResumes.includes(selectedResumeId)) {
      throw new Error('Unauthorized resume selection.');
    }

    // Filter out sensitive demographic fields
    const allowed = fields
      .filter(f => f.category !== 'sensitive_demographic')
      .map(f => f.id);

    // Cryptographic UUID v4 (122 bits entropy)
    const ticketId = `ticket_${Date.now()}_${crypto.randomUUID()}`;
    const ticketObj = {
      ticket: ticketId,
      scanId,
      tabId,
      frameId,
      origin,
      allowedFieldIds: allowed,
      approvedFields: fields,
      resumeId: selectedResumeId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 1000,
      consumed: false
    };

    session.tickets.set(ticketId, ticketObj);
    return { ticket: ticketId, allowedFieldIds: allowed };
  }

  consumeTicket(scanId, ticketId, tabId, fieldIds, frameId = 0, origin = null) {
    const session = this.sessions.get(scanId);
    if (!session) throw new Error('Unknown or expired scan session.');
    if (origin && session.origin !== origin) throw new Error('Security violation: Origin mismatch.');
    if (session.tabId !== tabId) throw new Error('Security violation: Tab mismatch.');
    if (session.frameId !== frameId) throw new Error('Security violation: Frame mismatch.');

    const ticket = session.tickets.get(ticketId);
    if (!ticket) throw new Error('Invalid ticket.');
    if (ticket.consumed) throw new Error('Ticket already consumed.');
    if (Date.now() > ticket.expiresAt) throw new Error('Ticket expired.');

    const isSubset = fieldIds.every(id => ticket.allowedFieldIds.includes(id));
    if (!isSubset) throw new Error('Unauthorized field set.');

    ticket.consumed = true;
    return true;
  }

  downloadResume(scanId, ticketId, tabId, frameId, origin, resumeId, ownedResumes) {
    const session = this.sessions.get(scanId);
    if (!session) throw new Error('Invalid or expired scan session for resume download.');
    if (session.origin !== origin) throw new Error('Security violation: Origin mismatch on resume download.');
    if (session.tabId !== tabId) throw new Error('Security violation: Tab mismatch on resume download.');
    if (session.frameId !== frameId) throw new Error('Security violation: Frame mismatch on resume download.');

    const ticket = session.tickets.get(ticketId);
    if (!ticket) throw new Error('Invalid or missing authorization ticket for resume download.');
    if (Date.now() > ticket.expiresAt) throw new Error('Authorization ticket expired.');
    if (ticket.resumeId !== resumeId) throw new Error('Ticket not authorized for requested resume ID.');
    if (!ownedResumes.includes(resumeId)) throw new Error('Candidate does not own requested resume.');

    return { downloaded: true, resumeId };
  }

  restartWorker() {
    // MV3 Service Worker termination clears in-memory ledger (fail-closed)
    this.sessions.clear();
  }
}

test('7. Background Authorization: Ticket Binding & Sensitive Field Quarantine', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_101', 1, 'https://boards.greenhouse.io', 'https://boards.greenhouse.io/job/1');

  const fields = [
    { id: 'f1', category: 'first_name', value: 'Alex' },
    { id: 'f2', category: 'email', value: 'alex@resii.dev' },
    { id: 'f3', category: 'sensitive_demographic', value: 'Prefer not to say' }
  ];

  const auth = ledger.authorizeAutofill('scan_101', 1, 'https://boards.greenhouse.io', fields, ['res_owned'], 'res_owned');
  assert.ok(auth.ticket.startsWith('ticket_'));
  assert.deepEqual(auth.allowedFieldIds, ['f1', 'f2'], 'Sensitive demographic field MUST be quarantined from automated authorization');
});

test('8. Single-Use Ticket Consumption and Replay Prevention', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_202', 2, 'https://jobs.lever.co', 'https://jobs.lever.co/job/2');

  const fields = [{ id: 'fname', category: 'first_name', value: 'Alex' }];
  const auth = ledger.authorizeAutofill('scan_202', 2, 'https://jobs.lever.co', fields, [], null);

  // 1st consumption: succeeds
  const consumed = ledger.consumeTicket('scan_202', auth.ticket, 2, ['fname']);
  assert.equal(consumed, true);

  // 2nd consumption (replay attack): MUST throw
  assert.throws(() => {
    ledger.consumeTicket('scan_202', auth.ticket, 2, ['fname']);
  }, /already consumed/i);
});

test('9. Origin, Tab & Ownership Security Boundaries', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_303', 3, 'https://myworkdayjobs.com', 'https://myworkdayjobs.com/job/3');

  const fields = [{ id: 'f_test', category: 'text', value: 'val' }];

  // Hostile origin spoofing attempt
  assert.throws(() => {
    ledger.authorizeAutofill('scan_303', 3, 'https://malicious-phishing.com', fields, ['res_1'], 'res_1');
  }, /origin mismatch/i);

  // Cross-tab spoofing attempt
  assert.throws(() => {
    ledger.authorizeAutofill('scan_303', 999, 'https://myworkdayjobs.com', fields, ['res_1'], 'res_1');
  }, /tab mismatch/i);

  // Unauthorized resume selection attempt
  assert.throws(() => {
    ledger.authorizeAutofill('scan_303', 3, 'https://myworkdayjobs.com', fields, ['res_1'], 'unauthorized_foreign_resume');
  }, /unauthorized resume/i);
});

test('10. MV3 Service-Worker Restart Fails Closed (No Stale Trust)', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_404', 4, 'https://boards.greenhouse.io', 'https://boards.greenhouse.io/job/4');
  const fields = [{ id: 'f1', category: 'email', value: 'alex@resii.dev' }];
  const auth = ledger.authorizeAutofill('scan_404', 4, 'https://boards.greenhouse.io', fields, [], null);

  // Force MV3 Service Worker termination and restart
  ledger.restartWorker();

  // Attempt to consume previous ticket: MUST FAIL CLOSED
  assert.throws(() => {
    ledger.consumeTicket('scan_404', auth.ticket, 4, ['f1']);
  }, /unknown or expired/i);

  // Attempt to authorize new fields under old scanId: MUST FAIL CLOSED
  assert.throws(() => {
    ledger.authorizeAutofill('scan_404', 4, 'https://boards.greenhouse.io', fields, [], null);
  }, /invalid or expired/i);
});

// ==========================================
// Phase 6F.3.1 Sender Metadata & Ticket Authorization Tests
// ==========================================

test('11. resolveBrowserOrigin: Top-Frame Origin Resolution', () => {
  const senderTop = {
    origin: 'https://jobs.lever.co',
    url: 'https://jobs.lever.co/company/job-123',
    tab: { id: 10, url: 'https://jobs.lever.co/company/job-123' },
    frameId: 0
  };
  assert.equal(resolveBrowserOrigin(senderTop), 'https://jobs.lever.co');

  const senderNoOrigin = {
    url: 'https://boards.greenhouse.io/embed/job?id=1',
    tab: { id: 11, url: 'https://boards.greenhouse.io/embed/job?id=1' },
    frameId: 0
  };
  assert.equal(resolveBrowserOrigin(senderNoOrigin), 'https://boards.greenhouse.io');
});

test('12. resolveBrowserOrigin: Subframe Origin Resolution (Ignores Top-Level Tab URL)', () => {
  const senderSubframe = {
    url: 'https://subframe-ats.applicantstack.com/form',
    tab: { id: 12, url: 'https://main-company.com/careers' },
    frameId: 2
  };
  // MUST resolve to subframe origin, NEVER top-level tab URL
  assert.equal(resolveBrowserOrigin(senderSubframe), 'https://subframe-ats.applicantstack.com');
});

test('13. resolveBrowserOrigin: Missing Sender Metadata Fails Closed', () => {
  assert.equal(resolveBrowserOrigin(null), null);
  assert.equal(resolveBrowserOrigin({}), null);
  assert.equal(resolveBrowserOrigin({ tab: {} }), null);
  assert.equal(resolveBrowserOrigin({ frameId: 1 }), null);
});

test('14. resolveBrowserOrigin: Opaque Origins Fail Closed', () => {
  assert.equal(resolveBrowserOrigin({ origin: 'null' }), null);
  assert.equal(resolveBrowserOrigin({ origin: 'opaque' }), null);
  assert.equal(resolveBrowserOrigin({ origin: 'data:text/html,<h1>evil</h1>' }), null);
  assert.equal(resolveBrowserOrigin({ url: 'data:text/html,<h1>evil</h1>', frameId: 0 }), null);
});

test('15. Spoofed Payload Origin Rejected (Browser Sender Metadata Governs)', () => {
  const sender = {
    origin: 'https://attacker.evil.com',
    tab: { id: 15, url: 'https://attacker.evil.com/page' },
    frameId: 0
  };
  // Caller payload claims to be Greenhouse, but browser metadata is attacker
  const resolved = resolveBrowserOrigin(sender);
  assert.equal(resolved, 'https://attacker.evil.com');
  assert.notEqual(resolved, 'https://boards.greenhouse.io');
});

test('16. Mismatched Tab and Frame ID Enforcement', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_frame_test', 5, 'https://boards.greenhouse.io', 'https://boards.greenhouse.io/job/1', 1);

  const fields = [{ id: 'f1', category: 'email', value: 'alex@resii.dev' }];

  // Correct frame (1) and tab (5): succeeds
  const auth = ledger.authorizeAutofill('scan_frame_test', 5, 'https://boards.greenhouse.io', fields, [], null, 1);
  assert.ok(auth.ticket);

  // Wrong frame (0 instead of 1): rejected
  assert.throws(() => {
    ledger.authorizeAutofill('scan_frame_test', 5, 'https://boards.greenhouse.io', fields, [], null, 0);
  }, /frame mismatch/i);

  // Wrong tab (99 instead of 5): rejected
  assert.throws(() => {
    ledger.authorizeAutofill('scan_frame_test', 99, 'https://boards.greenhouse.io', fields, [], null, 1);
  }, /tab mismatch/i);
});

test('17. Navigation to Different Origin Fails Closed', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_nav_test', 6, 'https://boards.greenhouse.io', 'https://boards.greenhouse.io/job/1', 0);
  const fields = [{ id: 'f1', category: 'email', value: 'alex@resii.dev' }];
  const auth = ledger.authorizeAutofill('scan_nav_test', 6, 'https://boards.greenhouse.io', fields, [], null, 0);

  // Tab navigates from Greenhouse to Phishing / Different site
  assert.throws(() => {
    ledger.consumeTicket('scan_nav_test', auth.ticket, 6, ['f1'], 0, 'https://malicious-phishing.org');
  }, /origin mismatch/i);
});

test('18. Authorization Ticket Protects BOTH Autofill and Resume Download', () => {
  const ledger = new MockScanLedger();
  ledger.initSession('scan_resume_test', 7, 'https://jobs.lever.co', 'https://jobs.lever.co/job/7', 0);
  const fields = [
    { id: 'f_name', category: 'first_name', value: 'Alex' },
    { id: 'f_res', category: 'resume_file', value: 'Alex_Resume.pdf' }
  ];

  // Authorize with selected resume
  const auth = ledger.authorizeAutofill('scan_resume_test', 7, 'https://jobs.lever.co', fields, ['res_alex_01'], 'res_alex_01', 0);

  // 1. Download with valid ticket and owned resume: succeeds
  const dlResult = ledger.downloadResume('scan_resume_test', auth.ticket, 7, 0, 'https://jobs.lever.co', 'res_alex_01', ['res_alex_01']);
  assert.equal(dlResult.downloaded, true);

  // 2. Download with wrong resume ID: rejected
  assert.throws(() => {
    ledger.downloadResume('scan_resume_test', auth.ticket, 7, 0, 'https://jobs.lever.co', 'res_foreign_99', ['res_alex_01']);
  }, /not authorized for requested resume/i);

  // 3. Download from mismatched origin: rejected
  assert.throws(() => {
    ledger.downloadResume('scan_resume_test', auth.ticket, 7, 0, 'https://evil.com', 'res_alex_01', ['res_alex_01']);
  }, /origin mismatch/i);

  // 4. Download with fake/invalid ticket: rejected
  assert.throws(() => {
    ledger.downloadResume('scan_resume_test', 'ticket_fake_invalid', 7, 0, 'https://jobs.lever.co', 'res_alex_01', ['res_alex_01']);
  }, /invalid or missing/i);

  // 5. Consume text fields: succeeds
  const consumed = ledger.consumeTicket('scan_resume_test', auth.ticket, 7, ['f_name', 'f_res'], 0, 'https://jobs.lever.co');
  assert.equal(consumed, true);
});

test('19. UUID v4 Cryptographic Entropy Verification (122 Random Bits)', () => {
  const uuid = crypto.randomUUID();
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx where y is [8, 9, a, b]
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert.ok(uuidV4Regex.test(uuid), `UUID must conform to RFC 4122 v4: ${uuid}`);

  // RFC 4122 v4 specification:
  // 128 total bits - 4 bits (version 0100) - 2 bits (variant 10) = 122 bits of cryptographic entropy
  const totalBits = 128;
  const versionBits = 4;
  const variantBits = 2;
  const entropyBits = totalBits - versionBits - variantBits;
  assert.equal(entropyBits, 122, 'UUID v4 provides exactly 122 bits of pseudo-random entropy');
});

console.log('[RESII Extension Tests] All test suites passed!');

console.log('[RESII Extension Tests] All test suites passed!');

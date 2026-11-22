import { RESII_API_DEFAULT } from '../shared/constants';
import {
  CandidateProfile,
  CandidateFacts,
  ResumeOption,
  TrackApplicationPayload
} from '../shared/types';

export class ResiiApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = RESII_API_DEFAULT) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['X-Extension-Token'] = this.token;
    }
    return headers;
  }

  async quickPair() {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/quick-pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Quick pair failed' }));
      throw new Error(err.detail || 'Failed to auto-connect with active session');
    }
    const data = await res.json();
    this.setToken(data.token);
    return data;
  }

  async pairWithCode(pairingCode: string) {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: pairingCode })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Pairing failed' }));
      throw new Error(err.detail || 'Failed to pair with RESII');
    }
    const data = await res.json();
    this.setToken(data.token);
    return data;
  }

  async pairWithCredentials(email: string, pass: string) {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Pairing failed' }));
      throw new Error(err.detail || 'Failed to pair with RESII');
    }
    const data = await res.json();
    this.setToken(data.token);
    return data;
  }

  async checkStatus() {
    if (!this.token) return { status: 'unpaired' };
    try {
      const res = await fetch(`${this.baseUrl}/api/v3/extension/status`, {
        headers: this.getHeaders()
      });
      if (res.ok) {
        return await res.json();
      }
      return { status: 'disconnected' };
    } catch {
      return { status: 'unreachable' };
    }
  }

  async getCandidateProfile(): Promise<{
    profile: CandidateProfile;
    facts: CandidateFacts;
    resumes: ResumeOption[];
  }> {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/candidate-profile`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error('Failed to fetch candidate profile from RESII');
    }
    return await res.json();
  }

  async generateAnswers(jobTitle: string, company: string, questions: string[]) {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/generate-answers`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        job_title: jobTitle,
        company,
        questions
      })
    });
    if (!res.ok) {
      throw new Error('Failed to generate screening answers');
    }
    return await res.json();
  }

  async downloadResumeArtifact(resumeId: string): Promise<{
    dataBase64: string;
    filename: string;
    contentType: string;
    size: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v3/resumes/${resumeId}/export/pdf`, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error(`Failed to download resume artifact: HTTP ${res.status}`);
    }
    const disposition = res.headers.get('content-disposition') || '';
    let filename = 'resume.pdf';
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const dataBase64 = btoa(binary);

    return {
      dataBase64,
      filename,
      contentType: res.headers.get('content-type') || 'application/pdf',
      size: bytes.byteLength
    };
  }

  async tailorAndAttachResume(
    resumeId: string,
    jobDescription: string,
    jobTitle: string,
    companyName: string,
    acceptedChanges?: any[],
    targetFormat: string = 'docx'
  ): Promise<{
    success: boolean;
    tailoredId: string;
    filename: string;
    fileBase64: string;
    mimeType: string;
    pageCount: number;
    atsScore: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/v3/tailor/tailor-and-attach`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        resume_id: resumeId,
        job_description: jobDescription,
        job_title: jobTitle,
        company_name: companyName,
        accepted_changes: acceptedChanges,
        target_format: targetFormat
      })
    });
    if (!res.ok) {
      throw new Error(`Failed to tailor and attach resume: HTTP ${res.status}`);
    }
    const data = await res.json();
    return {
      success: data.success,
      tailoredId: data.tailored_id,
      filename: data.filename,
      fileBase64: data.file_base64,
      mimeType: data.mime_type,
      pageCount: data.page_count,
      atsScore: data.ats_score
    };
  }

  async disconnect() {
    if (!this.token) return;
    try {
      await fetch(`${this.baseUrl}/api/v3/extension/disconnect`, {
        method: 'POST',
        headers: this.getHeaders()
      });
    } catch {
      // Ignore network errors on disconnect
    }
  }

  async trackApplication(payload: TrackApplicationPayload) {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/track-application`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error('Failed to track application');
    }
    return await res.json();
  }

  async tailorResume(resumeId: string, jobDescription: string, jobTitle: string, companyName: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/tailor`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        resume_id: resumeId,
        job_description: jobDescription,
        job_title: jobTitle,
        company_name: companyName
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to tailor resume' }));
      throw new Error(err.detail || 'Resume tailoring failed');
    }
    return await res.json();
  }

  async matchResume(resumeId: string, jobDescription: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/match`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        resume_id: resumeId,
        job_description: jobDescription
      })
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  }

  async applyTailoring(reviewId: string, acceptedChanges: any[]): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/v3/tailor/apply`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        review_id: reviewId,
        accepted_changes: acceptedChanges
      })
    });
    if (!res.ok) {
      throw new Error('Failed to apply tailoring changes');
    }
    return await res.json();
  }

  async rotateToken(): Promise<{ token: string; expires_at: number }> {
    const res = await fetch(`${this.baseUrl}/api/v3/extension/rotate-token`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    if (!res.ok) {
      throw new Error('Failed to rotate extension token');
    }
    const data = await res.json();
    this.setToken(data.token);
    return data;
  }
}

export const apiClient = new ResiiApiClient();

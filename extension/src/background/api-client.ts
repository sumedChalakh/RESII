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
}

export const apiClient = new ResiiApiClient();

export type FieldCategory =
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin_url'
  | 'github_url'
  | 'portfolio_url'
  | 'website_url'
  | 'work_authorization'
  | 'requires_sponsorship'
  | 'years_experience'
  | 'highest_education'
  | 'notice_period'
  | 'salary_expectation'
  | 'resume_file'
  | 'cover_letter'
  | 'screening_question'
  | 'sensitive_demographic'
  | 'unknown';

export type ProvenanceBadge =
  | 'verified_profile'
  | 'candidate_fact'
  | 'resume_source'
  | 'ai_grounded'
  | 'user_input_required';

export interface ClassifiedField {
  id: string;
  elementId?: string;
  name?: string;
  type: string; // text, email, tel, file, select, textarea, etc.
  category: FieldCategory;
  label: string;
  selector: string;
  confidence: number;
  isRequired: boolean;
  proposedValue: string;
  provenance: ProvenanceBadge;
  requiresUserInput: boolean;
  approved: boolean;
}

export interface JobContext {
  company: string;
  title: string;
  location?: string;
  url: string;
  adapterName: string;
  formDetected: boolean;
}

export interface ResumeOption {
  id: string;
  title: string;
  version: number;
  ats_score: number;
  is_primary: boolean;
  download_url_pdf: string;
  download_url_docx: string;
}

export interface CandidateProfile {
  name: string;
  email: string;
  phone: string;
  title: string;
  location: string;
  bio: string;
  website: string;
}

export interface CandidateFacts {
  work_authorization?: string;
  requires_sponsorship?: string;
  years_of_experience?: string;
  highest_education?: string;
  notice_period?: string;
  preferred_location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  [key: string]: any;
}

export interface ExtensionState {
  isConnected: boolean;
  token?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  profile?: CandidateProfile;
  facts?: CandidateFacts;
  resumes: ResumeOption[];
  selectedResumeId?: string;
}

export interface TrackApplicationPayload {
  title: string;
  company: string;
  location?: string;
  job_url?: string;
  resume_id?: string;
  salary_range?: string;
  notes?: string;
  form_provider?: string;
}

import {
  ClassifiedField,
  CandidateProfile,
  CandidateFacts,
  ResumeOption
} from '../shared/types';

export class EvidenceMapper {
  mapCandidateEvidence(
    fields: ClassifiedField[],
    profile?: CandidateProfile,
    facts?: CandidateFacts,
    resumes?: ResumeOption[]
  ): ClassifiedField[] {
    const primaryResume = resumes?.find((r) => r.is_primary) || resumes?.[0];

    return fields.map((field) => {
      const updated = { ...field };

      switch (field.category) {
        case 'first_name': {
          const val = this.extractFirstName(profile?.name || '');
          if (val) {
            updated.proposedValue = val;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'last_name': {
          const val = this.extractLastName(profile?.name || '');
          if (val) {
            updated.proposedValue = val;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'full_name': {
          if (profile?.name) {
            updated.proposedValue = profile.name;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.98;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'email': {
          if (profile?.email) {
            updated.proposedValue = profile.email;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.99;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'phone': {
          if (profile?.phone) {
            updated.proposedValue = profile.phone;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'location': {
          if (profile?.location) {
            updated.proposedValue = profile.location;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.90;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'linkedin_url': {
          if (facts?.linkedin_url) {
            updated.proposedValue = facts.linkedin_url;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.98;
          } else {
            updated.proposedValue = '';
            updated.requiresUserInput = true;
            updated.provenance = 'user_input_required';
            updated.confidence = 0.0;
            updated.approved = false;
          }
          break;
        }

        case 'github_url': {
          if (facts?.github_url) {
            updated.proposedValue = facts.github_url;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.98;
          } else {
            updated.proposedValue = '';
            updated.requiresUserInput = true;
            updated.provenance = 'user_input_required';
            updated.confidence = 0.0;
            updated.approved = false;
          }
          break;
        }

        case 'portfolio_url':
        case 'website_url': {
          const url = profile?.website || facts?.portfolio_url;
          if (url) {
            updated.proposedValue = url;
            updated.provenance = 'verified_profile';
            updated.confidence = 0.95;
          } else {
            updated.proposedValue = '';
            updated.requiresUserInput = true;
            updated.provenance = 'user_input_required';
            updated.confidence = 0.0;
            updated.approved = false;
          }
          break;
        }

        case 'work_authorization': {
          if (facts?.work_authorization) {
            updated.proposedValue = facts.work_authorization;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'requires_sponsorship': {
          if (facts?.requires_sponsorship) {
            updated.proposedValue = facts.requires_sponsorship;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'years_experience': {
          if (facts?.years_of_experience) {
            updated.proposedValue = facts.years_of_experience;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.92;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'highest_education': {
          if (facts?.highest_education) {
            updated.proposedValue = facts.highest_education;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.92;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'notice_period': {
          if (facts?.notice_period) {
            updated.proposedValue = facts.notice_period;
            updated.provenance = 'candidate_fact';
            updated.confidence = 0.92;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'resume_file': {
          if (primaryResume) {
            updated.proposedValue = `[RESII Resume]: ${primaryResume.title} (v${primaryResume.version})`;
            updated.provenance = 'resume_source';
            updated.confidence = 0.95;
          } else {
            updated.requiresUserInput = true;
          }
          break;
        }

        case 'sensitive_demographic': {
          // Strictly zero-autofill for demographic or EEO queries
          updated.proposedValue = '';
          updated.provenance = 'user_input_required';
          updated.confidence = 0.0;
          updated.requiresUserInput = true;
          updated.approved = false;
          break;
        }

        case 'screening_question': {
          if (facts?.years_of_experience) {
            updated.proposedValue = `Based on my verified background (${facts.years_of_experience}), I deliver high-performance engineering, robust testing, and production reliability.`;
            updated.provenance = 'ai_grounded';
            updated.confidence = 0.75;
          } else {
            updated.proposedValue = '';
            updated.requiresUserInput = true;
            updated.provenance = 'user_input_required';
            updated.confidence = 0.0;
            updated.approved = false;
          }
          break;
        }

        default: {
          updated.requiresUserInput = true;
          updated.approved = false;
        }
      }

      return updated;
    });
  }

  private extractFirstName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || '';
  }

  private extractLastName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
}

export const evidenceMapper = new EvidenceMapper();

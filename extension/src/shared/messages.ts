import {
  ClassifiedField,
  JobContext,
  ExtensionState,
  TrackApplicationPayload
} from './types';

export type ExtensionMessage =
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATED'; payload: ExtensionState }
  | { type: 'PAIR_EXTENSION'; payload: { pairingCode?: string; email?: string; password?: string } }
  | { type: 'DISCONNECT_EXTENSION' }
  | { type: 'DETECT_PAGE' }
  | { type: 'PAGE_DETECTED'; payload: JobContext }
  | { type: 'SCAN_AND_CLASSIFY' }
  | { type: 'SCAN_RESULTS'; payload: { context: JobContext; fields: ClassifiedField[] } }
  | { type: 'INIT_SCAN_SESSION'; payload: { origin?: string; url?: string } }
  | { type: 'AUTHORIZE_AUTOFILL'; payload: { scanId: string; origin?: string; fields: Array<{ id: string; category: string; value: string }>; selectedResumeId?: string } }
  | { type: 'CONSUME_AUTOFILL_TICKET'; payload: { scanId: string; ticket: string; fieldIds: string[] } }
  | { type: 'DOWNLOAD_RESUME'; payload: { resumeId: string; scanId?: string; ticket?: string } }
  | { type: 'ATTACH_RESUME_FILE'; payload: { selector: string; resumeId: string; scanId?: string; ticket?: string } }
  | { type: 'APPLY_AUTOFILL'; payload: { fields: ClassifiedField[]; resumeId?: string; scanId?: string; ticket?: string } }
  | { type: 'AUTOFILL_COMPLETE'; payload: { filledCount: number; skippedCount: number } }
  | { type: 'TRACK_APPLICATION'; payload: TrackApplicationPayload }
  | { type: 'APPLICATION_TRACKED'; payload: { success: boolean; id?: string } }
  | { type: 'GENERATE_ANSWERS'; payload: { questions: string[]; jobTitle: string; company: string } };

export interface MessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

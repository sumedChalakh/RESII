import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { getCsrfToken } from '../utils/csrf';

interface ResumeDropzoneProps {
  onUploadSuccess?: (resume: any) => void;
}

export const ResumeDropzone: React.FC<ResumeDropzoneProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedResume, setUploadedResume] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedExtensions = ['.pdf', '.docx', '.txt'];
  const maxBytes = 10 * 1024 * 1024; // 10MB

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return `Unsupported file format (${ext}). Please upload a PDF, DOCX, or TXT file.`;
    }
    if (file.size > maxBytes) {
      return `File exceeds maximum allowed size of 10 MB (file is ${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
    }
    return null;
  };

  const processUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setUploading(true);
    setUploadedResume(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }

      const res = await fetch('/api/v3/resumes/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to upload and parse resume.');
      }

      const data = await res.json();
      setUploadedResume(data);
      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during resume upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUpload(e.target.files[0]);
      e.target.value = ''; // Reset so the same file can be selected again if needed
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-lg)',
          background: isDragging ? 'var(--color-primary-light)' : 'var(--color-surface-elevated)',
          padding: '32px 24px',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all 150ms ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: isDragging ? '#fff' : 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: 'var(--shadow-sm)',
          color: 'var(--color-primary)'
        }}>
          {uploading ? (
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <UploadCloud size={24} />
          )}
        </div>

        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-ink)', marginBottom: 4 }}>
            {uploading ? 'Parsing & Ingesting Resume…' : 'Click to upload or drag and drop'}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)' }}>
            PDF, DOCX, or TXT up to 10 MB. Structural AST parsing & ATS evaluation.
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--color-danger-bg)',
          color: 'var(--color-danger)',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          border: '1px solid rgba(185, 28, 28, 0.2)'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Success Banner */}
      {uploadedResume && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-success-bg)',
          color: 'var(--color-success)',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          fontSize: 13,
          border: '1px solid rgba(21, 128, 61, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} />
            <div>
              <strong style={{ display: 'block' }}>Upload Successful!</strong>
              <span>
                "{uploadedResume.title || 'Resume'}" parsed successfully (Version {uploadedResume.version || 1}).
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeDropzone;

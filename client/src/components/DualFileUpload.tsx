import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import './DualFileUpload.css';

interface DualFileUploadProps {
  onUpload: (sessionId: string, styleData: any) => void;
}

interface UploadState {
  referenceFile: File | null;
  targetFile: File | null;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;
  extractedStyles: any | null;
}

const DualFileUpload: React.FC<DualFileUploadProps> = ({ onUpload }) => {
  const [state, setState] = useState<UploadState>({
    referenceFile: null,
    targetFile: null,
    isUploading: false,
    uploadProgress: 0,
    error: null,
    extractedStyles: null
  });

  const referenceInputRef = useRef<HTMLInputElement>(null);
  const targetInputRef = useRef<HTMLInputElement>(null);

  const handleReferenceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setState(prev => ({
        ...prev,
        referenceFile: file,
        error: null
      }));
    }
  };

  const handleTargetSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setState(prev => ({
        ...prev,
        targetFile: file,
        error: null
      }));
    }
  };

  const handleUpload = async () => {
    if (!state.referenceFile || !state.targetFile) {
      setState(prev => ({
        ...prev,
        error: 'Please select both reference and target documents'
      }));
      return;
    }

    setState(prev => ({
      ...prev,
      isUploading: true,
      uploadProgress: 0,
      error: null
    }));

    const formData = new FormData();
    formData.append('referenceDocument', state.referenceFile);
    formData.append('targetDocument', state.targetFile);

    try {
      // Upload both files
      setState(prev => ({ ...prev, uploadProgress: 30 }));

      const response = await fetch('http://localhost:3001/api/dual/upload-dual', {
        method: 'POST',
        body: formData
      });

      setState(prev => ({ ...prev, uploadProgress: 60 }));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();

      setState(prev => ({
        ...prev,
        uploadProgress: 90,
        extractedStyles: data.styleExtraction
      }));

      // Brief delay to show completion
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          uploadProgress: 100,
          isUploading: false
        }));

        onUpload(data.sessionId, data);
      }, 500);

    } catch (error) {
      setState(prev => ({
        ...prev,
        isUploading: false,
        error: error instanceof Error ? error.message : 'Upload failed'
      }));
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="dual-upload-container">
      <h2>Upload Documents</h2>
      <p className="upload-description">
        Upload a reference document with your desired formatting style,
        and the document you want to format.
      </p>

      {state.error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{state.error}</span>
        </div>
      )}

      <div className="upload-grid">
        {/* Reference Document Upload */}
        <div className="upload-section">
          <h3>📘 Reference Document</h3>
          <p>Upload a document with the formatting style you want to apply</p>

          <div
            className={`upload-area ${state.referenceFile ? 'has-file' : ''}`}
            onClick={() => referenceInputRef.current?.click()}
          >
            {state.referenceFile ? (
              <>
                <FileText size={40} />
                <p className="file-name">{state.referenceFile.name}</p>
                <span className="file-size">
                  {formatFileSize(state.referenceFile.size)}
                </span>
                <CheckCircle className="check-icon" size={24} />
              </>
            ) : (
              <>
                <Upload size={40} />
                <p>Click to select or drag & drop</p>
                <span className="file-types">Supports: DOCX, PDF, TXT, HTML</span>
              </>
            )}
          </div>

          <input
            ref={referenceInputRef}
            type="file"
            accept=".docx,.pdf,.txt,.html"
            onChange={handleReferenceSelect}
            style={{ display: 'none' }}
          />
        </div>

        {/* Target Document Upload */}
        <div className="upload-section">
          <h3>📄 Document to Format</h3>
          <p>Upload the document you want to apply formatting to</p>

          <div
            className={`upload-area ${state.targetFile ? 'has-file' : ''}`}
            onClick={() => targetInputRef.current?.click()}
          >
            {state.targetFile ? (
              <>
                <FileText size={40} />
                <p className="file-name">{state.targetFile.name}</p>
                <span className="file-size">
                  {formatFileSize(state.targetFile.size)}
                </span>
                <CheckCircle className="check-icon" size={24} />
              </>
            ) : (
              <>
                <Upload size={40} />
                <p>Click to select or drag & drop</p>
                <span className="file-types">Supports: DOCX, PDF, TXT, HTML</span>
              </>
            )}
          </div>

          <input
            ref={targetInputRef}
            type="file"
            accept=".docx,.pdf,.txt,.html"
            onChange={handleTargetSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* Upload Progress */}
      {state.isUploading && (
        <div className="upload-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${state.uploadProgress}%` }}
            />
          </div>
          <p>Uploading and analyzing documents... {state.uploadProgress}%</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="upload-actions">
        <button
          className="btn-primary"
          onClick={handleUpload}
          disabled={!state.referenceFile || !state.targetFile || state.isUploading}
        >
          {state.isUploading ? 'Processing...' : 'Upload & Analyze'}
        </button>

        {(state.referenceFile || state.targetFile) && !state.isUploading && (
          <button
            className="btn-secondary"
            onClick={() => setState({
              referenceFile: null,
              targetFile: null,
              isUploading: false,
              uploadProgress: 0,
              error: null,
              extractedStyles: null
            })}
          >
            Clear Files
          </button>
        )}
      </div>
    </div>
  );
};

export default DualFileUpload;
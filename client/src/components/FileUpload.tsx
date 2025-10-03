import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import './FileUpload.css';

interface FileUploadProps {
  onUpload: (jobId: string, filename: string, content: string) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUpload }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('document', file);

      const response = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();

      if (data.success) {
        onUpload(data.jobId, data.filename, data.content);
      } else {
        throw new Error(data.message || 'Upload failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt']
    },
    maxFiles: 1,
    disabled: uploading
  });

  return (
    <div className="file-upload">
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${uploading ? 'disabled' : ''}`}
      >
        <input {...getInputProps()} />

        <div className="dropzone-content">
          {uploading ? (
            <>
              <div className="upload-icon uploading">📤</div>
              <p>Uploading...</p>
            </>
          ) : isDragActive ? (
            <>
              <div className="upload-icon">📥</div>
              <p>Drop your document here</p>
            </>
          ) : (
            <>
              <div className="upload-icon">📁</div>
              <p>Drag & drop your document here</p>
              <p className="upload-hint">or click to browse</p>
              <p className="upload-formats">Supported: .docx, .doc, .txt</p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="upload-error">
          ❌ {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
import React, { useState } from 'react';
import './DocumentActions.css';

interface DocumentActionsProps {
  content: string;
  filename: string;
  styleId: string;
  onReset: () => void;
}

const DocumentActions: React.FC<DocumentActionsProps> = ({
  content,
  filename,
  styleId,
  onReset
}) => {
  const [downloading, setDownloading] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'docx' | 'pdf'>('docx');

  const handleDownload = async () => {
    setDownloading(true);

    try {
      const response = await fetch('http://localhost:3001/api/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content,
          format: selectedFormat,
          filename: filename.replace(/\.[^/.]+$/, ''),
          styleId
        })
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename.replace(/\.[^/.]+$/, '')}_formatted.${selectedFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download document');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="document-actions">
      <div className="success-message">
        <div className="success-icon">✅</div>
        <h2>Document formatted successfully!</h2>
        <p>Your document has been transformed with the {styleId} style.</p>
      </div>

      <div className="preview-section">
        <h3>Preview</h3>
        <div className="document-preview">
          <pre>{content.substring(0, 500)}...</pre>
        </div>
      </div>

      <div className="export-section">
        <h3>Export Options</h3>
        <div className="format-selector">
          <label className={`format-option ${selectedFormat === 'docx' ? 'selected' : ''}`}>
            <input
              type="radio"
              value="docx"
              checked={selectedFormat === 'docx'}
              onChange={(e) => setSelectedFormat(e.target.value as 'docx')}
            />
            <span>📄 Word Document (.docx)</span>
          </label>
          <label className={`format-option ${selectedFormat === 'pdf' ? 'selected' : ''}`}>
            <input
              type="radio"
              value="pdf"
              checked={selectedFormat === 'pdf'}
              onChange={(e) => setSelectedFormat(e.target.value as 'pdf')}
            />
            <span>📑 PDF Document (.pdf)</span>
          </label>
        </div>
      </div>

      <div className="action-buttons">
        <button
          className="btn-download"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? 'Downloading...' : `Download as ${selectedFormat.toUpperCase()}`}
        </button>
        <button
          className="btn-reset"
          onClick={onReset}
        >
          Format Another Document
        </button>
      </div>
    </div>
  );
};

export default DocumentActions;
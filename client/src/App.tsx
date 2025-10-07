import { useState } from 'react';
import FileUpload from './components/FileUpload';
import DualFileUpload from './components/DualFileUpload';
import StyleSelector from './components/StyleSelector';
import StylePreview from './components/StylePreview';
import ProgressTracker from './components/ProgressTracker';
import DocumentActions from './components/DocumentActions';
import './App.css';

interface AppState {
  mode: 'dual' | 'single';
  currentStep: 'upload' | 'style-preview' | 'style' | 'processing' | 'complete';
  sessionId: string | null;
  jobId: string | null;
  filename: string | null;
  content: string | null;
  selectedStyle: string | null;
  formattedContent: string | null;
  structuredRepresentation: any | null;
  progress: number;
  error: string | null;
  uploadData: any | null;
  debugInfo: any | null;
}

function App() {
  const [state, setState] = useState<AppState>({
    mode: 'dual',  // Default to dual mode
    currentStep: 'upload',
    sessionId: null,
    jobId: null,
    filename: null,
    content: null,
    selectedStyle: null,
    formattedContent: null,
    structuredRepresentation: null,
    progress: 0,
    error: null,
    uploadData: null,
    debugInfo: null
  });

  // Dual upload handlers
  const handleDualUpload = (sessionId: string, uploadData: any) => {
    setState(prev => ({
      ...prev,
      sessionId,
      uploadData,
      currentStep: 'style-preview',
      filename: uploadData.target.fileName,
      content: uploadData.target.extractedText,
      error: null,
      debugInfo: null
    }));
  };

  const handleStyleApply = async () => {
    if (!state.sessionId) return;

    setState(prev => ({
      ...prev,
      currentStep: 'processing',
      progress: 0,
      debugInfo: null
    }));

    try {
      // Apply styles from reference document
      const response = await fetch('http://localhost:3001/api/dual/apply-styles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to apply styles');
      }

      const data = await response.json();
      const jobId = data.jobId;

      setState(prev => ({
        ...prev,
        jobId
      }));

      // Start formatting process with extracted styles
      const formatResponse = await fetch('http://localhost:3001/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: state.content,
          styleId: 'custom-extracted',
          jobId,
          sessionId: state.sessionId
        })
      });

      if (!formatResponse.ok) {
        throw new Error('Failed to start formatting');
      }

      // Poll for progress
      pollForProgress(jobId);

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An error occurred',
        currentStep: 'style-preview'
      }));
    }
  };

  // Single upload handlers (existing)
  const handleFileUpload = (jobId: string, filename: string, content: string) => {
    setState(prev => ({
      ...prev,
      jobId,
      filename,
      content,
      currentStep: 'style',
      error: null
    }));
  };

  const handleStyleSelect = (styleId: string) => {
    setState(prev => ({
      ...prev,
      selectedStyle: styleId,
      currentStep: 'processing',
      progress: 0,
      debugInfo: null
    }));
    processDocument(styleId);
  };

  const processDocument = async (styleId: string) => {
    if (!state.content || !state.jobId) return;

    try {
      const response = await fetch('http://localhost:3001/api/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: state.content,
          styleId,
          jobId: state.jobId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start formatting');
      }

      pollForProgress(state.jobId);

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An error occurred',
        currentStep: 'style',
        debugInfo: null
      }));
    }
  };

  const pollForProgress = (jobId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const progressResponse = await fetch(`http://localhost:3001/api/progress/${jobId}`);
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();

          setState(prev => ({
            ...prev,
            progress: progressData.progress
          }));

          if (progressData.status === 'completed') {
            clearInterval(pollInterval);

            const resultResponse = await fetch(`http://localhost:3001/api/format/result/${jobId}`);
            if (resultResponse.ok) {
              const resultData = await resultResponse.json();
              setState(prev => ({
                ...prev,
                formattedContent: resultData.formattedContent,
                structuredRepresentation: resultData.structuredRepresentation || null,
                currentStep: 'complete',
                progress: 100,
                debugInfo: resultData.debug || null
              }));
            }
          } else if (progressData.status === 'failed') {
            clearInterval(pollInterval);
            throw new Error(progressData.error || 'Processing failed');
          }
        }
      } catch (error) {
        clearInterval(pollInterval);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'An error occurred',
          currentStep: prev.mode === 'dual' ? 'style-preview' : 'style',
          debugInfo: null
        }));
      }
    }, 500);
  };

  const handleReset = () => {
    setState({
      mode: 'dual',
      currentStep: 'upload',
      sessionId: null,
      jobId: null,
      filename: null,
      content: null,
      selectedStyle: null,
      formattedContent: null,
      structuredRepresentation: null,
      progress: 0,
      error: null,
      uploadData: null,
      debugInfo: null
    });
  };

  const switchMode = () => {
    setState(prev => ({
      ...prev,
      mode: prev.mode === 'dual' ? 'single' : 'dual',
      currentStep: 'upload',
      error: null
    }));
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Document Formatter</h1>
        <p>Transform your documents with AI-powered professional formatting</p>

        {/* Mode Switch */}
        <div className="mode-switch">
          <button
            className={`mode-btn ${state.mode === 'dual' ? 'active' : ''}`}
            onClick={() => state.currentStep === 'upload' && switchMode()}
            disabled={state.currentStep !== 'upload'}
          >
            Reference-Based Formatting
          </button>
          <button
            className={`mode-btn ${state.mode === 'single' ? 'active' : ''}`}
            onClick={() => state.currentStep === 'upload' && switchMode()}
            disabled={state.currentStep !== 'upload'}
          >
            Pre-defined Styles
          </button>
        </div>
      </header>

      <main className="app-main">
        {state.error && (
          <div className="error-message">
            {state.error}
          </div>
        )}

        {/* Upload Step */}
        {state.currentStep === 'upload' && (
          state.mode === 'dual' ? (
            <DualFileUpload onUpload={handleDualUpload} />
          ) : (
            <FileUpload onUpload={handleFileUpload} />
          )
        )}

        {/* Style Preview (for dual mode) */}
        {state.currentStep === 'style-preview' && state.uploadData && (
          <StylePreview
            styleData={state.uploadData}
            sessionId={state.sessionId || ''}
            onProceed={handleStyleApply}
            onBack={handleReset}
          />
        )}

        {/* Style Selection (for single mode) */}
        {state.currentStep === 'style' && (
          <StyleSelector
            onSelect={handleStyleSelect}
            filename={state.filename}
          />
        )}

        {/* Processing */}
        {state.currentStep === 'processing' && (
          <ProgressTracker
            progress={state.progress}
            filename={state.filename}
            style={state.mode === 'dual' ? 'Extracted from reference' : state.selectedStyle}
          />
        )}

        {/* Complete */}
        {state.currentStep === 'complete' && state.formattedContent && (
          <DocumentActions
            content={state.formattedContent}
            filename={state.filename || 'document'}
            styleId={state.mode === 'dual' ? 'custom-extracted' : (state.selectedStyle || 'custom')}
            sessionId={state.sessionId}
            structuredRepresentation={state.structuredRepresentation}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}

export default App;

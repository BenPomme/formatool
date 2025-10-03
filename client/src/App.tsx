import { useState } from 'react';
import FileUpload from './components/FileUpload';
import StyleSelector from './components/StyleSelector';
import ProgressTracker from './components/ProgressTracker';
import DocumentActions from './components/DocumentActions';
import './App.css';

interface AppState {
  currentStep: 'upload' | 'style' | 'processing' | 'complete';
  jobId: string | null;
  filename: string | null;
  content: string | null;
  selectedStyle: string | null;
  formattedContent: string | null;
  progress: number;
  error: string | null;
}

function App() {
  const [state, setState] = useState<AppState>({
    currentStep: 'upload',
    jobId: null,
    filename: null,
    content: null,
    selectedStyle: null,
    formattedContent: null,
    progress: 0,
    error: null
  });

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
      progress: 0
    }));
    processDocument(styleId);
  };

  const processDocument = async (styleId: string) => {
    if (!state.content || !state.jobId) return;

    try {
      // Start processing
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

      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch(`http://localhost:3001/api/progress/${state.jobId}`);
          if (progressResponse.ok) {
            const progressData = await progressResponse.json();

            setState(prev => ({
              ...prev,
              progress: progressData.progress
            }));

            if (progressData.status === 'completed') {
              clearInterval(pollInterval);

              // Get the result
              const resultResponse = await fetch(`http://localhost:3001/api/format/result/${state.jobId}`);
              if (resultResponse.ok) {
                const resultData = await resultResponse.json();
                setState(prev => ({
                  ...prev,
                  formattedContent: resultData.formattedContent,
                  currentStep: 'complete',
                  progress: 100
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
            currentStep: 'style'
          }));
        }
      }, 500);

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'An error occurred',
        currentStep: 'style'
      }));
    }
  };

  const handleReset = () => {
    setState({
      currentStep: 'upload',
      jobId: null,
      filename: null,
      content: null,
      selectedStyle: null,
      formattedContent: null,
      progress: 0,
      error: null
    });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Document Formatter</h1>
        <p>Transform your documents with AI-powered professional formatting</p>
      </header>

      <main className="app-main">
        {state.error && (
          <div className="error-message">
            {state.error}
          </div>
        )}

        {state.currentStep === 'upload' && (
          <FileUpload onUpload={handleFileUpload} />
        )}

        {state.currentStep === 'style' && (
          <StyleSelector
            onSelect={handleStyleSelect}
            filename={state.filename}
          />
        )}

        {state.currentStep === 'processing' && (
          <ProgressTracker
            progress={state.progress}
            filename={state.filename}
            style={state.selectedStyle}
          />
        )}

        {state.currentStep === 'complete' && state.formattedContent && (
          <DocumentActions
            content={state.formattedContent}
            filename={state.filename || 'document'}
            styleId={state.selectedStyle || 'default'}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}

export default App;

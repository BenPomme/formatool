import React, { useEffect, useState } from 'react';
import './ProgressTracker.css';

interface ProgressTrackerProps {
  progress: number;
  filename: string | null;
  style: string | null;
}

const ProgressTracker: React.FC<ProgressTrackerProps> = ({ progress, filename, style }) => {
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedProgress(progress);
    }, 100);
    return () => clearTimeout(timer);
  }, [progress]);

  const stages = [
    { name: 'Analyzing document', threshold: 20 },
    { name: 'Chunking content', threshold: 30 },
    { name: 'Processing with AI', threshold: 70 },
    { name: 'Checking conformity', threshold: 92 },
    { name: 'Finalizing document', threshold: 100 }
  ];

  const currentStage = stages.find(stage => animatedProgress <= stage.threshold) || stages[stages.length - 1];

  return (
    <div className="progress-tracker">
      <div className="progress-header">
        <h2>Formatting your document</h2>
        {filename && (
          <p className="progress-info">
            Processing <strong>{filename}</strong> with <strong>{style}</strong> style
          </p>
        )}
      </div>

      <div className="progress-container">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${animatedProgress}%` }}
          />
        </div>
        <div className="progress-percentage">{Math.round(animatedProgress)}%</div>
      </div>

      <div className="progress-stage">
        <div className="stage-icon">⚙️</div>
        <p>{currentStage.name}...</p>
      </div>

      <div className="progress-stages">
        {stages.map((stage, index) => (
          <div
            key={index}
            className={`stage-item ${animatedProgress >= stage.threshold ? 'completed' : ''}`}
          >
            <div className="stage-dot" />
            <span>{stage.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProgressTracker;
import React, { useEffect, useState } from 'react';
import './StyleSelector.css';

interface Style {
  id: string;
  name: string;
  description: string;
}

interface StyleSelectorProps {
  onSelect: (styleId: string) => void;
  filename: string | null;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ onSelect, filename }) => {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

  useEffect(() => {
    fetchStyles();
  }, []);

  const fetchStyles = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/format/styles');
      const data = await response.json();
      setStyles(data.styles);
    } catch (error) {
      console.error('Failed to fetch styles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStyleClick = (styleId: string) => {
    setSelectedStyle(styleId);
    setTimeout(() => onSelect(styleId), 300);
  };

  const styleIcons: { [key: string]: string } = {
    'business-memo': '📝',
    'book-manuscript': '📖',
    'sales-proposal': '💼',
    'academic-paper': '🎓',
    'legal-document': '⚖️',
    'technical-manual': '⚙️',
    'marketing-brief': '📢',
    'meeting-minutes': '📋'
  };

  if (loading) {
    return <div className="style-selector loading">Loading styles...</div>;
  }

  return (
    <div className="style-selector">
      <div className="style-header">
        <h2>Choose a formatting style</h2>
        {filename && (
          <p className="filename-display">for: <strong>{filename}</strong></p>
        )}
      </div>

      <div className="style-grid">
        {styles.map(style => (
          <div
            key={style.id}
            className={`style-card ${selectedStyle === style.id ? 'selected' : ''}`}
            onClick={() => handleStyleClick(style.id)}
          >
            <div className="style-icon">{styleIcons[style.id] || '📄'}</div>
            <h3>{style.name}</h3>
            <p>{style.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StyleSelector;
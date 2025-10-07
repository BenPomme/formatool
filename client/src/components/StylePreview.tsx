import React from 'react';
import { CheckCircle, Type, Palette, AlignLeft, Layout } from 'lucide-react';
import './StylePreview.css';

interface StylePreviewProps {
  styleData: any;
  sessionId: string;
  onProceed: () => void;
  onBack: () => void;
}

const StylePreview: React.FC<StylePreviewProps> = ({
  styleData,
  sessionId: _sessionId,
  onProceed,
  onBack
}) => {
  const { styleExtraction, reference, target } = styleData;
  const styles = styleExtraction?.simplifiedStyles;
  const rawDocxStyles = styleExtraction?.rawDocxStyles;

  const fontList: string[] = (rawDocxStyles?.fonts || []).filter((font: string) => typeof font === 'string' && font.trim().length > 0);
  const primaryFont = rawDocxStyles?.defaultFont || fontList[0] || styles?.font;
  const secondaryFonts = fontList.filter(font => font !== primaryFont);
  const primaryFontSize = rawDocxStyles?.defaultFontSize || styles?.fontSize;
  const primaryLineHeight = styles?.lineHeight || rawDocxStyles?.lineHeights?.[0];
  const paragraphSpacing = styles?.paragraphSpacing || rawDocxStyles?.paragraphSpacing?.after?.[0];
  const heading1Docx = rawDocxStyles?.headingStyles?.Heading1 || rawDocxStyles?.headingStyles?.['Heading 1'];
  const textColor = styles?.colors?.text || rawDocxStyles?.defaultColor || rawDocxStyles?.colors?.[0];
  const headingColor = styles?.colors?.heading || heading1Docx?.color || rawDocxStyles?.colors?.[0];
  const backgroundColor = styles?.colors?.background || '#FFFFFF';
  const fontDisplay = primaryFont || 'Not detected';
  const fontSizeDisplay = primaryFontSize ? `${primaryFontSize}pt` : 'Not detected';
  const lineHeightDisplay = primaryLineHeight ? primaryLineHeight : 'Not detected';
  const paragraphSpacingDisplay = paragraphSpacing ? `${paragraphSpacing}pt` : 'Not detected';
  const textColorDisplay = textColor || 'Not detected';
  const headingColorDisplay = headingColor || 'Not detected';
  const backgroundColorDisplay = backgroundColor || 'Not detected';
  const textColorSwatch = textColor || 'transparent';
  const headingColorSwatch = headingColor || 'transparent';
  const backgroundColorSwatch = backgroundColor || 'transparent';

  return (
    <div className="style-preview-container">
      <h2>Style Analysis Complete</h2>

      {/* Confidence Score */}
      <div className="confidence-section">
        <div className="confidence-meter">
          <div className="confidence-label">
            <CheckCircle size={20} />
            <span>Style Extraction Confidence</span>
          </div>
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${styleExtraction?.confidence || 0}%` }}
            />
          </div>
          <span className="confidence-value">
            {styleExtraction?.confidence || 0}%
          </span>
        </div>

        {styleExtraction?.warnings && styleExtraction.warnings.length > 0 && (
          <div className="warnings">
            <p>⚠️ Notes:</p>
            <ul>
              {styleExtraction.warnings.map((warning: string, index: number) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Document Info */}
      <div className="document-info">
        <div className="doc-card">
          <h3>📘 Reference Document</h3>
          <p className="doc-name">{reference?.fileName}</p>
          <div className="doc-stats">
            <span>{reference?.wordCount} words</span>
            <span>•</span>
            <span>{styleExtraction?.documentType || 'General'} format</span>
          </div>
        </div>

        <div className="doc-card">
          <h3>📄 Target Document</h3>
          <p className="doc-name">{target?.fileName}</p>
          <div className="doc-stats">
            <span>{target?.wordCount} words</span>
          </div>
        </div>
      </div>

      {/* Extracted Styles Preview */}
      {styles && (
        <div className="extracted-styles">
          <h3>Extracted Style Attributes</h3>

          <div className="style-grid">
            {/* Typography */}
            <div className="style-card">
              <div className="style-header">
                <Type size={20} />
                <h4>Typography</h4>
              </div>
              <ul>
                <li>Font: <span className="style-value">{fontDisplay}</span></li>
                {secondaryFonts.length > 0 && (
                  <li>Additional Fonts: <span className="style-value">{secondaryFonts.join(', ')}</span></li>
                )}
                <li>Size: <span className="style-value">{fontSizeDisplay}</span></li>
                <li>Line Height: <span className="style-value">{lineHeightDisplay}</span></li>
                <li>Paragraph Spacing: <span className="style-value">{paragraphSpacingDisplay}</span></li>
              </ul>
            </div>

            {/* Colors */}
            <div className="style-card">
              <div className="style-header">
                <Palette size={20} />
                <h4>Colors</h4>
              </div>
              <ul>
                <li>
                  Text:
                  <span className="color-preview" style={{ background: textColorSwatch }} />
                  <span className="style-value">{textColorDisplay}</span>
                </li>
                <li>
                  Headings:
                  <span className="color-preview" style={{ background: headingColorSwatch }} />
                  <span className="style-value">{headingColorDisplay}</span>
                </li>
                <li>
                  Background:
                  <span className="color-preview" style={{ background: backgroundColorSwatch }} />
                  <span className="style-value">{backgroundColorDisplay}</span>
                </li>
              </ul>
            </div>

            {/* Layout */}
            <div className="style-card">
              <div className="style-header">
                <Layout size={20} />
                <h4>Layout</h4>
              </div>
              <ul>
                <li>Top Margin: <span className="style-value">{styles.margins?.top}mm</span></li>
                <li>Bottom Margin: <span className="style-value">{styles.margins?.bottom}mm</span></li>
                <li>Left Margin: <span className="style-value">{styles.margins?.left}mm</span></li>
                <li>Right Margin: <span className="style-value">{styles.margins?.right}mm</span></li>
              </ul>
            </div>

            {/* Formatting */}
            <div className="style-card">
              <div className="style-header">
                <AlignLeft size={20} />
                <h4>Formatting</h4>
              </div>
              <ul>
                <li>List Style: <span className="style-value">{styles.listStyle}</span></li>
                {styles.headingStyles?.h1 && (
                  <li>H1 Size: <span className="style-value">{styles.headingStyles.h1.fontSize}pt</span></li>
                )}
                {styles.headingStyles?.h2 && (
                  <li>H2 Size: <span className="style-value">{styles.headingStyles.h2.fontSize}pt</span></li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="preview-actions">
        <button className="btn-secondary" onClick={onBack}>
          Choose Different Files
        </button>
        <button className="btn-primary" onClick={onProceed}>
          Apply These Styles
        </button>
      </div>
    </div>
  );
};

export default StylePreview;

interface ConformityResult {
  isConformant: boolean;
  originalWordCount: number;
  formattedWordCount: number;
  originalCharCount: number;
  formattedCharCount: number;
  missingContent: string[];
  addedContent: string[];
  conformityScore: number;
}

export class ConformityChecker {
  /**
   * Check if the formatted document contains all content from the original
   */
  checkConformity(originalContent: string, formattedContent: string): ConformityResult {
    // Clean and normalize texts for comparison
    const originalNormalized = this.normalizeText(originalContent);
    const formattedNormalized = this.normalizeText(formattedContent);

    // Get all words from both documents
    const originalWords = this.extractWords(originalNormalized);
    const formattedWords = this.extractWords(formattedNormalized);

    // Count characters (excluding formatting)
    const originalCharCount = originalNormalized.replace(/\s+/g, '').length;
    const formattedCharCount = formattedNormalized.replace(/\s+/g, '').length;

    // Find missing and added words
    const missingContent = this.findMissingContent(originalWords, formattedWords);
    const addedContent = this.findAddedContent(originalWords, formattedWords);

    // Calculate conformity score
    const conformityScore = this.calculateConformityScore(
      originalWords.length,
      formattedWords.length,
      missingContent.length,
      addedContent.length
    );

    // Check if all original content is preserved
    const isConformant = missingContent.length === 0 &&
                         Math.abs(originalCharCount - formattedCharCount) / originalCharCount < 0.05; // Allow 5% variation for formatting

    return {
      isConformant,
      originalWordCount: originalWords.length,
      formattedWordCount: formattedWords.length,
      originalCharCount,
      formattedCharCount,
      missingContent: missingContent.slice(0, 10), // Show first 10 missing words
      addedContent: addedContent.slice(0, 10), // Show first 10 added words
      conformityScore
    };
  }

  /**
   * Normalize text by removing formatting markers and extra whitespace
   */
  private normalizeText(text: string): string {
    return text
      // Remove markdown formatting
      .replace(/#{1,6}\s*/g, '') // Headers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // Bold/italic
      .replace(/`([^`]+)`/g, '$1') // Code blocks
      .replace(/^[-*+]\s*/gm, '') // Bullet points
      .replace(/^\d+\.\s*/gm, '') // Numbered lists
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Extract words from text
   */
  private extractWords(text: string): string[] {
    return text
      .split(/\s+/)
      .filter(word => word.length > 0)
      .map(word => word.replace(/[^\w\s'-]/g, '')) // Keep words, apostrophes, hyphens
      .filter(word => word.length > 0);
  }

  /**
   * Find words that are in original but not in formatted
   */
  private findMissingContent(originalWords: string[], formattedWords: string[]): string[] {
    const formattedSet = new Set(formattedWords);
    const missing: string[] = [];

    for (const word of originalWords) {
      if (!formattedSet.has(word)) {
        missing.push(word);
        formattedSet.delete(word); // Remove to avoid counting duplicates
      }
    }

    return missing;
  }

  /**
   * Find words that are in formatted but not in original
   */
  private findAddedContent(originalWords: string[], formattedWords: string[]): string[] {
    const originalSet = new Set(originalWords);
    const added: string[] = [];

    for (const word of formattedWords) {
      if (!originalSet.has(word)) {
        added.push(word);
        originalSet.delete(word); // Remove to avoid counting duplicates
      }
    }

    return added;
  }

  /**
   * Calculate a conformity score (0-100)
   */
  private calculateConformityScore(
    originalCount: number,
    formattedCount: number,
    missingCount: number,
    addedCount: number
  ): number {
    if (originalCount === 0) return 100;

    const preservationRate = Math.max(0, 1 - (missingCount / originalCount));
    const additionPenalty = Math.max(0, 1 - (addedCount / originalCount));

    // Weight preservation more heavily than additions
    const score = (preservationRate * 0.7 + additionPenalty * 0.3) * 100;

    return Math.round(Math.min(100, Math.max(0, score)));
  }

  /**
   * Generate a detailed conformity report
   */
  generateReport(result: ConformityResult): string {
    const status = result.isConformant ? '✅ CONFORMANT' : '⚠️ NON-CONFORMANT';

    let report = `\nContent Conformity Check ${status}\n`;
    report += `${'='.repeat(40)}\n\n`;

    report += `📊 Statistics:\n`;
    report += `  Original words: ${result.originalWordCount}\n`;
    report += `  Formatted words: ${result.formattedWordCount}\n`;
    report += `  Word difference: ${result.formattedWordCount - result.originalWordCount}\n`;
    report += `  Character preservation: ${((result.formattedCharCount / result.originalCharCount) * 100).toFixed(1)}%\n`;
    report += `  Conformity score: ${result.conformityScore}%\n\n`;

    if (result.missingContent.length > 0) {
      report += `⚠️ Missing words (first 10):\n`;
      report += `  ${result.missingContent.join(', ')}\n\n`;
    }

    if (result.addedContent.length > 0) {
      report += `➕ Added words (first 10):\n`;
      report += `  ${result.addedContent.join(', ')}\n\n`;
    }

    if (result.isConformant) {
      report += `✅ All original content has been preserved!\n`;
    } else {
      report += `⚠️ Content differences detected. Please review the formatting.\n`;
    }

    return report;
  }
}

export const conformityChecker = new ConformityChecker();
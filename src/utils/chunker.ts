import { encoding_for_model, type Tiktoken } from '@dqbd/tiktoken';
import { DocumentChunk } from '../types';
import { v4 as uuidv4 } from 'uuid';

// GPT-5-nano has 400k context window, we can use much larger chunks
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS_PER_REQUEST || '8000');
const OVERLAP_TOKENS = 50;
// Use gpt-4 encoding as fallback since gpt-5-nano might not be in tiktoken yet
let encoder: Tiktoken;
try {
  encoder = encoding_for_model('gpt-5-nano' as any);
} catch {
  encoder = encoding_for_model('gpt-4');
}

export async function chunkDocument(content: string): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentChunk = '';
  let currentTokenCount = 0;
  let chunkOrder = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = countTokens(paragraph);

    if (paragraphTokens > MAX_TOKENS) {
      if (currentChunk) {
        chunks.push(createChunk(currentChunk, currentTokenCount, chunkOrder++));
        currentChunk = '';
        currentTokenCount = 0;
      }

      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentenceTokens = countTokens(sentence);

        if (currentTokenCount + sentenceTokens > MAX_TOKENS) {
          if (currentChunk) {
            chunks.push(createChunk(currentChunk, currentTokenCount, chunkOrder++));
            currentChunk = sentence;
            currentTokenCount = sentenceTokens;
          }
        } else {
          currentChunk += (currentChunk ? ' ' : '') + sentence;
          currentTokenCount += sentenceTokens;
        }
      }
    } else if (currentTokenCount + paragraphTokens > MAX_TOKENS) {
      chunks.push(createChunk(currentChunk, currentTokenCount, chunkOrder++));
      currentChunk = paragraph;
      currentTokenCount = paragraphTokens;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokenCount += paragraphTokens;
    }
  }

  if (currentChunk) {
    chunks.push(createChunk(currentChunk, currentTokenCount, chunkOrder++));
  }

  return chunks;
}

function countTokens(text: string): number {
  try {
    const tokens = encoder.encode(text);
    return tokens.length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

function createChunk(content: string, tokenCount: number, order: number): DocumentChunk {
  return {
    id: uuidv4(),
    content,
    tokenCount,
    order
  };
}

import OpenAI from 'openai';

export function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing. Please set it in your .env file');
  }
  return new OpenAI({ apiKey });
}

// Different models for different tasks
export const OPENAI_MODELS = {
  ANALYSIS: process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4.1-nano-2025-04-14',  // GPT-4.1 for document analysis
  FORMATTING: process.env.OPENAI_FORMATTING_MODEL || 'gpt-5-nano-2025-08-07',    // GPT-5 nano for fast formatting
  STYLE_EXTRACTION: process.env.OPENAI_STYLE_MODEL || 'gpt-4.1-nano-2025-04-14'  // GPT-4.1 for style extraction
};

// Legacy export for backward compatibility
export const OPENAI_MODEL = OPENAI_MODELS.FORMATTING;
export const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 30000);
export const MAX_TOKENS_PER_REQUEST = parseInt(process.env.MAX_TOKENS_PER_REQUEST || '3000');
export const FORMAT_CONCURRENCY = Number(process.env.FORMAT_CONCURRENCY || 4);
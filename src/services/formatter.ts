import { DocumentChunk, FormattingStyle } from '../types';
import { progressTracker } from './progressTracker';
import { getOpenAIClient, OPENAI_MODEL, OPENAI_TIMEOUT_MS } from './openaiClient';

export async function formatDocument(
  chunks: DocumentChunk[],
  style: FormattingStyle,
  jobId?: string
): Promise<DocumentChunk[]> {
  const formattedChunks: DocumentChunk[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (jobId) {
      progressTracker.setFormatting(jobId, i + 1, chunks.length);
    }

    try {
      const formattedContent = await formatChunk(chunk.content, style);
      formattedChunks.push({
        ...chunk,
        content: formattedContent
      });

      console.log(`Formatted chunk ${chunk.order + 1}/${chunks.length}`);
    } catch (error) {
      console.error(`Error formatting chunk ${chunk.order}:`, error);
      throw new Error(`Failed to format chunk ${chunk.order}: ${error}`);
    }
  }

  return formattedChunks;
}

async function formatChunk(content: string, style: FormattingStyle): Promise<string> {
  try {
    const openai = getOpenAIClient();

    // Count original words for validation
    const originalWordCount = content.trim().split(/\s+/).length;
    console.log(`  - Calling OpenAI with style: ${style.name}`);
    console.log(`  - Original word count: ${originalWordCount}`);

    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: style.systemPrompt
        },
        {
          role: 'user',
          content: `CRITICAL: You must return EVERY SINGLE WORD from the following text. Apply proper markdown formatting based on the style guide. Use:
- # for main titles
- ## for chapter headings
- ### for sections
- #### for subsections
- **bold** for emphasis
- * or - for bullet points
- 1. for numbered lists
- > for quotes
- --- for horizontal rules

DO NOT summarize, shorten, or remove any content. Only add formatting.

Text to format:
${content}

Remember: Return 100% of the above text with markdown formatting applied.`
        }
      ],
      temperature: 0,
      max_tokens: 8000
    });

    const formattedContent = response.choices[0]?.message?.content || content;
    console.log(`  - Response received, length: ${formattedContent.length}`);

    // Validate that we got content back
    const formattedWordCount = formattedContent.trim().split(/\s+/).length;
    console.log(`  - Formatted word count: ${formattedWordCount}`);
    console.log(`  - Content changed: ${formattedContent !== content}`);

    // If we lost more than 5% of words, something went wrong (stricter threshold)
    if (formattedWordCount < originalWordCount * 0.95) {
      console.error(`⚠️ Content loss detected! Original: ${originalWordCount} words, Formatted: ${formattedWordCount} words`);
      console.log('Returning original content unformatted to preserve data');
      return content; // Return original to prevent data loss
    }

    return formattedContent;
  } catch (error) {
    console.error('❌ OpenAI API error:', error);
    console.log('⚠️ Returning original content to prevent data loss');
    // On error, return original content to prevent data loss
    return content;
  }
}
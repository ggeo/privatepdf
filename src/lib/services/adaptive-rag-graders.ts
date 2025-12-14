/**
 * Adaptive RAG Graders
 * LLM-based grading for retrieval quality, answer quality, and hallucination detection
 * Uses the same LLM that the user has activated (light/medium/large)
 */

import { ollamaService } from './ollama-service';
import type { SearchResult } from './semantic-search';

export interface GradeResult {
  passed: boolean;
  score: number; // 0-1
  reasoning: string;
}

/**
 * Retrieval Grader: Check if retrieved documents are relevant to the query
 * Uses LLM to evaluate relevance (binary yes/no)
 */
export async function gradeRetrieval(
  query: string,
  documents: SearchResult[],
  model: string
): Promise<GradeResult> {
  if (documents.length === 0 || !documents[0]) {
    return {
      passed: false,
      score: 0,
      reasoning: 'No documents retrieved',
    };
  }

  const topDoc = documents[0];

  const prompt = `You are a grader assessing relevance of a retrieved document to a user question.

Retrieved Document:
${topDoc.chunk.text}

User Question: ${query}

Give a binary score 'yes' or 'no' to indicate whether the document is relevant to the question.
Answer with ONLY 'yes' or 'no'.`;

  try {
    const response = await ollamaService.chatSync(
      [
        {
          role: 'system',
          content: 'You are a document relevance grader. Answer with only yes or no.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        model, // Use the user's activated model
        temperature: 0.0, // Deterministic
        maxTokens: 10, // Very short response
      }
    );

    const lowerResponse = response.toLowerCase().trim();
    const passed = lowerResponse.includes('yes');

    return {
      passed,
      score: passed ? 1 : 0,
      reasoning: passed ? 'Document is relevant to query' : 'Document not relevant to query',
    };
  } catch (error) {
    console.error('Retrieval grading failed:', error);
    // On error, assume documents are relevant (fail-open)
    return {
      passed: true,
      score: 0.5,
      reasoning: 'Grading failed - assuming relevance',
    };
  }
}

/**
 * Answer Grader: Check if the answer addresses the question
 * Uses LLM to evaluate if answer is useful (binary yes/no)
 */
export async function gradeAnswer(
  query: string,
  answer: string,
  model: string
): Promise<GradeResult> {
  const prompt = `You are a grader assessing whether an answer addresses a user question.

User Question: ${query}

Generated Answer: ${answer}

Give a binary score 'yes' or 'no' to indicate whether the answer addresses the question.
Answer with ONLY 'yes' or 'no'.`;

  try {
    const response = await ollamaService.chatSync(
      [
        {
          role: 'system',
          content: 'You are an answer quality grader. Answer with only yes or no.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        model,
        temperature: 0.0,
        maxTokens: 10,
      }
    );

    const lowerResponse = response.toLowerCase().trim();
    const passed = lowerResponse.includes('yes');

    return {
      passed,
      score: passed ? 1 : 0,
      reasoning: passed ? 'Answer addresses the question' : 'Answer does not address the question',
    };
  } catch (error) {
    console.error('Answer grading failed:', error);
    return {
      passed: true,
      score: 0.5,
      reasoning: 'Grading failed - assuming answer is adequate',
    };
  }
}

/**
 * Hallucination Grader: Check if the answer is grounded in the retrieved documents
 * Uses LLM to check if answer is supported by facts (binary yes/no)
 */
export async function gradeHallucination(
  answer: string,
  documents: SearchResult[],
  model: string
): Promise<GradeResult> {
  if (documents.length === 0) {
    // No documents to ground in - this is acceptable for no-retrieval queries
    return {
      passed: true,
      score: 1,
      reasoning: 'No retrieval documents - using LLM knowledge',
    };
  }

  const docTexts = documents.slice(0, 3).map((d, i) => `Document ${i + 1}:\n${d.chunk.text}`).join('\n\n');

  const prompt = `You are a grader assessing whether an answer is grounded in / supported by a set of facts.

Facts:
${docTexts}

Generated Answer: ${answer}

Give a binary score 'yes' or 'no':
- 'yes' means the answer is grounded in the facts
- 'no' means the answer contains information not found in the facts (hallucination)

Answer with ONLY 'yes' or 'no'.`;

  try {
    const response = await ollamaService.chatSync(
      [
        {
          role: 'system',
          content: 'You are a hallucination detector. Answer with only yes or no.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      {
        model,
        temperature: 0.0,
        maxTokens: 10,
      }
    );

    const lowerResponse = response.toLowerCase().trim();
    const passed = lowerResponse.includes('yes');

    return {
      passed,
      score: passed ? 1 : 0,
      reasoning: passed ? 'Answer is grounded in documents' : 'Answer contains hallucinations',
    };
  } catch (error) {
    console.error('Hallucination grading failed:', error);
    return {
      passed: true,
      score: 0.5,
      reasoning: 'Grading failed - assuming answer is grounded',
    };
  }
}

/**
 * Run all graders and return combined result
 */
export async function gradeRAGResponse(
  query: string,
  answer: string,
  documents: SearchResult[],
  model: string
): Promise<{
  retrieval: GradeResult;
  answer: GradeResult;
  hallucination: GradeResult;
  overallPassed: boolean;
}> {
  const [retrieval, answerGrade, hallucination] = await Promise.all([
    documents.length > 0 ? gradeRetrieval(query, documents, model) : Promise.resolve({ passed: true, score: 1, reasoning: 'No retrieval needed' }),
    gradeAnswer(query, answer, model),
    gradeHallucination(answer, documents, model),
  ]);

  const overallPassed = retrieval.passed && answerGrade.passed && hallucination.passed;

  return {
    retrieval,
    answer: answerGrade,
    hallucination,
    overallPassed,
  };
}

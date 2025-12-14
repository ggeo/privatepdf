/**
 * Query Classifier for Adaptive RAG
 * Classifies user queries to determine optimal retrieval strategy
 */

export type QueryType = 'factual' | 'analytical' | 'exploratory' | 'conversational';

export type QueryComplexity = 'simple' | 'moderate' | 'complex';

export type RetrievalMode = 'no_retrieval' | 'single_step' | 'multi_step';

export interface QueryClassification {
  type: QueryType;
  complexity: QueryComplexity;
  retrievalMode: RetrievalMode;
  confidence: number;
  reasoning: string;
}

export interface RetrievalStrategy {
  mode: RetrievalMode;
  topK: number;
  minSimilarity: number;
  mmrLambda: number;
  temperature: number;
  maxTokens: number;
}

/**
 * Classify a query based on patterns and keywords
 * This is a fast, rule-based classifier (no LLM call needed)
 * @param query - The user's query text
 * @param hasDocuments - Whether user has documents selected (prevents no_retrieval classification)
 */
export function classifyQuery(query: string, hasDocuments: boolean = false): QueryClassification {
  const lowerQuery = query.toLowerCase().trim();

  // Factual patterns: seeking specific information
  const factualPatterns = [
    /^what is/i,
    /^define/i,
    /^who is/i,
    /^when (did|was)/i,
    /^where (is|was)/i,
    /article \d+/i,
    /page \d+/i,
    /section \d+/i,
    /specific/i,
  ];

  // Analytical patterns: requiring deep explanation
  const analyticalPatterns = [
    /^explain/i,
    /^describe/i,
    /^how (does|do|can)/i,
    /^why/i,
    /compare/i,
    /analyze/i,
    /relationship between/i,
    /impact of/i,
  ];

  // Exploratory patterns: seeking comprehensive overview
  const exploratoryPatterns = [
    /^(list|tell me).*all/i,
    /what are (all|the)/i,
    /give me (all|everything)/i,
    /comprehensive/i,
    /overview/i,
    /summarize/i,
    /summary/i,
  ];

  // Conversational patterns: follow-up or vague
  const conversationalPatterns = [
    /^(and|also|what about)/i,
    /^tell me more/i,
    /^continue/i,
    /^anything else/i,
    /^can you/i,
    query.length < 20, // Very short queries tend to be conversational
  ];

  // Score each type
  let factualScore = 0;
  let analyticalScore = 0;
  let exploratoryScore = 0;
  let conversationalScore = 0;

  factualPatterns.forEach(pattern => {
    if (typeof pattern === 'boolean') {
      if (pattern) factualScore++;
    } else if (pattern.test(query)) {
      factualScore++;
    }
  });

  analyticalPatterns.forEach(pattern => {
    if (pattern.test(query)) analyticalScore++;
  });

  exploratoryPatterns.forEach(pattern => {
    if (pattern.test(query)) exploratoryScore++;
  });

  conversationalPatterns.forEach(pattern => {
    if (typeof pattern === 'boolean') {
      if (pattern) conversationalScore++;
    } else if (pattern.test(query)) {
      conversationalScore++;
    }
  });

  // Determine type based on highest score
  const scores = [
    { type: 'factual' as QueryType, score: factualScore },
    { type: 'analytical' as QueryType, score: analyticalScore },
    { type: 'exploratory' as QueryType, score: exploratoryScore },
    { type: 'conversational' as QueryType, score: conversationalScore },
  ];

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];

  // Safety check - should never happen but TypeScript needs it
  if (!winner) {
    return {
      type: 'conversational',
      complexity: 'moderate',
      retrievalMode: 'single_step',
      confidence: 0.5,
      reasoning: 'Unable to classify query - using default conversational strategy',
    };
  }

  // Calculate confidence based on score difference
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const confidence = totalScore > 0 ? winner.score / totalScore : 0.5;

  // Determine complexity and retrieval mode
  let { complexity, retrievalMode } = determineComplexity(query, winner.type);

  // CRITICAL FIX: If user has documents selected, NEVER skip retrieval
  // This prevents the bug where short queries like "summarize" bypass document search
  if (hasDocuments && retrievalMode === 'no_retrieval') {
    console.log('⚠️ Query classifier override: User has documents selected - forcing retrieval');
    console.log('   Original classification:', { complexity, retrievalMode });
    retrievalMode = 'single_step';
    // Upgrade complexity to ensure proper parameter selection
    if (complexity === 'simple') {
      complexity = 'moderate';
    }
    console.log('   Overridden classification:', { complexity, retrievalMode });
  }

  const reasoning = getReasoningForType(winner.type, query, complexity, retrievalMode);

  return {
    type: winner.type,
    complexity,
    retrievalMode,
    confidence,
    reasoning,
  };
}

/**
 * Determine query complexity and appropriate retrieval mode
 * Based on Adaptive RAG paper: simple -> no retrieval, moderate -> single-step, complex -> multi-step
 */
function determineComplexity(query: string, queryType: QueryType): {
  complexity: QueryComplexity;
  retrievalMode: RetrievalMode;
} {
  const lowerQuery = query.toLowerCase();

  // Simple queries: Can be answered with LLM's internal knowledge
  const simplePatterns = [
    query.length < 15, // Very short queries
    /^(what is|define|who is) (a|an|the)?\s?\w+\??$/i.test(query), // "What is X?"
    /^(hi|hello|hey|thanks|thank you)/i.test(query), // Greetings
    /^\d+\s*[\+\-\*\/]\s*\d+/i.test(query), // Simple math: "2+2"
    /^(yes|no|ok|okay|continue)/i.test(query), // Confirmations
  ];

  // Complex queries: Require multi-hop reasoning or multiple sources
  const complexPatterns = [
    /compare.*(?:and|with|versus|vs)/i.test(query), // Comparisons
    /explain.*(?:why|how).*(?:and|also)/i.test(query), // Multi-part explanations
    /(analyze|evaluate|assess).*relationship/i.test(query), // Relationship analysis
    /(?:list|describe|explain).*(?:all|every|each)/i.test(query), // Comprehensive lists
    query.split(/[?.!]/).length > 2, // Multiple sentences/questions
    query.length > 100, // Very long queries
  ];

  const isSimple = simplePatterns.some(p => (typeof p === 'boolean' ? p : p));
  const isComplex = complexPatterns.some(p => p);

  if (isSimple) {
    return {
      complexity: 'simple',
      retrievalMode: 'no_retrieval',
    };
  }

  if (isComplex) {
    return {
      complexity: 'complex',
      retrievalMode: 'multi_step',
    };
  }

  // Default: moderate complexity with single-step retrieval
  return {
    complexity: 'moderate',
    retrievalMode: 'single_step',
  };
}

/**
 * Get optimal retrieval strategy for query type
 */
export function getRetrievalStrategy(
  queryType: QueryType,
  retrievalMode: RetrievalMode
): RetrievalStrategy {
  // Base strategy on query type
  let baseStrategy: Omit<RetrievalStrategy, 'mode'>;

  switch (queryType) {
    case 'factual':
      baseStrategy = {
        topK: 8,
        minSimilarity: 0.55,
        mmrLambda: 0.9,
        temperature: 0.3,
        maxTokens: 4096,
      };
      break;
    case 'analytical':
      baseStrategy = {
        topK: 12,
        minSimilarity: 0.45,
        mmrLambda: 0.75,
        temperature: 0.4,
        maxTokens: 8192,
      };
      break;
    case 'exploratory':
      baseStrategy = {
        topK: 18,
        minSimilarity: 0.35,
        mmrLambda: 0.6,
        temperature: 0.5,
        maxTokens: 12288,
      };
      break;
    case 'conversational':
      baseStrategy = {
        topK: 10,
        minSimilarity: 0.4,
        mmrLambda: 0.7,
        temperature: 0.45,
        maxTokens: 6144,
      };
      break;
    default:
      baseStrategy = {
        topK: 10,
        minSimilarity: 0.45,
        mmrLambda: 0.85,
        temperature: 0.4,
        maxTokens: 8192,
      };
  }

  // Adjust based on retrieval mode
  if (retrievalMode === 'multi_step') {
    // Multi-step needs more results per iteration
    baseStrategy.topK = Math.min(baseStrategy.topK + 5, 20);
    baseStrategy.maxTokens = Math.min(baseStrategy.maxTokens * 1.5, 16384);
  }

  return {
    mode: retrievalMode,
    ...baseStrategy,
  };
}

function getReasoningForType(
  type: QueryType,
  query: string,
  complexity: QueryComplexity,
  retrievalMode: RetrievalMode
): string {
  const typeReason = {
    factual: 'specific factual information',
    analytical: 'deep explanation',
    exploratory: 'broad overview',
    conversational: 'conversational follow-up',
  }[type];

  const modeReason = {
    no_retrieval: 'Using LLM knowledge only (no document retrieval needed)',
    single_step: 'Single-step retrieval',
    multi_step: 'Multi-step iterative retrieval for comprehensive answer',
  }[retrievalMode];

  return `Query seeks ${typeReason} (${complexity} complexity). ${modeReason}.`;
}

/**
 * Check if retrieval results are sufficient for the query
 * Returns true if we should proceed, false if we need fallback
 */
export function checkRetrievalSufficiency(
  results: Array<{ similarity: number }>,
  queryType: QueryType
): { sufficient: boolean; reason: string } {
  if (results.length === 0) {
    return {
      sufficient: false,
      reason: 'No results found - retrieval failed',
    };
  }

  // Get minimum expected similarity based on query type
  const minExpectedSimilarity = {
    factual: 0.6, // Factual queries need high confidence
    analytical: 0.5, // Analytical can work with medium
    exploratory: 0.4, // Exploratory is more forgiving
    conversational: 0.45,
  }[queryType];

  const topResult = results[0];

  // Safety check - should never happen since we already checked length > 0
  if (!topResult) {
    return {
      sufficient: false,
      reason: 'No top result available',
    };
  }

  if (topResult.similarity < minExpectedSimilarity) {
    return {
      sufficient: false,
      reason: `Top result similarity (${topResult.similarity.toFixed(2)}) below threshold (${minExpectedSimilarity})`,
    };
  }

  // Check if we have enough diverse results for exploratory queries
  if (queryType === 'exploratory' && results.length < 5) {
    return {
      sufficient: false,
      reason: 'Exploratory query needs at least 5 diverse results',
    };
  }

  return {
    sufficient: true,
    reason: 'Retrieval results are sufficient for query type',
  };
}

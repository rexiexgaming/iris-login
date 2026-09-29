/**
 * IRIS - RAG Engine Module
 * Implements client-side text chunking and Okapi BM25 ranking for document retrieval.
 */

export class RAGEngine {
  constructor() {
    this.pages = [];
    this.avgDocLength = 0;
    this.N = 0; // Total pages
    this.idfCache = {};
    this.k1 = 1.2; // BM25 tuning parameter (term saturation)
    this.b = 0.75; // BM25 tuning parameter (document length normalization)
  }

  /**
   * Indexes pages of a parsed PDF.
   * @param {Array} pages Array of { pageNum, text, wordCount }
   */
  indexDocument(pages) {
    this.pages = pages.map(p => {
      const tokens = this.tokenize(p.text);
      const termFreqs = {};
      tokens.forEach(token => {
        termFreqs[token] = (termFreqs[token] || 0) + 1;
      });
      
      return {
        pageNum: p.pageNum,
        text: p.text,
        dl: tokens.length, // page document length
        termFreqs
      };
    });

    this.N = this.pages.length;
    
    // Calculate average document (page) length
    const totalLength = this.pages.reduce((sum, p) => sum + p.dl, 0);
    this.avgDocLength = this.N > 0 ? totalLength / this.N : 0;
    
    // Precompute IDF for all terms in the document
    this.precomputeIDF();
  }

  /**
   * Tokenizer: lowers case, removes punctuation, filters empty strings.
   */
  tokenize(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // remove punctuation except hyphens
      .split(/\s+/)
      .filter(token => token.length > 1); // skip single-character terms (a, I, etc.) or empty
  }

  /**
   * Precomputes Inverse Document Frequency (IDF) for all tokens in corpus.
   */
  precomputeIDF() {
    this.idfCache = {};
    const df = {}; // document frequency (number of pages containing term)

    this.pages.forEach(page => {
      const termsInPage = Object.keys(page.termFreqs);
      termsInPage.forEach(term => {
        df[term] = (df[term] || 0) + 1;
      });
    });

    // Compute BM25 adapted IDF
    Object.keys(df).forEach(term => {
      const n = df[term];
      // BM25 IDF formula with smoothing to avoid negative values
      this.idfCache[term] = Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
    });
  }

  /**
   * Retrieves top N pages matching the query based on BM25 score.
   * @param {string} query Search query string.
   * @param {number} topK Maximum pages to retrieve. Default is 5.
   * @returns {Array} List of retrieved page items with pageNum, text, and score.
   */
  retrieve(query, topK = 5) {
    if (!query || this.N === 0) return [];
    
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      // Fallback: return first page or empty
      return this.pages.slice(0, Math.min(topK, this.N)).map(p => ({
        pageNum: p.pageNum,
        text: p.text,
        score: 0
      }));
    }

    const scores = [];

    this.pages.forEach(page => {
      let score = 0;
      
      queryTokens.forEach(token => {
        const idf = this.idfCache[token] || 0;
        const tf = page.termFreqs[token] || 0;
        
        if (tf > 0) {
          // BM25 scoring formula
          const numerator = tf * (this.k1 + 1);
          const denominator = tf + this.k1 * (1 - this.b + this.b * (page.dl / this.avgDocLength));
          score += idf * (numerator / denominator);
        }
      });

      if (score > 0) {
        scores.push({
          pageNum: page.pageNum,
          text: page.text,
          score
        });
      }
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // If we have fewer matches than topK, pad with top scores or return what we have
    if (scores.length === 0) {
      // Fallback: return first pages
      return this.pages.slice(0, Math.min(topK, this.N)).map(p => ({
        pageNum: p.pageNum,
        text: p.text,
        score: 0
      }));
    }

    return scores.slice(0, topK);
  }

  /**
   * Dynamic Retrieval Mode Helper: determines whether document is small enough 
   * to send in full, or if RAG is required.
   * @param {number} wordLimit The threshold above which we use chunk retrieval.
   * @returns {boolean} True if RAG should be activated.
   */
  isRetrievalRequired(wordLimit = 35000) {
    const totalWords = this.pages.reduce((sum, p) => sum + p.dl, 0);
    return totalWords > wordLimit;
  }
}

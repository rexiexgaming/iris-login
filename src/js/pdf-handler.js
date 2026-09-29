/**
 * IRIS - PDF Handler Module
 * Handles loading and parsing PDF files client-side using PDF.js.
 */

// Set worker source URL to match the core library version loaded via CDN
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export class PDFHandler {
  constructor() {
    this.pdfjsLib = window.pdfjsLib;
    if (!this.pdfjsLib) {
      console.error('PDF.js library was not loaded. Make sure the script tag is present.');
    }
  }

  /**
   * Reads a file and extracts text page by page.
   * @param {File} file The PDF file object from input.
   * @param {Function} onProgress Optional callback for progress updates.
   * @returns {Promise<Object>} Object containing parsed pages and stats.
   */
  async parsePDF(file, onProgress) {
    if (!this.pdfjsLib) {
      throw new Error('PDF.js library is not available.');
    }

    const arrayBuffer = await this.readFileAsArrayBuffer(file);
    
    // Load the PDF document
    const loadingTask = this.pdfjsLib.getDocument({ data: arrayBuffer });
    
    // Track loading progress if provided
    loadingTask.onProgress = (progressData) => {
      if (onProgress && progressData.total > 0) {
        const percent = Math.round((progressData.loaded / progressData.total) * 50); // first 50% for loading file
        onProgress(percent);
      }
    };

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pages = [];
    let totalChars = 0;
    let totalWords = 0;

    // Extract text from each page
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      
      // Reconstruction of text blocks
      let lastY = null;
      let textItems = [];
      
      for (const item of textContent.items) {
        // Simple heuristic: add newlines for separate lines/y-coordinates
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 8) {
          textItems.push('\n');
        }
        textItems.push(item.str);
        // Sometimes text elements need spacing
        if (item.hasNeLine === false && !item.str.endsWith(' ')) {
          textItems.push(' ');
        }
        lastY = item.transform[5];
      }
      
      // Clean and normalize text
      const pageRawText = textItems.join('');
      const cleanPageText = this.cleanExtractedText(pageRawText);
      
      const charCount = cleanPageText.length;
      const wordCount = cleanPageText.split(/\s+/).filter(w => w.length > 0).length;

      pages.push({
        pageNum: i,
        text: cleanPageText,
        charCount,
        wordCount
      });

      totalChars += charCount;
      totalWords += wordCount;

      if (onProgress) {
        const percent = 50 + Math.round((i / numPages) * 50); // next 50% for parsing pages
        onProgress(percent);
      }
    }

    return {
      fileName: file.name,
      fileSize: file.size,
      totalPages: numPages,
      pages,
      totalChars,
      totalWords
    };
  }

  /**
   * Helper to read file as ArrayBuffer.
   */
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Cleans white spaces and weird unicode characters from parsed PDF text.
   */
  cleanExtractedText(text) {
    if (!text) return '';
    const cleaned = text
      .replace(/[\r\v\f]/g, '\n')                // normalize breaks
      .replace(/[ \t]+/g, ' ')                  // collapse horizontal whitespace
      .replace(/\n\s*\n/g, '\n\n')              // limit consecutive newlines
      .trim();

    return this.removeMCQs(cleaned);
  }

  /**
   * Identifies and filters out multiple-choice questions (MCQs) and their choices.
   */
  removeMCQs(text) {
    const lines = text.split('\n');
    const resultLines = [];
    const choiceRegex = /^\s*([A-Ed-e]|[a-ed-e])\s*[\.\)]\s+/;
    const bracketChoiceRegex = /^\s*\(([A-Ed-e]|[a-ed-e])\)\s+/;
    const inlineMCQRegex = /([A-Da-d]|[a-da-d])\s*[\.\)]\s+.*?\s+([B-Eb-e]|[b-eb-e])\s*[\.\)]\s+.*?\s+([C-Fc-f]|[c-fc-f])\s*[\.\)]\s+/;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();

      if (!line) {
        resultLines.push(lines[i]);
        i++;
        continue;
      }

      // 1. Check for inline MCQ on this single line
      if (inlineMCQRegex.test(line)) {
        console.log(`Ignoring inline MCQ line: "${line.substring(0, 60)}..."`);
        i++;
        continue;
      }

      // 2. Lookahead block check for multi-line MCQ
      let choiceLinesFound = 0;
      let peekIndex = 1;
      let totalLengthOfChoices = 0;
      let hasQuestionIndicator = line.includes('?') || 
                                 /^\s*(question|q\d+|mcq)/i.test(line) ||
                                 /\b(which|what|how|who|why|choose|select)\b/i.test(line);

      while (i + peekIndex < lines.length && peekIndex <= 6) {
        const nextLine = lines[i + peekIndex].trim();
        if (!nextLine) {
          peekIndex++;
          continue;
        }

        if (choiceRegex.test(nextLine) || bracketChoiceRegex.test(nextLine)) {
          choiceLinesFound++;
          totalLengthOfChoices += nextLine.length;
        }
        peekIndex++;
      }

      // If we found choices and either they are short or we have a question mark/indicator
      const avgChoiceLength = choiceLinesFound > 0 ? totalLengthOfChoices / choiceLinesFound : 0;
      const isShortChoices = avgChoiceLength < 120; // typical MCQ choices are short
      
      if (choiceLinesFound >= 2 && (hasQuestionIndicator || isShortChoices)) {
        console.log(`Ignoring MCQ block starting at line: "${line.substring(0, 60)}..."`);
        // Skip current question line and all peeked lines
        i += peekIndex;

        // Skip any trailing choices that went past our 6-line peek window
        while (i < lines.length) {
          const nextLine = lines[i].trim();
          if (nextLine && (choiceRegex.test(nextLine) || bracketChoiceRegex.test(nextLine))) {
            i++;
          } else {
            break;
          }
        }
        continue;
      }

      // 3. Skip individual choice lines if they are orphans (choice letters on their own line)
      if ((choiceRegex.test(line) || bracketChoiceRegex.test(line)) && line.length < 80) {
        i++;
        continue;
      }

      resultLines.push(lines[i]);
      i++;
    }

    return resultLines.join('\n');
  }
}

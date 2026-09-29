/**
 * IRIS - UI Manager Module
 * Coordinates all DOM interaction, chat updates, modal panels, search highlights, and event mapping.
 */

export class UIManager {
  constructor(callbacks = {}) {
    this.callbacks = callbacks; // e.g. onSaveApiKey, onUploadPdf, onSubmitChat
    
    // Cache DOM Elements
    this.dom = {
      // Setup elements removed

      authGate: document.getElementById('authGate'),
      authGateMessage: document.getElementById('authGateMessage'),
      googleSignInButton: document.getElementById('googleSignInButton'),
      userPill: document.getElementById('userPill'),
      userEmail: document.getElementById('userEmail'),
      usagePill: document.getElementById('usagePill'),

      // Chat Elements
      chatMessages: document.getElementById('chatMessages'),
      clearChatBtn: document.getElementById('clearChatBtn'),
      welcomeDocName: document.getElementById('welcomeDocName'),
      chatForm: document.getElementById('chatForm'),
      chatInput: document.getElementById('chatInput'),
      sendBtn: document.getElementById('sendBtn'),
      tokenUsage: document.getElementById('tokenUsage'),
      suggestChips: document.querySelectorAll('.suggest-chip'),
      
      // Settings Modal removed
    };

    this.initEventListeners();
    this.initTextareaAutoGrow();
  }

  /**
   * Bind event handlers to DOM elements.
   */
  initEventListeners() {
    // Setup UI event listeners removed

    // Clear Chat History
    this.dom.clearChatBtn.addEventListener('click', () => {
      if (this.callbacks.onClearChat) this.callbacks.onClearChat();
    });

    // Chat submit
    this.dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const prompt = this.dom.chatInput.value.trim();
      if (!prompt) return;
      
      this.dom.chatInput.value = '';
      this.resetTextareaHeight();
      
      if (this.callbacks.onSubmitChat) this.callbacks.onSubmitChat(prompt);
    });

    // Enter to submit key binding (instead of newline) in Chat Input
    this.dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.dom.chatForm.dispatchEvent(new Event('submit'));
      }
    });

    // Suggestion chips
    this.dom.suggestChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.dom.chatInput.value = chip.textContent;
        this.dom.chatInput.focus();
        this.resetTextareaHeight();
      });
    });

    // Settings Modal toggles removed

  }

  /**
   * Setup elastic textarea height scaling.
   */
  initTextareaAutoGrow() {
    const textarea = this.dom.chatInput;
    textarea.addEventListener('input', () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    });
  }

  resetTextareaHeight() {
    this.dom.chatInput.style.height = 'auto';
  }

  /**
   * PDF File Selection Hooks
   */
  handleFileSelect(event) {
    const files = event.target.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  handleFile(file) {
    if (file.type !== 'application/pdf') {
      alert('IRIS currently only supports reading standard PDF documents.');
      return;
    }
    if (this.callbacks.onUploadPdf) {
      this.callbacks.onUploadPdf(file);
    }
  }

  /**
   * Settings Forms Removed
   */
  getSelectedRetrievalMode() {
    return 'auto';
  }

  populateSettingsForm(config) {
  }

  showSettingsModal() {
  }

  hideSettingsModal() {
  }

  setChatAvailability(isAvailable) {
    this.dom.sendBtn.disabled = !isAvailable;
    this.dom.chatInput.disabled = !isAvailable;
    this.dom.chatInput.placeholder = isAvailable
      ? 'Message IRIS ...'
      : 'Chat is not available...';
  }

  showAuthGate(message) {
    if (this.dom.authGate) {
      this.dom.authGate.classList.remove('hidden');
    }
    if (this.dom.authGateMessage && message) {
      this.dom.authGateMessage.textContent = message;
    }
  }

  hideAuthGate() {
    if (this.dom.authGate) {
      this.dom.authGate.classList.add('hidden');
    }
  }

  updateSignedInUser(email) {
    if (this.dom.userEmail) {
      this.dom.userEmail.textContent = email || '';
    }
    if (this.dom.userPill) {
      this.dom.userPill.classList.toggle('hidden', !email);
    }
  }

  updateDailyUsage(count, limit) {
    if (this.dom.usagePill) {
      this.dom.usagePill.textContent = `${count} / ${limit} messages today`;
    }
  }

  showUploadProgress(percent, filename) {}
  resetUploadCard() {}
  showAutoLoader(statusText, progressPercent) {}
  hideAutoLoader() {}

  showIndexingProgress(statusText, percent) {
    const container = document.getElementById('aiLoadingContainer');
    const status = document.getElementById('aiLoadingStatus');
    const bar = document.getElementById('aiLoadingBar');
    const prompts = document.querySelector('.suggested-prompts-container');
    
    if (container) container.classList.remove('hidden');
    if (status) status.textContent = statusText;
    if (bar) bar.style.width = `${percent}%`;
    if (prompts) prompts.classList.add('hidden'); // Hide prompts while loading
  }

  hideIndexingProgress() {
    const container = document.getElementById('aiLoadingContainer');
    const prompts = document.querySelector('.suggested-prompts-container');
    
    if (container) container.classList.add('hidden');
    if (prompts) prompts.classList.remove('hidden'); // Show prompts after loading
  }

  updateModelIndicator(providerId, providerName) {
    const dot = document.getElementById('modelDot');
    const container = document.getElementById('modelIndicator');
    
    if (!dot || !container) return;
    
    dot.className = 'model-dot';
    if (providerId) {
      dot.classList.add(`model-${providerId}`);
    }
  }

  activateWorkspace(docName, stats) {
    if (this.dom.welcomeDocName) {
      this.dom.welcomeDocName.textContent = docName;
    }
  }

  /**
   * Updates workspace when parsing completes in the background.
   */
  updateWorkspace(stats) {
    if (window.lucide) window.lucide.createIcons();
  }

  /**
   * Updates the greeting message in the chat depending on whether the document is ready or loading.
   */
  updateGreetingText(isReady, docName, isGeneralMode = false) {
    const welcomeTextEl = this.dom.chatMessages.querySelector('.welcome-text p');
    if (welcomeTextEl) {
      if (isGeneralMode) {
        welcomeTextEl.innerHTML = `I am ready for direct conversation. Ask me anything, or load a PDF later if you want document-grounded answers with page citations.`;
      } else if (isReady) {
        welcomeTextEl.innerHTML = `I have successfully parsed and indexed <strong>${docName}</strong>. I am fully ready to answer questions, compile reports, or locate specific sections for you.`;
      } else {
        welcomeTextEl.innerHTML = `I am currently reading and indexing <strong>${docName}</strong> in the background... Please wait.`;
      }
    }
  }

  setDocumentMode(hasDocument, docName = 'General Chat') {
    this.dom.welcomeDocName.textContent = hasDocument ? docName : 'General Chat';
  }

  deactivateWorkspace() {
    this.dom.chatMessages.innerHTML = '';
  }

  /**
   * Resets the chat view to the initial welcome state without unloading the document.
   * Used by the Clear Chat button.
   */
  resetChatView(docName) {
    this.dom.chatMessages.innerHTML = `
      <div class="system-welcome-message glass-panel">
        <div class="welcome-ai-avatar">
          <div class="logo-icon-iris size-sm"></div>
        </div>
        <div class="welcome-text">
          <h3>Hello, I'm IRIS</h3>
          <p>${docName ? `I have successfully parsed and indexed <strong>${docName}</strong>. I am fully ready to answer questions, compile reports, or locate specific sections for you.` : 'I am ready for direct conversation. Ask me anything, or load a PDF later if you want document-grounded answers with page citations.'}</p>
          <div id="aiLoadingContainer" class="hidden" style="margin-top: 1rem; margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <div class="progress-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
              <span id="aiLoadingStatus" style="font-size: 0.9rem; color: var(--text-secondary);">Preparing document stream...</span>
            </div>
            <div class="progress-bar-container" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.05); border-radius: 3px; overflow: hidden;">
              <div class="progress-bar-fill" id="aiLoadingBar" style="width: 0%; height: 100%; background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%); transition: width 0.15s ease;"></div>
            </div>
          </div>
          <div class="suggested-prompts-container">
            <button class="suggest-chip">Define a Granuloma</button>
            <button class="suggest-chip">Compare between acute and chronic inflammation</button>
            <button class="suggest-chip">List the three successive phases of Bilharzial granuloma formation.</button>
            <button class="suggest-chip">What are types of cellular adaptation</button>
            <button class="suggest-chip">What are uses of atropine</button>
          </div>
        </div>
      </div>
    `;
    // Re-bind suggestion chips
    this.dom.chatMessages.querySelectorAll('.suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.dom.chatInput.value = chip.textContent;
        this.dom.chatInput.focus();
        this.resetTextareaHeight();
      });
    });
    if (window.lucide) window.lucide.createIcons();
  }



  /**
   * Appends a chat message bubble.
   * @param {string} sender 'user' or 'ai'
   * @param {string} text Raw text (will be formatted)
   * @param {boolean} isStreaming If true, returns DOM element to append chunks to.
   */
  appendChatMessage(sender, text = '', isStreaming = false) {
    const chatContainer = this.dom.chatMessages;
    
    // Clear initial greeting if first user message
    const welcomeMsg = chatContainer.querySelector('.system-welcome-message');
    if (welcomeMsg && sender === 'user') {
      welcomeMsg.remove();
    }

    const row = document.createElement('div');
    row.className = `chat-row ${sender === 'user' ? 'user-row' : 'ai-row'}`;

    const avatar = document.createElement('div');
    avatar.className = `chat-avatar ${sender === 'user' ? 'user' : 'ai'}`;
    
    if (sender === 'user') {
      avatar.innerHTML = '<i data-lucide="user"></i>';
    } else {
      avatar.innerHTML = '<div class="logo-icon-iris size-sm"></div>';
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (isStreaming) {
      bubble.classList.add('streaming-bubble');
      const streamTextSpan = document.createElement('span');
      streamTextSpan.className = 'stream-text-node';
      streamTextSpan.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      bubble.appendChild(streamTextSpan);
    } else {
      bubble.innerHTML = this.formatMarkdown(text);
    }

    if (sender === 'user') {
      row.appendChild(bubble);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(bubble);
    }

    chatContainer.appendChild(row);
    this.scrollToBottom();

    // Reload icons for new message row
    if (window.lucide) window.lucide.createIcons();

    return isStreaming ? bubble : null;
  }

  /**
   * Appends typing indicator in chat window.
   */
  showTypingIndicator() {
    this.hideTypingIndicator(); // Avoid duplication
    
    const chatContainer = this.dom.chatMessages;
    const row = document.createElement('div');
    row.className = 'chat-row ai-row' + ' typing-row';

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar ai';
    avatar.innerHTML = '<div class="logo-icon-iris size-sm"></div>';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble typing-indicator-bubble';
    bubble.innerHTML = `
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    `;

    row.appendChild(avatar);
    row.appendChild(bubble);
    chatContainer.appendChild(row);
    
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    const indicator = this.dom.chatMessages.querySelector('.typing-row');
    if (indicator) {
      indicator.remove();
    }
  }

  scrollToBottom() {
    const container = this.dom.chatMessages;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }

  /**
   * Markdown formatting.
   */
  formatMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks: ```language ... ```
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || 'code';
      const cleanCode = code.trim();
      return `<div class="code-header">
                <span>${language}</span>
                <button class="copy-code-btn" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(cleanCode)}')); this.innerText='Copied!'; setTimeout(()=>{this.innerText='Copy'}, 1500)">Copy</button>
              </div><pre><code>${cleanCode}</code></pre>`;
    });

    // Inline code: `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold: **text**
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* (but not double-star bold)
    html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // Citations: [Page 4] or [Page 4, 5] or [Page 4 - 6]
    html = html.replace(/\[Page\s*(\d+)([^\]]*)\]/gi, (match, firstPage, rest) => {
      const pageNum = parseInt(firstPage, 10);
      return `<span class="citation-badge" data-page="${pageNum}">${match}</span>`;
    });

    // Tables
    html = html.replace(/(?:^|\n)((?:[ \t]*\|[^\n]+\|[ \t]*\n?)+)/g, (match, tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      let tableHtml = '\n<div class="table-responsive"><table class="chat-table">';
      
      rows.forEach((row, index) => {
        let cells = row.split('|');
        if (cells[0].trim() === '') cells.shift();
        if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop();
        
        // Skip separator row
        if (index === 1 && cells[0] && cells[0].trim().match(/^:?-+:?$/)) return;
        
        tableHtml += '<tr>';
        cells.forEach(cell => {
          if (index === 0) {
            tableHtml += `<th>${cell.trim()}</th>`;
          } else {
            tableHtml += `<td>${cell.trim()}</td>`;
          }
        });
        tableHtml += '</tr>';
      });
      
      tableHtml += '</table></div>\n';
      return match.startsWith('\n') ? '\n' + tableHtml : tableHtml;
    });

    // Split into lines and process structure
    const lines = html.split('\n');
    let result = [];
    let inUL = false;
    let inOL = false;

    for (let line of lines) {
      const trimmed = line.trim();

      // Close open lists on blank line
      if (!trimmed) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        result.push('<hr class="chat-hr">');
        continue;
      }

      // Headings: ## H2, ### H3, #### H4
      const h3Match = trimmed.match(/^###\s+(.+)/);
      const h2Match = trimmed.match(/^##\s+(.+)/);
      const h4Match = trimmed.match(/^####\s+(.+)/);
      if (h4Match) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        result.push(`<h4 class="chat-h4">${h4Match[1]}</h4>`);
        continue;
      }
      if (h3Match) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        result.push(`<h3 class="chat-h3">${h3Match[1]}</h3>`);
        continue;
      }
      if (h2Match) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        result.push(`<h2 class="chat-h2">${h2Match[1]}</h2>`);
        continue;
      }

      // Check for list items
      const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);

      if (isBullet) {
        if (inOL) { result.push('</ol>'); inOL = false; }
        if (!inUL) { result.push('<ul class="chat-list">'); inUL = true; }
        const itemContent = trimmed.substring(2);
        result.push(`<li>${itemContent}</li>`);
      } else if (numberedMatch) {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (!inOL) { result.push('<ol class="chat-list">'); inOL = true; }
        result.push(`<li>${numberedMatch[2]}</li>`);
      } else {
        if (inUL) { result.push('</ul>'); inUL = false; }
        if (inOL) { result.push('</ol>'); inOL = false; }
        
        // Skip tags that shouldn't be wrapped in <p>
        if (trimmed.startsWith('<div class="code-header"') || trimmed.startsWith('<div class="table-responsive"') || trimmed.startsWith('<pre>') || trimmed.startsWith('</pre>') || trimmed.startsWith('<li>') || trimmed.startsWith('<ul>') || trimmed.startsWith('</ul>') || trimmed.startsWith('<ol>') || trimmed.startsWith('</ol>') || trimmed.startsWith('<h2') || trimmed.startsWith('<h3') || trimmed.startsWith('<h4') || trimmed.startsWith('<hr')) {
          result.push(line);
        } else {
          result.push(`<p>${line}</p>`);
        }
      }
    }

    if (inUL) result.push('</ul>');
    if (inOL) result.push('</ol>');

    return result.join('\n');
  }

  /**
   * Render HTML content for streaming bubbles.
   * Format buffer periodically to avoid parsing incomplete blocks.
   */
  updateStreamingBubble(bubbleElement, rawTextAccumulated) {
    const textSpan = bubbleElement.querySelector('.stream-text-node');
    if (textSpan) {
      const formatted = this.formatMarkdown(rawTextAccumulated);
      textSpan.innerHTML = formatted || '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(textSpan, {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false},
              {left: '\\(', right: '\\)', display: false},
              {left: '\\[', right: '\\]', display: true}
            ],
            throwOnError: false
          });
        } catch(e) {}
      }
      this.scrollToBottom();
    }
  }

  /**
   * Finalize streaming bubble. Replace stream nodes with clean static nodes.
   */
  finalizeStreamingBubble(bubbleElement, rawTextFinal) {
    bubbleElement.classList.remove('streaming-bubble');
    bubbleElement.innerHTML = this.formatMarkdown(rawTextFinal);
    
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(bubbleElement, {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\(', right: '\\)', display: false},
            {left: '\\[', right: '\\]', display: true}
          ],
          throwOnError: false
        });
      } catch(e) {}
    }
    
    // Re-bind Lucide icons
    if (window.lucide) window.lucide.createIcons();
    this.scrollToBottom();
  }

  updateTokenUsage(estimate) {
    this.dom.tokenUsage.textContent = `${estimate.toLocaleString()} est. tokens`;
  }
}

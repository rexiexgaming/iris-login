/**
 * IRIS - Main Application Entry Point
 * Coordinates PDFHandler, RAGEngine, server-backed chat, and UI workflows.
 * Usage limits are tracked locally via localStorage (no login required).
 */

import { PDFHandler } from './pdf-handler.js';
import { RAGEngine } from './rag-engine.js';
import { ServerAPI } from './server-api.js';
import { UIManager } from './ui-manager.js';
import { CONFIG } from './config.js';
import {
  createAccount,
  firebaseErrorMessage,
  observeAuthState,
  signIn,
  signOutUser
} from './firebase.js';

class IrisApp {
  constructor() {
    this.dailyMessageLimit = Number(CONFIG.dailyMessageLimit) || 25;

    this.config = {
      retrievalMode: 'auto',
      systemPrompt: ''
    };

    this.docState = {
      fileName: '',
      fileSize: 0,
      totalPages: 0,
      pages: [],
      totalChars: 0,
      totalWords: 0,
      isRAGActive: false
    };

    this.chatHistory = [];
    this.isGenerating = false;
    this.isDocumentLoading = false;
    this.dailyUsageCount = 0;
    this.pendingUserPrompt = null;

    this.loadConfigFromStorage();
    this.loadUsageFromStorage();

    this.pdfHandler = new PDFHandler();
    this.ragEngine = new RAGEngine();
    this.serverApi = new ServerAPI('');

    this.ui = new UIManager({
      onUploadPdf: (file) => this.handlePdfUpload(file),
      onUnloadPdf: () => this.handlePdfUnload(),
      onSubmitChat: (prompt) => this.handleChatSubmit(prompt),
      onSaveConfig: (config) => this.handleSaveConfig(config),
      onResetConfig: () => this.handleResetConfig(),
      onClearChat: () => this.handleClearChat()
    });

    this.launchWorkspace();
    this.verifyProviders();
    this.checkAndAutoLoad();
  }

  canAutoLoad() {
    return Boolean(CONFIG.pdfPath);
  }

  // --- Local Storage Usage Tracking ---

  _getUsageStorageKey() {
    const today = new Date().toISOString().slice(0, 10);
    return `iris_daily_usage_${today}`;
  }

  loadUsageFromStorage() {
    const key = this._getUsageStorageKey();
    const stored = localStorage.getItem(key);
    this.dailyUsageCount = stored ? Number(stored) : 0;
  }

  saveUsageToStorage() {
    const key = this._getUsageStorageKey();
    localStorage.setItem(key, String(this.dailyUsageCount));
  }

  incrementUsage() {
    this.dailyUsageCount += 1;
    this.saveUsageToStorage();
    this.ui.updateDailyUsage(this.dailyUsageCount, this.dailyMessageLimit);
    this.updateChatAvailability();
  }

  // --- Provider verification ---

  async verifyProviders() {
    try {
      console.log('--- Checking API Providers ---');
      const status = await this.serverApi.getProviderStatus();
      
      if (status.allStatuses && status.allStatuses.length > 0) {
        console.table(status.allStatuses);
      }

      if (status?.provider?.id) {
        console.log(`✅ Selected Provider: ${status.provider.name}`);
        this.ui.updateModelIndicator(status.provider.id, status.provider.name);
      } else {
        console.warn('❌ No working models found.');
        this.ui.updateModelIndicator('', 'No working models');
      }
    } catch (error) {
      console.error('Provider status check failed.', error);
      this.ui.updateModelIndicator('', 'No working models');
    }
  }

  launchWorkspace() {
    const hasDocumentConfigured = Boolean(CONFIG.pdfPath);
    const initialName = hasDocumentConfigured
      ? (CONFIG.pdfDisplayName || CONFIG.pdfPath.split('/').pop())
      : 'General Chat';

    this.ui.activateWorkspace(initialName, {
      totalPages: 0,
      fileSize: 0,
      totalChars: 0,
      totalWords: 0,
      retrievalModeText: hasDocumentConfigured ? 'Waiting for document...' : 'General Chat',
      pages: []
    });
    this.ui.resetChatView(hasDocumentConfigured ? initialName : '');
    this.ui.setDocumentMode(false, initialName);
    this.ui.updateGreetingText(false, initialName, !hasDocumentConfigured);
    this.ui.updateDailyUsage(this.dailyUsageCount, this.dailyMessageLimit);
    this.updateChatAvailability();
    this.updateTokenUsageEstimate();
  }

  updateChatAvailability() {
    const hasRemainingUsage = this.dailyUsageCount < this.dailyMessageLimit;
    this.ui.setChatAvailability(!this.isDocumentLoading && hasRemainingUsage);
  }

  loadConfigFromStorage() {
    const saved = localStorage.getItem('iris_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.config = { ...this.config, ...parsed };
      } catch (error) {
        console.error('Failed to parse local configuration.', error);
      }
    }
  }

  saveConfigToStorage() {
    localStorage.setItem('iris_config', JSON.stringify(this.config));
  }

  async checkAndAutoLoad() {
    const isPdfPathConfigured = Boolean(CONFIG.pdfPath);
    if (!isPdfPathConfigured) return;

    const docName = CONFIG.pdfDisplayName || CONFIG.pdfPath.split('/').pop();
    this.isDocumentLoading = true;
    this.updateChatAvailability();

    this.ui.setDocumentMode(false, docName);
    this.ui.updateGreetingText(false, docName, false);

    try {
      const response = await fetch(CONFIG.pdfPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF from path: ${CONFIG.pdfPath}`);
      }

      const blob = await response.blob();
      const fileMock = {
        name: docName,
        size: blob.size,
        type: 'application/pdf'
      };

      const originalReadFile = this.pdfHandler.readFileAsArrayBuffer;
      this.pdfHandler.readFileAsArrayBuffer = () => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(blob);
        });
      };

      const parsedData = await this.pdfHandler.parsePDF(fileMock, (percent) => {
        this.ui.showIndexingProgress(`Loading (${percent}%)...`, percent);
      });

      this.pdfHandler.readFileAsArrayBuffer = originalReadFile;
      this.ui.showIndexingProgress('Indexing retrieval tags...', 100);

      this.docState.fileName = parsedData.fileName;
      this.docState.fileSize = parsedData.fileSize;
      this.docState.totalPages = parsedData.totalPages;
      this.docState.pages = parsedData.pages;
      this.docState.totalChars = parsedData.totalChars;
      this.docState.totalWords = parsedData.totalWords;

      this.ragEngine.indexDocument(this.docState.pages);
      this.updateRetrievalStrategy();
      this.isDocumentLoading = false;

      const viewStats = {
        totalPages: this.docState.totalPages,
        fileSize: this.docState.fileSize,
        totalChars: this.docState.totalChars,
        totalWords: this.docState.totalWords,
        retrievalModeText: this.docState.isRAGActive ? 'Semantic RAG' : 'Full Context',
        pages: this.docState.pages
      };

      this.ui.updateWorkspace(viewStats);
      this.ui.setDocumentMode(true, this.docState.fileName);
      this.ui.updateGreetingText(true, this.docState.fileName, false);
      this.ui.hideIndexingProgress();
      this.updateTokenUsageEstimate();
      this.updateChatAvailability();

      if (this.pendingUserPrompt) {
        const prompt = this.pendingUserPrompt;
        this.pendingUserPrompt = null;
        this.isGenerating = false;
        this.handleChatSubmit(prompt);
      }
    } catch (error) {
      console.error('Auto-load failed:', error);
      this.isDocumentLoading = false;
      this.clearDocumentState();
      this.ui.setDocumentMode(false, 'General Chat');
      this.ui.updateGreetingText(false, 'General Chat', true);
      this.ui.hideIndexingProgress();
      this.updateTokenUsageEstimate();
      this.updateChatAvailability();
    }
  }

  handleSaveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.saveConfigToStorage();

    if (this.docState.pages.length > 0) {
      this.updateRetrievalStrategy();
    }
  }

  handleResetConfig() {
    this.config = {
      retrievalMode: 'auto',
      systemPrompt: ''
    };
    this.saveConfigToStorage();
    return this.config;
  }

  async handlePdfUpload(file) {
    try {
      const parsedData = await this.pdfHandler.parsePDF(file, (percent) => {
        this.ui.showUploadProgress(percent, file.name);
      });

      this.docState.fileName = parsedData.fileName;
      this.docState.fileSize = parsedData.fileSize;
      this.docState.totalPages = parsedData.totalPages;
      this.docState.pages = parsedData.pages;
      this.docState.totalChars = parsedData.totalChars;
      this.docState.totalWords = parsedData.totalWords;

      this.ragEngine.indexDocument(this.docState.pages);
      this.updateRetrievalStrategy();
      this.isDocumentLoading = false;
      this.chatHistory = [];

      const viewStats = {
        totalPages: this.docState.totalPages,
        fileSize: this.docState.fileSize,
        totalChars: this.docState.totalChars,
        totalWords: this.docState.totalWords,
        retrievalModeText: this.docState.isRAGActive ? 'Semantic RAG' : 'Full Context',
        pages: this.docState.pages
      };

      this.ui.activateWorkspace(this.docState.fileName, viewStats);
      this.ui.setDocumentMode(true, this.docState.fileName);
      this.ui.updateGreetingText(true, this.docState.fileName, false);
      this.updateTokenUsageEstimate();
      this.updateChatAvailability();
    } catch (error) {
      console.error(error);
      alert(`Error loading PDF: ${error.message || 'An error occurred while parsing the file.'}`);
      this.ui.resetUploadCard();
    }
  }

  handlePdfUnload() {
    this.clearDocumentState();
    this.chatHistory = [];
    this.isDocumentLoading = false;
    this.ui.setDocumentMode(false, 'General Chat');
    this.ui.resetChatView('');
    this.ui.updateGreetingText(false, 'General Chat', true);
    this.updateTokenUsageEstimate();
    this.updateChatAvailability();
  }

  clearDocumentState() {
    this.docState = {
      fileName: '',
      fileSize: 0,
      totalPages: 0,
      pages: [],
      totalChars: 0,
      totalWords: 0,
      isRAGActive: false
    };
  }

  handleClearChat() {
    if (this.isGenerating) return;
    this.chatHistory = [];
    this.ui.resetChatView(this.docState.fileName);
    this.ui.updateGreetingText(
      !this.isDocumentLoading && this.docState.pages.length > 0,
      this.docState.fileName || 'General Chat',
      this.docState.pages.length === 0
    );
    this.updateTokenUsageEstimate();
  }

  updateRetrievalStrategy() {
    if (this.config.retrievalMode === 'rag') {
      this.docState.isRAGActive = true;
    } else if (this.config.retrievalMode === 'full') {
      this.docState.isRAGActive = false;
    } else {
      this.docState.isRAGActive = this.ragEngine.isRetrievalRequired(35000);
    }
  }

  getMessagePermission() {
    if (this.dailyUsageCount >= this.dailyMessageLimit) {
      this.updateChatAvailability();
      return { allowed: false, reason: 'limit' };
    }

    return { allowed: true };
  }

  async handleChatSubmit(prompt) {
    if (this.isGenerating) return;

    const permission = this.getMessagePermission();
    if (!permission.allowed) {
      if (permission.reason === 'limit') {
        this.ui.appendChatMessage(
          'ai',
          `**Daily limit reached.** You have used all ${this.dailyMessageLimit} messages for today. Please come back tomorrow.`
        );
      }
      return;
    }

    if (this.isDocumentLoading) {
      this.ui.appendChatMessage('user', prompt);
      this.ui.showTypingIndicator();
      this.pendingUserPrompt = prompt;
      this.isGenerating = true;
      return;
    }

    this.isGenerating = true;
    this.ui.dom.sendBtn.disabled = true;
    this.ui.dom.chatInput.disabled = true;
    this.ui.appendChatMessage('user', prompt);

    let contextPages = [];
    if (this.docState.pages.length > 0) {
      if (this.docState.isRAGActive) {
        const retrieved = this.ragEngine.retrieve(prompt, 5);
        contextPages = retrieved.map((result) => ({
          pageNum: result.pageNum,
          text: result.text
        }));
        contextPages.sort((a, b) => a.pageNum - b.pageNum);
      } else {
        contextPages = this.docState.pages.map((page) => ({
          pageNum: page.pageNum,
          text: page.text
        }));
      }
    }

    const streamingBubble = this.ui.appendChatMessage('ai', '', true);

    try {
      const response = await this.serverApi.sendMessage({
        prompt,
        contextPages,
        history: this.chatHistory.slice(-8),
        systemInstruction: this.config.systemPrompt
      });

      if (response?.provider?.id) {
        this.ui.updateModelIndicator(response.provider.id, response.provider.name);
      }

      const finalText = response.text || '';
      this.ui.updateStreamingBubble(streamingBubble, finalText);
      this.ui.finalizeStreamingBubble(streamingBubble, finalText);

      this.chatHistory.push({ role: 'user', text: prompt });
      this.chatHistory.push({ role: 'model', text: finalText });

      // Increment local usage after successful response
      this.incrementUsage();

      this.isGenerating = false;
      this.updateTokenUsageEstimate();
      this.updateChatAvailability();
    } catch (error) {
      console.error(error);
      this.ui.hideTypingIndicator();

      const errorMessage = error.code === 'ALL_PROVIDERS_UNAVAILABLE'
        ? '**Sorry, the server is busy right now. Please try again later.**'
        : `**Connection Error:** ${error.message || 'Unable to fetch a response right now.'}`;

      this.ui.finalizeStreamingBubble(streamingBubble, errorMessage);
      this.isGenerating = false;
      this.updateChatAvailability();
    } finally {
      this.ui.dom.sendBtn.disabled = false;
      this.ui.dom.chatInput.disabled = false;
      this.updateChatAvailability();
    }
  }

  updateTokenUsageEstimate() {
    let contextWords = 0;
    if (this.docState.pages.length > 0) {
      if (this.docState.isRAGActive) {
        const retrievedPages = this.ragEngine.retrieve('estimate', 5);
        contextWords = retrievedPages.reduce((sum, page) => sum + page.text.split(/\s+/).length, 0);
      } else {
        contextWords = this.docState.totalWords;
      }
    }

    const historyWords = this.chatHistory.reduce((sum, item) => sum + item.text.split(/\s+/).length, 0);
    const totalWordsEstimate = contextWords + historyWords;
    const tokenEstimate = Math.round(totalWordsEstimate * 1.35);
    this.ui.updateTokenUsage(tokenEstimate);
  }
}

function setAuthMessage(message, isError = false) {
  const element = document.getElementById('authMessage');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('auth-message-error', isError);
}

function setAuthenticatedView(user) {
  document.getElementById('authScreen')?.classList.add('hidden');
  document.getElementById('protectedApp')?.classList.remove('hidden');
  const emailElement = document.getElementById('userEmail');
  if (emailElement) emailElement.textContent = user.email || '';
  window.irisApp ||= new IrisApp();
}

function setUnauthenticatedView() {
  document.getElementById('protectedApp')?.classList.add('hidden');
  document.getElementById('authScreen')?.classList.remove('hidden');
  document.getElementById('authLoading')?.classList.add('hidden');
  document.getElementById('authForm')?.classList.remove('hidden');
}

function initializeAuthentication() {
  const form = document.getElementById('authForm');
  const modeToggle = document.getElementById('authModeToggle');
  const codeField = document.getElementById('authCodeField');
  const submitButton = document.getElementById('authSubmit');
  const modeLabel = document.getElementById('authModeLabel');
  const signOutButton = document.getElementById('signOutButton');
  let isSignup = false;

  const updateMode = () => {
    isSignup = !isSignup;
    codeField?.classList.toggle('hidden', !isSignup);
    if (submitButton) submitButton.textContent = isSignup ? 'Create account' : 'Log in';
    if (modeLabel) modeLabel.textContent = isSignup ? 'Already have an account?' : 'Need an account?';
    if (modeToggle) modeToggle.textContent = isSignup ? 'Log in' : 'Create account';
    setAuthMessage('');
  };

  modeToggle?.addEventListener('click', updateMode);
  signOutButton?.addEventListener('click', () => signOutUser().catch((error) => setAuthMessage(firebaseErrorMessage(error), true)));

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    const oneTimeCode = String(formData.get('oneTimeCode') || '');

    if (!email || !password || (isSignup && !oneTimeCode.trim())) {
      setAuthMessage(isSignup ? 'Email, password, and one-time code are required.' : 'Email and password are required.', true);
      return;
    }

    submitButton.disabled = true;
    setAuthMessage(isSignup ? 'Creating your account…' : 'Signing you in…');

    try {
      if (isSignup) await createAccount(email, password, oneTimeCode);
      else await signIn(email, password);
    } catch (error) {
      setAuthMessage(firebaseErrorMessage(error), true);
      submitButton.disabled = false;
    }
  });

  document.getElementById('authLoading')?.classList.remove('hidden');
  document.getElementById('authForm')?.classList.add('hidden');
  try {
    observeAuthState((user) => {
      if (user) setAuthenticatedView(user);
      else setUnauthenticatedView();
    });
  } catch (error) {
    const loading = document.getElementById('authLoading');
    if (loading) {
      loading.textContent = firebaseErrorMessage(error);
      loading.classList.add('auth-message-error');
    }
  }
}

document.addEventListener('DOMContentLoaded', initializeAuthentication);

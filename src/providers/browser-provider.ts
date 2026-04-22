/**
 * Browser Provider - Use Kimi via web interface
 * Uses subscription (free if you have Kimi subscription)
 * No API key required!
 */

// Playwright types - imported dynamically to avoid requiring playwright for API mode
type Browser = any;
type BrowserContext = any;
type Page = any;
import { 
  Provider, 
  ProviderConfig, 
  ChatOptions, 
  ChatResponse, 
  StreamChunk 
} from './types.js';

export class BrowserProvider implements Provider {
  readonly name = 'Kimi Web (Browser)';
  readonly type = 'browser' as const;
  
  private config: ProviderConfig = {
    type: 'browser',
    headless: false,
    browserType: 'chromium',
    timeout: 120000,
  };
  
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private initialized = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = { ...this.config, ...config };
    
    try {
      // Dynamic import playwright
      // @ts-ignore - playwright is optional peer dependency
      const playwright = await import('playwright');
      const { chromium, firefox, webkit } = playwright as any;
      
      const browserType = this.config.browserType ?? 'chromium';
      const launcher = browserType === 'firefox' ? firefox : 
                       browserType === 'webkit' ? webkit : chromium;
      
      console.log('🌐 Launching browser for Kimi Web...');
      console.log('   (Make sure you are logged in to kimi.moonshot.cn)');
      
      this.browser = await launcher.launch({
        headless: this.config.headless ?? false,
      });
      
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      
      this.page = await this.context.newPage();
      
      // Navigate to Kimi
      await this.page.goto('https://kimi.moonshot.cn/', {
        waitUntil: 'networkidle',
      });
      
      // Wait for chat interface to load
      await this.page.waitForSelector('[data-testid="chat-input"], .chat-input, textarea', {
        timeout: 30000,
      }).catch(() => {
        console.log('⚠️  Could not detect chat interface.');
        console.log('   Please log in to Kimi if not already logged in.');
      });
      
      this.initialized = true;
      console.log('✅ Browser provider initialized');
      
    } catch (err) {
      throw new Error(
        `Failed to initialize browser provider.\n` +
        `Make sure you have:\n` +
        `1. Playwright installed: npm install playwright\n` +
        `2. Browser binaries: npx playwright install chromium\n` +
        `3. Internet connection\n\n` +
        `Error: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.initialized && this.page !== null;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const lastMessage = options.messages[options.messages.length - 1];
    const content = lastMessage?.content ?? '';

    try {
      // Find input and send message
      const inputSelector = '[data-testid="chat-input"], .chat-input textarea, textarea[placeholder*="message"], textarea';
      
      // Clear and type message
      await this.page.click(inputSelector);
      await this.page.fill(inputSelector, '');
      await this.page.type(inputSelector, content, { delay: 10 });
      
      // Press Enter to send
      await this.page.press(inputSelector, 'Enter');
      
      // Wait for response
      await this.page.waitForTimeout(1000);
      
      // Wait for response to complete (no loading indicator)
      await this.waitForResponse();
      
      // Extract response text
      const responseText = await this.extractLastResponse();
      
      return {
        content: responseText,
        usage: undefined, // Browser mode doesn't provide token counts
      };
      
    } catch (err) {
      throw new Error(`Browser chat failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  async *stream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    const lastMessage = options.messages[options.messages.length - 1];
    const content = lastMessage?.content ?? '';

    try {
      const inputSelector = '[data-testid="chat-input"], .chat-input textarea, textarea[placeholder*="message"], textarea';
      
      await this.page.click(inputSelector);
      await this.page.fill(inputSelector, '');
      await this.page.type(inputSelector, content, { delay: 10 });
      await this.page.press(inputSelector, 'Enter');
      
      // Stream response by checking DOM changes
      let lastText = '';
      const startTime = Date.now();
      const timeout = this.config.timeout ?? 120000;
      
      while (Date.now() - startTime < timeout) {
        const currentText = await this.extractLastResponse();
        
        if (currentText !== lastText) {
          const newContent = currentText.slice(lastText.length);
          yield { content: newContent, done: false };
          lastText = currentText;
        }
        
        // Check if response is complete
        const isComplete = await this.isResponseComplete();
        if (isComplete && currentText.length > 0) {
          break;
        }
        
        await this.page.waitForTimeout(100);
      }
      
      yield { content: '', done: true };
      
    } catch (err) {
      throw new Error(`Browser stream failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async waitForResponse(): Promise<void> {
    if (!this.page) return;
    
    const maxWait = 120000;
    const start = Date.now();
    
    while (Date.now() - start < maxWait) {
      const isLoading = await (this.page as any).evaluate(`() => {
        const loaders = document.querySelectorAll('.loading, .spinner, [data-testid="loading"]');
        return loaders.length > 0;
      }`);
      
      if (!isLoading) {
        await (this.page as any).waitForTimeout(500);
        return;
      }
      
      await (this.page as any).waitForTimeout(500);
    }
  }

  private async isResponseComplete(): Promise<boolean> {
    if (!this.page) return true;
    
    return await (this.page as any).evaluate(`() => {
      const loaders = document.querySelectorAll('.loading, .spinner, [data-testid="loading"]');
      return loaders.length === 0;
    }`);
  }

  private async extractLastResponse(): Promise<string> {
    if (!this.page) return '';
    
    return await (this.page as any).evaluate(`() => {
      const selectors = [
        '[data-testid="assistant-message"] .message-content',
        '.assistant-message .content',
        '.chat-message.assistant:last-child .content',
        '.message.assistant:last-child',
        '[class*="assistant"]:last-child [class*="content"]',
        '.kimi-chat-content .assistant:last-child',
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          const last = elements[elements.length - 1];
          if (last && last.textContent) {
            return last.textContent.trim();
          }
        }
      }
      
      const allMessages = document.querySelectorAll('[class*="message"], [class*="chat-item"]');
      if (allMessages.length > 0) {
        const lastMessage = allMessages[allMessages.length - 1];
        return lastMessage.textContent?.trim() ?? '';
      }
      
      return '';
    }`);
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.initialized = false;
    }
  }
}

/**
 * Context Manager - Level 3 Token Optimization
 * Features: Token counting, sliding window, summarization, semantic caching, smart pruning
 */

import { ChatMessage } from '../providers/types.js';

export interface ContextStats {
  totalTokens: number;
  promptTokens: number;
  contextTokens: number;
  fileTokens: number;
  historyTokens: number;
  cachedTokens: number;
  compressed: boolean;
  summaryTokens: number;
}

export interface CachedResponse {
  query: string;
  response: string;
  timestamp: number;
  tokens: number;
  hitCount: number;
}

export interface MessagePriority {
  message: ChatMessage;
  priority: number; // 0-100
  estimatedTokens: number;
  timestamp: number;
  accessCount: number;
}

export class ContextManager {
  private maxContextTokens: number = 120000; // Kimi k1.5 context window
  private targetTokens: number = 80000; // Target 80% of max
  private messagePriorities: Map<string, MessagePriority> = new Map();
  private semanticCache: Map<string, CachedResponse> = new Map();
  private cacheMaxSize: number = 50;
  private summary: string = '';
  private summaryTimestamp: number = 0;
  private conversationStart: number = Date.now();
  
  // Token estimation constants
  private readonly CHARS_PER_TOKEN = 4;
  private readonly OVERHEAD_TOKENS = 4; // Per message overhead

  /**
   * Estimate tokens for text (fast approximation)
   */
  estimateTokens(text: string): number {
    if (!text) return 0;
    // More accurate estimation: ~4 chars per token for English/Thai mix
    const charTokens = Math.ceil(text.length / this.CHARS_PER_TOKEN);
    return charTokens + this.OVERHEAD_TOKENS;
  }

  /**
   * Calculate tokens for a message
   */
  calculateMessageTokens(message: ChatMessage): number {
    const contentTokens = this.estimateTokens(message.content);
    const roleTokens = this.estimateTokens(message.role);
    return contentTokens + roleTokens + this.OVERHEAD_TOKENS;
  }

  /**
   * Calculate total tokens for messages
   */
  calculateTotalTokens(messages: ChatMessage[]): number {
    return messages.reduce((total, msg) => {
      return total + this.calculateMessageTokens(msg);
    }, 0);
  }

  /**
   * Calculate priority score for a message
   */
  private calculatePriority(message: ChatMessage, index: number, total: number): number {
    let priority = 50; // Base priority

    // System messages are highest priority
    if (message.role === 'system') {
      priority = 100;
    }
    
    // Recent messages have higher priority
    const recencyBoost = Math.floor((index / total) * 30);
    priority += recencyBoost;

    // Messages with code blocks are important
    if (message.content.includes('```')) {
      priority += 15;
    }

    // Messages with file references are important
    if (message.content.includes('@') || message.content.includes('file:')) {
      priority += 10;
    }

    // User questions (short) are often more important than AI responses (long)
    if (message.role === 'user' && message.content.length < 200) {
      priority += 5;
    }

    return Math.min(priority, 100);
  }

  /**
   * Build priority map for messages
   */
  private buildPriorities(messages: ChatMessage[]): void {
    this.messagePriorities.clear();
    
    messages.forEach((msg, index) => {
      const key = `${msg.role}-${index}-${msg.content.slice(0, 50)}`;
      const existing = this.messagePriorities.get(key);
      
      this.messagePriorities.set(key, {
        message: msg,
        priority: this.calculatePriority(msg, index, messages.length),
        estimatedTokens: this.calculateMessageTokens(msg),
        timestamp: existing?.timestamp || Date.now(),
        accessCount: (existing?.accessCount || 0) + 1,
      });
    });
  }

  /**
   * Compress context to fit within token limit
   */
  compressContext(
    messages: ChatMessage[],
    contextFiles?: string[],
    maxTokens?: number
  ): { messages: ChatMessage[]; stats: ContextStats } {
    const target = maxTokens || this.targetTokens;
    let currentTokens = this.calculateTotalTokens(messages);
    
    // Calculate file tokens
    const fileTokens = contextFiles ? this.estimateTokens(contextFiles.join('\n')) : 0;
    
    // Build priorities
    this.buildPriorities(messages);

    const stats: ContextStats = {
      totalTokens: currentTokens + fileTokens,
      promptTokens: currentTokens,
      contextTokens: currentTokens,
      fileTokens: fileTokens,
      historyTokens: currentTokens,
      cachedTokens: 0,
      compressed: false,
      summaryTokens: this.estimateTokens(this.summary),
    };

    // If within limit, return as-is
    if (currentTokens + fileTokens <= target) {
      return { messages, stats };
    }

    stats.compressed = true;

    // Strategy 1: Remove old AI responses (keep user questions)
    let compressed = this.removeOldAIResponses([...messages], target - fileTokens);
    currentTokens = this.calculateTotalTokens(compressed);

    // Strategy 2: If still over limit, summarize old messages
    if (currentTokens + fileTokens > target) {
      compressed = this.summarizeOldMessages(compressed, target - fileTokens);
      currentTokens = this.calculateTotalTokens(compressed);
      stats.summaryTokens = this.estimateTokens(this.summary);
    }

    // Strategy 3: If still over limit, use sliding window on recent messages
    if (currentTokens + fileTokens > target) {
      compressed = this.applySlidingWindow(compressed, target - fileTokens);
      currentTokens = this.calculateTotalTokens(compressed);
    }

    stats.totalTokens = currentTokens + fileTokens;
    stats.promptTokens = currentTokens;

    return { messages: compressed, stats };
  }

  /**
   * Remove old AI responses, keeping user messages and recent exchanges
   */
  private removeOldAIResponses(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    // Always keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');
    
    // Keep all user messages and recent AI responses
    const userMessages = nonSystem.filter(m => m.role === 'user');
    const aiMessages = nonSystem.filter(m => m.role === 'assistant');
    
    // Keep last 3 AI responses
    const recentAI = aiMessages.slice(-3);
    
    let result = [...systemMessages, ...userMessages, ...recentAI];
    
    // If still over limit, remove older user messages
    while (this.calculateTotalTokens(result) > maxTokens && userMessages.length > 2) {
      userMessages.shift();
      result = [...systemMessages, ...userMessages, ...recentAI];
    }

    // Sort by original order
    const orderMap = new Map(messages.map((m, i) => [`${m.role}-${m.content.slice(0, 30)}`, i]));
    result.sort((a, b) => {
      const orderA = orderMap.get(`${a.role}-${a.content.slice(0, 30)}`) || 0;
      const orderB = orderMap.get(`${b.role}-${b.content.slice(0, 30)}`) || 0;
      return orderA - orderB;
    });

    return result;
  }

  /**
   * Summarize old messages and replace them with summary
   */
  private summarizeOldMessages(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    // If we already have a recent summary, use it
    const summaryAge = Date.now() - this.summaryTimestamp;
    const hasValidSummary = this.summary && summaryAge < 5 * 60 * 1000; // 5 minutes

    if (!hasValidSummary) {
      // Generate summary (in real implementation, this would call AI)
      // For now, create a placeholder summary
      const oldMessages = messages.slice(0, -5); // Keep last 5 as-is
      const recentMessages = messages.slice(-5);
      
      if (oldMessages.length > 0) {
        this.summary = this.generateLocalSummary(oldMessages);
        this.summaryTimestamp = Date.now();
      }
    }

    const summaryMessage: ChatMessage = {
      role: 'system',
      content: `[Previous conversation summary]:\n${this.summary}`,
    };

    const recentMessages = messages.slice(-5);
    const result = [summaryMessage, ...recentMessages];

    if (this.calculateTotalTokens(result) > maxTokens) {
      // Even with summary, need to trim more
      return this.applySlidingWindow(result, maxTokens);
    }

    return result;
  }

  /**
   * Generate a simple local summary (without AI call)
   */
  private generateLocalSummary(messages: ChatMessage[]): string {
    const topics: string[] = [];
    const files: Set<string> = new Set();
    const tools: Set<string> = new Set();

    for (const msg of messages) {
      // Extract topics
      if (msg.content.includes('implement') || msg.content.includes('create')) {
        topics.push('implementation');
      }
      if (msg.content.includes('fix') || msg.content.includes('bug')) {
        topics.push('bug fixing');
      }
      if (msg.content.includes('refactor')) {
        topics.push('refactoring');
      }

      // Extract file mentions
      const fileMatches = msg.content.match(/@([\w./-]+)/g);
      if (fileMatches) {
        fileMatches.forEach(f => files.add(f.replace('@', '')));
      }

      // Extract tool mentions
      const toolMatches = msg.content.match(/\$([\w_]+)/g);
      if (toolMatches) {
        toolMatches.forEach(t => tools.add(t.replace('$', '')));
      }
    }

    const parts: string[] = [];
    if (topics.length > 0) {
      parts.push(`Discussed: ${[...new Set(topics)].slice(0, 5).join(', ')}`);
    }
    if (files.size > 0) {
      parts.push(`Files: ${[...files].slice(0, 5).join(', ')}${files.size > 5 ? '...' : ''}`);
    }
    if (tools.size > 0) {
      parts.push(`Tools used: ${[...tools].slice(0, 3).join(', ')}`);
    }

    const duration = Math.floor((Date.now() - this.conversationStart) / 60000);
    parts.push(`Conversation duration: ${duration}m, ${messages.length} messages`);

    return parts.join(' | ');
  }

  /**
   * Apply sliding window to keep most recent messages
   */
  private applySlidingWindow(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    // Always keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');
    
    let result = [...systemMessages];
    let currentTokens = this.calculateTotalTokens(result);

    // Add recent messages from the end
    for (let i = nonSystem.length - 1; i >= 0; i--) {
      const msgTokens = this.calculateMessageTokens(nonSystem[i]);
      if (currentTokens + msgTokens > maxTokens) {
        break;
      }
      result.unshift(nonSystem[i]);
      currentTokens += msgTokens;
    }

    return result;
  }

  /**
   * Semantic cache lookup - find similar queries
   */
  lookupCache(query: string): CachedResponse | null {
    const normalized = this.normalizeQuery(query);
    
    // Exact match
    const exact = this.semanticCache.get(normalized);
    if (exact) {
      exact.hitCount++;
      return exact;
    }

    // Semantic similarity (simplified: check for keyword overlap)
    let bestMatch: CachedResponse | null = null;
    let bestScore = 0;

    for (const [key, cached] of this.semanticCache) {
      const similarity = this.calculateSimilarity(normalized, key);
      if (similarity > 0.85 && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = cached;
      }
    }

    if (bestMatch) {
      bestMatch.hitCount++;
    }

    return bestMatch;
  }

  /**
   * Store response in cache
   */
  storeCache(query: string, response: string, tokens: number): void {
    // Limit cache size
    if (this.semanticCache.size >= this.cacheMaxSize) {
      // Remove least used entry
      let leastUsed: [string, CachedResponse] | null = null;
      for (const entry of this.semanticCache) {
        if (!leastUsed || entry[1].hitCount < leastUsed[1].hitCount) {
          leastUsed = entry;
        }
      }
      if (leastUsed) {
        this.semanticCache.delete(leastUsed[0]);
      }
    }

    const normalized = this.normalizeQuery(query);
    this.semanticCache.set(normalized, {
      query: normalized,
      response,
      timestamp: Date.now(),
      tokens,
      hitCount: 1,
    });
  }

  /**
   * Normalize query for caching
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200); // Limit length
  }

  /**
   * Calculate similarity between two queries (0-1)
   */
  private calculateSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));
    
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    
    return intersection.size / union.size;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number; savedTokens: number } {
    let totalHits = 0;
    let savedTokens = 0;

    for (const cached of this.semanticCache.values()) {
      totalHits += cached.hitCount;
      savedTokens += cached.tokens * (cached.hitCount - 1);
    }

    const hitRate = this.semanticCache.size > 0 
      ? totalHits / (this.semanticCache.size + totalHits)
      : 0;

    return {
      size: this.semanticCache.size,
      hitRate: Math.round(hitRate * 100),
      savedTokens,
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.semanticCache.clear();
    this.summary = '';
    this.summaryTimestamp = 0;
  }

  /**
   * Get current context statistics
   */
  getStats(messages: ChatMessage[], contextFiles?: string[]): ContextStats {
    const currentTokens = this.calculateTotalTokens(messages);
    const fileTokens = contextFiles ? this.estimateTokens(contextFiles.join('\n')) : 0;

    return {
      totalTokens: currentTokens + fileTokens,
      promptTokens: currentTokens,
      contextTokens: currentTokens,
      fileTokens: fileTokens,
      historyTokens: currentTokens,
      cachedTokens: this.getCacheStats().savedTokens,
      compressed: false,
      summaryTokens: this.estimateTokens(this.summary),
    };
  }

  /**
   * Format stats for display
   */
  formatStats(stats: ContextStats): string {
    const lines: string[] = [];
    lines.push(`📊 Context Statistics:`);
    lines.push(`   Total: ${stats.totalTokens.toLocaleString()} tokens`);
    lines.push(`   └─ Messages: ${stats.historyTokens.toLocaleString()}`);
    lines.push(`   └─ Files: ${stats.fileTokens.toLocaleString()}`);
    if (stats.summaryTokens > 0) {
      lines.push(`   └─ Summary: ${stats.summaryTokens.toLocaleString()}`);
    }
    if (stats.cachedTokens > 0) {
      lines.push(`   💾 Cache saved: ${stats.cachedTokens.toLocaleString()} tokens`);
    }
    if (stats.compressed) {
      lines.push(`   ⚡ Context compressed`);
    }
    lines.push(`   🎯 Target: ${this.targetTokens.toLocaleString()} tokens`);
    
    const usage = Math.round((stats.totalTokens / this.targetTokens) * 100);
    const bar = this.renderProgressBar(usage);
    lines.push(`   ${bar} ${usage}%`);
    
    return lines.join('\n');
  }

  /**
   * Render progress bar
   */
  private renderProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    let color = '\x1b[32m'; // Green
    if (percentage > 70) color = '\x1b[33m'; // Yellow
    if (percentage > 90) color = '\x1b[31m'; // Red
    
    const reset = '\x1b[0m';
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    return `${color}[${bar}]${reset}`;
  }

  /**
   * Set max context tokens
   */
  setMaxTokens(tokens: number): void {
    this.maxContextTokens = tokens;
    this.targetTokens = Math.floor(tokens * 0.8);
  }

  /**
   * Get smart context for AI
   * - Deduplicates similar messages
   * - Prioritizes important content
   * - Compresses if needed
   */
  getOptimizedContext(
    messages: ChatMessage[],
    contextFiles?: string[],
    newQuery?: string
  ): { messages: ChatMessage[]; stats: ContextStats; cached?: string } {
    // Check cache first
    if (newQuery) {
      const cached = this.lookupCache(newQuery);
      if (cached) {
        const stats = this.getStats(messages, contextFiles);
        stats.cachedTokens = cached.tokens;
        return { messages, stats, cached: cached.response };
      }
    }

    // Remove duplicate messages (keeping most recent)
    const deduped = this.deduplicateMessages(messages);
    
    // Compress to fit token limit
    const { messages: compressed, stats } = this.compressContext(deduped, contextFiles);
    
    return { messages: compressed, stats };
  }

  /**
   * Remove duplicate or very similar messages
   */
  private deduplicateMessages(messages: ChatMessage[]): ChatMessage[] {
    const seen = new Set<string>();
    const result: ChatMessage[] = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const normalized = msg.content.toLowerCase().replace(/\s+/g, ' ').trim();
      const key = `${msg.role}:${normalized.slice(0, 100)}`;
      
      if (!seen.has(key)) {
        seen.add(key);
        result.unshift(msg);
      }
    }

    return result;
  }
}

// Singleton instance
let contextManager: ContextManager | null = null;

export function getContextManager(): ContextManager {
  if (!contextManager) {
    contextManager = new ContextManager();
  }
  return contextManager;
}

export function resetContextManager(): void {
  contextManager = null;
}

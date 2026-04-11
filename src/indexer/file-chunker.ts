/**
 * File Chunker - For processing large files without loading entirely into memory
 * Splits files into logical chunks (functions, classes, sections)
 */

import { readFileSync } from 'fs';

export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  type: 'function' | 'class' | 'interface' | 'type' | 'import' | 'comment' | 'other';
  name: string;
  content: string;
  symbols: string[];
  dependencies: string[];
  tokenEstimate: number;
}

export class FileChunker {
  private readonly MAX_CHUNK_SIZE = 8000; // Max lines per chunk
  private readonly CHUNK_OVERLAP = 5; // Lines of overlap between chunks

  /**
   * Chunk a large file into manageable pieces
   */
  chunkFile(filePath: string, content?: string): CodeChunk[] {
    const fullContent = content || readFileSync(filePath, 'utf-8');
    const lines = fullContent.split('\n');
    
    // If file is small enough, return as single chunk
    if (lines.length <= this.MAX_CHUNK_SIZE) {
      return [{
        id: `${filePath}#full`,
        filePath,
        startLine: 1,
        endLine: lines.length,
        type: 'other',
        name: filePath.split('/').pop() || 'file',
        content: fullContent,
        symbols: this.extractSymbols(fullContent),
        dependencies: this.extractDependencies(fullContent),
        tokenEstimate: Math.ceil(fullContent.length / 4),
      }];
    }

    // For large files, chunk by logical boundaries
    return this.chunkByBoundaries(filePath, lines);
  }

  /**
   * Chunk file by logical boundaries (functions, classes, etc.)
   */
  private chunkByBoundaries(filePath: string, lines: string[]): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    let currentChunk: CodeChunk | null = null;
    let currentLines: string[] = [];
    let chunkStartLine = 1;
    let depth = 0;

    const boundaryPatterns = [
      { pattern: /^(export\s+)?(class|interface|type|enum)\s+(\w+)/, type: 'class' as const },
      { pattern: /^(export\s+)?(async\s+)?function\s+(\w+)/, type: 'function' as const },
      { pattern: /^(export\s+)?const\s+(\w+)\s*=\s*(async\s+)?\(/, type: 'function' as const },
      { pattern: /^(\w+)\s*\([^)]*\)\s*\{/, type: 'function' as const }, // Method
      { pattern: /^(import|export)\s+.*\s+from/, type: 'import' as const },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for new boundary
      let isBoundary = false;
      let boundaryName = '';
      let boundaryType: CodeChunk['type'] = 'other';

      for (const { pattern, type } of boundaryPatterns) {
        const match = trimmed.match(pattern);
        if (match && depth === 0) {
          isBoundary = true;
          boundaryName = match[match.length - 1];
          boundaryType = type;
          break;
        }
      }

      // Track brace depth
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      // Finish current chunk if we hit a boundary at root level
      if (isBoundary && currentChunk && depth === 0) {
        currentChunk.content = currentLines.join('\n');
        currentChunk.endLine = i;
        currentChunk.tokenEstimate = Math.ceil(currentChunk.content.length / 4);
        chunks.push(currentChunk);
        
        // Start overlap
        const overlapLines = currentLines.slice(-this.CHUNK_OVERLAP);
        currentLines = [...overlapLines];
        chunkStartLine = i + 1 - this.CHUNK_OVERLAP;
      }

      // Start new chunk
      if (isBoundary && depth === 0) {
        currentChunk = {
          id: `${filePath}#L${i + 1}`,
          filePath,
          startLine: i + 1,
          endLine: i + 1,
          type: boundaryType,
          name: boundaryName,
          content: '',
          symbols: [],
          dependencies: [],
          tokenEstimate: 0,
        };
      }

      depth += openBraces - closeBraces;
      currentLines.push(line);

      // Force chunk if too large
      if (currentLines.length >= this.MAX_CHUNK_SIZE && currentChunk) {
        currentChunk.content = currentLines.join('\n');
        currentChunk.endLine = i + 1;
        currentChunk.tokenEstimate = Math.ceil(currentChunk.content.length / 4);
        chunks.push(currentChunk);
        
        currentLines = [];
        chunkStartLine = i + 2;
        currentChunk = null;
        depth = 0;
      }
    }

    // Add final chunk
    if (currentChunk && currentLines.length > 0) {
      currentChunk.content = currentLines.join('\n');
      currentChunk.endLine = lines.length;
      currentChunk.tokenEstimate = Math.ceil(currentChunk.content.length / 4);
      chunks.push(currentChunk);
    }

    // Fill in symbols and dependencies for each chunk
    for (const chunk of chunks) {
      chunk.symbols = this.extractSymbols(chunk.content);
      chunk.dependencies = this.extractDependencies(chunk.content);
    }

    return chunks;
  }

  /**
   * Extract symbols from chunk content
   */
  private extractSymbols(content: string): string[] {
    const symbols: string[] = [];
    const patterns = [
      /(?:class|interface|type|enum|function)\s+(\w+)/g,
      /const\s+(\w+)\s*[:=]/g,
      /let\s+(\w+)\s*[:=]/g,
      /var\s+(\w+)\s*[:=]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        symbols.push(match[1]);
      }
    }

    return [...new Set(symbols)];
  }

  /**
   * Extract dependencies from chunk content
   */
  private extractDependencies(content: string): string[] {
    const deps: string[] = [];
    const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      deps.push(match[1]);
    }

    return [...new Set(deps)];
  }

  /**
   * Get relevant chunks based on query
   */
  findRelevantChunks(chunks: CodeChunk[], query: string): CodeChunk[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    const scored = chunks.map(chunk => {
      let score = 0;
      const contentLower = chunk.content.toLowerCase();
      
      for (const keyword of keywords) {
        // Name match is high value
        if (chunk.name.toLowerCase().includes(keyword)) score += 20;
        
        // Content match
        const occurrences = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
        score += occurrences * 2;
        
        // Symbol match
        for (const sym of chunk.symbols) {
          if (sym.toLowerCase().includes(keyword)) score += 10;
        }
      }

      // Boost smaller, focused chunks
      if (chunk.type === 'function' && chunk.content.length < 500) score += 5;
      
      return { chunk, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.chunk);
  }

  /**
   * Merge chunks back together with separators
   */
  mergeChunks(chunks: CodeChunk[]): string {
    return chunks
      .map(c => `// --- ${c.filePath}:${c.startLine}-${c.endLine} (${c.name}) ---\n${c.content}`)
      .join('\n\n');
  }

  /**
   * Estimate total tokens for chunks
   */
  estimateTotalTokens(chunks: CodeChunk[]): number {
    return chunks.reduce((sum, c) => sum + c.tokenEstimate, 0);
  }
}

let chunker: FileChunker | null = null;
export function getFileChunker(): FileChunker {
  if (!chunker) chunker = new FileChunker();
  return chunker;
}

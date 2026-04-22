/**
 * Compact RAG search over local code context plus optional web snippets.
 *
 * The local side uses a persistent chunk index under .omk/index/ and a small
 * deterministic sparse embedding. It is not a neural embedding model, but it
 * gives semantic-style vector retrieval without adding dependencies or sending
 * code to an external embedding service.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, extname, join, relative, resolve, sep } from 'path';
import { getFileChunker } from '../indexer/file-chunker.js';
import { getWebFetchTool } from './web-fetch.js';

export interface RagSearchInput {
  query: string;
  maxFiles?: number;
  maxChunks?: number;
  maxWebResults?: number;
  includeWeb?: boolean;
  maxTokens?: number;
  rebuildIndex?: boolean;
}

export interface RagSource {
  type: 'local' | 'web';
  title: string;
  path?: string;
  url?: string;
  score: number;
  tokens: number;
  snippet: string;
}

export interface RagSearchResult {
  query: string;
  tokenBudget: number;
  estimatedTokens: number;
  sources: RagSource[];
  context: string;
  indexPath?: string;
  indexUpdatedAt?: string;
}

interface IndexedFile {
  path: string;
  size: number;
  mtimeMs: number;
  hash: string;
}

interface IndexedChunk {
  id: string;
  path: string;
  title: string;
  startLine: number;
  endLine: number;
  content: string;
  tokens: number;
  embedding: Record<string, number>;
  fileHash: string;
}

interface PersistentRagIndex {
  version: 1;
  cwd: string;
  updatedAt: string;
  files: IndexedFile[];
  chunks: IndexedChunk[];
}

const DEFAULT_TOKEN_BUDGET = 6000;
const CHARS_PER_TOKEN = 4;
const EMBEDDING_DIMS = 512;
const INDEX_VERSION = 1;

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java', '.kt',
  '.c', '.cpp', '.h', '.hpp', '.rb', '.php', '.swift', '.scala', '.cs', '.fs',
  '.ex', '.exs', '.json', '.toml', '.yaml', '.yml', '.md',
]);

const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'target', '.next', '.nuxt', 'coverage',
  '.cache', 'vendor', '__pycache__', '.tox', '.eggs',
]);

const SEMANTIC_ALIASES: Record<string, string[]> = {
  auth: ['oauth', 'login', 'signin', 'credential', 'credentials', 'session', 'token'],
  oauth: ['auth', 'login', 'signin', 'credential', 'session', 'token'],
  token: ['credential', 'secret', 'session', 'auth', 'refresh'],
  refresh: ['renew', 'renewal', 'rotate', 'rotation', 'token'],
  renewal: ['refresh', 'renew', 'rotate', 'rotation', 'token'],
  renew: ['refresh', 'renewal', 'rotate', 'rotation', 'token'],
  credential: ['token', 'secret', 'auth', 'session'],
  credentials: ['token', 'secret', 'auth', 'session'],
  cli: ['command', 'terminal', 'shell', 'binary', 'executable'],
  search: ['find', 'lookup', 'retrieve', 'retrieval', 'query'],
  rag: ['retrieval', 'context', 'snippet', 'chunk', 'index'],
  web: ['internet', 'browser', 'online', 'search'],
  provider: ['model', 'backend', 'gateway', 'adapter'],
  config: ['settings', 'preference', 'toml', 'profile'],
};

const STOP_TERMS = new Set([
  'export', 'function', 'return', 'const', 'let', 'var', 'class', 'interface',
  'type', 'import', 'from', 'async', 'await', 'public', 'private', 'string',
  'number', 'boolean', 'void', 'true', 'false', 'null', 'undefined',
]);

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

function tokenParts(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter(word => word.length > 1 && !STOP_TERMS.has(word));
}

function keywords(query: string): string[] {
  return tokenParts(query)
    .filter(word => word.length > 2)
    .slice(0, 16);
}

function featureHash(feature: string): string {
  let hash = 2166136261;
  for (let i = 0; i < feature.length; i++) {
    hash ^= feature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(Math.abs(hash) % EMBEDDING_DIMS);
}

function addFeature(vector: Record<string, number>, feature: string, weight: number): void {
  const key = featureHash(feature);
  vector[key] = (vector[key] ?? 0) + weight;
}

function expandSemanticTerms(term: string): string[] {
  const aliases = Object.prototype.hasOwnProperty.call(SEMANTIC_ALIASES, term)
    ? SEMANTIC_ALIASES[term]
    : [];
  return [term, ...aliases];
}

function embedText(text: string): Record<string, number> {
  const vector: Record<string, number> = {};
  const terms = tokenParts(text);

  for (const term of terms) {
    for (const expanded of expandSemanticTerms(term)) {
      addFeature(vector, `w:${expanded}`, expanded === term ? 1 : 0.45);
    }

    for (let i = 0; i <= term.length - 3; i++) {
      addFeature(vector, `g:${term.slice(i, i + 3)}`, 0.2);
    }
  }

  normalizeVector(vector);
  return vector;
}

function normalizeVector(vector: Record<string, number>): void {
  const norm = Math.sqrt(Object.values(vector).reduce((sum, value) => sum + value * value, 0));
  if (!norm) return;
  for (const key of Object.keys(vector)) {
    vector[key] = vector[key] / norm;
  }
}

function cosine(a: Record<string, number>, b: Record<string, number>): number {
  let sum = 0;
  const [small, large] = Object.keys(a).length < Object.keys(b).length ? [a, b] : [b, a];
  for (const [key, value] of Object.entries(small)) {
    sum += value * (large[key] ?? 0);
  }
  return sum;
}

function extractFocusedSnippet(content: string, query: string, maxChars: number): string {
  const words = new Set(keywords(query).flatMap(expandSemanticTerms));
  const lines = content.split(/\r?\n/);
  const hits: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if ([...words].some(word => lower.includes(word))) {
      hits.push(i);
      if (hits.length >= 4) break;
    }
  }

  if (hits.length === 0) {
    return content.slice(0, maxChars).trim();
  }

  const selected = new Set<number>();
  for (const hit of hits) {
    for (let i = Math.max(0, hit - 2); i <= Math.min(lines.length - 1, hit + 2); i++) {
      selected.add(i);
    }
  }

  const snippet = Array.from(selected)
    .sort((a, b) => a - b)
    .map(index => `${index + 1}: ${lines[index]}`)
    .join('\n');

  return snippet.slice(0, maxChars).trim();
}

function compactSource(source: RagSource): string {
  const label = source.type === 'local'
    ? `${source.path}`
    : `${source.title} ${source.url}`;
  return [
    `### ${source.type}: ${label}`,
    `score=${source.score.toFixed(3)} tokens=${source.tokens}`,
    source.snippet,
  ].join('\n');
}

export class RagSearchTool {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = resolve(cwd);
  }

  async search(input: RagSearchInput): Promise<RagSearchResult> {
    const query = String(input.query ?? '').trim();
    if (!query) {
      throw new Error('rag_search requires query');
    }

    const tokenBudget = Math.max(1000, Math.min(input.maxTokens ?? DEFAULT_TOKEN_BUDGET, 30000));
    const sources: RagSource[] = [];
    const index = this.loadOrBuildIndex(Boolean(input.rebuildIndex));
    sources.push(...this.searchLocalIndex(index, query, input.maxFiles ?? 8, input.maxChunks ?? 8));

    if (input.includeWeb) {
      sources.push(...await this.searchWeb(query, input.maxWebResults ?? 5));
    }

    const selected: RagSource[] = [];
    let estimatedTokens = estimateTokens(query);

    for (const source of sources.sort((a, b) => b.score - a.score)) {
      if (estimatedTokens + source.tokens > tokenBudget && selected.length > 0) continue;
      selected.push(source);
      estimatedTokens += source.tokens;
      if (estimatedTokens >= tokenBudget) break;
    }

    const context = [
      `# RAG context`,
      `query: ${query}`,
      `budget: ${tokenBudget} tokens`,
      `estimated: ${estimatedTokens} tokens`,
      `index: ${this.getIndexFile()}`,
      '',
      ...selected.map(compactSource),
    ].join('\n\n');

    return {
      query,
      tokenBudget,
      estimatedTokens,
      sources: selected,
      context,
      indexPath: this.getIndexFile(),
      indexUpdatedAt: index.updatedAt,
    };
  }

  private searchLocalIndex(index: PersistentRagIndex, query: string, maxFiles: number, maxChunks: number): RagSource[] {
    const queryEmbedding = embedText(query);
    const terms = keywords(query);
    const seenFiles = new Map<string, number>();

    const scored = index.chunks.map(chunk => {
      const vectorScore = cosine(queryEmbedding, chunk.embedding) * 100;
      const lowerPath = chunk.path.toLowerCase();
      const lowerTitle = chunk.title.toLowerCase();
      const keywordBoost = terms.reduce((score, term) => {
        const expanded = expandSemanticTerms(term);
        if (expanded.some(word => lowerPath.includes(word))) return score + 10;
        if (expanded.some(word => lowerTitle.includes(word))) return score + 8;
        if (expanded.some(word => chunk.content.toLowerCase().includes(word))) return score + 3;
        return score;
      }, 0);

      return {
        chunk,
        score: vectorScore + keywordBoost,
      };
    })
      .filter(item => item.score >= 12)
      .sort((a, b) => b.score - a.score);

    const sources: RagSource[] = [];
    for (const item of scored) {
      const fileHits = seenFiles.get(item.chunk.path) ?? 0;
      if (fileHits >= Math.max(1, Math.ceil(maxChunks / Math.max(1, maxFiles)))) continue;
      if (seenFiles.size >= maxFiles && !seenFiles.has(item.chunk.path)) continue;

      const snippet = extractFocusedSnippet(item.chunk.content, query, 1400);
      sources.push({
        type: 'local',
        title: item.chunk.title,
        path: `${item.chunk.path}:${item.chunk.startLine}-${item.chunk.endLine}`,
        score: item.score,
        tokens: estimateTokens(snippet),
        snippet,
      });
      seenFiles.set(item.chunk.path, fileHits + 1);
      if (sources.length >= maxChunks) break;
    }

    return sources;
  }

  private async searchWeb(query: string, maxResults: number): Promise<RagSource[]> {
    const web = await getWebFetchTool().search({ query, maxResults, mode: 'full' });
    return web.results.map((result, index) => {
      const snippet = result.snippet.slice(0, 900);
      return {
        type: 'web',
        title: result.title,
        url: result.url,
        score: 50 - index,
        tokens: estimateTokens(snippet),
        snippet,
      };
    });
  }

  private loadOrBuildIndex(force: boolean): PersistentRagIndex {
    if (!force) {
      const existing = this.readIndex();
      if (existing && !this.needsRebuild(existing)) {
        return existing;
      }
    }

    const index = this.buildIndex();
    this.writeIndex(index);
    return index;
  }

  private readIndex(): PersistentRagIndex | null {
    const file = this.getIndexFile();
    if (!existsSync(file)) return null;

    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as PersistentRagIndex;
      if (parsed.version !== INDEX_VERSION || parsed.cwd !== this.cwd) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private needsRebuild(index: PersistentRagIndex): boolean {
    const currentFiles = this.findIndexableFiles();
    if (currentFiles.length !== index.files.length) return true;

    const known = new Map(index.files.map(file => [file.path, file]));
    for (const fullPath of currentFiles) {
      const relPath = relative(this.cwd, fullPath);
      const stat = statSync(fullPath);
      const cached = known.get(relPath);
      if (!cached || cached.size !== stat.size || cached.mtimeMs !== stat.mtimeMs) {
        return true;
      }
    }
    return false;
  }

  private buildIndex(): PersistentRagIndex {
    const chunker = getFileChunker();
    const files: IndexedFile[] = [];
    const chunks: IndexedChunk[] = [];

    for (const fullPath of this.findIndexableFiles()) {
      let content = '';
      try {
        content = readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }
      const stat = statSync(fullPath);
      const relPath = relative(this.cwd, fullPath);
      const hash = simpleHash(content);
      files.push({
        path: relPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        hash,
      });

      for (const chunk of chunker.chunkFile(relPath, content)) {
        const chunkContent = chunk.content.slice(0, 6000);
        const title = chunk.name || relPath;
        chunks.push({
          id: `${relPath}#${chunk.startLine}-${chunk.endLine}`,
          path: relPath,
          title,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunkContent,
          tokens: estimateTokens(chunkContent),
          embedding: embedText([relPath, title, chunk.symbols.join(' '), chunkContent].join('\n')),
          fileHash: hash,
        });
      }
    }

    return {
      version: INDEX_VERSION,
      cwd: this.cwd,
      updatedAt: new Date().toISOString(),
      files,
      chunks,
    };
  }

  private findIndexableFiles(): string[] {
    const files: string[] = [];

    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          if (entry.name.startsWith('.') && entry.name !== '.github' && entry.name !== '.omk') continue;
          visit(join(dir, entry.name));
          continue;
        }

        if (!entry.isFile()) continue;
        const fullPath = join(dir, entry.name);
        const relPath = relative(this.cwd, fullPath);
        if (relPath.split(sep).includes('.omk')) continue;
        if (!CODE_EXTENSIONS.has(extname(entry.name))) continue;
        if (statSync(fullPath).size > 1_000_000) continue;
        files.push(fullPath);
      }
    };

    visit(this.cwd);
    return files.sort((a, b) => a.localeCompare(b));
  }

  private getIndexFile(): string {
    return join(this.getIndexDir(), 'rag-index.json');
  }

  private getIndexDir(): string {
    const dir = join(this.cwd, '.omk', 'index');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private writeIndex(index: PersistentRagIndex): void {
    const file = this.getIndexFile();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(index, null, 2));
  }
}

export function getRagSearchTool(cwd?: string): RagSearchTool {
  return new RagSearchTool(cwd);
}

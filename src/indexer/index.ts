/**
 * Codebase Indexer Module
 * Export all indexing functionality for large projects
 */

export { CodebaseIndexer, getCodebaseIndexer } from './codebase-indexer.js';
export { FileChunker, getFileChunker } from './file-chunker.js';
export type { Symbol, FileIndex, RepositoryMap, ModuleInfo } from './codebase-indexer.js';
export type { CodeChunk } from './file-chunker.js';

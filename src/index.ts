/**
 * Oh-my-KIMI
 * Multi-agent orchestration for Kimi AI
 */

// API
export { KimiClient, KimiAPIError, KimiConfigError } from './api/kimi.js';
export type { 
  KimiMessage, 
  KimiTool, 
  KimiToolCall,
  KimiCompletionOptions, 
  KimiCompletionResponse,
  KimiStreamChunk 
} from './api/kimi.js';

// State
export {
  writeModeState,
  readModeState,
  clearModeState,
  listActiveModes,
  createTask,
  updateTask,
  getTask,
  listTasks,
  appendToNotepad,
  readNotepad,
  readProjectMemory,
  writeProjectMemory,
  createContextSnapshot,
} from './state/index.js';
export type { ModeState, Task, ProjectMemory } from './state/index.js';

// CLI
export { main } from './cli/index.js';

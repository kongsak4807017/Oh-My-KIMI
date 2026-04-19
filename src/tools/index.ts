/**
 * OMK Tools - Complete tool suite like OMX
 */

export { FileSystemTools, getFileSystemTools } from './file-system.js';
export { WebFetchTool, getWebFetchTool } from './web-fetch.js';
export { CodeIntelTools, getCodeIntelTools } from './code-intel.js';
export { ExecuteTool, getExecuteTool } from './execute.js';
export { MemoryTools, getMemoryTools } from './memory.js';

// Tool definitions for AI
export const toolDefinitions = [
  {
    name: '$read_file',
    description: 'Read file contents. Supports offset and limit for large files.',
    parameters: {
      path: 'File path (required)',
      offset: 'Start reading from this character offset (optional)',
      limit: 'Maximum characters to read (default: 10000)',
    },
  },
  {
    name: '$write_file',
    description: 'Write or append content to a file. Creates directories if needed.',
    parameters: {
      path: 'File path (required)',
      content: 'Content to write (required)',
      append: 'Append to existing file (default: false)',
    },
  },
  {
    name: '$list_directory',
    description: 'List directory contents. Supports recursive listing.',
    parameters: {
      path: 'Directory path (required)',
      recursive: 'List recursively (default: false)',
    },
  },
  {
    name: '$search_files',
    description: 'Search for patterns in files using grep/ripgrep.',
    parameters: {
      path: 'Directory to search in (required)',
      pattern: 'Search pattern (required)',
      filePattern: 'Filter by file pattern, e.g., "*.ts" (optional)',
    },
  },
  {
    name: '$web_fetch',
    description: 'Fetch content from URLs. Supports HTML stripping.',
    parameters: {
      url: 'URL to fetch (required)',
      maxLength: 'Maximum characters (default: 50000)',
      format: 'Output format: text, html, json (default: text)',
    },
  },
  {
    name: '$web_search',
    description: 'Search the web and return concise result links/snippets.',
    parameters: {
      query: 'Search query (required)',
      maxResults: 'Maximum results, 1-10 (default: 5)',
    },
  },
  {
    name: '$diagnostics',
    description: 'Run TypeScript diagnostics (tsc --noEmit).',
    parameters: {
      file: 'File or directory to check (required)',
      severity: 'Filter: error, warning, all (default: all)',
    },
  },
  {
    name: '$document_symbols',
    description: 'Extract symbols (functions, classes) from a file.',
    parameters: {
      file: 'File path (required)',
    },
  },
  {
    name: '$find_references',
    description: 'Find all references to a symbol across codebase.',
    parameters: {
      file: 'Starting file (required)',
      symbol: 'Symbol name to find (required)',
    },
  },
  {
    name: '$execute_command',
    description: 'Execute shell commands safely.',
    parameters: {
      command: 'Command to run (required)',
      args: 'Command arguments array (optional)',
      timeout: 'Timeout in ms (default: 60000)',
    },
  },
  {
    name: '$memory_read',
    description: 'Read project memory and notepad.',
    parameters: {
      section: 'Section to read: all, techStack, notes, directives',
    },
  },
  {
    name: '$memory_write',
    description: 'Write to project memory.',
    parameters: {
      type: 'Type: note, directive, techStack, conventions',
      content: 'Content to save (required)',
      priority: 'For directives: high, normal',
    },
  },
];

export const openAIToolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read file contents. Supports offset and limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number' },
          limit: { type: 'number' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Write or append content to a file inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          append: { type: 'boolean' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_directory',
      description: 'List directory contents. Supports recursive listing.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          recursive: { type: 'boolean' },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_files',
      description: 'Search for a literal pattern in files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          pattern: { type: 'string' },
          filePattern: { type: 'string' },
        },
        required: ['path', 'pattern'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_fetch',
      description: 'Fetch content from a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          maxLength: { type: 'number' },
          format: { type: 'string', enum: ['text', 'html', 'json'] },
        },
        required: ['url'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Search the web and return concise result links/snippets.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'diagnostics',
      description: 'Run TypeScript diagnostics.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['error', 'warning', 'all'] },
        },
        required: ['file'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'spawn_subagent',
      description: 'Run a bounded sub-agent lane on a focused task. Use for simple independent subtasks. The sub-agent can use a different model, for example openrouter/free or another configured free OpenRouter model.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          role: { type: 'string' },
          model: { type: 'string' },
        },
        required: ['task'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'document_symbols',
      description: 'Extract symbols from a file.',
      parameters: {
        type: 'object',
        properties: { file: { type: 'string' } },
        required: ['file'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_references',
      description: 'Find all references to a symbol across the codebase.',
      parameters: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          symbol: { type: 'string' },
        },
        required: ['file', 'symbol'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Execute an allowlisted shell command.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
          timeout: { type: 'number' },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'memory_read',
      description: 'Read project memory and notepad.',
      parameters: {
        type: 'object',
        properties: {
          section: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'memory_write',
      description: 'Write to project memory.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          content: { type: 'string' },
          priority: { type: 'string' },
          category: { type: 'string' },
          context: { type: 'string' },
        },
        required: ['type', 'content'],
        additionalProperties: false,
      },
    },
  },
];

// Tool dispatcher
export class ToolDispatcher {
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
  }

  async dispatch(toolName: string, args: Record<string, any>): Promise<any> {
    const { getFileSystemTools } = await import('./file-system.js');
    const { getWebFetchTool } = await import('./web-fetch.js');
    const { getCodeIntelTools } = await import('./code-intel.js');
    const { getExecuteTool } = await import('./execute.js');
    const { getMemoryTools } = await import('./memory.js');

    const normalizedToolName = toolName.startsWith('$') ? toolName : `$${toolName}`;

    switch (normalizedToolName) {
      case '$read_file':
        return getFileSystemTools(this.cwd).readFile(args as any);
      
      case '$write_file':
        return getFileSystemTools(this.cwd).writeFile(args as any);
      
      case '$list_directory':
        return getFileSystemTools(this.cwd).listDirectory(args as any);
      
      case '$search_files':
        return getFileSystemTools(this.cwd).searchFiles(args as any);
      
      case '$web_fetch':
        return getWebFetchTool().fetch(args as any);

      case '$web_search':
        return getWebFetchTool().search(args as any);
      
      case '$diagnostics':
        return getCodeIntelTools(this.cwd).diagnostics(args as any);
      
      case '$document_symbols':
        return getCodeIntelTools(this.cwd).documentSymbols(args as any);
      
      case '$find_references':
        return getCodeIntelTools(this.cwd).findReferences(args as any);
      
      case '$execute_command':
        return getExecuteTool().execute(args as any);
      
      case '$memory_read':
        return getMemoryTools(this.cwd).readMemory(args?.section);
      
      case '$memory_write':
        if (args.type === 'note') {
          getMemoryTools(this.cwd).addNote(args.category || 'general', args.content);
        } else if (args.type === 'directive') {
          getMemoryTools(this.cwd).addDirective(args.content, args.priority || 'normal', args.context);
        } else {
          getMemoryTools(this.cwd).writeMemory({ [args.type]: args.content });
        }
        return { success: true };
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

export function getToolDispatcher(cwd?: string): ToolDispatcher {
  return new ToolDispatcher(cwd);
}

/**
 * MCP Server for OMK
 * Exposes OMK state and tools via Model Context Protocol
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  MCPRequest, 
  MCPResponse, 
  MCPServerInfo, 
  MCPResource, 
  MCPTool,
  MCPPrompt 
} from './types.js';
import { listActiveModes, listTasks, readNotepad, readProjectMemory } from '../state/index.js';

export class OMKMCPServer {
  private port: number;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(port: number = 3000) {
    this.port = port;
  }

  start(): void {
    this.server = createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const request = JSON.parse(body) as MCPRequest;
          const response = await this.handleRequest(request);
          res.setHeader('Content-Type', 'application/json');
          res.writeHead(200);
          res.end(JSON.stringify(response));
        } catch (err) {
          const errorResponse: MCPResponse = {
            jsonrpc: '2.0',
            id: 0,
            error: {
              code: -32700,
              message: 'Parse error',
            },
          };
          res.writeHead(400);
          res.end(JSON.stringify(errorResponse));
        }
      });
    });

    this.server.listen(this.port, () => {
      console.log(`[OMK MCP Server] Running on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    switch (method) {
      case 'initialize':
        return this.handleInitialize(id);
      
      case 'resources/list':
        return this.handleListResources(id);
      
      case 'resources/read':
        return this.handleReadResource(id, params as { uri: string });
      
      case 'tools/list':
        return this.handleListTools(id);
      
      case 'tools/call':
        return await this.handleCallTool(id, params as { name: string; arguments: Record<string, unknown> });
      
      case 'prompts/list':
        return this.handleListPrompts(id);
      
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  private handleInitialize(id: number | string): MCPResponse {
    const serverInfo: MCPServerInfo = {
      name: 'oh-my-kimi',
      version: '0.1.0',
      capabilities: {
        resources: {
          subscribe: false,
          listChanged: false,
        },
        tools: {
          listChanged: false,
        },
        prompts: {
          listChanged: false,
        },
      },
    };

    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo,
      },
    };
  }

  private handleListResources(id: number | string): MCPResponse {
    const resources: MCPResource[] = [
      {
        uri: 'omk://state/current',
        mimeType: 'application/json',
      },
      {
        uri: 'omk://tasks/all',
        mimeType: 'application/json',
      },
      {
        uri: 'omk://notepad/current',
        mimeType: 'text/markdown',
      },
      {
        uri: 'omk://memory/project',
        mimeType: 'application/json',
      },
    ];

    return {
      jsonrpc: '2.0',
      id,
      result: { resources },
    };
  }

  private handleReadResource(id: number | string, params: { uri: string }): MCPResponse {
    const { uri } = params;
    const cwd = process.cwd();

    try {
      switch (uri) {
        case 'omk://state/current': {
          const modes = listActiveModes(cwd);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ modes }, null, 2),
              }],
            },
          };
        }

        case 'omk://tasks/all': {
          const tasks = listTasks(cwd);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ tasks }, null, 2),
              }],
            },
          };
        }

        case 'omk://notepad/current': {
          const content = readNotepad(cwd);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'text/markdown',
                text: content || '# No notes yet',
              }],
            },
          };
        }

        case 'omk://memory/project': {
          const memory = readProjectMemory(cwd);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(memory, null, 2),
              }],
            },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Resource not found: ${uri}`,
            },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Internal error: ${err instanceof Error ? err.message : 'Unknown'}`,
        },
      };
    }
  }

  private handleListTools(id: number | string): MCPResponse {
    const tools: MCPTool[] = [
      {
        name: 'omk_create_task',
        description: 'Create a new task in OMK',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['title'],
        },
      },
      {
        name: 'omk_list_tasks',
        description: 'List all tasks',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'omk_append_notepad',
        description: 'Append to session notepad',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string' },
          },
          required: ['content'],
        },
      },
      {
        name: 'omk_read_file',
        description: 'Read a file from the project',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
      },
    ];

    return {
      jsonrpc: '2.0',
      id,
      result: { tools },
    };
  }

  private async handleCallTool(
    id: number | string, 
    params: { name: string; arguments: Record<string, unknown> }
  ): Promise<MCPResponse> {
    const { name, arguments: args } = params;
    const cwd = process.cwd();

    try {
      switch (name) {
        case 'omk_create_task': {
          const { createTask } = await import('../state/index.js');
          const task = createTask({
            title: args.title as string,
            description: args.description as string,
            status: 'pending',
          }, cwd);
          
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: `Created task: ${task.id}`,
              }],
            },
          };
        }

        case 'omk_list_tasks': {
          const { listTasks } = await import('../state/index.js');
          const tasks = listTasks(cwd);
          
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: JSON.stringify(tasks, null, 2),
              }],
            },
          };
        }

        case 'omk_append_notepad': {
          const { appendToNotepad } = await import('../state/index.js');
          appendToNotepad(args.content as string, cwd);
          
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: 'Added to notepad',
              }],
            },
          };
        }

        case 'omk_read_file': {
          const filePath = join(cwd, args.path as string);
          if (!existsSync(filePath)) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: `File not found: ${args.path}`,
              },
            };
          }
          
          const content = readFileSync(filePath, 'utf-8');
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{
                type: 'text',
                text: content,
              }],
            },
          };
        }

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Tool not found: ${name}`,
            },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: `Tool execution failed: ${err instanceof Error ? err.message : 'Unknown'}`,
        },
      };
    }
  }

  private handleListPrompts(id: number | string): MCPResponse {
    const prompts: MCPPrompt[] = [
      {
        name: 'omk_code_review',
        description: 'Code review prompt template',
        arguments: [
          {
            name: 'file',
            description: 'File to review',
            required: true,
          },
        ],
      },
      {
        name: 'omk_plan_feature',
        description: 'Plan a new feature',
        arguments: [
          {
            name: 'description',
            description: 'Feature description',
            required: true,
          },
        ],
      },
    ];

    return {
      jsonrpc: '2.0',
      id,
      result: { prompts },
    };
  }
}

// Singleton instance
let server: OMKMCPServer | null = null;

export function startMCPServer(port?: number): OMKMCPServer {
  if (!server) {
    server = new OMKMCPServer(port);
    server.start();
  }
  return server;
}

export function stopMCPServer(): void {
  if (server) {
    server.stop();
    server = null;
  }
}

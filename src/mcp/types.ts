/**
 * MCP (Model Context Protocol) Types
 * Based on https://modelcontextprotocol.io/
 */

// Core types
export interface MCPResource {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: {
    name: string;
    description?: string;
    required?: boolean;
  }[];
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// OMK-specific MCP resources
export interface OMKStateResource extends MCPResource {
  uri: 'omk://state/current';
  mode: string;
  phase: string;
  active: boolean;
}

export interface OMKTaskResource extends MCPResource {
  uri: 'omk://tasks/all';
  tasks: {
    id: string;
    title: string;
    status: string;
  }[];
}

export interface OMKNotepadResource extends MCPResource {
  uri: 'omk://notepad/current';
  content: string;
}

// MCP Server capabilities
export interface MCPServerCapabilities {
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
}

export interface MCPServerInfo {
  name: string;
  version: string;
  capabilities: MCPServerCapabilities;
}

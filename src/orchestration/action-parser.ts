/**
 * Action Parser - Extract tool calls from Kimi CLI text output
 * Supports multiple formats that Kimi might emit
 */

export interface ParsedAction {
  tool: string;
  args: Record<string, any>;
}

const KNOWN_TOOLS = [
  '$read_file',
  '$write_file',
  '$list_directory',
  '$search_files',
  '$web_fetch',
  '$web_search',
  '$rag_search',
  '$diagnostics',
  '$document_symbols',
  '$find_references',
  '$execute_command',
  '$memory_read',
  '$memory_write',
];

/**
 * Try to parse a JSON object from a string fragment
 */
function tryParseJSON(str: string): Record<string, any> | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Parse key=value or key="value" pairs
 */
function parseKeyValuePairs(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match key="value" or key='value' or key=value
  const regex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    result[key] = value;
  }
  return result;
}

/**
 * Extract actions from a line containing a tool call
 */
function extractFromLine(line: string): ParsedAction | null {
  for (const tool of KNOWN_TOOLS) {
    const idx = line.indexOf(tool);
    if (idx === -1) continue;

    const afterTool = line.slice(idx + tool.length).trim();

    // Case 1: JSON object immediately after tool
    if (afterTool.startsWith('{')) {
      // Try to find matching closing brace
      let depth = 0;
      let jsonStr = '';
      for (const char of afterTool) {
        jsonStr += char;
        if (char === '{') depth++;
        if (char === '}') depth--;
        if (depth === 0) break;
      }
      const parsed = tryParseJSON(jsonStr);
      if (parsed) {
        return { tool, args: parsed };
      }
    }

    // Case 2: key=value pairs
    const kv = parseKeyValuePairs(afterTool);
    if (Object.keys(kv).length > 0) {
      return { tool, args: kv };
    }

    // Case 3: Single positional argument (path/url/command)
    const firstToken = afterTool.split(/\s+/)[0];
    if (firstToken) {
      if (tool === '$read_file') return { tool, args: { path: firstToken } };
      if (tool === '$list_directory') return { tool, args: { path: firstToken } };
      if (tool === '$search_files') return { tool, args: { path: '.', pattern: firstToken } };
      if (tool === '$web_fetch') return { tool, args: { url: firstToken } };
      if (tool === '$web_search') return { tool, args: { query: afterTool } };
      if (tool === '$rag_search') return { tool, args: { query: afterTool } };
      if (tool === '$diagnostics') return { tool, args: { file: firstToken } };
      if (tool === '$document_symbols') return { tool, args: { file: firstToken } };
      if (tool === '$execute_command') return { tool, args: { command: afterTool } };
      if (tool === '$memory_read') return { tool, args: { section: firstToken } };
      return { tool, args: { input: firstToken } };
    }
  }
  return null;
}

/**
 * Parse markdown code blocks that might contain tool calls
 */
function extractFromCodeBlocks(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const blockContent = match[1];
    const lines = blockContent.split('\n');
    for (const line of lines) {
      const action = extractFromLine(line.trim());
      if (action) {
        actions.push(action);
      }
    }
  }

  return actions;
}

/**
 * Parse inline tool calls outside code blocks
 */
function extractFromInline(text: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip lines that are clearly explanations
    if (trimmed.startsWith('#') || trimmed.startsWith('>') || trimmed.startsWith('-')) {
      // But still check if a tool call is embedded
    }
    // Only process lines that actually contain a $tool
    if (!KNOWN_TOOLS.some(t => trimmed.includes(t))) continue;

    const action = extractFromLine(trimmed);
    if (action) {
      actions.push(action);
    }
  }

  return actions;
}

/**
 * Main entry: parse all actions from Kimi output
 */
export function parseActions(text: string): ParsedAction[] {
  const fromBlocks = extractFromCodeBlocks(text);
  const fromInline = extractFromInline(text);

  // Merge and deduplicate by stringified representation
  const seen = new Set<string>();
  const results: ParsedAction[] = [];

  for (const action of [...fromBlocks, ...fromInline]) {
    const key = `${action.tool}:${JSON.stringify(action.args)}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(action);
    }
  }

  return results;
}

/**
 * Action Executor - Execute parsed tool calls from Kimi output
 */

import { getToolDispatcher } from '../tools/index.js';
import { ParsedAction } from './action-parser.js';

export interface ExecutionResult {
  action: ParsedAction;
  success: boolean;
  result: any;
  error?: string;
}

/**
 * Execute a single parsed action
 */
export async function executeAction(
  action: ParsedAction,
  cwd: string = process.cwd()
): Promise<ExecutionResult> {
  const dispatcher = getToolDispatcher(cwd);

  try {
    const result = await dispatcher.dispatch(action.tool, action.args);
    return {
      action,
      success: true,
      result,
    };
  } catch (err) {
    return {
      action,
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute multiple actions sequentially
 */
export async function executeActions(
  actions: ParsedAction[],
  cwd: string = process.cwd()
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  for (const action of actions) {
    const result = await executeAction(action, cwd);
    results.push(result);
  }
  return results;
}

/**
 * Format execution results for feeding back to Kimi
 */
export function formatResultsForPrompt(results: ExecutionResult[]): string {
  if (results.length === 0) return '';

  const lines: string[] = ['\n\n## Tool Results\n'];

  for (const res of results) {
    lines.push(`### ${res.action.tool}`);
    if (res.success) {
      const output = typeof res.result === 'string'
        ? res.result
        : JSON.stringify(res.result, null, 2);
      lines.push('**Result:**');
      lines.push('```');
      lines.push(output.slice(0, 10000));
      lines.push('```');
    } else {
      lines.push('**Error:**');
      lines.push('```');
      lines.push(res.error || 'Unknown error');
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

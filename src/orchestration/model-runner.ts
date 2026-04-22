/**
 * Provider-backed model runner for orchestration engines.
 * This replaces hard Kimi CLI coupling while preserving the old RunResult shape.
 */

import { getProviderManager } from '../providers/manager.js';
import { ChatMessage, ProviderConfig, ProviderType, ToolCall } from '../providers/types.js';
import { openAIToolDefinitions } from '../tools/index.js';
import { executeActions, formatResultsForPrompt } from './action-executor.js';
import { parseActions } from './action-parser.js';

export interface ModelRunOptions {
  provider?: ProviderType;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
  yolo?: boolean;
  thinking?: boolean;
  reasoning?: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  toolCalls?: number;
}

function providerConfigFromOptions(options: ModelRunOptions): ProviderConfig {
  return {
    type: options.provider ?? 'auto',
    model: options.model,
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    apiKeyEnv: options.apiKeyEnv,
    headers: options.headers,
    reasoning: options.reasoning as any,
  };
}

async function getInitializedProvider(options: ModelRunOptions) {
  const manager = getProviderManager();
  try {
    return manager.getProvider();
  } catch {
    await manager.initialize(providerConfigFromOptions(options));
    return manager.getProvider();
  }
}

export async function runModelPrompt(
  prompt: string,
  options: ModelRunOptions = {}
): Promise<RunResult> {
  const provider = await getInitializedProvider(options);
  let stdout = '';
  let stderr = '';

  try {
    for await (const chunk of provider.stream({
      messages: [{ role: 'user', content: prompt }],
      model: options.model,
      reasoning: options.reasoning as any,
    })) {
      if (chunk.content) {
        stdout += chunk.content;
        process.stdout.write(chunk.content);
      }
      if (chunk.done) break;
    }

    if (!stdout.trim()) {
      const response = await provider.chat({
        messages: [{ role: 'user', content: prompt }],
        model: options.model,
        reasoning: options.reasoning as any,
      });
      stdout = response.content || '';
      if (stdout) process.stdout.write(stdout);
    }
  } catch (err) {
    stderr = err instanceof Error ? err.message : String(err);
    throw err;
  }

  if (stdout && !stdout.endsWith('\n')) process.stdout.write('\n');
  return { stdout, stderr, exitCode: 0 };
}

export async function runModelToolLoop(
  prompt: string,
  cwd: string,
  options: ModelRunOptions = {},
  loopOptions: { maxIterations?: number; executeTextActions?: boolean; showEvidence?: boolean; systemPrompt?: string; silent?: boolean } = {}
): Promise<RunResult> {
  const provider = await getInitializedProvider(options);
  const maxIterations = loopOptions.maxIterations ?? 5;
  const executeTextActions = loopOptions.executeTextActions ?? true;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        [
          'You are an autonomous coding agent.',
          'Default to acting like an agent, not a chatbot: gather evidence, execute the next concrete step, verify, then summarize.',
          'Use the provided tools when reading files, writing files, searching, spawning subagents, or running verification commands.',
          'For implementation, investigation, review, diagnosis, or workspace-specific questions, do not merely describe capabilities. Call tools and then summarize what actually happened.',
          'For pure conceptual questions that do not depend on the workspace, answer directly without unnecessary tools.',
          'If native function calling is unavailable, emit one text action per line using forms such as $read_file path="src/index.ts", $search_files path="." pattern="TODO", $rag_search query="provider routing", or $execute_command command="npm test".',
          'Do not claim files were inspected, commands were run, or work is complete unless tool evidence supports it.',
          'If the user says "do it" or "ทำเลย", infer the actionable task from recent context and execute it.',
          loopOptions.systemPrompt,
        ].filter(Boolean).join('\n'),
    },
    { role: 'user', content: prompt },
  ];

  let stdout = '';
  let stderr = '';
  let toolCallCount = 0;
  const showEvidence = loopOptions.showEvidence ?? true;
  const writeOutput = (text: string): void => {
    if (!loopOptions.silent) process.stdout.write(text);
  };

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let response;
    try {
      response = await provider.chat({
        messages,
        model: options.model,
        reasoning: options.reasoning as any,
        tools: openAIToolDefinitions,
        toolChoice: 'auto',
      });
    } catch (err) {
      stderr = err instanceof Error ? err.message : String(err);
      throw err;
    }

    if (response.content) {
      stdout += response.content;
      writeOutput(response.content);
      if (!response.content.endsWith('\n')) writeOutput('\n');
    }

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length > 0) {
      toolCallCount += toolCalls.length;
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        if (showEvidence) {
          const evidence = formatToolStart(toolCall);
          stdout += evidence;
          writeOutput(evidence);
        }

        const result = await executeToolCall(toolCall, cwd, options);
        const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        if (showEvidence) {
          const evidence = formatToolEnd(toolCall, result);
          stdout += evidence;
          writeOutput(evidence);
        }
        stdout += `\n[Tool ${toolCall.function.name}]\n${content}\n`;
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content,
        });
      }
      continue;
    }

    const textActions = executeTextActions ? parseActions(response.content) : [];
    if (textActions.length > 0) {
      toolCallCount += textActions.length;
      const execResults = await executeActions(textActions, cwd);
      const feedback = formatResultsForPrompt(execResults);
      stdout += feedback;
      if (!loopOptions.silent) console.log(feedback);
      messages.push({ role: 'assistant', content: response.content || '' });
      messages.push({ role: 'user', content: `Tool results are below. Continue or finish.\n${feedback}` });
      continue;
    }

    break;
  }

  if (showEvidence && toolCallCount === 0) {
    const evidence = '[agent] No tools were called; no external process, file read/write, web fetch, or sub-agent work was executed.\n';
    stdout += evidence;
    writeOutput(evidence);
  }

  return { stdout, stderr, exitCode: 0, toolCalls: toolCallCount };
}

async function executeToolCall(toolCall: ToolCall, cwd: string, options: ModelRunOptions): Promise<unknown> {
  let args: Record<string, unknown> = {};
  if (toolCall.function.arguments?.trim()) {
    try {
      args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      args = { input: toolCall.function.arguments };
    }
  }

  if (toolCall.function.name === 'spawn_subagent') {
    return runSubagent(args, options);
  }

  const { executeAction } = await import('./action-executor.js');
  const result = await executeAction({
    tool: toolCall.function.name,
    args,
  }, cwd);

  return result.success ? result.result : { error: result.error ?? 'Tool failed' };
}

async function runSubagent(args: Record<string, unknown>, options: ModelRunOptions): Promise<unknown> {
  const task = String(args.task ?? '').trim();
  if (!task) {
    return { error: 'spawn_subagent requires task' };
  }

  const model = typeof args.model === 'string' && args.model.trim()
    ? args.model.trim()
    : process.env.OMK_SUBAGENT_MODEL || process.env.OPENROUTER_FREE_MODEL || 'openrouter/free';
  const role = typeof args.role === 'string' && args.role.trim() ? args.role.trim() : 'subagent';
  const provider = await getInitializedProvider(options);

  const response = await provider.chat({
    model,
    reasoning: 'low',
    messages: [
      {
        role: 'system',
        content: `You are ${role}, a bounded sub-agent. Complete only this assigned slice. Be concise and return evidence or findings.`,
      },
      { role: 'user', content: task },
    ],
  });

  return {
    role,
    model,
    task,
    content: response.content || '',
    finishReason: response.finishReason,
  };
}

function formatToolStart(toolCall: ToolCall): string {
  const args = compactArguments(toolCall.function.arguments);
  return `[tool] ${toolCall.function.name} ${args}\n`;
}

function formatToolEnd(toolCall: ToolCall, result: unknown): string {
  return `[tool] ${toolCall.function.name} ok - ${summarizeResult(result)}\n`;
}

function compactArguments(raw: string): string {
  if (!raw) return '{}';
  return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw;
}

function summarizeResult(result: unknown): string {
  if (typeof result === 'string') {
    return `${result.length} chars`;
  }
  const json = JSON.stringify(result);
  return json.length > 180 ? `${json.slice(0, 177)}...` : json;
}

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
  loopOptions: { maxIterations?: number; executeTextActions?: boolean } = {}
): Promise<RunResult> {
  const provider = await getInitializedProvider(options);
  const maxIterations = loopOptions.maxIterations ?? 5;
  const executeTextActions = loopOptions.executeTextActions ?? true;
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are an autonomous coding agent. Use the provided tools when reading files, writing files, searching, or running verification commands. Keep responses concise and continue until the requested step is complete.',
    },
    { role: 'user', content: prompt },
  ];

  let stdout = '';
  let stderr = '';

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
      process.stdout.write(response.content);
      if (!response.content.endsWith('\n')) process.stdout.write('\n');
    }

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const result = await executeToolCall(toolCall, cwd);
        const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
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
      const execResults = await executeActions(textActions, cwd);
      const feedback = formatResultsForPrompt(execResults);
      stdout += feedback;
      console.log(feedback);
      messages.push({ role: 'assistant', content: response.content || '' });
      messages.push({ role: 'user', content: `Tool results are below. Continue or finish.\n${feedback}` });
      continue;
    }

    break;
  }

  return { stdout, stderr, exitCode: 0 };
}

async function executeToolCall(toolCall: ToolCall, cwd: string): Promise<unknown> {
  let args: Record<string, unknown> = {};
  if (toolCall.function.arguments?.trim()) {
    try {
      args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      args = { input: toolCall.function.arguments };
    }
  }

  const { executeAction } = await import('./action-executor.js');
  const result = await executeAction({
    tool: toolCall.function.name,
    args,
  }, cwd);

  return result.success ? result.result : { error: result.error ?? 'Tool failed' };
}

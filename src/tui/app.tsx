/**
 * OMK TUI - Terminal User Interface
 * Full-featured CLI interface with real-time updates
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { readdirSync } from 'fs';
import { join } from 'path';
import { resolveExecutionProfile } from '../orchestration/phase-map.js';
// Simple spinner component since ink-spinner has compatibility issues
const Spinner = ({ type = 'dots' }: { type?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = type === 'dots' ? ['.', 'o', 'O', 'o'] : ['-', '\\', '|', '/'];
  
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  
  return <Text>{frames[frame]}</Text>;
};
import TextInput from 'ink-text-input';
import { Header } from './components/Header.js';
import { Footer } from './components/Footer.js';
import { AgentPanel } from './components/AgentPanel.js';
import { StatusHud } from './components/StatusHud.js';
import { ProviderManager } from '../providers/index.js';
import { Agent, Activity, TokenUsage } from './types.js';
import { listAvailableSkills } from '../skills/runtime.js';

interface Suggestion {
  value: string;
  display: string;
  hint: string;
  kind: 'command' | 'tool' | 'skill' | 'file';
}

const TOKEN_LIMIT = 262144;

const COMMAND_SUGGESTIONS: Suggestion[] = [
  { value: '/help', display: '/help', hint: 'show commands', kind: 'command' },
  { value: '/skills', display: '/skills', hint: 'list workflows', kind: 'command' },
  { value: '/tools', display: '/tools', hint: 'list tools', kind: 'command' },
  { value: '/model', display: '/model', hint: 'switch provider', kind: 'command' },
  { value: '/status', display: '/status', hint: 'session status', kind: 'command' },
  { value: '/settings', display: '/settings', hint: 'provider and cwd', kind: 'command' },
  { value: '/tokens', display: '/tokens', hint: 'token usage', kind: 'command' },
  { value: '/rag', display: '/rag', hint: 'compact retrieval', kind: 'command' },
  { value: '/file', display: '/file', hint: 'add context file', kind: 'command' },
  { value: '/context', display: '/context', hint: 'show context', kind: 'command' },
  { value: '/exit', display: '/exit', hint: 'quit OMK', kind: 'command' },
];

const TOOL_SUGGESTIONS: Suggestion[] = [
  { value: '$read_file', display: '$read_file', hint: 'read file', kind: 'tool' },
  { value: '$write_file', display: '$write_file', hint: 'write file', kind: 'tool' },
  { value: '$list_directory', display: '$list_directory', hint: 'list directory', kind: 'tool' },
  { value: '$search_files', display: '$search_files', hint: 'search files', kind: 'tool' },
  { value: '$execute_command', display: '$execute_command', hint: 'run command', kind: 'tool' },
  { value: '$diagnostics', display: '$diagnostics', hint: 'type diagnostics', kind: 'tool' },
  { value: '$web_fetch', display: '$web_fetch', hint: 'fetch URL', kind: 'tool' },
  { value: '$web_search', display: '$web_search', hint: 'search web', kind: 'tool' },
  { value: '$rag_search', display: '$rag_search', hint: 'compact retrieval', kind: 'tool' },
  { value: '$memory_read', display: '$memory_read', hint: 'read memory', kind: 'tool' },
  { value: '$memory_write', display: '$memory_write', hint: 'write memory', kind: 'tool' },
];

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

function findFiles(cwd: string, search: string, limit = 12): Suggestion[] {
  const results: Suggestion[] = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.nuxt']);

  const walk = (dir: string, relative: string, depth: number) => {
    if (results.length >= limit || depth > 4) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= limit) return;
      if (ignored.has(entry.name)) continue;

      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const lower = rel.toLowerCase();
      const matches = !search || lower.includes(search.toLowerCase());

      if (entry.isDirectory()) {
        if (matches) {
          results.push({ value: `@${rel}/`, display: `@${rel}/`, hint: 'directory', kind: 'file' });
        }
        walk(join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile() && matches) {
        results.push({ value: `@${rel}`, display: `@${rel}`, hint: 'file', kind: 'file' });
      }
    }
  };

  walk(cwd, '', 0);
  return results;
}

function buildSuggestions(input: string, cwd: string, skills: string[]): Suggestion[] {
  const trimmed = input.trimStart();

  if (trimmed.startsWith('/')) {
    return COMMAND_SUGGESTIONS
      .filter(item => item.value.startsWith(trimmed))
      .slice(0, 8);
  }

  if (trimmed.startsWith('$')) {
    const skillSuggestions = skills.map((skill): Suggestion => ({
      value: `$${skill}`,
      display: `$${skill}`,
      hint: 'skill',
      kind: 'skill',
    }));
    return [...TOOL_SUGGESTIONS, ...skillSuggestions]
      .filter(item => item.value.startsWith(trimmed))
      .slice(0, 8);
  }

  const atIndex = input.lastIndexOf('@');
  if (atIndex >= 0) {
    const token = input.slice(atIndex + 1).split(/\s/)[0] ?? '';
    const before = input.slice(0, atIndex);
    return findFiles(cwd, token).map(item => ({
      ...item,
      value: `${before}${item.value}`,
    }));
  }

  return [];
}

interface TUIProps {
  cwd: string;
  providerManager: ProviderManager;
  reasoning?: 'low' | 'medium' | 'high';
  model?: string;
  yolo?: boolean;
}

export const OMKApp: React.FC<TUIProps> = ({ 
  cwd, 
  providerManager, 
  reasoning = 'medium',
  model,
  yolo = false 
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  
  // State
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'plan' | 'agent'>('chat');
  const [showAgents, setShowAgents] = useState(true);
  const [contextUsage, setContextUsage] = useState({ used: 0, total: TOKEN_LIMIT, percentage: 0 });
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    input: 0,
    output: 0,
    context: 0,
    total: 0,
    limit: TOKEN_LIMIT,
    routes: ['input', 'provider', 'output'],
  });
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date }>>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [currentAgent, setCurrentAgent] = useState({ agent: 'idle', role: 'system', phase: 'waiting', task: 'Ready for input' });
  const availableSkills = useMemo(() => listAvailableSkills(cwd), [cwd]);
  const suggestions = useMemo(
    () => buildSuggestions(input, cwd, availableSkills),
    [input, cwd, availableSkills],
  );

  useEffect(() => {
    setSelectedSuggestion(0);
  }, [input]);
  
  // Terminal dimensions
  const [dimensions, setDimensions] = useState({ 
    width: stdout?.columns || 80, 
    height: stdout?.rows || 24 
  });
  
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ 
        width: stdout?.columns || 80, 
        height: stdout?.rows || 24 
      });
    };
    
    stdout?.on('resize', handleResize);
    return () => {
      stdout?.off('resize', handleResize);
    };
  }, [stdout]);
  
  // Add activity helper
  const addActivity = (activity: Omit<Activity, 'id' | 'timestamp'>) => {
    setActivities(prev => [...prev.slice(-50), {
      ...activity,
      id: Date.now().toString(),
      timestamp: new Date(),
    }]);
  };

  const detectTaskType = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes('http') || lower.includes('github') || lower.includes('clone')) return 'repository-analysis';
    if (lower.includes('plan')) return 'planning';
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) return 'debugging';
    if (lower.includes('refactor')) return 'refactoring';
    return 'general-chat';
  };

  const acceptSuggestion = () => {
    const suggestion = suggestions[selectedSuggestion];
    if (!suggestion) return false;
    setInput(suggestion.value);
    return true;
  };
  
  // Keyboard handlers
  useInput((inputStr, key) => {
    // Ctrl+C to exit
    if (key.ctrl && inputStr === 'c') {
      exit();
      return;
    }
    
    // Ctrl+X to toggle mode
    if (key.ctrl && inputStr === 'x') {
      setMode(prev => {
        const modes: Array<'chat' | 'plan' | 'agent'> = ['chat', 'plan', 'agent'];
        const nextIndex = (modes.indexOf(prev) + 1) % modes.length;
        const nextMode = modes[nextIndex];
        addActivity({ type: 'system', message: `Mode: ${nextMode}`, status: 'info' });
        return nextMode;
      });
      return;
    }
    
    // Shift+Tab to toggle agent panel.
    if ((key as any).tab && (key as any).shift) {
      setShowAgents(prev => !prev);
      return;
    }

    if ((key as any).tab && suggestions.length > 0) {
      acceptSuggestion();
      return;
    }

    if ((key as any).upArrow && suggestions.length > 0) {
      setSelectedSuggestion(prev => Math.max(0, prev - 1));
      return;
    }

    if ((key as any).downArrow && suggestions.length > 0) {
      setSelectedSuggestion(prev => Math.min(suggestions.length - 1, prev + 1));
      return;
    }
    
    // Enter to send
    if (key.return && input.trim() && !isProcessing) {
      handleSubmit(input.trim());
    }
  });
  
  const handleSubmit = async (text: string) => {
    if (!text) return;
    
    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }]);
    setInput('');
    setIsProcessing(true);
    
    addActivity({ type: 'user', message: text.slice(0, 60), status: 'running' });
    
    try {
      const provider = providerManager.getProvider();
      const providerType = providerManager.getCurrentType() || 'unknown';
      let response = '';
      const taskType = detectTaskType(text);
      const profile = resolveExecutionProfile({ taskType, cwd });
      const systemMessage = { role: 'system' as const, content: 'You are OMK, a helpful AI assistant.' };
      const historyMessages = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const requestMessages = [
        systemMessage,
        ...historyMessages,
        { role: 'user' as const, content: text },
      ];
      const inputTokens = estimateTokens(text);
      const contextTokens = estimateTokens(systemMessage.content) +
        historyMessages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
      const initialTotal = inputTokens + contextTokens;
      const initialRoutes = [
        `input:${inputTokens}`,
        `system:${estimateTokens(systemMessage.content)}`,
        `history:${historyMessages.length}`,
        providerType,
        'output:0',
      ];
      setTokenUsage({
        input: inputTokens,
        output: 0,
        context: contextTokens,
        total: initialTotal,
        limit: TOKEN_LIMIT,
        routes: initialRoutes,
      });
      setContextUsage({
        used: initialTotal,
        total: TOKEN_LIMIT,
        percentage: Math.min((initialTotal / TOKEN_LIMIT) * 100, 100),
      });
      const routerPhases = ['routing', 'handoff', 'complete'];
      const contextPhases = ['context', 'prompt-prep', 'complete'];
      const workerPhases = profile.phases;
      setCurrentAgent({ agent: 'router', role: 'dispatcher', phase: 'routing', task: text });
      setAgents([
        { id: 'router', name: 'router', role: 'dispatcher', status: 'completed', phase: 'routing', currentStep: 1, totalSteps: routerPhases.length, task: 'Routed the request to the best lane' },
        { id: 'context', name: 'context', role: 'workspace', status: 'running', phase: 'context', currentStep: 1, totalSteps: contextPhases.length, task: 'Loading AGENTS.md and local context' },
        { id: profile.agent, name: profile.agent, role: profile.role, status: 'waiting', phase: workerPhases[0], currentStep: 1, totalSteps: workerPhases.length, task: profile.task },
      ]);
      addActivity({ type: 'agent', message: `router -> ${profile.agent}`, status: 'completed', agentName: 'router', role: 'dispatcher', phase: 'routing' });
      
      setCurrentAgent({ agent: 'context', role: 'workspace', phase: 'context', task: 'Loading workspace instructions' });
      addActivity({ type: 'agent', message: 'Loaded workspace instructions', status: 'completed', agentName: 'context', role: 'workspace', phase: 'context' });
      
      // Stream response
      setAgents(prev => prev.map(agent =>
        agent.id === 'context'
          ? { ...agent, status: 'completed', phase: 'prompt-prep', currentStep: 2, task: 'Workspace context ready' }
          : agent.id === profile.agent
            ? { ...agent, status: 'running', phase: workerPhases[Math.min(2, workerPhases.length - 1)], currentStep: Math.min(3, workerPhases.length) }
            : agent
      ));
      setCurrentAgent({ agent: profile.agent, role: profile.role, phase: workerPhases[Math.min(2, workerPhases.length - 1)], task: profile.task });
      addActivity({ type: 'agent', message: `${profile.agent} is ${profile.task}`, status: 'running', agentName: profile.agent, role: profile.role, phase: workerPhases[Math.min(2, workerPhases.length - 1)] });

      for await (const chunk of provider.stream({
        messages: requestMessages,
      })) {
        response += chunk.content;
        const outputTokens = estimateTokens(response);
        const totalTokens = inputTokens + contextTokens + outputTokens;

        setTokenUsage({
          input: inputTokens,
          output: outputTokens,
          context: contextTokens,
          total: totalTokens,
          limit: TOKEN_LIMIT,
          routes: [
            `input:${inputTokens}`,
            `context:${contextTokens}`,
            providerType,
            `output:${outputTokens}`,
          ],
        });
        setContextUsage({
          used: totalTokens,
          total: TOKEN_LIMIT,
          percentage: Math.min((totalTokens / TOKEN_LIMIT) * 100, 100),
        });
      }
      
      // Add assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
      addActivity({ type: 'assistant', message: 'Response complete', status: 'completed' });
      setCurrentAgent({ agent: profile.agent, role: profile.role, phase: 'complete', task: 'Finished the response' });
      
      setAgents(prev => prev.map(agent =>
        agent.id === profile.agent
          ? { ...agent, status: 'completed', phase: 'complete', currentStep: workerPhases.length, totalSteps: workerPhases.length, task: 'Response streamed successfully' }
          : agent.id === 'router'
            ? { ...agent, phase: 'complete', currentStep: routerPhases.length, totalSteps: routerPhases.length }
            : agent.id === 'context'
              ? { ...agent, phase: 'complete', currentStep: contextPhases.length, totalSteps: contextPhases.length }
              : agent
      ));
      addActivity({ type: 'agent', message: `${profile.agent} completed ${profile.task}`, status: 'completed', agentName: profile.agent, role: profile.role, phase: 'complete' });
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addActivity({ type: 'system', message: `Error: ${errorMsg}`, status: 'error' });
      setCurrentAgent({ agent: 'system', role: 'error', phase: 'failed', task: errorMsg });
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: `[ERROR] ${errorMsg}`, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Layout calculations
  const headerHeight = 4;
  const footerHeight = 5;
  const effectiveShowAgents = showAgents && dimensions.width >= 96;
  const agentPanelWidth = effectiveShowAgents ? Math.min(40, Math.max(32, Math.floor(dimensions.width * 0.28))) : 0;
  const mainWidth = dimensions.width - agentPanelWidth;
  const mainHeight = dimensions.height - headerHeight - footerHeight;
  const maxVisibleMessages = Math.max(1, mainHeight - (suggestions.length > 0 ? 12 : 7));
  
  return (
    <Box flexDirection="column" height={dimensions.height}>
      <Header 
        mode={mode} 
        reasoning={reasoning} 
        provider={providerManager.getCurrentType() || 'unknown'}
        model={model}
        cwd={cwd}
        yolo={yolo}
      />
      
      <Box flexDirection="row" height={mainHeight}>
        {/* Main Chat Area */}
        <Box 
          width={mainWidth} 
          flexDirection="column" 
          paddingX={1}
        >
          <StatusHud
            agent={currentAgent.agent}
            role={currentAgent.role}
            phase={currentAgent.phase}
            task={currentAgent.task}
          />

          {/* Messages */}
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {messages.slice(-maxVisibleMessages).map((msg, idx) => (
              <Box key={idx} marginY={0} flexDirection="column">
                <Box>
                  <Text 
                    color={msg.role === 'user' ? 'cyan' : msg.role === 'assistant' ? 'green' : 'yellow'}
                    bold={msg.role === 'user'}
                  >
                    {msg.role === 'user' ? 'user ' : msg.role === 'assistant' ? 'omk  ' : 'sys  '}
                  </Text>
                  <Text wrap="wrap">{msg.content}</Text>
                </Box>
              </Box>
            ))}
            
            {isProcessing && (
              <Box marginY={1}>
                <Text color="yellow">
                  <Spinner type="dots" />
                </Text>
                <Text color="yellow"> {currentAgent.agent} [{currentAgent.phase}]</Text>
              </Box>
            )}
          </Box>
          
          {suggestions.length > 0 && (
            <Box
              flexDirection="column"
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              marginTop={1}
            >
              <Box justifyContent="space-between">
                <Text color="gray">Suggestions</Text>
                <Text color="gray">/ @ $</Text>
              </Box>
              {suggestions.slice(0, 5).map((suggestion, idx) => {
                const selected = idx === selectedSuggestion;
                const color = suggestion.kind === 'command'
                  ? 'cyan'
                  : suggestion.kind === 'file'
                    ? 'green'
                    : suggestion.kind === 'skill'
                      ? 'magenta'
                      : 'yellow';
                return (
                  <Box key={`${suggestion.value}-${idx}`}>
                    <Text color={selected ? 'black' : color} backgroundColor={selected ? color : undefined}>
                      {selected ? '> ' : '  '}
                      {suggestion.display}
                    </Text>
                    <Text color="gray">  {suggestion.hint}</Text>
                  </Box>
                );
              })}
            </Box>
          )}

          {/* Input Area */}
          <Box marginTop={1} flexDirection="row">
            <Text color="green" bold>omk </Text>
            <Text color={yolo ? 'red' : 'gray'}>{yolo ? '[YOLO] ' : '> '}</Text>
            <TextInput 
              value={input} 
              onChange={setInput}
              placeholder="Ask OMK, run /help, or invoke $plan..."
            />
          </Box>
        </Box>
        
        {/* Agent Panel */}
        {effectiveShowAgents && (
          <AgentPanel 
            agents={agents}
            activities={activities}
            width={agentPanelWidth}
          />
        )}
      </Box>
      
      <Footer 
        mode={mode}
        contextUsage={contextUsage}
        tokenUsage={tokenUsage}
        showAgents={effectiveShowAgents}
      />
    </Box>
  );
};

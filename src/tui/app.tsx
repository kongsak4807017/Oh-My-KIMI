/**
 * OMK TUI - Terminal User Interface
 * Full-featured CLI interface with real-time updates
 */

import React, { useState, useEffect, type Key } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
// Simple spinner component since ink-spinner has compatibility issues
const Spinner = ({ type = 'dots' }: { type?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = type === 'dots' ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : 
                 ['◐', '◓', '◑', '◒'];
  
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
import { ProviderManager } from '../providers/index.js';
import { Agent, Activity } from './types.js';

interface TUIProps {
  cwd: string;
  providerManager: ProviderManager;
  reasoning?: 'low' | 'medium' | 'high';
  yolo?: boolean;
}

export const OMKApp: React.FC<TUIProps> = ({ 
  cwd, 
  providerManager, 
  reasoning = 'medium',
  yolo = false 
}) => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  
  // State
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'chat' | 'plan' | 'agent'>('chat');
  const [showAgents, setShowAgents] = useState(false);
  const [contextUsage, setContextUsage] = useState({ used: 0, total: 262144, percentage: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: Date }>>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  
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
    
    // Shift+Tab to toggle agent panel (use 'z' as alternative)
    if (key.shift && inputStr === 'z') {
      setShowAgents(prev => !prev);
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
      let response = '';
      
      // Simulate agent activity
      if (text.includes('plan') || text.includes('phase')) {
        setAgents([
          { id: '1', name: 'Lorentz', role: 'explorer', status: 'running', task: 'Analyzing codebase' },
          { id: '2', name: 'Curie', role: 'planner', status: 'waiting', task: 'Waiting for analysis' },
        ]);
      }
      
      // Stream response
      for await (const chunk of provider.stream({
        messages: [
          { role: 'system', content: 'You are OMK, a helpful AI assistant.' },
          ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: text },
        ],
      })) {
        response += chunk.content;
        
        // Update context usage
        setContextUsage(prev => {
          const newUsed = prev.used + chunk.content.length;
          return {
            ...prev,
            used: newUsed,
            percentage: Math.min((newUsed / prev.total) * 100, 100),
          };
        });
      }
      
      // Add assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
      addActivity({ type: 'assistant', message: 'Response complete', status: 'completed' });
      
      // Clear agents
      setAgents([]);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addActivity({ type: 'system', message: `Error: ${errorMsg}`, status: 'error' });
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
  const headerHeight = 3;
  const footerHeight = 3;
  const agentPanelWidth = showAgents ? 35 : 0;
  const mainWidth = dimensions.width - agentPanelWidth;
  const mainHeight = dimensions.height - headerHeight - footerHeight;
  
  return (
    <Box flexDirection="column" height={dimensions.height}>
      <Header 
        mode={mode} 
        reasoning={reasoning} 
        provider={providerManager.getCurrentType() || 'unknown'}
        yolo={yolo}
      />
      
      <Box flexDirection="row" height={mainHeight}>
        {/* Main Chat Area */}
        <Box 
          width={mainWidth} 
          flexDirection="column" 
          paddingX={1}
        >
          {/* Messages */}
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {messages.slice(-(mainHeight - 5)).map((msg, idx) => (
              <Box key={idx} marginY={0} flexDirection="column">
                <Box>
                  <Text 
                    color={msg.role === 'user' ? 'cyan' : msg.role === 'assistant' ? 'green' : 'yellow'}
                    bold={msg.role === 'user'}
                  >
                    {msg.role === 'user' ? '► ' : msg.role === 'assistant' ? '◄ ' : '⚠ '}
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
                <Text color="yellow"> Processing...</Text>
              </Box>
            )}
          </Box>
          
          {/* Input Area */}
          <Box marginTop={1} flexDirection="row">
            <Text color="green" bold>omk </Text>
            <Text color={yolo ? 'red' : 'gray'}>{yolo ? '[YOLO] ' : '> '}</Text>
            <TextInput 
              value={input} 
              onChange={setInput}
              placeholder="Type a message..."
            />
          </Box>
        </Box>
        
        {/* Agent Panel */}
        {showAgents && (
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
        showAgents={showAgents}
      />
    </Box>
  );
};

/**
 * Header Component
 * Shows title, mode, provider info
 */

import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  mode: 'chat' | 'plan' | 'agent';
  reasoning: 'low' | 'medium' | 'high';
  provider: string;
  yolo?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ mode, reasoning, provider, yolo }) => {
  const modeColor = {
    chat: 'blue',
    plan: 'magenta',
    agent: 'cyan',
  }[mode];

  return (
    <Box 
      height={3} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="green">OMK</Text>
          <Text color="gray"> - Oh My Kimi</Text>
          {yolo && <Text color="red" bold> [YOLO]</Text>}
        </Box>
        
        <Box>
          <Text color="gray">Provider: </Text>
          <Text color="yellow">{provider}</Text>
          <Text color="gray"> | </Text>
          <Text color="gray">Reasoning: </Text>
          <Text color={reasoning === 'high' ? 'red' : reasoning === 'medium' ? 'yellow' : 'green'}>
            {reasoning}
          </Text>
        </Box>
        
        <Box>
          <Text color="gray">Mode: </Text>
          <Text color={modeColor} bold>
            {mode.toUpperCase()}
          </Text>
        </Box>
      </Box>
      
      <Box>
        <Text color="gray" dimColor>
          Ctrl+X: Toggle Mode | Shift+Tab: Agents | Ctrl+C: Exit
        </Text>
      </Box>
    </Box>
  );
};

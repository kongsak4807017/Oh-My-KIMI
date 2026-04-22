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
  model?: string;
  cwd: string;
  yolo?: boolean;
}

function shortPath(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) return normalized;
  return `.../${parts.slice(-3).join('/')}`;
}

export const Header: React.FC<HeaderProps> = ({ mode, reasoning, provider, model, cwd, yolo }) => {
  const modeColor = {
    chat: 'blue',
    plan: 'magenta',
    agent: 'cyan',
  }[mode];

  return (
    <Box 
      height={4} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="green">OMK</Text>
          <Text color="gray"> agent console</Text>
          {yolo && <Text color="red" bold> [YOLO]</Text>}
        </Box>

        <Box>
          <Text color="gray">cwd </Text>
          <Text color="white">{shortPath(cwd)}</Text>
        </Box>
        
        <Box>
          <Text color="gray">mode </Text>
          <Text color={modeColor} bold>{mode}</Text>
        </Box>
      </Box>

      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">provider </Text>
          <Text color="yellow">{provider}</Text>
          {model && (
            <>
              <Text color="gray"> / </Text>
              <Text color="white">{model}</Text>
            </>
          )}
        </Box>

        <Box>
          <Text color="gray">reasoning </Text>
          <Text color={reasoning === 'high' ? 'red' : reasoning === 'medium' ? 'yellow' : 'green'}>
            {reasoning}
          </Text>
        </Box>
      </Box>
      
      <Box>
        <Text color="gray" dimColor>
          Ctrl+X mode | Shift+Tab agents | Enter send | Ctrl+C exit
        </Text>
      </Box>
    </Box>
  );
};

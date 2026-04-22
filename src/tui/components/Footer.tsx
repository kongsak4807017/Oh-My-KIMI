/**
 * Footer Component
 * Shows context usage and status bar
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ContextUsage, TokenUsage } from '../types.js';

interface FooterProps {
  mode: string;
  contextUsage: ContextUsage;
  tokenUsage: TokenUsage;
  showAgents: boolean;
}

export const Footer: React.FC<FooterProps> = ({ mode, contextUsage, tokenUsage, showAgents }) => {
  const percentage = contextUsage.percentage.toFixed(1);
  const usageColor = contextUsage.percentage > 80 ? 'red' : 
                     contextUsage.percentage > 50 ? 'yellow' : 'green';
  
  // Create progress bar
  const barWidth = 20;
  const filled = Math.round((contextUsage.percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '#'.repeat(filled) + '-'.repeat(empty);
  
  return (
    <Box 
      height={5} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">Context </Text>
          <Text color={usageColor}>[{bar}]</Text>
          <Text color={usageColor}> {percentage}%</Text>
          <Text color="gray"> ({(contextUsage.used / 1024).toFixed(1)}k/{(contextUsage.total / 1024).toFixed(1)}k)</Text>
        </Box>
        
        {/* Status indicators */}
        <Box>
          <Text color="gray">Agents: </Text>
          <Text color={showAgents ? 'green' : 'gray'}>{showAgents ? 'ON' : 'OFF'}</Text>
          <Text color="gray"> | </Text>
          <Text color="gray">Mode: </Text>
          <Text color="cyan">{mode}</Text>
        </Box>
      </Box>

      <Box justifyContent="space-between">
        <Box>
          <Text color="gray">Tokens </Text>
          <Text color="cyan">in {tokenUsage.input.toLocaleString()}</Text>
          <Text color="gray"> | </Text>
          <Text color="green">out {tokenUsage.output.toLocaleString()}</Text>
          <Text color="gray"> | </Text>
          <Text color="yellow">ctx {tokenUsage.context.toLocaleString()}</Text>
          <Text color="gray"> | total {tokenUsage.total.toLocaleString()}</Text>
        </Box>
        <Box>
          <Text color="gray">Limit </Text>
          <Text color={usageColor}>{tokenUsage.limit.toLocaleString()}</Text>
        </Box>
      </Box>

      <Box>
        <Text color="gray">Route </Text>
        <Text color="white" wrap="truncate-end">{tokenUsage.routes.join(' -> ') || 'input -> provider -> output'}</Text>
      </Box>
      
      <Box>
        <Text color="gray" dimColor>
          / commands | @ files | $ skills/tools | Tab accept | arrows select | Ctrl+C exit
        </Text>
      </Box>
    </Box>
  );
};

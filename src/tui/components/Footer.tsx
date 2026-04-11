/**
 * Footer Component
 * Shows context usage and status bar
 */

import React from 'react';
import { Box, Text } from 'ink';
import { ContextUsage } from '../types.js';

interface FooterProps {
  mode: string;
  contextUsage: ContextUsage;
  showAgents: boolean;
}

export const Footer: React.FC<FooterProps> = ({ mode, contextUsage, showAgents }) => {
  const percentage = contextUsage.percentage.toFixed(1);
  const usageColor = contextUsage.percentage > 80 ? 'red' : 
                     contextUsage.percentage > 50 ? 'yellow' : 'green';
  
  // Create progress bar
  const barWidth = 20;
  const filled = Math.round((contextUsage.percentage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  return (
    <Box 
      height={3} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      <Box justifyContent="space-between">
        {/* Context Usage */}
        <Box>
          <Text color="gray">Context: </Text>
          <Text color={usageColor}>{bar}</Text>
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
      
      <Box>
        <Text color="gray" dimColor>
          Press Enter to send | Use ↑↓ to navigate history
        </Text>
      </Box>
    </Box>
  );
};

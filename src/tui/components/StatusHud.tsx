import React from 'react';
import { Box, Text } from 'ink';

interface StatusHudProps {
  agent: string;
  role: string;
  phase: string;
  task: string;
}

export const StatusHud: React.FC<StatusHudProps> = ({ agent, role, phase, task }) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">STATUS</Text>
          <Text color="gray"> / </Text>
          <Text color="green">{agent}</Text>
          <Text color="gray"> [{role}]</Text>
        </Box>
        <Box>
          <Text color="gray">phase </Text>
          <Text color="yellow">{phase}</Text>
        </Box>
      </Box>
      <Box>
        <Text color="gray">task </Text>
        <Text wrap="truncate-end">{task}</Text>
      </Box>
    </Box>
  );
};

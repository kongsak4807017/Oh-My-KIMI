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
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Box>
        <Text bold color="cyan">CURRENT HUD</Text>
      </Box>
      <Box>
        <Text color="gray">Agent: </Text>
        <Text color="green">{agent}</Text>
        <Text color="gray"> [{role}]</Text>
      </Box>
      <Box>
        <Text color="gray">Phase: </Text>
        <Text color="yellow">{phase}</Text>
      </Box>
      <Box>
        <Text color="gray">Task: </Text>
        <Text wrap="truncate-end">{task}</Text>
      </Box>
    </Box>
  );
};

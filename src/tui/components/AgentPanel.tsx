/**
 * Agent Panel Component
 * Shows active agents and recent activities.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Agent, Activity } from '../types.js';

const Spinner = () => {
  const [frame, setFrame] = React.useState(0);
  const frames = ['-', '\\', '|', '/'];

  React.useEffect(() => {
    const timer = setInterval(() => setFrame(value => (value + 1) % frames.length), 100);
    return () => clearInterval(timer);
  }, []);

  return <Text>{frames[frame]}</Text>;
};

interface AgentPanelProps {
  agents: Agent[];
  activities: Activity[];
  width: number;
}

const getStatusIcon = (status: Agent['status']) => {
  switch (status) {
    case 'running': return <Text color="yellow"><Spinner /></Text>;
    case 'waiting': return <Text color="gray">.</Text>;
    case 'completed': return <Text color="green">ok</Text>;
    case 'error': return <Text color="red">!!</Text>;
    default: return <Text color="gray">--</Text>;
  }
};

const getStatusColor = (status: Agent['status']) => {
  switch (status) {
    case 'running': return 'yellow';
    case 'completed': return 'green';
    case 'error': return 'red';
    default: return 'gray';
  }
};

const getActivityIcon = (status: Activity['status']) => {
  switch (status) {
    case 'running': return <Text color="yellow"><Spinner /></Text>;
    case 'completed': return <Text color="green">ok</Text>;
    case 'error': return <Text color="red">!!</Text>;
    case 'info': return <Text color="blue">i</Text>;
    default: return <Text color="gray">.</Text>;
  }
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents, activities, width }) => {
  const recentActivities = activities.slice(-10).reverse();

  return (
    <Box width={width} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color="cyan">AGENTS</Text>
        <Text color="gray">{agents.length} lanes</Text>
      </Box>

      {agents.length === 0 ? (
        <Text color="gray">No active agents</Text>
      ) : (
        agents.map(agent => (
          <Box key={agent.id} marginBottom={1} flexDirection="column">
            <Box>
              {getStatusIcon(agent.status)}
              <Text> </Text>
              <Text bold color={getStatusColor(agent.status)}>{agent.name}</Text>
              <Text color="gray"> [{agent.role}]</Text>
            </Box>
            {agent.phase && (
              <Box marginLeft={2}>
                <Text color="yellow">
                  {agent.phase}
                  {agent.currentStep && agent.totalSteps ? ` (${agent.currentStep}/${agent.totalSteps})` : ''}
                </Text>
              </Box>
            )}
            <Box marginLeft={2}>
              <Text color="gray" wrap="truncate-end">{(agent.task || 'No task').slice(0, width - 4)}</Text>
            </Box>
          </Box>
        ))
      )}

      <Box marginY={1}>
        <Text color="gray">{'-'.repeat(Math.max(8, width - 2))}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray" underline>Timeline</Text>
      </Box>

      {recentActivities.length === 0 ? (
        <Text color="gray">No recent activities</Text>
      ) : (
        recentActivities.map(activity => (
          <Box key={activity.id} flexDirection="column" marginBottom={1}>
            <Box>
              {getActivityIcon(activity.status)}
              <Text> </Text>
              <Text color="gray">
                {activity.agentName || 'system'}
                {activity.phase ? `/${activity.phase}` : ''}
              </Text>
            </Box>
            <Box marginLeft={2}>
              <Text
                color={activity.type === 'user' ? 'cyan' : activity.type === 'assistant' ? 'green' : activity.type === 'agent' ? 'magenta' : 'gray'}
                wrap="truncate-end"
              >
                {activity.message.slice(0, width - 4)}
              </Text>
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
};

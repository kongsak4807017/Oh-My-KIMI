/**
 * Agent Panel Component
 * Shows running agents and recent activities
 */

import React from 'react';
import { Box, Text } from 'ink';
// Simple spinner component
const Spinner = ({ type = 'dots' }: { type?: string }) => {
  const [frame, setFrame] = React.useState(0);
  const frames = type === 'dots' ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : 
                 ['◐', '◓', '◑', '◒'];
  
  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);
  
  return <Text>{frames[frame]}</Text>;
};
import { Agent, Activity } from '../types.js';

interface AgentPanelProps {
  agents: Agent[];
  activities: Activity[];
  width: number;
}

const getStatusIcon = (status: Agent['status']) => {
  switch (status) {
    case 'running': return <Text color="yellow"><Spinner type="dots" /></Text>;
    case 'waiting': return <Text color="gray">⏳</Text>;
    case 'completed': return <Text color="green">✓</Text>;
    case 'error': return <Text color="red">✗</Text>;
    default: return <Text color="gray">○</Text>;
  }
};

const getStatusColor = (status: Agent['status']) => {
  switch (status) {
    case 'running': return 'yellow';
    case 'waiting': return 'gray';
    case 'completed': return 'green';
    case 'error': return 'red';
    default: return 'gray';
  }
};

const getActivityIcon = (status: Activity['status']) => {
  switch (status) {
    case 'running': return <Text color="yellow"><Spinner type="dots" /></Text>;
    case 'completed': return <Text color="green">✓</Text>;
    case 'error': return <Text color="red">✗</Text>;
    case 'info': return <Text color="blue">ℹ</Text>;
    default: return <Text color="gray">•</Text>;
  }
};

export const AgentPanel: React.FC<AgentPanelProps> = ({ agents, activities, width }) => {
  const recentActivities = activities.slice(-10);
  
  return (
    <Box 
      width={width} 
      flexDirection="column" 
      borderStyle="single" 
      borderColor="gray"
      paddingX={1}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color="cyan">AGENTS & ACTIVITIES</Text>
      </Box>
      
      {/* Running Agents */}
      {agents.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text color="gray" underline>Active Agents</Text>
          </Box>
          
          {agents.map(agent => (
            <Box key={agent.id} marginBottom={1} flexDirection="column">
              <Box>
                {getStatusIcon(agent.status)}
                <Text> </Text>
                <Text bold color={getStatusColor(agent.status)}>
                  {agent.name}
                </Text>
                <Text color="gray"> [{agent.role}]</Text>
              </Box>
              {agent.task && (
                <Box marginLeft={2}>
                  <Text color="gray" wrap="truncate-end">
                    {agent.task.slice(0, width - 4)}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
          
          <Box marginY={1}>
            <Text color="gray">{'─'.repeat(width - 2)}</Text>
          </Box>
        </>
      )}
      
      {/* Activities */}
      <Box marginBottom={1}>
        <Text color="gray" underline>Recent Activities</Text>
      </Box>
      
      {recentActivities.length === 0 ? (
        <Text color="gray" dimColor>No recent activities</Text>
      ) : (
        recentActivities.map(activity => (
          <Box key={activity.id} marginY={0}>
            {getActivityIcon(activity.status)}
            <Text> </Text>
            <Text 
              color={
                activity.type === 'user' ? 'cyan' :
                activity.type === 'assistant' ? 'green' :
                activity.type === 'agent' ? 'magenta' : 'gray'
              }
              wrap="truncate-end"
            >
              {activity.message.slice(0, width - 4)}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
};

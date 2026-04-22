/**
 * Assist Suggestion System for OMK CLI
 * Provides comprehensive guidance for commands, skills, tools, and file references
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Re-export for backward compatibility
export interface Suggestion {
  value: string;
  display: string;
  hint?: string;
  type: 'command' | 'tool' | 'file' | 'skill';
}

export interface AssistItem {
  value: string;
  display: string;
  hint: string;
  type: 'command' | 'tool' | 'skill' | 'file' | 'category';
  description?: string;
  examples?: string[];
  category?: string;
}

export interface AssistGuide {
  prefix: string;
  title: string;
  description: string;
  items: AssistItem[];
}

// All built-in CLI commands with descriptions and examples
const CLI_COMMANDS: AssistItem[] = [
  {
    value: '/help',
    display: '/help',
    hint: 'Show help',
    type: 'command',
    description: 'Display available commands, skills, and usage information',
    examples: ['/help', '/help ralph'],
    category: 'Info',
  },
  {
    value: '/skills',
    display: '/skills',
    hint: 'List all skills',
    type: 'command',
    description: 'Show all available skills from local, project, and global sources',
    category: 'Info',
  },
  {
    value: '/tools',
    display: '/tools',
    hint: 'List all tools',
    type: 'command',
    description: 'Display available tools for file operations, search, and execution',
    category: 'Info',
  },
  {
    value: '/clear',
    display: '/clear',
    hint: 'Clear screen',
    type: 'command',
    description: 'Clear the terminal screen and reset activity log',
    category: 'Session',
  },
  {
    value: '/history',
    display: '/history',
    hint: 'Chat history',
    type: 'command',
    description: 'Display conversation history in current session',
    category: 'Session',
  },
  {
    value: '/save',
    display: '/save [name]',
    hint: 'Save session',
    type: 'command',
    description: 'Save current conversation session with optional name',
    examples: ['/save', '/save my-feature'],
    category: 'Session',
  },
  {
    value: '/load',
    display: '/load [name]',
    hint: 'Load session',
    type: 'command',
    description: 'Load a previously saved conversation session',
    examples: ['/load', '/load my-feature'],
    category: 'Session',
  },
  {
    value: '/sessions',
    display: '/sessions',
    hint: 'List sessions',
    type: 'command',
    description: 'Show all saved sessions with metadata',
    category: 'Session',
  },
  {
    value: '/title',
    display: '/title <text>',
    hint: 'Set session title',
    type: 'command',
    description: 'Set a custom title for the current session',
    category: 'Session',
  },
  {
    value: '/note',
    display: '/note <text>',
    hint: 'Add note',
    type: 'command',
    description: 'Add a note to the session notepad',
    examples: ['/note Review this later', '/note TODO: fix error handling'],
    category: 'Productivity',
  },
  {
    value: '/task',
    display: '/task <title>',
    hint: 'Create task',
    type: 'command',
    description: 'Create a new task entry in the project tracker',
    examples: ['/task Implement login', '/task Fix bug #123'],
    category: 'Productivity',
  },
  {
    value: '/file',
    display: '/file <path>',
    hint: 'Add to context',
    type: 'command',
    description: 'Add a file to the conversation context',
    examples: ['/file src/index.ts', '/file README.md'],
    category: 'Context',
  },
  {
    value: '/files',
    display: '/files',
    hint: 'Context files',
    type: 'command',
    description: 'Show all files currently in context',
    category: 'Context',
  },
  {
    value: '/context',
    display: '/context',
    hint: 'Full context',
    type: 'command',
    description: 'Display complete conversation context including files',
    category: 'Context',
  },
  {
    value: '/tokens',
    display: '/tokens',
    hint: 'Token stats',
    type: 'command',
    description: 'Show token usage statistics for current session',
    category: 'Info',
  },
  {
    value: '/cache',
    display: '/cache',
    hint: 'Cache stats',
    type: 'command',
    description: 'Display cache statistics for indexed files',
    category: 'Info',
  },
  {
    value: '/rag',
    display: '/rag <query>',
    hint: 'RAG search',
    type: 'command',
    description: 'Search codebase using RAG (Retrieval Augmented Generation)',
    examples: ['/rag authentication', '/rag --web how to use react hooks'],
    category: 'Search',
  },
  {
    value: '/index',
    display: '/index',
    hint: 'Build index',
    type: 'command',
    description: 'Build or rebuild the codebase index for search',
    category: 'Search',
  },
  {
    value: '/map',
    display: '/map',
    hint: 'Repository map',
    type: 'command',
    description: 'Show a map of the repository structure',
    category: 'Search',
  },
  {
    value: '/search',
    display: '/search <symbol>',
    hint: 'Search symbols',
    type: 'command',
    description: 'Search for symbols (functions, classes, variables) in the codebase',
    examples: ['/search UserService', '/search handleClick'],
    category: 'Search',
  },
  {
    value: '/plugins',
    display: '/plugins',
    hint: 'List plugins',
    type: 'command',
    description: 'Show all loaded plugins and their status',
    category: 'System',
  },
  {
    value: '/mcp',
    display: '/mcp [start|stop]',
    hint: 'MCP server',
    type: 'command',
    description: 'Control the Model Context Protocol server',
    examples: ['/mcp start', '/mcp stop'],
    category: 'System',
  },
  {
    value: '/model',
    display: '/model [provider]',
    hint: 'Switch provider',
    type: 'command',
    description: 'Switch AI provider or model dynamically',
    examples: ['/model openrouter', '/model kimi'],
    category: 'System',
  },
  {
    value: '/settings',
    display: '/settings',
    hint: 'Show settings',
    type: 'command',
    description: 'Display current OMK configuration and settings',
    category: 'System',
  },
  {
    value: '/status',
    display: '/status',
    hint: 'Show status',
    type: 'command',
    description: 'Show current system status including provider and active modes',
    category: 'System',
  },
  {
    value: '/reasoning',
    display: '/reasoning <level>',
    hint: 'low|medium|high',
    type: 'command',
    description: 'Set the reasoning effort level for AI responses',
    examples: ['/reasoning high', '/reasoning low'],
    category: 'System',
  },
  {
    value: '/memory',
    display: '/memory',
    hint: 'Project memory',
    type: 'command',
    description: 'Show or manage project memory entries',
    category: 'System',
  },
  {
    value: '/exit',
    display: '/exit',
    hint: 'Exit OMK',
    type: 'command',
    description: 'Exit the OMK CLI session',
    category: 'Session',
  },
  {
    value: '/quit',
    display: '/quit',
    hint: 'Exit OMK',
    type: 'command',
    description: 'Alias for /exit - Exit the OMK CLI session',
    category: 'Session',
  },
];

// All available tools with descriptions
const TOOLS: AssistItem[] = [
  {
    value: '$read_file',
    display: '$read_file',
    hint: 'Read file content',
    type: 'tool',
    description: 'Read the contents of a file at the specified path',
    examples: ['$read_file src/index.ts', '$read_file {"path": "README.md"}'],
    category: 'File',
  },
  {
    value: '$write_file',
    display: '$write_file',
    hint: 'Write file content',
    type: 'tool',
    description: 'Write content to a file (creates or overwrites)',
    examples: ['$write_file {"path": "test.txt", "content": "Hello"}'],
    category: 'File',
  },
  {
    value: '$list_directory',
    display: '$list_directory',
    hint: 'List directory contents',
    type: 'tool',
    description: 'List files and directories at the specified path',
    examples: ['$list_directory .', '$list_directory src/components'],
    category: 'File',
  },
  {
    value: '$search_files',
    display: '$search_files',
    hint: 'Search file contents',
    type: 'tool',
    description: 'Search for text patterns across all files',
    examples: ['$search_files {"pattern": "TODO", "path": "."}'],
    category: 'File',
  },
  {
    value: '$document_symbols',
    display: '$document_symbols',
    hint: 'Get file symbols',
    type: 'tool',
    description: 'Extract symbols (functions, classes, variables) from a file',
    examples: ['$document_symbols src/utils.ts'],
    category: 'Code',
  },
  {
    value: '$find_references',
    display: '$find_references',
    hint: 'Find symbol references',
    type: 'tool',
    description: 'Find all references to a symbol in the codebase',
    examples: ['$find_references UserService'],
    category: 'Code',
  },
  {
    value: '$diagnostics',
    display: '$diagnostics',
    hint: 'TypeScript diagnostics',
    type: 'tool',
    description: 'Run TypeScript type checking and diagnostics',
    category: 'Code',
  },
  {
    value: '$web_fetch',
    display: '$web_fetch',
    hint: 'Fetch URL content',
    type: 'tool',
    description: 'Fetch and extract content from a web URL',
    examples: ['$web_fetch https://example.com', '$web_fetch {"url": "..."}'],
    category: 'Web',
  },
  {
    value: '$web_search',
    display: '$web_search',
    hint: 'Search the web',
    type: 'tool',
    description: 'Search the web for information (if configured)',
    examples: ['$web_search "nodejs best practices"'],
    category: 'Web',
  },
  {
    value: '$rag_search',
    display: '$rag_search',
    hint: 'RAG search',
    type: 'tool',
    description: 'Search using RAG over indexed codebase',
    examples: ['$rag_search "authentication flow"'],
    category: 'Search',
  },
  {
    value: '$execute_command',
    display: '$execute_command',
    hint: 'Run shell command',
    type: 'tool',
    description: 'Execute a shell command in the workspace',
    examples: ['$execute_command npm test', '$execute_command ls -la'],
    category: 'System',
  },
  {
    value: '$memory_read',
    display: '$memory_read',
    hint: 'Read project memory',
    type: 'tool',
    description: 'Read from project memory store',
    examples: ['$memory_read key', '$memory_read {"key": "config"}'],
    category: 'Memory',
  },
  {
    value: '$memory_write',
    display: '$memory_write',
    hint: 'Write project memory',
    type: 'tool',
    description: 'Write to project memory store',
    examples: ['$memory_write {"key": "config", "value": "..."}'],
    category: 'Memory',
  },
];

// Built-in skills that are always available
const BUILTIN_SKILLS: AssistItem[] = [
  {
    value: '$ralph',
    display: '$ralph',
    hint: 'Persistent task completion',
    type: 'skill',
    description: 'Self-referential loop that persists until task completion with verification',
    examples: ['$ralph "Implement user authentication"', '$ralph "Fix all TypeScript errors"'],
    category: 'Engine',
  },
  {
    value: '$team',
    display: '$team',
    hint: 'Multi-agent execution',
    type: 'skill',
    description: 'Coordinated multi-agent execution across parallel lanes',
    examples: ['$team "Build a full-stack app"', '$team "Review and refactor codebase"'],
    category: 'Engine',
  },
  {
    value: '$plan',
    display: '$plan',
    hint: 'Create implementation plan',
    type: 'skill',
    description: 'Create structured implementation plans with tradeoff analysis',
    examples: ['$plan "Build a REST API"', '$plan "Migrate to new database"'],
    category: 'Planning',
  },
  {
    value: '$ralplan',
    display: '$ralplan',
    hint: 'Consensus plan with Ralph',
    type: 'skill',
    description: 'Create a plan using Ralph for persistent completion loop',
    examples: ['$ralplan "Design new feature architecture"'],
    category: 'Planning',
  },
  {
    value: '$deep-interview',
    display: '$deep-interview',
    hint: 'Requirements clarification',
    type: 'skill',
    description: 'Socratic requirements clarification through guided interview',
    examples: ['$deep-interview', '$deep-interview "I want to build a mobile app"'],
    category: 'Planning',
  },
  {
    value: '$autopilot',
    display: '$autopilot',
    hint: 'Full autonomous pipeline',
    type: 'skill',
    description: 'Full autonomous pipeline from requirements to deployment',
    examples: ['$autopilot "Build a landing page"'],
    category: 'Engine',
  },
  {
    value: '$swarm',
    display: '$swarm',
    hint: 'Coordinated swarm',
    type: 'skill',
    description: 'Lightweight coordinated swarm for quick parallel tasks',
    examples: ['$swarm "Update all config files"'],
    category: 'Engine',
  },
  {
    value: '$ultrawork',
    display: '$ultrawork',
    hint: 'Ultra work mode',
    type: 'skill',
    description: 'Maximum throughput mode for complex multi-file tasks',
    examples: ['$ultrawork "Refactor entire codebase"'],
    category: 'Engine',
  },
  {
    value: '$ultraqa',
    display: '$ultraqa',
    hint: 'Ultra QA mode',
    type: 'skill',
    description: 'Comprehensive testing and QA verification',
    examples: ['$ultraqa "Test all API endpoints"'],
    category: 'Engine',
  },
  {
    value: '$pipeline',
    display: '$pipeline',
    hint: 'Pipeline execution',
    type: 'skill',
    description: 'Execute tasks in a structured pipeline with phases',
    examples: ['$pipeline "Deploy production"'],
    category: 'Engine',
  },
  {
    value: '$code-review',
    display: '$code-review',
    hint: 'Review code',
    type: 'skill',
    description: 'Comprehensive code review with best practices analysis',
    examples: ['$code-review', '$code-review src/auth.ts'],
    category: 'Review',
  },
  {
    value: '$security-review',
    display: '$security-review',
    hint: 'Security audit',
    type: 'skill',
    description: 'Security-focused code review and vulnerability analysis',
    examples: ['$security-review', '$security-review src/auth.ts'],
    category: 'Review',
  },
  {
    value: '$git-master',
    display: '$git-master',
    hint: 'Git operations',
    type: 'skill',
    description: 'Git workflow assistance and operations',
    examples: ['$git-master "Create feature branch"', '$git-master commit'],
    category: 'DevOps',
  },
  {
    value: '$build-fix',
    display: '$build-fix',
    hint: 'Fix build errors',
    type: 'skill',
    description: 'Automatically diagnose and fix build/type errors',
    examples: ['$build-fix', '$build-fix "npm run build"'],
    category: 'DevOps',
  },
  {
    value: '$tdd',
    display: '$tdd',
    hint: 'Test-driven dev',
    type: 'skill',
    description: 'Test-driven development workflow assistance',
    examples: ['$tdd "Implement calculator"'],
    category: 'Dev',
  },
  {
    value: '$analyze',
    display: '$analyze',
    hint: 'Analyze code',
    type: 'skill',
    description: 'Deep code analysis and architecture review',
    examples: ['$analyze', '$analyze src/core'],
    category: 'Review',
  },
  {
    value: '$visual-verdict',
    display: '$visual-verdict',
    hint: 'Visual QA',
    type: 'skill',
    description: 'Visual regression testing and UI verification',
    examples: ['$visual-verdict', '$visual-verdict src/components'],
    category: 'Review',
  },
  {
    value: '$cancel',
    display: '$cancel',
    hint: 'Cancel active modes',
    type: 'skill',
    description: 'Cancel or stop any active execution modes',
    examples: ['$cancel', '$cancel ralph'],
    category: 'Control',
  },
  {
    value: '$help',
    display: '$help',
    hint: 'Skill help',
    type: 'skill',
    description: 'Show help for available skills',
    examples: ['$help', '$help ralph'],
    category: 'Info',
  },
  {
    value: '$hud',
    display: '$hud',
    hint: 'Activity HUD',
    type: 'skill',
    description: 'Show activity heads-up display',
    category: 'Info',
  },
  {
    value: '$note',
    display: '$note',
    hint: 'Note taking',
    type: 'skill',
    description: 'Skill-based note taking and documentation',
    examples: ['$note "Meeting notes"'],
    category: 'Productivity',
  },
  {
    value: '$session',
    display: '$session',
    hint: 'Session management',
    type: 'skill',
    description: 'Advanced session management and persistence',
    category: 'Session',
  },
  {
    value: '$doctor',
    display: '$doctor',
    hint: 'Health check',
    type: 'skill',
    description: 'Run health diagnostics on OMK installation',
    category: 'System',
  },
  {
    value: '$gsd',
    display: '$gsd',
    hint: 'Get Stuff Done',
    type: 'skill',
    description: 'GSD workflow for phased project execution',
    examples: ['$gsd "Start new project"', '$gsd-discuss-phase 1'],
    category: 'Engine',
  },
  {
    value: '$deepsearch',
    display: '$deepsearch',
    hint: 'Deep search',
    type: 'skill',
    description: 'Deep codebase search with semantic understanding',
    examples: ['$deepsearch "find auth logic"'],
    category: 'Search',
  },
  {
    value: '$web-clone',
    display: '$web-clone',
    hint: 'Clone website',
    type: 'skill',
    description: 'Clone or replicate a website structure and styling',
    examples: ['$web-clone https://example.com'],
    category: 'Dev',
  },
  {
    value: '$ai-slop-cleaner',
    display: '$ai-slop-cleaner',
    hint: 'Clean AI code',
    type: 'skill',
    description: 'Clean up and refactor AI-generated code',
    examples: ['$ai-slop-cleaner src/'],
    category: 'Dev',
  },
  {
    value: '$ecomode',
    display: '$ecomode',
    hint: 'Budget mode',
    type: 'skill',
    description: 'Economical mode for budget-conscious operations',
    category: 'Control',
  },
  {
    value: '$trace',
    display: '$trace',
    hint: 'Execution trace',
    type: 'skill',
    description: 'Trace and debug execution flow',
    category: 'Debug',
  },
];

interface SkillRoots {
  root: string;
  source: 'local' | 'project' | 'global';
}

function getSkillRoots(cwd: string): SkillRoots[] {
  return [
    { root: join(cwd, '.omk', 'skills'), source: 'local' },
    { root: join(cwd, 'skills'), source: 'project' },
    { root: join(homedir(), '.omk', 'skills'), source: 'global' },
  ];
}

function parseSkillDescription(content: string): string {
  // Try to extract description from YAML frontmatter
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const descMatch = frontmatterMatch[1].match(/description:\s*(.+)/);
    if (descMatch) {
      return descMatch[1].trim();
    }
  }
  
  // Try to extract first paragraph after title
  const lines = content.split('\n');
  let inFrontmatter = false;
  let foundTitle = false;
  
  for (const line of lines) {
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    
    if (line.startsWith('# ') && !foundTitle) {
      foundTitle = true;
      continue;
    }
    
    if (foundTitle && line.trim() && !line.startsWith('#')) {
      return line.trim().slice(0, 100);
    }
  }
  
  return 'Custom skill';
}

/**
 * Discover all available skills from all sources
 */
export function discoverAllSkills(cwd: string): AssistItem[] {
  const seen = new Set<string>();
  const skills: AssistItem[] = [];
  
  // First add built-in skills
  for (const skill of BUILTIN_SKILLS) {
    seen.add(skill.value);
    skills.push({ ...skill });
  }
  
  // Then discover from filesystem
  for (const { root, source } of getSkillRoots(cwd)) {
    if (!existsSync(root)) continue;
    
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      
      const skillFile = join(root, entry.name, 'SKILL.md');
      if (!existsSync(skillFile)) continue;
      
      const skillName = entry.name.toLowerCase();
      const value = `$${skillName}`;
      
      if (seen.has(value)) {
        // Update source info if already exists
        const existing = skills.find(s => s.value === value);
        if (existing) {
          existing.hint = `${existing.hint} (${source})`;
        }
        continue;
      }
      
      seen.add(value);
      
      try {
        const content = readFileSync(skillFile, 'utf-8');
        const description = parseSkillDescription(content);
        
        skills.push({
          value,
          display: value,
          hint: `${description.slice(0, 40)}${description.length > 40 ? '...' : ''} (${source})`,
          type: 'skill',
          description,
          category: source === 'local' ? 'Local' : source === 'project' ? 'Project' : 'Global',
        });
      } catch {
        skills.push({
          value,
          display: value,
          hint: `(${source})`,
          type: 'skill',
          category: source === 'local' ? 'Local' : source === 'project' ? 'Project' : 'Global',
        });
      }
    }
  }
  
  return skills.sort((a, b) => {
    // Sort by category priority then alphabetically
    const catPriority = { 'Engine': 1, 'Planning': 2, 'Dev': 3, 'Review': 4, 'DevOps': 5, 'Local': 6, 'Project': 7, 'Global': 8 };
    const aPriority = catPriority[a.category as keyof typeof catPriority] || 9;
    const bPriority = catPriority[b.category as keyof typeof catPriority] || 9;
    
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.display.localeCompare(b.display);
  });
}

/**
 * Get all available commands
 */
export function getAllCommands(): AssistItem[] {
  return [...CLI_COMMANDS];
}

/**
 * Get all available tools
 */
export function getAllTools(): AssistItem[] {
  return [...TOOLS];
}

/**
 * Get complete guide for a specific prefix
 */
export function getAssistGuide(prefix: string, cwd: string): AssistGuide {
  switch (prefix) {
    case '/':
      return {
        prefix: '/',
        title: '📋 Commands',
        description: 'Built-in OMK commands for session management, context, and system control',
        items: getAllCommands(),
      };
    
    case '$':
      const skills = discoverAllSkills(cwd);
      const tools = getAllTools();
      return {
        prefix: '$',
        title: '🛠️  Skills & Tools',
        description: `Available skills (${skills.length}) and tools (${tools.length}) for task execution`,
        items: [...skills, ...tools],
      };
    
    case '@':
      return {
        prefix: '@',
        title: '📁 Files',
        description: 'Reference files in your project by typing @ followed by filename',
        items: [], // File items are dynamically discovered
      };
    
    default:
      return {
        prefix: '',
        title: '💡 Quick Help',
        description: 'Type / for commands, $ for skills/tools, @ for files',
        items: [],
      };
  }
}

/**
 * Search for items matching the input
 */
export function searchAssistItems(input: string, cwd: string): AssistItem[] {
  const trimmed = input.trim();
  
  if (trimmed.startsWith('/')) {
    const search = trimmed.slice(1).toLowerCase();
    const commands = getAllCommands();
    if (!search) return commands;
    return commands.filter(cmd => 
      cmd.value.toLowerCase().includes(search) ||
      cmd.hint.toLowerCase().includes(search) ||
      cmd.description?.toLowerCase().includes(search)
    );
  }
  
  if (trimmed.startsWith('$')) {
    const search = trimmed.slice(1).toLowerCase();
    const skills = discoverAllSkills(cwd);
    const tools = getAllTools();
    const all = [...skills, ...tools];
    if (!search) return all;
    return all.filter(item => 
      item.value.toLowerCase().includes(search) ||
      item.hint.toLowerCase().includes(search) ||
      item.description?.toLowerCase().includes(search)
    );
  }
  
  return [];
}

/**
 * Format assist items for display
 */
export function formatAssistItems(items: AssistItem[], selectedIndex: number = 0, maxItems: number = 15): string {
  if (items.length === 0) return '';
  
  const lines: string[] = [];
  const displayItems = items.slice(0, maxItems);
  const remaining = items.length - maxItems;
  
  // Group items by category if showing skills
  const grouped = new Map<string, AssistItem[]>();
  for (const item of displayItems) {
    const cat = item.category || 'Other';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }
  
  let index = 0;
  for (const [category, catItems] of grouped) {
    if (grouped.size > 1) {
      lines.push(`\x1b[90m${category}:\x1b[0m`);
    }
    
    for (const item of catItems) {
      const isSelected = index === selectedIndex;
      const prefix = isSelected ? '\x1b[7m' : '';
      const suffix = isSelected ? '\x1b[0m' : '';
      
      let icon = '  ';
      if (item.type === 'command') icon = '\x1b[36m/ \x1b[0m';
      else if (item.type === 'tool') icon = '\x1b[33m$ \x1b[0m';
      else if (item.type === 'skill') icon = '\x1b[35m$ \x1b[0m';
      else if (item.type === 'file') icon = '\x1b[32m@ \x1b[0m';
      
      const display = item.display.padEnd(25);
      const hint = item.hint ? `\x1b[90m${item.hint}\x1b[0m` : '';
      
      lines.push(`${prefix}${icon}${display}${hint}${suffix}`);
      index++;
    }
  }
  
  if (remaining > 0) {
    lines.push(`\x1b[90m... and ${remaining} more\x1b[0m`);
  }
  
  return lines.join('\n');
}

/**
 * Get detailed help for a specific command/skill/tool
 */
export function getDetailedHelp(name: string, cwd: string): string {
  // Check commands
  const command = getAllCommands().find(c => c.value === name || c.value === `/${name}`);
  if (command) {
    const lines = [
      `\x1b[36m${command.display}\x1b[0m - ${command.hint}`,
      '',
      command.description || 'No description available',
    ];
    if (command.examples) {
      lines.push('', '\x1b[90mExamples:\x1b[0m');
      for (const ex of command.examples) {
        lines.push(`  ${ex}`);
      }
    }
    return lines.join('\n');
  }
  
  // Check tools
  const tool = getAllTools().find(t => t.value === name || t.value === `$${name}`);
  if (tool) {
    const lines = [
      `\x1b[33m${tool.display}\x1b[0m - ${tool.hint}`,
      '',
      tool.description || 'No description available',
    ];
    if (tool.examples) {
      lines.push('', '\x1b[90mExamples:\x1b[0m');
      for (const ex of tool.examples) {
        lines.push(`  ${ex}`);
      }
    }
    return lines.join('\n');
  }
  
  // Check skills
  const skill = discoverAllSkills(cwd).find(s => s.value === name || s.value === `$${name}`);
  if (skill) {
    const lines = [
      `\x1b[35m${skill.display}\x1b[0m - ${skill.hint}`,
      '',
      skill.description || 'No description available',
    ];
    if (skill.examples) {
      lines.push('', '\x1b[90mExamples:\x1b[0m');
      for (const ex of skill.examples) {
        lines.push(`  ${ex}`);
      }
    }
    return lines.join('\n');
  }
  
  return `No help found for: ${name}`;
}

/**
 * Get all available prefixes with descriptions
 */
export function getPrefixGuides(): { prefix: string; title: string; description: string }[] {
  return [
    { prefix: '/', title: 'Commands', description: 'Session, context, and system commands' },
    { prefix: '$', title: 'Skills & Tools', description: 'AI skills and utility tools' },
    { prefix: '@', title: 'Files', description: 'Reference project files' },
  ];
}

/**
 * Show quick help display
 */
export function showQuickHelp(): void {
  console.log('\n\x1b[36m🚀 OMK Assist System\x1b[0m\n');
  console.log('\x1b[90mAvailable Prefixes:\x1b[0m');
  console.log('  \x1b[36m/\x1b[0m - Commands (type "/" to see all)');
  console.log('  \x1b[35m$\x1b[0m - Skills & Tools (type "$" to see all)');
  console.log('  \x1b[32m@\x1b[0m - Files (type "@" then filename)');
  console.log('\n\x1b[90mQuick Commands:\x1b[0m');
  console.log('  /help      - Show detailed help');
  console.log('  /skills    - List all skills');
  console.log('  /tools     - List all tools');
  console.log('  /exit      - Exit OMK');
  console.log('\n\x1b[90mPopular Skills:\x1b[0m');
  console.log('  $ralph     - Persistent task completion');
  console.log('  $team      - Multi-agent execution');
  console.log('  $plan      - Create implementation plan');
  console.log('  $code-review - Review your code');
  console.log('');
}

/**
 * Show comprehensive help
 */
export function showComprehensiveHelp(cwd: string): void {
  console.log('\n\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║\x1b[0m                    \x1b[1mOMK Assist Guide\x1b[0m                       \x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m\n');
  
  // Commands
  const commands = getAllCommands();
  console.log(`\x1b[36m📋 Commands (${commands.length})\x1b[0m`);
  console.log('\x1b[90mSession, context, and system management\x1b[0m\n');
  
  const cmdCategories = new Map<string, AssistItem[]>();
  for (const cmd of commands) {
    const cat = cmd.category || 'Other';
    if (!cmdCategories.has(cat)) cmdCategories.set(cat, []);
    cmdCategories.get(cat)!.push(cmd);
  }
  
  for (const [cat, items] of cmdCategories) {
    console.log(`  \x1b[90m${cat}:\x1b[0m`);
    for (const item of items) {
      console.log(`    \x1b[36m${item.display.padEnd(20)}\x1b[0m ${item.hint}`);
    }
  }
  
  // Skills
  const skills = discoverAllSkills(cwd);
  console.log(`\n\x1b[35m🛠️  Skills (${skills.length})\x1b[0m`);
  console.log('\x1b[90mAI-powered task execution workflows\x1b[0m\n');
  
  const skillCategories = new Map<string, AssistItem[]>();
  for (const skill of skills.slice(0, 30)) {
    const cat = skill.category || 'Other';
    if (!skillCategories.has(cat)) skillCategories.set(cat, []);
    skillCategories.get(cat)!.push(skill);
  }
  
  for (const [cat, items] of skillCategories) {
    console.log(`  \x1b[90m${cat}:\x1b[0m`);
    for (const item of items.slice(0, 8)) {
      console.log(`    \x1b[35m${item.display.padEnd(20)}\x1b[0m ${item.hint.slice(0, 40)}`);
    }
    if (items.length > 8) {
      console.log(`    \x1b[90m... and ${items.length - 8} more\x1b[0m`);
    }
  }
  
  // Tools
  const tools = getAllTools();
  console.log(`\n\x1b[33m🔧 Tools (${tools.length})\x1b[0m`);
  console.log('\x1b[90mDirect file and system operations\x1b[0m\n');
  
  const toolCategories = new Map<string, AssistItem[]>();
  for (const tool of tools) {
    const cat = tool.category || 'Other';
    if (!toolCategories.has(cat)) toolCategories.set(cat, []);
    toolCategories.get(cat)!.push(tool);
  }
  
  for (const [cat, items] of toolCategories) {
    console.log(`  \x1b[90m${cat}:\x1b[0m`);
    for (const item of items) {
      console.log(`    \x1b[33m${item.display.padEnd(20)}\x1b[0m ${item.hint}`);
    }
  }
  
  // Files
  console.log(`\n\x1b[32m📁 Files (@)\x1b[0m`);
  console.log('\x1b[90mType @ followed by filename to reference files\x1b[0m');
  console.log('\x1b[90mExample: @src/index.ts, @README.md\x1b[0m\n');
  
  console.log('\x1b[90mPress Ctrl+G in the REPL to toggle guide mode\x1b[0m\n');
}

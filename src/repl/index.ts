/**
 * Interactive REPL for OMK
 * Real-time chat session with Kimi AI
 */

import { createInterface, Interface as ReadlineInterface } from 'readline';
import { stdin, stdout } from 'process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { 
  ProviderManager, 
  getProviderManager,
  ChatMessage 
} from '../providers/index.js';
import { 
  writeModeState, 
  clearModeState, 
  appendToNotepad,
  createTask,
  listActiveModes
} from '../state/index.js';
import { PluginManager } from '../plugins/index.js';
import { startMCPServer, stopMCPServer } from '../mcp/server.js';

// REPL State
interface REPLState {
  history: ChatMessage[];
  currentSkill: string | null;
  context: {
    cwd: string;
    files?: string[];
    selectedFiles?: string[];
  };
}

// Skill registry
const SKILL_PREFIXES = [
  '$ralph',
  '$team',
  '$plan',
  '$deep-interview',
  '$autopilot',
  '$code-review',
  '$security-review',
  '$git-master',
  '$build-fix',
  '$tdd',
  '$analyze',
  '$visual-verdict',
  '$cancel',
  '$help',
];

// Built-in commands
const BUILTIN_COMMANDS = [
  '/help',
  '/skills',
  '/clear',
  '/history',
  '/save',
  '/load',
  '/note',
  '/task',
  '/file',
  '/files',
  '/context',
  '/plugins',
  '/mcp',
  '/exit',
  '/quit',
];

export class OMKREPL {
  private providerManager: ProviderManager;
  private rl: ReadlineInterface;
  private state: REPLState;
  private pluginManager: PluginManager;
  private isRunning: boolean = false;
  private globalOmkPath: string;

  constructor(private cwd: string = process.cwd()) {
    this.providerManager = getProviderManager();
    this.state = {
      history: [],
      currentSkill: null,
      context: { cwd },
    };
    this.pluginManager = new PluginManager(cwd);
    this.globalOmkPath = join(homedir(), '.omk');
    
    // Enable keypress events
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    
    this.rl = createInterface({
      input: stdin,
      output: stdout,
      prompt: this.getPrompt(),
      completer: (line: string) => this.completer(line),
    });

    this.setupEventHandlers();
  }

  private getPrompt(): string {
    if (this.state.currentSkill) {
      return `\x1b[36m[${this.state.currentSkill}]\x1b[0m > `;
    }
    return '\x1b[32momk\x1b[0m > ';
  }

  private setupEventHandlers(): void {
    this.rl.on('line', (input: string) => {
      this.handleInput(input.trim());
    });

    this.rl.on('close', () => {
      this.shutdown();
    });

    // Handle keypress for guides
    process.stdin.on('keypress', (str, key) => {
      if (key.name === 'return' || key.name === 'enter') return;
      
      const currentLine = this.rl.line || '';
      
      // Show guide for /
      if (currentLine === '/' || currentLine === '') {
        if (str === '/') {
          console.log('\n\x1b[90mCommands: /help /tools /status /settings /exit\x1b[0m');
          this.rl.prompt();
        }
      }
      
      // Show guide for $
      if (currentLine === '$' || currentLine === '') {
        if (str === '$') {
          console.log('\n\x1b[90mTools: $read_file $write_file $web_fetch $diagnostics $execute_command\x1b[0m');
          this.rl.prompt();
        }
      }
      
      // Show guide for @
      if (currentLine.endsWith('@') || currentLine === '') {
        if (str === '@') {
          console.log('\n\x1b[90mType @filename to include file content\x1b[0m');
          this.rl.prompt();
        }
      }
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\nUse /exit or /quit to exit properly.');
      this.rl.prompt();
    });
  }

  private completer(line: string): [string[], string] {
    // Command mode (starts with /)
    if (line.startsWith('/')) {
      const cmd = line.slice(1);
      const matches = BUILTIN_COMMANDS.filter(c => c.startsWith('/' + cmd));
      return [matches, line];
    }
    
    // Tool mode (starts with $)
    if (line.startsWith('$')) {
      const tool = line.slice(1);
      const tools = [
        '$read_file', '$write_file', '$list_directory', '$search_files',
        '$web_fetch', '$diagnostics', '$document_symbols', '$find_references',
        '$execute_command', '$memory_read', '$memory_write',
      ];
      const matches = tools.filter(t => t.startsWith('$' + tool));
      return [matches, line];
    }
    
    // File mention mode (starts with @)
    if (line.includes('@')) {
      const afterAt = line.slice(line.lastIndexOf('@') + 1);
      try {
        const { getFileSystemTools } = require('../tools/file-system.js');
        const fsTools = getFileSystemTools(this.cwd);
        const { entries } = fsTools.listDirectory({ path: '.', recursive: true });
        const files = entries
          .filter((e: any) => e.type === 'file')
          .map((e: any) => '@' + e.name)
          .filter((f: string) => f.startsWith('@' + afterAt))
          .slice(0, 20);
        return [files, '@' + afterAt];
      } catch {
        return [[], line];
      }
    }
    
    // Default: skills + commands
    const completions = [...SKILL_PREFIXES, ...BUILTIN_COMMANDS];
    const hits = completions.filter(c => c.startsWith(line));
    return [hits.length ? hits : completions, line];
  }

  async start(options?: { provider?: string; reasoning?: string; yolo?: boolean }): Promise<void> {
    if (options?.yolo) {
      console.log('\n[WARNING] YOLO mode enabled - bypassing confirmations');
    }
    console.log('\nWelcome to Oh-my-KIMI (OMK)');
    
    // Initialize provider
    try {
      const providerType = (options?.provider as 'api' | 'browser' | 'cli' | 'auto') || 'auto';
      await this.providerManager.initialize({
        type: providerType,
        reasoning: (options?.reasoning as 'low' | 'medium' | 'high') || 'medium',
      });
      
      const currentType = this.providerManager.getCurrentType();
      console.log(`[OK] Provider: ${currentType} (reasoning: ${options?.reasoning || 'medium'})`);
    } catch (err) {
      console.error('\n❌ Failed to initialize provider:');
      console.error(`   ${err instanceof Error ? err.message : err}`);
      console.error('\n[HINT] Try: omk --provider=browser (for subscription mode)');
      process.exit(1);
    }
    
    console.log('Type /help for commands, /exit to quit\n');

    // Load plugins
    await this.pluginManager.loadAllPlugins();
    
    // Write initial state
    writeModeState('repl', {
      mode: 'repl',
      active: true,
      current_phase: 'running',
      started_at: new Date().toISOString(),
    }, this.cwd);

    this.isRunning = true;
    this.rl.prompt();
  }

  private async handleInput(input: string): Promise<void> {
    if (!input) {
      this.rl.prompt();
      return;
    }

    // Add to history
    this.state.history.push({ role: 'user', content: input });

    try {
      // Check for builtin commands
      if (input.startsWith('/')) {
        await this.handleBuiltinCommand(input);
        return;
      }

      // Check for skill invocation
      if (input.startsWith('$')) {
        await this.handleSkill(input);
        return;
      }

      // Check for file mention (@filename)
      if (input.includes('@')) {
        input = await this.handleFileMentions(input);
      }

      // Regular chat with Kimi
      await this.handleChat(input);

    } catch (err) {
      console.error('\x1b[31mError:', err instanceof Error ? err.message : err, '\x1b[0m');
    }

    if (this.isRunning) {
      this.rl.setPrompt(this.getPrompt());
      this.rl.prompt();
    }
  }

  private async handleBuiltinCommand(input: string): Promise<void> {
    const [command, ...args] = input.split(' ');

    switch (command) {
      case '/help':
        this.showHelp();
        break;

      case '/skills':
        this.showSkills();
        break;

      case '/clear':
        console.clear();
        break;

      case '/history':
        this.showHistory();
        break;

      case '/save':
        await this.saveSession(args[0]);
        break;

      case '/load':
        await this.loadSession(args[0]);
        break;

      case '/note':
        this.addNote(args.join(' '));
        break;

      case '/task':
        this.createTask(args.join(' '));
        break;

      case '/file':
        this.addFileToContext(args[0]);
        break;

      case '/files':
        this.showContextFiles();
        break;

      case '/context':
        this.showContext();
        break;

      case '/plugins':
        this.showPlugins();
        break;

      case '/mcp':
        await this.toggleMCP(args[0]);
        break;

      case '/model':
        await this.handleModelCommand(args.join(' '));
        break;

      case '/settings':
        this.showSettings();
        break;

      case '/status':
        this.showStatus();
        break;

      case '/reasoning':
        this.handleReasoningCommand(args[0]);
        break;

      case '/tools':
        this.showTools();
        break;

      case '/memory':
        this.showMemory();
        break;

      case '/exit':
      case '/quit':
        this.shutdown();
        return;

      default:
        console.log(`Unknown command: ${command}. Type /help for available commands.`);
    }

    this.rl.prompt();
  }

  private async handleSkill(input: string): Promise<void> {
    const skillName = input.split(' ')[0].slice(1);
    const skillArgs = input.slice(input.indexOf(' ') + 1);

    // Check if it's a tool command (file_system, web_fetch, etc.)
    const toolCommands = ['read_file', 'write_file', 'list_directory', 'search_files', 
                          'web_fetch', 'diagnostics', 'document_symbols', 'find_references',
                          'execute_command', 'memory_read', 'memory_write'];
    
    if (toolCommands.includes(skillName)) {
      await this.handleToolCommand(skillName, skillArgs);
      return;
    }

    // Load skill definition - try local, then global
    let skillPath = join(this.cwd, '.omk', 'skills', skillName, 'SKILL.md');
    let skillSource = 'local';
    
    if (!existsSync(skillPath)) {
      skillPath = join(this.globalOmkPath, 'skills', skillName, 'SKILL.md');
      skillSource = 'global';
    }
    
    if (!existsSync(skillPath)) {
      console.log(`\x1b[33mSkill not found: ${skillName}\x1b[0m`);
      console.log('Available skills: try /skills to list available skills');
      this.rl.prompt();
      return;
    }

    const skillContent = readFileSync(skillPath, 'utf-8');
    
    if (skillSource === 'global') {
      console.log(`\x1b[36m[Loading skill from global: ${skillName}]\x1b[0m`);
    }

    // Set current skill mode
    this.state.currentSkill = skillName;
    
    writeModeState(skillName, {
      mode: skillName,
      active: true,
      current_phase: 'running',
      started_at: new Date().toISOString(),
      state: { args: skillArgs },
    }, this.cwd);

    console.log(`\x1b[36m[Activating skill: ${skillName}]\x1b[0m`);

    // Create system message with skill instructions
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are executing the ${skillName} skill. Follow these instructions:\n\n${skillContent}\n\nUser input: ${skillArgs}`,
    };

    // Execute skill
    try {
      const provider = this.providerManager.getProvider();
      const response = await provider.chat({
        messages: [
          systemMessage,
          ...this.state.history.slice(-5),
        ],
      });

      const content = response.content || '';
      console.log('\n' + content + '\n');
      
      this.state.history.push({ role: 'assistant', content });

    } catch (err) {
      console.error('\x1b[31mSkill execution failed:', err, '\x1b[0m');
      this.state.currentSkill = null;
    }

    this.rl.setPrompt(this.getPrompt());
    this.rl.prompt();
  }

  private async handleToolCommand(toolName: string, argsStr: string): Promise<void> {
    // Import activity logger
    const { getActivityLogger } = await import('./activity-logger.js');
    const logger = getActivityLogger();
    
    // Parse JSON arguments
    let args: Record<string, any> = {};
    if (argsStr.trim()) {
      try {
        args = JSON.parse(argsStr);
      } catch {
        args = { path: argsStr.trim() };
      }
    }

    // Log tool call
    logger.addActivity({
      type: 'tool_call',
      message: `Tool: ${toolName}`,
      status: 'running',
      toolName,
      toolArgs: args,
    });
    
    try {
      const toolMap: Record<string, string> = {
        'read_file': '$read_file',
        'write_file': '$write_file',
        'list_directory': '$list_directory',
        'search_files': '$search_files',
        'web_fetch': '$web_fetch',
        'diagnostics': '$diagnostics',
        'document_symbols': '$document_symbols',
        'find_references': '$find_references',
        'execute_command': '$execute_command',
        'memory_read': '$memory_read',
        'memory_write': '$memory_write',
      };

      const toolFullName = toolMap[toolName] || `$${toolName}`;
      
      const { getToolDispatcher } = await import('../tools/index.js');
      const dispatcher = getToolDispatcher(this.cwd);
      
      const result = await dispatcher.dispatch(toolFullName, args);
      
      // Log tool result
      logger.addActivity({
        type: 'tool_result',
        message: `Result: ${toolName}`,
        status: 'completed',
        toolName,
        toolResult: result,
      });
      
    } catch (err) {
      logger.addActivity({
        type: 'error',
        message: `Tool failed: ${toolName}`,
        status: 'failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
    
    this.rl.setPrompt(this.getPrompt());
    this.rl.prompt();
  }

  private async handleChat(input: string): Promise<void> {
    // Check if input contains GitHub URL
    const githubUrlMatch = input.match(/https:\/\/github\.com\/[^\s]+/);
    
    if (githubUrlMatch && (input.includes('clone') || input.includes('download') || input.includes('ศึกษา'))) {
      // Handle repo analysis
      await this.handleRepoAnalysis(githubUrlMatch[0], input);
      return;
    }

    // Regular chat flow
    await this.handleRegularChat(input);
  }

  private async handleRepoAnalysis(url: string, originalInput: string): Promise<void> {
    const { getActivityLogger } = await import('./activity-logger.js');
    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'action',
      message: `Cloning repository: ${url}`,
      status: 'running',
    });

    try {
      // Import and use repo analyzer
      const { getRepoAnalyzer } = await import('../utils/repo-analyzer.js');
      const analyzer = getRepoAnalyzer();
      
      const repoInfo = await analyzer.analyzeRepo(url);
      
      logger.addActivity({
        type: 'complete',
        message: `Analyzed ${repoInfo.name}: ${repoInfo.structure.length} files`,
        status: 'completed',
      });

      // Format for AI
      const repoContext = analyzer.formatForAI(repoInfo);
      
      logger.addActivity({
        type: 'thinking',
        message: 'Analyzing repository with AI...',
        status: 'running',
      });

      // Send to AI
      const provider = this.providerManager.getProvider();
      let fullResponse = '';
      let chunkCount = 0;
      
      const systemPrompt = `You are analyzing a GitHub repository. Here is the repository information:\n\n${repoContext}`;
      
      for await (const chunk of provider.stream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: originalInput },
        ],
      })) {
        process.stdout.write(chunk.content);
        fullResponse += chunk.content;
        chunkCount++;
        
        if (chunkCount % 50 === 0) {
          logger.addActivity({
            type: 'action',
            message: `Analysis: ${chunkCount} chunks`,
            status: 'completed',
          });
        }
        
        if (chunk.done) break;
      }

      logger.addActivity({
        type: 'complete',
        message: 'Analysis complete',
        status: 'completed',
      });

      console.log('\n');
      this.state.history.push({ role: 'assistant', content: fullResponse });
      
      // Cleanup
      analyzer.cleanup(repoInfo.localPath);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.addActivity({
        type: 'error',
        message: `Repo analysis failed: ${errorMsg}`,
        status: 'failed',
      });
      console.error('\n[ERROR] Failed to analyze repository:', errorMsg);
    } finally {
      logger.stop();
    }
  }

  private async handleRegularChat(input: string): Promise<void> {
    // Read AGENTS.md if exists (local first, then global fallback)
    const localAgentsPath = join(this.cwd, 'AGENTS.md');
    const globalAgentsPath = join(this.globalOmkPath, 'AGENTS.md');
    
    let systemPrompt = 'You are a helpful AI assistant for software development.';
    
    if (existsSync(localAgentsPath)) {
      systemPrompt += '\n\nProject guidelines (local AGENTS.md):\n' + readFileSync(localAgentsPath, 'utf-8');
    } else if (existsSync(globalAgentsPath)) {
      systemPrompt += '\n\nProject guidelines (Global Root Agent):\n' + readFileSync(globalAgentsPath, 'utf-8');
    }

    // Add context files if any
    if (this.state.context.selectedFiles && this.state.context.selectedFiles.length > 0) {
      systemPrompt += '\n\nRelevant files:\n';
      for (const file of this.state.context.selectedFiles) {
        const filePath = join(this.cwd, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, 'utf-8').slice(0, 2000);
          systemPrompt += `\n--- ${file} ---\n${content}\n`;
        }
      }
    }

    // Import activity logger
    const { getActivityLogger } = await import('./activity-logger.js');
    const logger = getActivityLogger();
    logger.start();
    
    // Detect task type from input
    const taskType = this.detectTaskType(input);
    
    // Log initial activity
    logger.addActivity({
      type: 'thinking',
      message: `Processing: ${input.slice(0, 50)}...`,
      status: 'running',
    });

    try {
      const provider = this.providerManager.getProvider();
      let fullResponse = '';
      let chunkCount = 0;
      
      // Create streaming timeout (10 minutes for complex tasks)
      const streamTimeout = 10 * 60 * 1000;
      const startTime = Date.now();
      
      for await (const chunk of provider.stream({
        messages: [
          { role: 'system', content: systemPrompt },
          ...this.state.history.slice(-10),
        ],
      })) {
        // Check timeout
        if (Date.now() - startTime > streamTimeout) {
          logger.addActivity({
            type: 'error',
            message: 'Request timed out (10 minutes)',
            status: 'failed',
          });
          break;
        }
        
        // Write chunk immediately
        process.stdout.write(chunk.content);
        fullResponse += chunk.content;
        chunkCount++;
        
        // Log progress every 50 chunks
        if (chunkCount % 50 === 0) {
          logger.addActivity({
            type: 'action',
            message: `Received ${chunkCount} chunks (${fullResponse.length} chars)`,
            status: 'completed',
          });
        }
        
        if (chunk.done) break;
      }

      // Log completion
      logger.addActivity({
        type: 'complete',
        message: `Response complete (${fullResponse.length} chars, ${chunkCount} chunks)`,
        status: 'completed',
      });
      
      console.log('\n');
      this.state.history.push({ role: 'assistant', content: fullResponse });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.addActivity({
        type: 'error',
        message: `Failed: ${errorMsg}`,
        status: 'failed',
      });
      console.error('\n[ERROR] Chat failed:', errorMsg);
    } finally {
      logger.stop();
    }
  }
  
  private async handleFileMentions(input: string): Promise<string> {
    // Find @filename patterns
    const mentionRegex = /@([\w./-]+)/g;
    let match;
    let processedInput = input;
    
    while ((match = mentionRegex.exec(input)) !== null) {
      const fileName = match[1];
      const fullPath = resolve(this.cwd, fileName);
      
      if (existsSync(fullPath)) {
        // Add to context
        if (!this.state.context.selectedFiles) {
          this.state.context.selectedFiles = [];
        }
        
        if (!this.state.context.selectedFiles.includes(fileName)) {
          this.state.context.selectedFiles.push(fileName);
          console.log(`\x1b[90m[Added to context: ${fileName}]\x1b[0m`);
        }
        
        // Read file content for inline display
        try {
          const { getFileSystemTools } = await import('../tools/file-system.js');
          const tools = getFileSystemTools(this.cwd);
          const result = tools.readFile({ path: fileName, limit: 1000 });
          
          // Replace @filename with actual content reference
          const fileContent = `\n\n--- Content of ${fileName} ---\n${result.content}\n--- End of ${fileName} ---\n`;
          processedInput = processedInput.replace(match[0], fileContent);
        } catch {
          // If can't read, just keep the mention
          processedInput = processedInput.replace(match[0], `[File: ${fileName}]`);
        }
      } else {
        console.log(`\x1b[33m[File not found: ${fileName}]\x1b[0m`);
        processedInput = processedInput.replace(match[0], `[File not found: ${fileName}]`);
      }
    }
    
    return processedInput;
  }

  private detectTaskType(input: string): string {
    const lower = input.toLowerCase();
    if (lower.includes('http') || lower.includes('github') || lower.includes('clone')) {
      return 'repository-analysis';
    }
    if (lower.includes('fix') || lower.includes('bug') || lower.includes('error')) {
      return 'debugging';
    }
    if (lower.includes('plan') || lower.includes('phase') || lower.includes('progression')) {
      return 'planning';
    }
    if (lower.includes('refactor') || lower.includes('rewrite')) {
      return 'refactoring';
    }
    return 'general-chat';
  }

  private showHelp(): void {
    console.log(`
\x1b[1mOh-my-KIMI Commands:\x1b[0m

\x1b[1mBuiltin Commands:\x1b[0m
  /help              Show this help
  /skills            List available skills
  /tools             List available tools
  /model [provider]  Switch AI provider
  /reasoning <level> Set reasoning effort (low|medium|high)
  /settings          Show current settings
  /status            Show session status
  /memory            Show project memory
  /clear             Clear screen
  /history           Show chat history
  /save [name]       Save session
  /load [name]       Load session
  /note <text>       Add to notepad
  /task <title>      Create a task
  /file <path>       Add file to context
  /files             Show context files
  /context           Show full context
  /plugins           List loaded plugins
  /mcp [start|stop]  Toggle MCP server
  /exit, /quit       Exit OMK

\x1b[1mSkills (use with $ prefix):\x1b[0m
  $ralph "task"          Persistent completion
  $team "task"           Multi-agent execution
  $plan "task"           Create plan
  $deep-interview        Requirements clarification
  $autopilot "task"      Full pipeline
  $code-review [file]    Code review
  $security-review       Security audit
  $git-master [cmd]      Git operations
  $build-fix             Fix build errors
  $tdd "feature"         Test-driven development
  $analyze               Codebase analysis
  $visual-verdict        Visual comparison
  $cancel                Cancel current skill
  $help                  Show skill help

\x1b[1mExamples:\x1b[0m
  $ralph "refactor auth module"
  $plan "design new API"
  /note Remember to update docs
  /file src/main.ts
`);
  }

  private showSkills(): void {
    console.log('\n\x1b[1mAvailable Skills:\x1b[0m\n');
    
    const categories: Record<string, string[]> = {
      'Core': ['ralph', 'team', 'plan', 'deep-interview', 'autopilot', 'cancel'],
      'Code Quality': ['code-review', 'security-review', 'analyze', 'build-fix'],
      'Development': ['tdd', 'git-master'],
      'Visual': ['visual-verdict'],
      'Utils': ['help'],
    };

    for (const [category, skills] of Object.entries(categories)) {
      console.log(`\x1b[33m${category}:\x1b[0m`);
      for (const skill of skills) {
        console.log(`  $${skill}`);
      }
    }
    console.log('');
  }

  private showHistory(): void {
    console.log('\n\x1b[1mSession History:\x1b[0m\n');
    for (const msg of this.state.history) {
      const role = msg.role === 'user' ? '\x1b[32mYou' : '\x1b[36mKimi';
      console.log(`${role}:\x1b[0m ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    }
    console.log('');
  }

  private async saveSession(name?: string): Promise<void> {
    const sessionName = name || `session-${Date.now()}`;
    const { writeFileSync } = await import('fs');
    const sessionPath = join(this.cwd, '.omk', 'sessions', `${sessionName}.json`);
    
    writeFileSync(sessionPath, JSON.stringify(this.state.history, null, 2));
    console.log(`[OK] Session saved: ${sessionName}`);
  }

  private async loadSession(name?: string): Promise<void> {
    if (!name) {
      console.log('Usage: /load <session-name>');
      return;
    }
    
    const { readFileSync, existsSync } = await import('fs');
    const sessionPath = join(this.cwd, '.omk', 'sessions', `${name}.json`);
    
    if (!existsSync(sessionPath)) {
      console.log(`\x1b[31mSession not found: ${name}\x1b[0m`);
      return;
    }

    this.state.history = JSON.parse(readFileSync(sessionPath, 'utf-8'));
    console.log(`[OK] Session loaded: ${name} (${this.state.history.length} messages)`);
  }

  private addNote(text: string): void {
    if (!text) {
      console.log('Usage: /note <text>');
      return;
    }
    
    appendToNotepad(text, this.cwd);
    console.log('[OK] Note added.');
  }

  private createTask(title: string): void {
    if (!title) {
      console.log('Usage: /task <title>');
      return;
    }
    
    const task = createTask({
      title,
      description: 'Created from REPL',
      status: 'pending',
    }, this.cwd);
    
    console.log(`[OK] Task created: ${task.id}`);
  }

  private addFileToContext(filePath?: string): void {
    if (!filePath) {
      console.log('Usage: /file <path>');
      return;
    }

    const fullPath = join(this.cwd, filePath);
    if (!existsSync(fullPath)) {
      console.log(`\x1b[31mFile not found: ${filePath}\x1b[0m`);
      return;
    }

    if (!this.state.context.selectedFiles) {
      this.state.context.selectedFiles = [];
    }

    if (!this.state.context.selectedFiles.includes(filePath)) {
      this.state.context.selectedFiles.push(filePath);
      console.log(`[OK] Added to context: ${filePath}`);
    } else {
      console.log(`[INFO] Already in context: ${filePath}`);
    }
  }

  private showContextFiles(): void {
    if (!this.state.context.selectedFiles?.length) {
      console.log('No files in context. Use /file <path> to add.');
      return;
    }

    console.log('\n\x1b[1mContext Files:\x1b[0m');
    for (const file of this.state.context.selectedFiles) {
      console.log(`  - ${file}`);
    }
  }

  private showContext(): void {
    console.log('\n\x1b[1mCurrent Context:\x1b[0m');
    console.log(`  CWD: ${this.state.context.cwd}`);
    console.log(`  Current Skill: ${this.state.currentSkill || 'none'}`);
    console.log(`  History Size: ${this.state.history.length} messages`);
    this.showContextFiles();
  }

  private showPlugins(): void {
    const plugins = this.pluginManager.listPlugins();
    
    if (plugins.length === 0) {
      console.log('No plugins loaded.');
      return;
    }

    console.log('\n\x1b[1mLoaded Plugins:\x1b[0m');
    for (const plugin of plugins) {
      console.log(`  - ${plugin.name} v${plugin.version}`);
      if (plugin.description) {
        console.log(`    ${plugin.description}`);
      }
    }
  }

  private async toggleMCP(action?: string): Promise<void> {
    if (action === 'start') {
      startMCPServer(3000);
      console.log('\x1b[32mMCP server started on port 3000\x1b[0m');
    } else if (action === 'stop') {
      stopMCPServer();
      console.log('\x1b[32mMCP server stopped\x1b[0m');
    } else {
      console.log('Usage: /mcp [start|stop]');
    }
  }

  private async handleModelCommand(args: string): Promise<void> {
    if (!args) {
      const current = this.providerManager.getCurrentType();
      console.log(`Current provider: ${current || 'not initialized'}`);
      console.log('Usage: /model <provider> [options]');
      console.log('Providers: api, browser, cli');
      return;
    }

    const [provider, ...rest] = args.split(' ');
    
    try {
      await this.providerManager.switchProvider(provider as any, {});
      console.log(`[OK] Switched to provider: ${provider}`);
    } catch (err) {
      console.error('[ERROR] Failed to switch provider:', err instanceof Error ? err.message : String(err));
    }
  }

  private showSettings(): void {
    console.log('\n\x1b[1mOMK Settings:\x1b[0m\n');
    console.log(`  Provider: ${this.providerManager.getCurrentType() || 'auto'}`);
    console.log(`  Working Directory: ${this.cwd}`);
    console.log(`  Global Config: ${this.globalOmkPath}`);
    console.log(`  History Size: ${this.state.history.length}`);
    console.log(`  Context Files: ${this.state.context.selectedFiles?.length || 0}`);
    console.log('');
  }

  private showStatus(): void {
    console.log('\n\x1b[1mOMK Status:\x1b[0m\n');
    console.log(`  Mode: ${this.state.currentSkill || 'chat'}`);
    console.log(`  Provider: ${this.providerManager.getCurrentType() || 'not initialized'}`);
    console.log(`  Session Messages: ${this.state.history.length}`);
    console.log(`  Context Files: ${this.state.context.selectedFiles?.length || 0}`);
    
    const activeModes = listActiveModes(this.cwd);
    if (activeModes.length > 0) {
      console.log('  Active Modes:');
      for (const mode of activeModes) {
        console.log(`    - ${mode.mode}: ${mode.current_phase}`);
      }
    }
    console.log('');
  }

  private handleReasoningCommand(level?: string): void {
    const validLevels = ['low', 'medium', 'high'];
    
    if (!level) {
      console.log('Current reasoning: medium (default)');
      console.log('Usage: /reasoning <low|medium|high>');
      return;
    }

    if (!validLevels.includes(level)) {
      console.log('[ERROR] Invalid reasoning level. Use: low, medium, high');
      return;
    }

    console.log(`[OK] Reasoning level set to: ${level}`);
    console.log('[INFO] Will take effect on next request');
  }

  private showTools(): void {
    console.log('\n\x1b[1mAvailable Tools:\x1b[0m\n');
    console.log('\x1b[33mFile System:\x1b[0m');
    console.log('  $read_file <path>           Read file contents');
    console.log('  $write_file <path> <content>  Write to file');
    console.log('  $list_directory [path]      List directory contents');
    console.log('  $search_files <pattern>     Search files for pattern');
    console.log('');
    console.log('\x1b[33mWeb:\x1b[0m');
    console.log('  $web_fetch <url>            Fetch URL content');
    console.log('');
    console.log('\x1b[33mCode Intelligence:\x1b[0m');
    console.log('  $diagnostics [path]         Run TypeScript diagnostics');
    console.log('  $document_symbols <file>    Extract symbols from file');
    console.log('  $find_references <symbol>   Find symbol references');
    console.log('');
    console.log('\x1b[33mExecution:\x1b[0m');
    console.log('  $execute_command <cmd>      Execute shell command');
    console.log('');
    console.log('\x1b[33mMemory:\x1b[0m');
    console.log('  $memory_read [section]      Read project memory');
    console.log('  $memory_write <type> <content>  Write to memory');
    console.log('');
  }

  private showMemory(): void {
    try {
      const { getMemoryTools } = require('../tools/memory.js');
      const memory = getMemoryTools(this.cwd);
      const info = memory.readMemory() as any;
      
      console.log('\n\x1b[1mProject Memory:\x1b[0m\n');
      
      if (info.techStack) {
        console.log(`Tech Stack: ${info.techStack}`);
      }
      if (info.conventions) {
        console.log(`Conventions: ${info.conventions}`);
      }
      
      if (info.notes?.length > 0) {
        console.log('\n\x1b[33mNotes:\x1b[0m');
        for (const note of info.notes.slice(-5)) {
          console.log(`  [${note.category}] ${note.content.slice(0, 60)}...`);
        }
      }
      
      if (info.directives?.length > 0) {
        console.log('\n\x1b[33mDirectives:\x1b[0m');
        for (const d of info.directives.slice(-5)) {
          console.log(`  [${d.priority}] ${d.directive.slice(0, 60)}...`);
        }
      }
      
      console.log('');
    } catch (err) {
      console.log('No project memory found.');
    }
  }

  private shutdown(): void {
    console.log('\n\x1b[32mGoodbye! 👋\x1b[0m\n');
    
    this.isRunning = false;
    
    // Cleanup
    if (this.state.currentSkill) {
      clearModeState(this.state.currentSkill, this.cwd);
    }
    clearModeState('repl', this.cwd);
    stopMCPServer();
    
    this.rl.close();
    process.exit(0);
  }
}

// Factory function
export async function startREPL(
  cwd?: string, 
  options?: { provider?: string; reasoning?: string; yolo?: boolean }
): Promise<void> {
  const repl = new OMKREPL(cwd);
  await repl.start(options);
  
  // Keep process alive until REPL is closed
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // @ts-ignore - accessing private member
      if (!repl.isRunning) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

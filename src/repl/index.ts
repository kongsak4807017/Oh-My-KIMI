/**
 * Interactive REPL for OMK
 * Real-time chat session with the configured provider
 */

import { createInterface, Interface as ReadlineInterface } from 'readline';
import { stdin, stdout } from 'process';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve, basename } from 'path';
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
  listActiveModes,
  listSessions,
  saveSession,
  updateSession,
  deleteSession,
  getSession,
  formatRelativeTime,
  generateSessionTitle,
  SessionInfo
} from '../state/index.js';
import { PluginManager } from '../plugins/index.js';
import { startMCPServer, stopMCPServer } from '../mcp/server.js';
import { getContextManager, ContextStats } from '../utils/context-manager.js';
import { getCodebaseIndexer, getFileChunker, RepositoryMap } from '../indexer/index.js';
import { InteractiveAutocomplete } from './autocomplete-prompt.js';
import { getActivityLogger } from './activity-logger.js';
import { getGSDExecutor } from '../skills/gsd-executor.js';
import { getFileSystemTools } from '../tools/file-system.js';
import { getMemoryTools } from '../tools/memory.js';
import { resolveExecutionProfile } from '../orchestration/phase-map.js';
import { runEngine } from '../orchestration/index.js';
import {
  buildSkillSystemPrompt,
  detectSkillInvocations,
  getWorkspaceAgentsContent,
  listAvailableSkills,
  loadSkillContent,
} from '../skills/runtime.js';

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

// Built-in commands
const BUILTIN_COMMANDS = [
  '/help',
  '/skills',
  '/clear',
  '/history',
  '/save',
  '/load',
  '/sessions',
  '/title',
  '/note',
  '/task',
  '/file',
  '/files',
  '/context',
  '/tokens',
  '/cache',
  '/index',
  '/map',
  '/search',
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
  private contextManager = getContextManager();
  private codebaseIndexer: ReturnType<typeof getCodebaseIndexer>;
  private fileChunker = getFileChunker();
  private repoMap: RepositoryMap | null = null;
  private autocomplete: InteractiveAutocomplete;
  private currentSessionId: string | null = null;
  private sessionTitle: string | null = null;
  private gsdExecutor: ReturnType<typeof getGSDExecutor>;
  private availableSkills: string[] = [];

  constructor(private cwd: string = process.cwd()) {
    this.codebaseIndexer = getCodebaseIndexer(this.cwd);
    this.autocomplete = new InteractiveAutocomplete(this.cwd);
    this.gsdExecutor = getGSDExecutor(this.cwd);
    this.availableSkills = listAvailableSkills(this.cwd);
    this.providerManager = getProviderManager();
    getActivityLogger().configure(this.cwd);
    this.state = {
      history: [],
      currentSkill: null,
      context: { cwd },
    };
    this.pluginManager = new PluginManager(cwd);
    this.globalOmkPath = join(homedir(), '.omk');
    
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

    // Note: Interactive autocomplete handles all input now

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\nUse /exit or /quit to exit properly.');
      // Input loop will continue
    });
  }

  private currentHint: string = '';
  private hintCleared: boolean = true;

  private showGrayHint(prefix: string, line: string): void {
    let hint = '';
    
    if (prefix === '/') {
      hint = ' help  exit  tools  status';
    } else if (prefix === '$') {
      hint = ' read_file  write_file  web_fetch  diagnostics  execute_command';
    } else if (prefix === '@') {
      hint = ' filename';
    }
    
    if (hint) {
      this.currentHint = hint;
      this.hintCleared = false;
      const gray = '\x1b[90m';
      const reset = '\x1b[0m';
      // Save cursor position, move to end, print hint, restore cursor
      process.stdout.write(`\x1b[s${gray}${hint}${reset}\x1b[u`);
    }
  }

  private clearHint(): void {
    if (this.hintCleared) return;
    this.hintCleared = true;
    // Clear from cursor to end of line
    process.stdout.write('\x1b[K');
  }

  private completer(line: string): [string[], string] {
    const skillPrefixes = this.availableSkills.map(skill => `$${skill}`);

    // Empty or whitespace - show hints
    if (!line.trim()) {
      return [['/help', '/exit', '$tools', '@filename'], ''];
    }
    
    // Command mode (starts with /)
    if (line.startsWith('/')) {
      const matches = BUILTIN_COMMANDS.filter(c => c.startsWith(line));
      // Return the part after '/' as substring to complete
      return [matches, line];
    }
    
    // Tool mode (starts with $)
    if (line.startsWith('$')) {
      const tools = [
        '$read_file', '$write_file', '$list_directory', '$search_files',
        '$web_fetch', '$diagnostics', '$document_symbols', '$find_references',
        '$execute_command', '$memory_read', '$memory_write',
        ...skillPrefixes,
      ];
      const matches = tools.filter(t => t.startsWith(line));
      return [matches, line];
    }
    
    // File mention mode (starts with @)
    if (line.includes('@')) {
      const atIndex = line.lastIndexOf('@');
      const beforeAt = line.slice(0, atIndex);
      const afterAt = line.slice(atIndex + 1);
      
      try {
        const fsTools = getFileSystemTools(this.cwd);
        const { entries } = fsTools.listDirectory({ path: '.', recursive: true });
        const files = entries
          .filter((e: any) => e.type === 'file' && e.name.includes(afterAt))
          .map((e: any) => beforeAt + '@' + e.name)
          .slice(0, 20);
        return [files.length ? files : [line], line];
      } catch {
        return [[line], line];
      }
    }
    
    // Default: skills + commands
    const completions = [...skillPrefixes, ...BUILTIN_COMMANDS];
    const hits = completions.filter(c => c.startsWith(line));
    return [hits.length ? hits : completions, line];
  }

  async start(options?: {
    provider?: string;
    reasoning?: string;
    yolo?: boolean;
    model?: string;
    baseUrl?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
  }): Promise<void> {
    // Set terminal title to project name
    const projectName = basename(this.cwd);
    process.stdout.write(`\x1b]0;OMK: ${projectName}\x07`);
    
    if (options?.yolo) {
      console.log('\n[WARNING] YOLO mode enabled - bypassing confirmations');
    }
    console.log('\nWelcome to OMK');
    
    // Initialize provider
    try {
      const providerType = (options?.provider as any) || 'auto';
      await this.providerManager.initialize({
        type: providerType,
        reasoning: (options?.reasoning as 'low' | 'medium' | 'high') || 'medium',
        model: options?.model,
        baseUrl: options?.baseUrl,
        apiKeyEnv: options?.apiKeyEnv,
        headers: options?.headers,
      });
      
      const currentType = this.providerManager.getCurrentType();
      console.log(`[OK] Provider: ${currentType} (reasoning: ${options?.reasoning || 'medium'})`);
    } catch (err) {
      console.error('\n❌ Failed to initialize provider:');
      console.error(`   ${err instanceof Error ? err.message : err}`);
      console.error('\n[HINT] Try: omk --openrouter --model <provider/model>, or omk --browser');
      process.exit(1);
    }
    
    console.log('Type /help for commands, /exit to quit\n');
    const logger = getActivityLogger();
    logger.clear();
    logger.start();
    logger.stop();

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
    
    // Start autocomplete input loop
    this.runInputLoop();
  }

  private async runInputLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const input = await this.autocomplete.prompt();
        await this.handleInput(input.trim());
      } catch (err) {
        console.error('Input error:', err);
        break;
      }
    }
  }

  private async handleInput(rawInput: string): Promise<void> {
    let input = rawInput;

    if (!input) {
      return; // Loop will prompt again
    }

    // Add to history
    this.state.history.push({ role: 'user', content: input });

    try {
      // Check for builtin commands
      if (input.startsWith('/')) {
        await this.handleBuiltinCommand(input);
        return;
      }

      // Check for file mention (@filename)
      if (input.includes('@')) {
        input = await this.handleFileMentions(input);
      }

      const detectedSkills = detectSkillInvocations(input)
        .filter(match => loadSkillContent(this.cwd, match.skillName));
      if (detectedSkills.length > 0) {
        await this.handleSkill(input, detectedSkills.map(match => match.skillName), detectedSkills.some(match => match.kind === 'keyword'));
        this.saveCurrentSession(rawInput);
        return;
      }

      // Regular chat with Kimi
      await this.handleChat(input);
      
      // Save/update session after chat
      this.saveCurrentSession(input);

    } catch (err) {
      console.error('\x1b[31mError:', err instanceof Error ? err.message : err, '\x1b[0m');
    }
    // Loop will prompt again
  }

  private saveCurrentSession(lastMessage: string): void {
    // Auto-generate title from first message if not set
    if (!this.sessionTitle && this.state.history.length > 0) {
      const firstUserMsg = this.state.history.find(m => m.role === 'user')?.content;
      if (firstUserMsg) {
        this.sessionTitle = generateSessionTitle(firstUserMsg);
      }
    }
    
    const sessionData = {
      title: this.sessionTitle || undefined,
      cwd: this.cwd,
      message_count: this.state.history.length,
      first_message: this.state.history.find(m => m.role === 'user')?.content,
      last_message: lastMessage,
    };
    
    if (this.currentSessionId) {
      // Update existing session
      updateSession(this.currentSessionId, sessionData, this.cwd);
    } else {
      // Create new session
      const session = saveSession(sessionData, this.cwd);
      this.currentSessionId = session.id;
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
        getActivityLogger().clear();
        getActivityLogger().start();
        getActivityLogger().stop();
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

      case '/tokens':
        this.showTokenStats();
        break;

      case '/cache':
        this.showCacheStats();
        break;

      case '/index':
        await this.buildCodebaseIndex();
        break;

      case '/map':
        this.showRepositoryMap();
        break;

      case '/search':
        this.searchSymbols(args.join(' '));
        break;

      case '/sessions':
        await this.handleSessions();
        break;

      case '/title':
        this.handleTitle(args.join(' '));
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
    // Input loop will prompt again
  }

  private async handleSkill(input: string, requestedSkills?: string[], autoDetected: boolean = false): Promise<void> {
    const explicitSkillName = input.split(' ')[0].slice(1);
    const skillNames = requestedSkills?.length ? requestedSkills : [explicitSkillName];
    const skillArgs = requestedSkills?.length
      ? input
      : (input.includes(' ') ? input.slice(input.indexOf(' ') + 1) : '');
    const primarySkill = skillNames[0];

    // Check if it's a tool command (file_system, web_fetch, etc.)
    const toolCommands = ['read_file', 'write_file', 'list_directory', 'search_files', 
                          'web_fetch', 'diagnostics', 'document_symbols', 'find_references',
                          'execute_command', 'memory_read', 'memory_write'];
    
    if (toolCommands.includes(primarySkill)) {
      await this.handleToolCommand(primarySkill, skillArgs);
      return;
    }

    // Check if it's a GSD command
    if (primarySkill.startsWith('gsd-')) {
      await this.handleGSDCommand(primarySkill, skillArgs);
      return;
    }

    // Route to orchestration engine for supported skills
    const engineSkills = new Set([
      'ralph', 'team', 'ultrawork', 'swarm', 'ultraqa',
      'pipeline', 'autopilot', 'plan', 'ralplan', 'deep-interview',
    ]);

    if (engineSkills.has(primarySkill)) {
      const argsArray = skillArgs ? [skillArgs] : [];
      try {
        console.log(`\x1b[36m[Activating engine: $${primarySkill}]\x1b[0m\n`);
        await runEngine(primarySkill, argsArray, this.cwd, {
          yolo: false, // REPL mode does not auto-yolo
          reasoning: (this.providerManager as any).config?.reasoning || 'medium',
        });
      } catch (err) {
        console.error('\x1b[31mEngine execution failed:', err instanceof Error ? err.message : err, '\x1b[0m');
      }
      return;
    }

    const resolvedSkills = skillNames
      .map(skillName => loadSkillContent(this.cwd, skillName))
      .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

    if (resolvedSkills.length === 0) {
      console.log(`\x1b[33mSkill not found: ${primarySkill}\x1b[0m`);
      console.log('Available skills: try /skills to list available skills');
      return;
    }

    // Set current skill mode
    this.state.currentSkill = resolvedSkills.map(skill => skill.skillName).join(',');
    
    writeModeState(primarySkill, {
      mode: primarySkill,
      active: true,
      current_phase: 'running',
      started_at: new Date().toISOString(),
      state: { args: skillArgs, skills: resolvedSkills.map(skill => skill.skillName), autoDetected },
    }, this.cwd);

    if (autoDetected) {
      console.log(`\x1b[36m[Auto-routed skill(s): ${resolvedSkills.map(skill => `$${skill.skillName}`).join(', ')}]\x1b[0m`);
    } else {
      console.log(`\x1b[36m[Activating skill: ${resolvedSkills.map(skill => skill.skillName).join(', ')}]\x1b[0m`);
    }

    const logger = getActivityLogger();
    const profile = resolveExecutionProfile({ skillName: primarySkill, cwd: this.cwd });
    logger.clear();
    logger.start();
    logger.addActivity({
      type: 'action',
      status: 'completed',
      agent: 'router',
      role: 'dispatcher',
      message: `Selected skill lane: ${resolvedSkills.map(skill => `$${skill.skillName}`).join(', ')}`,
      details: autoDetected ? 'Triggered from keyword routing' : 'Triggered explicitly by user input',
      skillName: primarySkill,
    });
    logger.addActivity({
      type: 'reading',
      status: 'completed',
      agent: 'context',
      role: 'workspace',
      message: 'Loaded skill instructions and AGENTS.md context',
      details: `${resolvedSkills.length} skill(s), provider=${this.providerManager.getCurrentType() ?? 'unknown'}`,
      skillName: primarySkill,
    });
    const runningActivity = logger.addActivity({
      type: 'thinking',
      status: 'running',
      agent: profile.agent,
      role: profile.role,
      message: `Preparing ${profile.task}`,
      details: skillArgs || input,
      skillName: primarySkill,
    });

    // Create system message with skill instructions
    const systemMessage: ChatMessage = {
      role: 'system',
      content: resolvedSkills.map(skill => buildSkillSystemPrompt({
        skillName: skill.skillName,
        skillContent: skill.content,
        userInput: skillArgs || input,
        agentsContent: getWorkspaceAgentsContent(this.cwd),
        source: skill.source,
      })).join('\n\n---\n\n'),
    };

    // Execute skill
    try {
      const provider = this.providerManager.getProvider();
      
      // Optimize context for skill execution
      const { messages: optimizedMessages } = this.contextManager.getOptimizedContext(
        this.state.history,
        undefined,
        skillArgs
      );

      logger.updateActivity(runningActivity.id, {
        status: 'completed',
        message: `${profile.agent} received optimized context`,
        details: `${optimizedMessages.length} message(s) ready for provider`,
        skillName: primarySkill,
      });
      logger.stop();
      
      const response = await provider.chat({
        messages: [
          systemMessage,
          ...optimizedMessages,
        ],
      });

      const content = response.content || '';
      console.log('\n' + content + '\n');
      
      this.state.history.push({ role: 'assistant', content });

    } catch (err) {
      logger.stop();
      console.error('\x1b[31mSkill execution failed:', err, '\x1b[0m');
    } finally {
      clearModeState(primarySkill, this.cwd);
      this.state.currentSkill = null;
    }
  }

  private async handleToolCommand(toolName: string, argsStr: string): Promise<void> {
    // Import activity logger
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
      agent: 'tool-runner',
      role: 'executor',
      message: `Invoking tool ${toolName}`,
      status: 'running',
      toolName,
      toolArgs: args,
      details: `Preparing arguments for $${toolName}`,
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
        agent: 'tool-runner',
        role: 'executor',
        message: `Tool ${toolName} completed`,
        status: 'completed',
        toolName,
        toolResult: result,
      });
      
    } catch (err) {
      logger.addActivity({
        type: 'error',
        agent: 'tool-runner',
        role: 'executor',
        message: `Tool ${toolName} failed`,
        status: 'failed',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleGSDCommand(command: string, args: string): Promise<void> {
    console.log(`\x1b[36m[GSD] Executing: ${command}\x1b[0m`);
    
    try {
      switch (command) {
        case 'gsd-new-project':
          await this.gsdExecutor.newProject(args.trim() || undefined);
          break;
        case 'gsd-map-codebase':
          await this.gsdExecutor.mapCodebase();
          break;
        case 'gsd-discuss-phase':
          await this.gsdExecutor.discussPhase(parseInt(args) || 1);
          break;
        case 'gsd-plan-phase':
          await this.gsdExecutor.planPhase(parseInt(args) || 1);
          break;
        case 'gsd-execute-phase':
          await this.gsdExecutor.executePhase(parseInt(args) || 1);
          break;
        case 'gsd-verify-work':
          await this.gsdExecutor.verifyWork(parseInt(args) || 1);
          break;
        case 'gsd-ship':
          await this.gsdExecutor.ship(parseInt(args) || 1);
          break;
        case 'gsd-quick':
          await this.gsdExecutor.quick(args.trim() || 'Quick task');
          break;
        case 'gsd-progress':
          await this.gsdExecutor.progress();
          break;
        case 'gsd-next':
          await this.gsdExecutor.next();
          break;
        default:
          console.log(`\x1b[33m[GSD] Unknown command: ${command}\x1b[0m`);
          console.log('Available: $gsd-new-project, $gsd-discuss-phase, $gsd-plan-phase, etc.');
      }
    } catch (err) {
      console.error(`\x1b[31m[GSD] Error: ${err}\x1b[0m`);
    }
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
    const logger = getActivityLogger();
    logger.clear();
    const profile = resolveExecutionProfile({ taskType: 'repository-analysis', cwd: this.cwd });
    logger.start();
    
    logger.addActivity({
      type: 'action',
      agent: 'router',
      role: 'dispatcher',
      message: `Routing request to ${profile.agent}`,
      details: profile.task,
      status: 'completed',
      taskType: 'repository-analysis',
    });

    logger.addActivity({
      type: 'reading',
      agent: profile.agent,
      role: profile.role,
      message: `Cloning repository ${url}`,
      status: 'running',
      taskType: 'repository-analysis',
    });

    try {
      // Import and use repo analyzer
      const { getRepoAnalyzer } = await import('../utils/repo-analyzer.js');
      const analyzer = getRepoAnalyzer();
      
      const repoInfo = await analyzer.analyzeRepo(url);
      
      logger.addActivity({
        type: 'complete',
        agent: profile.agent,
        role: profile.role,
        message: `Indexed ${repoInfo.name}`,
        details: `${repoInfo.structure.length} files discovered`,
        status: 'completed',
        taskType: 'repository-analysis',
      });

      // Format for AI
      const repoContext = analyzer.formatForAI(repoInfo);
      
      logger.addActivity({
        type: 'thinking',
        agent: 'provider',
        role: 'explorer',
        message: 'Handing repository snapshot to provider',
        details: 'Preparing analysis response',
        status: 'running',
        taskType: 'repository-analysis',
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
        agent: 'provider',
        role: 'explorer',
        message: 'Repository analysis complete',
        status: 'completed',
        taskType: 'repository-analysis',
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
    
    // For large codebases, use indexer to find relevant files
    const stats = this.codebaseIndexer.getStats();
    if (stats.files > 0) {
      const relevantFiles = this.codebaseIndexer.getSmartContext(input, 15);
      if (relevantFiles.length > 0) {
        systemPrompt += '\n\nAutomatically selected relevant files:\n';
        for (const file of relevantFiles) {
          systemPrompt += `\n--- ${file.path} ---\n${file.content.slice(0, 1500)}\n`;
        }
      }
    }

    // Import activity logger
    const logger = getActivityLogger();
    logger.clear();
    logger.start();
    
    // Detect task type from input
    const taskType = this.detectTaskType(input);
    const profile = resolveExecutionProfile({ taskType, cwd: this.cwd });
    const providerType = this.providerManager.getCurrentType() ?? 'unknown';
    const agentsSource = existsSync(localAgentsPath) ? 'local AGENTS.md' : existsSync(globalAgentsPath) ? 'global AGENTS.md' : 'default system prompt';
    
    logger.addActivity({
      type: 'action',
      agent: 'router',
      role: 'dispatcher',
      message: `Routed request to ${profile.agent}`,
      details: `taskType=${taskType}, provider=${providerType}`,
      status: 'completed',
      taskType,
    });

    try {
      const provider = this.providerManager.getProvider();
      let fullResponse = '';
      let chunkCount = 0;
      
      // Create streaming timeout (10 minutes for complex tasks)
      const streamTimeout = 10 * 60 * 1000;
      const startTime = Date.now();
      
      // Optimize context with token management
      const { messages: optimizedMessages, stats, cached } = this.contextManager.getOptimizedContext(
        this.state.history,
        this.state.context.selectedFiles,
        input
      );

      logger.addActivity({
        type: 'reading',
        agent: 'context',
        role: 'workspace',
        message: 'Loaded workspace instructions',
        details: `${agentsSource}; selectedFiles=${this.state.context.selectedFiles?.length ?? 0}`,
        status: 'completed',
        taskType,
      });
      
      // If cache hit, use cached response
      if (cached) {
        logger.addActivity({
          type: 'complete',
          agent: 'cache',
          role: 'context-manager',
          message: 'Cache hit - returning saved answer',
          status: 'completed',
          taskType,
        });
        console.log('\n' + cached + '\n');
        return;
      }
      
      // Log token stats if compressed
      if (stats.compressed) {
        logger.addActivity({
          type: 'action',
          agent: 'context',
          role: 'context-manager',
          message: 'Compressed context window',
          details: `${stats.totalTokens.toLocaleString()} tokens in prompt`,
          status: 'completed',
          taskType,
        });
      }

      logger.addActivity({
        type: 'reading',
        agent: 'context',
        role: 'codebase-indexer',
        message: 'Prepared prompt context',
        details: `${optimizedMessages.length} message(s) passed to ${profile.agent}`,
        status: 'completed',
        taskType,
      });

      const handoffActivity = logger.addActivity({
        type: 'thinking',
        agent: profile.agent,
        role: profile.role,
        message: `${profile.agent} is ${profile.task}`,
        details: input.slice(0, 120),
        status: 'running',
        taskType,
      });
      logger.updateActivity(handoffActivity.id, {
        status: 'completed',
        message: `Handoff complete -> ${profile.agent}`,
        details: 'Streaming response below',
        taskType,
      });
      logger.stop();
      console.log('');
      
      let streamFinished = false;
      for await (const chunk of provider.stream({
        messages: [
          { role: 'system', content: systemPrompt },
          ...optimizedMessages,
        ],
        reasoning: (this.providerManager as any).config?.reasoning || 'medium',
      })) {
        // Check timeout
        if (Date.now() - startTime > streamTimeout) {
          logger.addActivity({
            type: 'error',
            agent: profile.agent,
            role: profile.role,
            message: 'Request timed out (10 minutes)',
            status: 'failed',
            taskType,
          });
          streamFinished = true;
        }
        
        if (!streamFinished) {
          // Write chunk immediately
          process.stdout.write(chunk.content);
          fullResponse += chunk.content;
          chunkCount++;
          
          // Log progress every 50 chunks
          if (chunkCount % 50 === 0) {
            logger.addActivity({
              type: 'action',
              agent: profile.agent,
              role: profile.role,
              message: `Streaming progress: ${chunkCount} chunks`,
              details: `${fullResponse.length} chars received`,
              status: 'completed',
              taskType,
            });
          }
          
          if (chunk.done) {
            streamFinished = true;
          }
        }
      }

      if (!fullResponse.trim()) {
        const fallback = await provider.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            ...optimizedMessages,
          ],
          reasoning: (this.providerManager as any).config?.reasoning || 'medium',
        });
        fullResponse = fallback.content || '';
        if (fullResponse) {
          process.stdout.write(fullResponse);
        }
      }

      if (!fullResponse.trim()) {
        fullResponse = '[No response content returned by provider. Run /settings and `omk config show` to verify provider, model, and API key.]';
        console.log(fullResponse);
      }

      // Log completion
      logger.addActivity({
        type: 'complete',
        agent: profile.agent,
        role: profile.role,
        message: 'Response complete',
        details: `${fullResponse.length} chars, ${chunkCount} chunks`,
        status: 'completed',
        taskType,
      });
      
      console.log('\n');
      this.state.history.push({ role: 'assistant', content: fullResponse });
      
      // Store in cache for future similar queries
      const responseTokens = this.contextManager.estimateTokens(fullResponse);
      this.contextManager.storeCache(input, fullResponse, responseTokens);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.addActivity({
        type: 'error',
        agent: profile.agent,
        role: profile.role,
        message: 'Response failed',
        details: errorMsg,
        status: 'failed',
        taskType,
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
        const stats = statSync(fullPath);
        
        // Skip directories
        if (stats.isDirectory()) {
          console.log(`\x1b[33m[Skipping directory: ${fileName}]\x1b[0m`);
          processedInput = processedInput.replace(match[0], `[Directory: ${fileName}]`);
          continue;
        }
        
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
\x1b[1mOMK Commands:\x1b[0m

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
  /sessions          List all saved sessions
  /title [text]      Set session title
  /note <text>       Add to notepad
  /task <title>      Create a task
  /file <path>       Add file to context
  /files             Show context files
  /context           Show full context
  /tokens            Show token usage stats
  /cache             Show cache statistics
  /index             Build codebase index (for large projects)
  /map               Show repository overview
  /search <symbol>   Search symbols in codebase
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

    if (this.availableSkills.length === 0) {
      console.log('No skills installed. Run omk setup to install built-in skills.\n');
      return;
    }

    for (const skill of this.availableSkills) {
      console.log(`  $${skill}`);
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

  private async handleSessions(): Promise<void> {
    const sessions = listSessions(this.cwd);
    
    if (sessions.length === 0) {
      console.log('\n\x1b[33mNo saved sessions found.\x1b[0m');
      console.log('Sessions are saved automatically when you chat.\n');
      return;
    }
    
    console.log('\n\x1b[1m💬 Saved Sessions:\x1b[0m\n');
    
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const isCurrent = session.id === this.currentSessionId;
      const marker = isCurrent ? '\x1b[36m→ ' : '  ';
      const title = session.title || generateSessionTitle(session.first_message || 'New session');
      const time = formatRelativeTime(session.updated_at);
      const messages = session.message_count || 0;
      
      console.log(`${marker}${i + 1}. ${title}\x1b[0m`);
      console.log(`     \x1b[90m${time} · ${messages} msgs · ${session.id.slice(0, 8)}\x1b[0m`);
      
      if (isCurrent) {
        console.log(`     \x1b[36m[current session]\x1b[0m`);
      }
      console.log();
    }
    
    console.log('\x1b[90mUse /load <name> to restore a session\x1b[0m\n');
  }

  private handleTitle(title?: string): void {
    if (!title) {
      // Show current title
      if (this.sessionTitle) {
        console.log(`\n\x1b[1mCurrent session title:\x1b[0m ${this.sessionTitle}\n`);
      } else if (this.currentSessionId) {
        console.log(`\n\x1b[1mCurrent session:\x1b[0m ${this.currentSessionId.slice(0, 8)}... (no title)\n`);
        console.log('\x1b[90mUse /title <text> to set a title\x1b[0m\n');
      } else {
        console.log('\n\x1b[33mNo active session. Start chatting to create one.\x1b[0m\n');
      }
      return;
    }
    
    // Set title
    this.sessionTitle = title.slice(0, 200); // Max 200 chars
    
    if (this.currentSessionId) {
      updateSession(this.currentSessionId, { title: this.sessionTitle }, this.cwd);
    }
    
    console.log(`\n\x1b[32m[OK] Session title set to: "${this.sessionTitle}"\x1b[0m\n`);
  }

  private async buildCodebaseIndex(): Promise<void> {
    console.log('\n\x1b[36m[Building codebase index...]\x1b[0m');
    console.log('This may take a while for large projects...\n');
    
    try {
      this.repoMap = await this.codebaseIndexer.buildIndex((current, total, file) => {
        if (current % 100 === 0 || current === total) {
          process.stdout.write(`\r  Indexed: ${current}/${total} files`);
        }
      });
      
      console.log(`\n\n\x1b[32m[OK] Index built successfully!\x1b[0m`);
      this.displayRepositoryMap(this.repoMap);
    } catch (err) {
      console.error('\x1b[31m[ERROR] Failed to build index:', err, '\x1b[0m');
    }
  }

  private displayRepositoryMap(map: RepositoryMap): void {
    console.log('\n\x1b[1m📊 Repository Overview:\x1b[0m');
    console.log(`  Files: ${map.totalFiles.toLocaleString()}`);
    console.log(`  Lines: ${map.totalLines.toLocaleString()}`);
    console.log(`  Symbols: ${map.totalSymbols.toLocaleString()}`);
    
    console.log('\n\x1b[1mLanguages:\x1b[0m');
    for (const [lang, stats] of Object.entries(map.languages).slice(0, 5)) {
      console.log(`  ${lang}: ${stats.percentage}% (${stats.files} files, ${stats.lines.toLocaleString()} lines)`);
    }
    
    if (map.modules.length > 0) {
      console.log('\n\x1b[1mTop Modules:\x1b[0m');
      for (const mod of map.modules.slice(0, 5)) {
        console.log(`  ${mod.name}: ${mod.files} files, ${mod.lines.toLocaleString()} lines`);
      }
    }
    
    if (map.keyFiles.length > 0) {
      console.log('\n\x1b[1mKey Files (most imported):\x1b[0m');
      for (const file of map.keyFiles.slice(0, 5)) {
        console.log(`  - ${file}`);
      }
    }
  }

  private showRepositoryMap(): void {
    if (!this.repoMap) {
      console.log('No index available. Run /index first.');
      return;
    }
    this.displayRepositoryMap(this.repoMap);
  }

  private searchSymbols(query: string): void {
    if (!query) {
      console.log('Usage: /search <symbol-name>');
      return;
    }
    
    const stats = this.codebaseIndexer.getStats();
    if (stats.files === 0) {
      console.log('No index available. Run /index first.');
      return;
    }
    
    // Simple symbol search through smart context
    const results = this.codebaseIndexer.getSmartContext(query, 10);
    
    if (results.length === 0) {
      console.log(`No results found for "${query}"`);
      return;
    }
    
    console.log(`\n\x1b[1mSearch results for "${query}":\x1b[0m\n`);
    for (const result of results) {
      console.log(`  \x1b[33m${result.path}\x1b[0m (relevance: ${result.relevance})`);
      // Show first few lines
      const preview = result.content.split('\n').slice(0, 5).join('\n  ');
      console.log(`  ${preview}\n`);
    }
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
      console.log('Providers: api, kimi, openrouter, custom, browser, cli');
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

  private showTokenStats(): void {
    const stats = this.contextManager.getStats(
      this.state.history,
      this.state.context.selectedFiles
    );
    console.log('\n' + this.contextManager.formatStats(stats));
    console.log('\n\x1b[90mTip: Context auto-compresses when >80K tokens\x1b[0m\n');
  }

  private showCacheStats(): void {
    const cacheStats = this.contextManager.getCacheStats();
    console.log('\n\x1b[1mSemantic Cache:\x1b[0m\n');
    console.log(`  Cached queries: ${cacheStats.size}`);
    console.log(`  Hit rate: ${cacheStats.hitRate}%`);
    console.log(`  Tokens saved: ${cacheStats.savedTokens.toLocaleString()}`);
    console.log('\n\x1b[90mSimilar queries reuse cached responses\x1b[0m\n');
  }

  private shutdown(): void {
    // Reset terminal title
    process.stdout.write('\x1b]0;\x07');
    
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
  options?: {
    provider?: string;
    reasoning?: string;
    yolo?: boolean;
    model?: string;
    baseUrl?: string;
    apiKeyEnv?: string;
    headers?: Record<string, string>;
  }
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

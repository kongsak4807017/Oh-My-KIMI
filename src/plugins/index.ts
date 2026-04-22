/**
 * Plugin System for OMK
 * Extensible architecture for custom skills and tools
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Plugin types
export interface OMKPlugin {
  name: string;
  version: string;
  description?: string;
  author?: string;
  
  // Lifecycle hooks
  onLoad?: (context: PluginContext) => void | Promise<void>;
  onUnload?: (context: PluginContext) => void | Promise<void>;
  
  // Skill registration
  registerSkills?: () => PluginSkill[];
  
  // Command registration
  registerCommands?: () => PluginCommand[];
  
  // Hook into existing skills
  hooks?: PluginHooks;
}

export interface PluginContext {
  cwd: string;
  omkPath: string;
  config: Record<string, unknown>;
  api: PluginAPI;
}

export interface PluginAPI {
  // State operations
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
  
  // Logging
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  
  // Execute command
  exec: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number }>;
  
  // Register hook
  registerHook: (skillName: string, hookPoint: string, handler: HookHandler) => void;
}

export interface PluginSkill {
  name: string;
  description: string;
  execute: (args: string[], context: PluginContext) => Promise<void>;
}

export interface PluginCommand {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string[], context: PluginContext) => Promise<void>;
}

export interface PluginHooks {
  preSkill?: (skillName: string, args: string[]) => void | Promise<void>;
  postSkill?: (skillName: string, args: string[], result: unknown) => void | Promise<void>;
  preCommand?: (command: string, args: string[]) => void | Promise<void>;
  postCommand?: (command: string, args: string[], result: unknown) => void | Promise<void>;
}

type HookHandler = (...args: unknown[]) => unknown | Promise<unknown>;

// Plugin registry
class PluginRegistry {
  private plugins: Map<string, OMKPlugin> = new Map();
  private hooks: Map<string, Map<string, HookHandler[]>> = new Map();
  private context: PluginContext;

  constructor(context: PluginContext) {
    this.context = context;
  }

  async loadPlugin(plugin: OMKPlugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already loaded`);
    }

    // Initialize plugin
    if (plugin.onLoad) {
      await plugin.onLoad(this.context);
    }

    // Register skills
    if (plugin.registerSkills) {
      const skills = plugin.registerSkills();
      for (const skill of skills) {
        this.registerSkill(skill);
      }
    }

    // Register commands
    if (plugin.registerCommands) {
      const commands = plugin.registerCommands();
      for (const command of commands) {
        this.registerCommand(command);
      }
    }

    // Store plugin
    this.plugins.set(plugin.name, plugin);
    
    console.log(`[Plugin] Loaded: ${plugin.name} v${plugin.version}`);
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin ${pluginName} is not loaded`);
    }

    if (plugin.onUnload) {
      await plugin.onUnload(this.context);
    }

    this.plugins.delete(pluginName);
    console.log(`[Plugin] Unloaded: ${pluginName}`);
  }

  getPlugin(name: string): OMKPlugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): OMKPlugin[] {
    return Array.from(this.plugins.values());
  }

  private registerSkill(skill: PluginSkill): void {
    // Skills are registered by creating SKILL.md files
    const skillPath = join(this.context.omkPath, 'skills', skill.name);
    console.log(`[Plugin] Registered skill: ${skill.name}`);
  }

  private registerCommand(command: PluginCommand): void {
    console.log(`[Plugin] Registered command: ${command.name}`);
  }

  registerHook(skillName: string, hookPoint: string, handler: HookHandler): void {
    if (!this.hooks.has(skillName)) {
      this.hooks.set(skillName, new Map());
    }
    
    const skillHooks = this.hooks.get(skillName)!;
    if (!skillHooks.has(hookPoint)) {
      skillHooks.set(hookPoint, []);
    }
    
    skillHooks.get(hookPoint)!.push(handler);
  }

  async executeHook(skillName: string, hookPoint: string, ...args: unknown[]): Promise<unknown[]> {
    const skillHooks = this.hooks.get(skillName);
    if (!skillHooks) return [];

    const handlers = skillHooks.get(hookPoint);
    if (!handlers) return [];

    const results: unknown[] = [];
    for (const handler of handlers) {
      try {
        const result = await handler(...args);
        results.push(result);
      } catch (err) {
        console.error(`[Plugin] Hook error in ${skillName}.${hookPoint}:`, err);
      }
    }

    return results;
  }
}

// Plugin loader
export class PluginManager {
  private registry: PluginRegistry;
  private pluginsDir: string;

  constructor(cwd: string = process.cwd()) {
    const omkPath = join(cwd, '.omk');
    this.pluginsDir = join(omkPath, 'plugins');
    
    const context: PluginContext = {
      cwd,
      omkPath,
      config: {},
      api: {
        getState: (key: string) => this.getState(key),
        setState: (key: string, value: unknown) => this.setState(key, value),
        log: (level: 'info' | 'warn' | 'error', message: string) => {
          console.log(`[Plugin ${level}] ${message}`);
        },
        exec: async (command: string, args: string[]) => {
          const { execFile } = await import('child_process');
          const { promisify } = await import('util');
          const execFileAsync = promisify(execFile);
          
          try {
            const { stdout, stderr } = await execFileAsync(command, args, { cwd });
            return { stdout, stderr, code: 0 };
          } catch (err: unknown) {
            const error = err as { stdout: string; stderr: string; code: number };
            return { 
              stdout: error.stdout || '', 
              stderr: error.stderr || '', 
              code: error.code || 1 
            };
          }
        },
        registerHook: (skillName: string, hookPoint: string, handler: HookHandler) => {
          this.registry.registerHook(skillName, hookPoint, handler);
        },
      },
    };

    this.registry = new PluginRegistry(context);
  }

  private state: Map<string, unknown> = new Map();

  private getState(key: string): unknown {
    return this.state.get(key);
  }

  private setState(key: string, value: unknown): void {
    this.state.set(key, value);
  }

  async loadAllPlugins(): Promise<void> {
    if (!existsSync(this.pluginsDir)) {
      return;
    }

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await this.loadPluginFromDir(join(this.pluginsDir, entry.name));
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        await this.loadPluginFromFile(join(this.pluginsDir, entry.name));
      }
    }
  }

  private async loadPluginFromDir(dirPath: string): Promise<void> {
    const indexPath = join(dirPath, 'index.js');
    const packagePath = join(dirPath, 'package.json');

    if (existsSync(indexPath)) {
      await this.loadPluginFromFile(indexPath);
    } else if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      const mainFile = pkg.main ? join(dirPath, pkg.main) : indexPath;
      if (existsSync(mainFile)) {
        await this.loadPluginFromFile(mainFile);
      }
    }
  }

  private async loadPluginFromFile(filePath: string): Promise<void> {
    try {
      const module = await import(filePath);
      const plugin: OMKPlugin = module.default || module;
      
      if (this.validatePlugin(plugin)) {
        await this.registry.loadPlugin(plugin);
      } else {
        console.error(`[Plugin] Invalid plugin: ${filePath}`);
      }
    } catch (err) {
      console.error(`[Plugin] Failed to load ${filePath}:`, err);
    }
  }

  private validatePlugin(plugin: unknown): plugin is OMKPlugin {
    return (
      typeof plugin === 'object' &&
      plugin !== null &&
      'name' in plugin &&
      'version' in plugin
    );
  }

  async loadPlugin(plugin: OMKPlugin): Promise<void> {
    await this.registry.loadPlugin(plugin);
  }

  async unloadPlugin(pluginName: string): Promise<void> {
    await this.registry.unloadPlugin(pluginName);
  }

  listPlugins(): OMKPlugin[] {
    return this.registry.listPlugins();
  }

  getPlugin(name: string): OMKPlugin | undefined {
    return this.registry.getPlugin(name);
  }
}

// Example plugin factory
export function createExamplePlugin(): OMKPlugin {
  return {
    name: 'example-plugin',
    version: '1.0.0',
    description: 'Example plugin demonstrating the plugin API',
    
    onLoad: async (context) => {
      context.api.log('info', 'Example plugin loaded!');
    },
    
    registerSkills: () => [
      {
        name: 'example',
        description: 'An example skill from a plugin',
        execute: async (args, context) => {
          context.api.log('info', `Executing example skill with args: ${args.join(' ')}`);
        },
      },
    ],
    
    registerCommands: () => [
      {
        name: 'example',
        description: 'Example plugin command',
        execute: async (args, context) => {
          console.log('Hello from example plugin!');
        },
      },
    ],
  };
}

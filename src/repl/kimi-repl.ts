/**
 * Kimi CLI-style REPL for OMK
 * Raw terminal mode UI with multi-line input, streaming, and suggestions
 */

import { stdin, stdout } from "process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join, resolve, basename } from "path";
import { homedir, tmpdir } from "os";
import { spawn } from "child_process";
import type { ReasoningEffort } from "../providers/types.js";
import { ProviderManager, getProviderManager } from "../providers/index.js";
import {
  detectSkillInvocations,
  isActionableAgentRequest,
  loadSkillContent,
  buildSkillSystemPrompt,
  getWorkspaceAgentsContent,
  listAvailableSkills,
} from "../skills/runtime.js";
import { runModelToolLoop } from "../orchestration/model-runner.js";
import { runEngine } from "../orchestration/index.js";
import {
  writeModeState,
  clearModeState,
  appendToNotepad,
  createTask,
  listActiveModes,
  listSessions,
  saveSession as saveStateSession,
  updateSession,
  formatRelativeTime,
  generateSessionTitle,
} from "../state/index.js";
import { PluginManager } from "../plugins/index.js";
import { startMCPServer, stopMCPServer } from "../mcp/server.js";
import { getContextManager } from "../utils/context-manager.js";
import {
  getCodebaseIndexer,
  getFileChunker,
  RepositoryMap,
} from "../indexer/index.js";
import { getMemoryTools } from "../tools/memory.js";
import {
  searchAssistItems,
  type AssistItem,
  discoverAllSkills,
  getAllTools,
  getAllCommands,
} from "./assist-suggestion.js";

// Unicode utilities (copied from autocomplete-prompt.ts)
const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new (Intl as any).Segmenter("en", { granularity: "grapheme" })
    : null;

function getGraphemeClusters(str: string): string[] {
  if (segmenter) {
    return Array.from(segmenter.segment(str), (s: any) => s.segment);
  }
  return Array.from(str);
}

function isZeroWidth(code: number): boolean {
  return (
    code === 0x200b ||
    code === 0x200c ||
    code === 0x200d ||
    code === 0xfeff ||
    (code >= 0x0300 && code <= 0x036f) ||
    (code >= 0x1ab0 && code <= 0x1aff) ||
    (code >= 0x1dc0 && code <= 0x1dff) ||
    (code >= 0x20d0 && code <= 0x20ff) ||
    (code >= 0xfe20 && code <= 0xfe2f) ||
    (code >= 0x0e31 && code <= 0x0e3a) ||
    (code >= 0x0e47 && code <= 0x0e4e)
  );
}

function isFullWidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fffd) ||
    (code >= 0x30000 && code <= 0x3fffd)
  );
}

function getClusterWidth(cluster: string): number {
  for (const char of cluster) {
    const code = char.codePointAt(0) ?? 0;
    if (isZeroWidth(code)) continue;
    if (isFullWidth(code)) return 2;
    return 1;
  }
  return 0;
}

function getStringWidth(str: string): number {
  const clean = stripAnsi(str);
  return getGraphemeClusters(clean).reduce(
    (sum, cluster) => sum + getClusterWidth(cluster),
    0
  );
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Types
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface KimiREPLOptions {
  provider?: string;
  reasoning?: string;
  yolo?: boolean;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  headers?: Record<string, string>;
}

const SPINNER_FRAMES = [
  "\u280b",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283c",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280f",
];

export class KimiREPL {
  private cwd: string;
  private options: KimiREPLOptions;
  private providerManager: ProviderManager;
  private messages: Message[] = [];
  private input = "";
  private cursor = 0;
  private mode: "agent" | "shell" | "plan" = "agent";
  private isProcessing = false;
  private isStreaming = false;
  private queuedMessages: string[] = [];
  private history: string[] = [];
  private historyIndex = -1;
  private messageScrollOffset = 0;
  private suggestions: AssistItem[] = [];
  private selectedSuggestion = 0;
  private renderedLines = 0;
  private isActive = false;
  private currentModel = "";
  private yolo = false;
  private contextFiles: string[] = [];
  private sessionTitle: string | null = null;
  private currentSessionId: string | null = null;
  private pluginManager: PluginManager;
  private contextManager = getContextManager();
  private codebaseIndexer: ReturnType<typeof getCodebaseIndexer>;
  private fileChunker = getFileChunker();
  private repoMap: RepositoryMap | null = null;
  private availableSkills: string[] = [];
  private spinnerFrame = 0;
  private spinnerInterval: NodeJS.Timeout | null = null;
  private reasoning: ReasoningEffort = "medium";
  private resolvePromise: (() => void) | null = null;
  private globalOmkPath: string;
  private maxMessageScrollOffset = 0;
  private activeRunId = 0;

  constructor(cwd: string, options?: KimiREPLOptions) {
    this.cwd = cwd;
    this.options = options || {};
    this.providerManager = getProviderManager();
    this.pluginManager = new PluginManager(cwd);
    this.codebaseIndexer = getCodebaseIndexer(cwd);
    this.availableSkills = listAvailableSkills(cwd);
    this.globalOmkPath = join(homedir(), ".omk");
    this.yolo = options?.yolo ?? false;
  }

  async start(): Promise<void> {
    const projectName = basename(this.cwd);
    stdout.write(`\x1b]0;OMK: ${projectName}\x07`);

    if (this.yolo) {
      console.log("\n[WARNING] YOLO mode enabled - bypassing confirmations");
    }
    console.log("\n\x1b[32m🚀 Welcome to OMK\x1b[0m");
    console.log("Type /help for commands, /exit to quit\n");

    try {
      const providerType = (this.options.provider as any) || "auto";
      this.reasoning = (this.options.reasoning as ReasoningEffort) || "medium";
      await this.providerManager.initialize({
        type: providerType,
        reasoning: this.reasoning,
        model: this.options.model,
        baseUrl: this.options.baseUrl,
        apiKey: this.options.apiKey,
        apiKeyEnv: this.options.apiKeyEnv,
        headers: this.options.headers,
      });
      this.currentModel = this.providerManager.getCurrentType() || "unknown";
      console.log(`[OK] Provider: ${this.currentModel} (reasoning: ${this.reasoning})`);
    } catch (err) {
      console.error("\n❌ Failed to initialize provider:");
      console.error(`   ${err instanceof Error ? err.message : err}`);
      console.error(
        "\n[HINT] Try: omk config show, omk --openrouter, or omk --browser"
      );
      process.exitCode = 1;
      return;
    }

    console.log("");

    await this.pluginManager.loadAllPlugins();

    writeModeState(
      "repl",
      {
        mode: "repl",
        active: true,
        current_phase: "running",
        started_at: new Date().toISOString(),
      },
      this.cwd
    );

    this.isActive = true;
    this.setupInput();
    this.render();

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private setupInput(): void {
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    if (stdout.isTTY) {
      stdout.write("\x1b[?1000h\x1b[?1006h");
    }
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", (key: string) => this.handleKey(key));
  }

  private cleanup(): void {
    this.isActive = false;
    this.stopSpinner();
    this.clearPreviousRender();
    if (stdout.isTTY) {
      stdout.write("\x1b[?1000l\x1b[?1006l");
    }
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdin.pause();
    stdin.removeAllListeners("data");
  }

  private shutdown(): void {
    this.cleanup();
    stdout.write("\x1b]0;\x07");
    console.log("\n\x1b[32mGoodbye! 👋\x1b[0m\n");
    clearModeState("repl", this.cwd);
    stopMCPServer();
    if (this.resolvePromise) {
      this.resolvePromise();
    }
    process.exit(0);
  }

  private handleKey(key: string): void {
    const charCode = key.charCodeAt(0);

    if (key === "\u0003") {
      if (this.isProcessing || this.isStreaming) {
        this.interruptAI();
      } else if (this.input.trim()) {
        this.input = "";
        this.cursor = 0;
        this.suggestions = [];
      }
      this.render();
      return;
    }

    if (key === "\u0004") {
      if (!this.input) {
        this.shutdown();
      }
      return;
    }

    if (key === "\u0018") {
      this.cycleMode();
      this.render();
      return;
    }

    if (key === "\u000a" || key === "\n") {
      this.insertChar("\n");
      this.updateSuggestions();
      this.render();
      return;
    }

    if (key === "\r") {
      if (this.isStreaming) {
        if (this.input.trim()) {
          this.queuedMessages.push(this.input);
          this.input = "";
          this.cursor = 0;
          this.suggestions = [];
        }
      } else {
        void this.submitInput();
      }
      return;
    }

    if (key === "\u000f") {
      void this.openExternalEditor();
      return;
    }

    if (key === "\u0013") {
      if (this.isStreaming && this.queuedMessages.length > 0) {
        const msg = this.queuedMessages.shift()!;
        this.messages.push({ role: "user", content: msg, timestamp: new Date() });
        this.render();
      }
      return;
    }

    if (key === "\t") {
      if (this.suggestions.length > 0) {
        this.input = this.suggestions[this.selectedSuggestion].value;
        this.cursor = getStringWidth(this.input);
        this.suggestions = [];
      }
      this.render();
      return;
    }

    if (key === "\u001b[Z") {
      this.mode = this.mode === "plan" ? "agent" : "plan";
      this.render();
      return;
    }

    if (key === "\u001b" || charCode === 27) {
      if (key.length > 1 && (key[1] === "[" || key[1] === "O")) {
        this.handleEscapeSequence(key);
      } else if (key.startsWith("\u001b[<")) {
        this.handleMouseSequence(key);
      } else {
        this.suggestions = [];
        this.render();
      }
      return;
    }

    if (charCode === 127 || charCode === 8) {
      this.handleBackspace();
      this.updateSuggestions();
      this.render();
      return;
    }

    if (charCode === 21) {
      this.input = "";
      this.cursor = 0;
      this.suggestions = [];
      this.render();
      return;
    }

    if (charCode >= 32 && charCode !== 127) {
      this.insertChar(key);
      this.updateSuggestions();
      this.render();
    }
  }

  private handleEscapeSequence(key: string): void {
    if (key.startsWith("\u001b[<")) {
      this.handleMouseSequence(key);
      return;
    }

    if (key === "\u001b[A" || key === "\u001bOA") {
      if (this.suggestions.length > 0) {
        this.selectedSuggestion = Math.max(0, this.selectedSuggestion - 1);
      } else {
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex++;
          this.input = this.history[this.history.length - 1 - this.historyIndex];
          this.cursor = getStringWidth(this.input);
        }
      }
      this.render();
      return;
    }

    if (key === "\u001b[B" || key === "\u001bOB") {
      if (this.suggestions.length > 0) {
        this.selectedSuggestion = Math.min(
          this.suggestions.length - 1,
          this.selectedSuggestion + 1
        );
      } else {
        if (this.historyIndex > 0) {
          this.historyIndex--;
          this.input = this.history[this.history.length - 1 - this.historyIndex];
          this.cursor = getStringWidth(this.input);
        } else if (this.historyIndex === 0) {
          this.historyIndex = -1;
          this.input = "";
          this.cursor = 0;
        }
      }
      this.render();
      return;
    }

    if (key === "\u001b[C" || key === "\u001bOC") {
      const inputWidth = getStringWidth(this.input);
      if (this.cursor < inputWidth) {
        const clusters = getGraphemeClusters(this.input);
        let pos = 0;
        for (const cluster of clusters) {
          const w = getClusterWidth(cluster);
          if (pos + w > this.cursor) {
            this.cursor = pos + w;
            break;
          }
          pos += w;
        }
      }
      this.render();
      return;
    }

    if (key === "\u001b[D" || key === "\u001bOD") {
      if (this.cursor > 0) {
        const clusters = getGraphemeClusters(this.input);
        let pos = 0;
        for (const cluster of clusters) {
          const w = getClusterWidth(cluster);
          if (pos + w >= this.cursor) {
            this.cursor = pos;
            break;
          }
          pos += w;
        }
      }
      this.render();
      return;
    }

    if (key === "\u001b[1;2A") {
      this.scrollMessages(1);
      this.render();
      return;
    }
    if (key === "\u001b[1;2B") {
      this.scrollMessages(-1);
      this.render();
      return;
    }

    if (key === "\u001b[5~") {
      this.scrollMessages(this.pageScrollAmount());
      this.render();
      return;
    }

    if (key === "\u001b[6~") {
      this.scrollMessages(-this.pageScrollAmount());
      this.render();
      return;
    }

    if (key === "\u001b[1;5H" || key === "\u001b[H") {
      if (this.input.length === 0) {
        this.messageScrollOffset = this.maxMessageScrollOffset;
      } else {
        this.cursor = 0;
      }
      this.render();
      return;
    }

    if (key === "\u001b[1;5F" || key === "\u001b[F") {
      if (this.input.length === 0) {
        this.messageScrollOffset = 0;
      } else {
        this.cursor = getStringWidth(this.input);
      }
      this.render();
      return;
    }

    this.render();
  }

  private handleMouseSequence(key: string): void {
    const match = key.match(/\x1b\[<(\d+);(\d+);(\d+)([mM])/);
    if (!match) return;
    const code = Number(match[1]);
    if (code === 64) {
      this.scrollMessages(3);
      this.render();
    } else if (code === 65) {
      this.scrollMessages(-3);
      this.render();
    }
  }

  private pageScrollAmount(): number {
    return Math.max(5, Math.floor((stdout.rows || 24) * 0.65));
  }

  private scrollMessages(delta: number): void {
    this.messageScrollOffset = Math.max(
      0,
      Math.min(this.maxMessageScrollOffset, this.messageScrollOffset + delta)
    );
  }

  private insertChar(char: string): void {
    const clusters = getGraphemeClusters(this.input);
    let pos = 0;
    let insertIndex = 0;
    for (let i = 0; i < clusters.length; i++) {
      const w = getClusterWidth(clusters[i]);
      if (pos + w > this.cursor) {
        insertIndex = i;
        break;
      }
      pos += w;
      insertIndex = i + 1;
    }
    const before = clusters.slice(0, insertIndex);
    const after = clusters.slice(insertIndex);
    this.input = before.join("") + char + after.join("");
    this.cursor += getStringWidth(char);
  }

  private handleBackspace(): void {
    if (this.cursor <= 0) return;
    const clusters = getGraphemeClusters(this.input);
    let pos = 0;
    let clusterIndex = 0;
    for (let i = 0; i < clusters.length; i++) {
      const w = getClusterWidth(clusters[i]);
      if (pos + w > this.cursor) {
        clusterIndex = i;
        break;
      }
      pos += w;
      clusterIndex = i + 1;
    }
    if (pos === this.cursor && clusterIndex > 0) {
      clusterIndex--;
    }
    const removedWidth = getClusterWidth(clusters[clusterIndex]);
    const before = clusters.slice(0, clusterIndex);
    const after = clusters.slice(clusterIndex + 1);
    this.input = before.join("") + after.join("");
    this.cursor = Math.max(0, this.cursor - removedWidth);
  }

  private updateSuggestions(): void {
    const trimmed = this.input.trim();
    if (trimmed.startsWith("/") || trimmed.startsWith("$")) {
      this.suggestions = searchAssistItems(trimmed, this.cwd);
      if (this.suggestions.length > 20) {
        this.suggestions = this.suggestions.slice(0, 20);
      }
    } else {
      this.suggestions = [];
    }
    this.selectedSuggestion = 0;
  }

  private async submitInput(): Promise<void> {
    const rawInput = this.input.trim();
    if (!rawInput) return;

    this.input = "";
    this.cursor = 0;
    this.suggestions = [];
    this.history.push(rawInput);
    this.historyIndex = -1;

    this.messages.push({ role: "user", content: rawInput, timestamp: new Date() });
    this.saveCurrentSession(rawInput);
    this.render();

    await this.processInput(rawInput);
  }

  private async processInput(input: string): Promise<void> {
    try {
      if (input.startsWith("/")) {
        await this.handleBuiltinCommand(input);
        return;
      }

      const detectedSkills = detectSkillInvocations(input).filter((match) =>
        loadSkillContent(this.cwd, match.skillName)
      );

      if (detectedSkills.length > 0) {
        await this.handleSkill(input, detectedSkills);
        this.saveCurrentSession(input);
        return;
      }

      await this.handleChat(input);
      this.saveCurrentSession(input);
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    } finally {
      this.isProcessing = false;
      this.isStreaming = false;
      this.stopSpinner();
      this.render();
      await this.processQueuedMessages();
    }
  }

  private async processQueuedMessages(): Promise<void> {
    while (this.queuedMessages.length > 0 && !this.isProcessing) {
      const msg = this.queuedMessages.shift()!;
      this.messages.push({ role: "user", content: msg, timestamp: new Date() });
      this.render();
      await this.processInput(msg);
    }
  }

  private interruptAI(): void {
    this.activeRunId++;
    this.isProcessing = false;
    this.isStreaming = false;
    this.stopSpinner();
    if (
      this.messages.length > 0 &&
      this.messages[this.messages.length - 1].role === "assistant"
    ) {
      const last = this.messages[this.messages.length - 1];
      if (!last.content.endsWith("[Interrupted]")) {
        last.content += "\n\n[Interrupted]";
      }
    }
    this.render();
  }

  private saveCurrentSession(lastMessage: string): void {
    if (!this.sessionTitle && this.messages.length > 0) {
      const firstUserMsg = this.messages.find((m) => m.role === "user")?.content;
      if (firstUserMsg) {
        this.sessionTitle = generateSessionTitle(firstUserMsg);
      }
    }

    const sessionData = {
      title: this.sessionTitle || undefined,
      cwd: this.cwd,
      message_count: this.messages.length,
      first_message: this.messages.find((m) => m.role === "user")?.content,
      last_message: lastMessage,
    };

    if (this.currentSessionId) {
      updateSession(this.currentSessionId, sessionData, this.cwd);
    } else {
      const session = saveStateSession(sessionData, this.cwd);
      this.currentSessionId = session.id;
    }
  }

  // Provider / Chat

  private getSystemPrompt(): string {
    const localAgentsPath = join(this.cwd, "AGENTS.md");
    const globalAgentsPath = join(this.globalOmkPath, "AGENTS.md");

    let prompt = [
      "You are OMK, an autonomous coding agent and orchestrator.",
      "For workspace-specific or actionable requests, use tools, gather evidence, execute the next concrete step, and verify before claiming completion.",
      "For pure conceptual questions, answer directly and concisely.",
    ].join("\n");

    if (existsSync(localAgentsPath)) {
      prompt += "\n\nProject guidelines (local AGENTS.md):\n" + readFileSync(localAgentsPath, "utf-8");
    } else if (existsSync(globalAgentsPath)) {
      prompt += "\n\nProject guidelines (Global Root Agent):\n" + readFileSync(globalAgentsPath, "utf-8");
    }

    if (this.contextFiles.length > 0) {
      prompt += "\n\nRelevant files:\n";
      for (const file of this.contextFiles) {
        const filePath = join(this.cwd, file);
        if (existsSync(filePath)) {
          const content = readFileSync(filePath, "utf-8").slice(0, 2000);
          prompt += `\n--- ${file} ---\n${content}\n`;
        }
      }
    }

    return prompt;
  }

  private async handleChat(input: string): Promise<void> {
    const runId = ++this.activeRunId;
    this.isProcessing = true;
    this.startSpinner();
    this.render();

    try {
      const provider = this.providerManager.getProvider();
      const systemPrompt = this.getSystemPrompt();

      if (isActionableAgentRequest(input)) {
        const assistantMsg: Message = {
          role: "assistant",
          content: "[agent] Running tool-backed workflow...",
          timestamp: new Date(),
        };
        this.messages.push(assistantMsg);
        this.isStreaming = true;
        this.stopSpinner();
        this.render();

        const agentPrompt = [
          "Conversation context:",
          ...this.messages.slice(-8).map((m) => `${m.role}: ${m.content}`),
          "",
          "Current user request:",
          input,
          "",
          "Execute the request as real agent work when it depends on this workspace. Use tools for inspection, edits, search, or verification. End with concise evidence.",
        ].join("\n");

        const result = await runModelToolLoop(
          agentPrompt,
          this.cwd,
          {
            provider: this.options.provider as any,
            model: this.options.model,
            baseUrl: this.options.baseUrl,
            apiKey: this.options.apiKey,
            apiKeyEnv: this.options.apiKeyEnv,
            headers: this.options.headers,
            reasoning: this.reasoning,
            yolo: this.yolo,
          },
          {
            maxIterations: 6,
            showEvidence: true,
            silent: true,
            systemPrompt,
          }
        );

        if (runId !== this.activeRunId) return;
        assistantMsg.content = result.stdout.trim() || "[agent] No response content returned.";
        this.render();
        return;
      }

      const recentMessages = this.messages.slice(-21).map((m) => ({
        role: m.role as any,
        content: m.content,
      }));

      const chatMessages = [
        { role: "system" as const, content: systemPrompt },
        ...recentMessages,
        { role: "user" as const, content: input },
      ];

      const assistantMsg: Message = {
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      this.messages.push(assistantMsg);
      this.isStreaming = true;
      this.stopSpinner();
      this.render();

      let fullResponse = "";
      const streamTimeout = 10 * 60 * 1000;
      const startTime = Date.now();

      for await (const chunk of provider.stream({
        messages: chatMessages,
        reasoning: this.reasoning,
      })) {
        if (runId !== this.activeRunId) break;
        if (Date.now() - startTime > streamTimeout) break;
        fullResponse += chunk.content;
        assistantMsg.content = fullResponse;
        this.render();
        if (chunk.done) break;
      }

      if (!assistantMsg.content.trim()) {
        try {
          const fallback = await provider.chat({
            messages: chatMessages,
            reasoning: this.reasoning,
          });
          if (runId !== this.activeRunId) return;
          assistantMsg.content = fallback.content || "";
          this.render();
        } catch {
          // ignore
        }
      }

      if (!assistantMsg.content.trim()) {
        assistantMsg.content =
          "[No response content returned by provider. Run /settings and `omk config show` to verify provider, model, and API key.]";
        this.render();
      }
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `Chat failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    }
  }

  private async handleSkill(input: string, detectedSkills: any[]): Promise<void> {
    const runId = ++this.activeRunId;
    this.isProcessing = true;
    this.startSpinner();
    this.render();

    try {
      const skillNames = detectedSkills.map((m: any) => m.skillName);
      const primarySkill = skillNames[0];

      const resolvedSkills = skillNames
        .map((name: string) => loadSkillContent(this.cwd, name))
        .filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

      if (resolvedSkills.length === 0) {
        this.messages.push({
          role: "system",
          content: `Skill not found: ${primarySkill}`,
          timestamp: new Date(),
        });
        return;
      }

      writeModeState(
        primarySkill,
        {
          mode: primarySkill,
          active: true,
          current_phase: "running",
          started_at: new Date().toISOString(),
          state: { skills: resolvedSkills.map((s) => s.skillName) },
        },
        this.cwd
      );

      const systemMessage = resolvedSkills
        .map((skill) =>
          buildSkillSystemPrompt({
            skillName: skill.skillName,
            skillContent: skill.content,
            userInput: input,
            agentsContent: getWorkspaceAgentsContent(this.cwd),
            source: skill.source,
          })
        )
        .join("\n\n---\n\n");

      const assistantMsg: Message = {
        role: "assistant",
        content: `[agent] Running $${primarySkill}...`,
        timestamp: new Date(),
      };
      this.messages.push(assistantMsg);
      this.isStreaming = true;
      this.stopSpinner();
      this.render();

      const engineSkills = new Set([
        "ralph",
        "team",
        "ultrawork",
        "swarm",
        "ultraqa",
        "pipeline",
        "autopilot",
        "plan",
        "ralplan",
        "deep-interview",
      ]);

      if (engineSkills.has(primarySkill)) {
        this.cleanup();
        await runEngine(primarySkill, [input], this.cwd, {
          provider: this.options.provider as any,
          model: this.options.model,
          baseUrl: this.options.baseUrl,
          apiKey: this.options.apiKey,
          apiKeyEnv: this.options.apiKeyEnv,
          headers: this.options.headers,
          reasoning: this.reasoning,
          yolo: this.yolo,
        });
        if (runId !== this.activeRunId) return;
        this.isActive = true;
        this.setupInput();
        assistantMsg.content = `[agent] $${primarySkill} engine finished. See terminal output above for evidence.`;
        this.render();
      } else {
        const result = await runModelToolLoop(
          input,
          this.cwd,
          {
            provider: this.options.provider as any,
            model: this.options.model,
            baseUrl: this.options.baseUrl,
            apiKey: this.options.apiKey,
            apiKeyEnv: this.options.apiKeyEnv,
            headers: this.options.headers,
            reasoning: this.reasoning,
            yolo: this.yolo,
          },
          {
            maxIterations: 6,
            showEvidence: true,
            silent: true,
            systemPrompt: systemMessage,
          }
        );
        if (runId !== this.activeRunId) return;
        assistantMsg.content = result.stdout.trim() || "[No response content]";
        this.render();
      }

      clearModeState(primarySkill, this.cwd);
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `Skill execution failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    }
  }

  private async openExternalEditor(): Promise<void> {
    const wasRaw = stdin.isTTY && (stdin as any).isRaw;
    if (wasRaw) {
      stdin.setRawMode(false);
    }

    const tmpFile = join(tmpdir(), `omk-repl-${Date.now()}.txt`);
    writeFileSync(tmpFile, this.input, "utf8");

    const editor =
      process.env.VISUAL ||
      process.env.EDITOR ||
      (process.platform === "win32" ? "notepad" : "code --wait");
    const [cmd, ...args] = editor.split(" ");

    return new Promise((resolve) => {
      const child = spawn(cmd, [...args, tmpFile], { stdio: "inherit" });
      child.on("close", () => {
        try {
          const content = readFileSync(tmpFile, "utf8");
          this.input = content;
          this.cursor = getStringWidth(this.input);
          unlinkSync(tmpFile);
        } catch {
          // ignore
        }
        if (wasRaw) {
          stdin.setRawMode(true);
        }
        this.render();
        resolve();
      });
      child.on("error", () => {
        if (wasRaw) {
          stdin.setRawMode(true);
        }
        this.render();
        resolve();
      });
    });
  }

  // Builtin commands

  private async handleBuiltinCommand(input: string): Promise<void> {
    const [command, ...args] = input.split(" ");

    switch (command) {
      case "/help":
        this.showHelp();
        break;
      case "/skills":
        this.showSkills();
        break;
      case "/clear":
        this.messages = [];
        this.messageScrollOffset = 0;
        break;
      case "/history":
        this.showHistory();
        break;
      case "/save":
        await this.saveSession(args[0]);
        break;
      case "/load":
        await this.loadSession(args[0]);
        break;
      case "/sessions":
        await this.handleSessions();
        break;
      case "/title":
        this.handleTitle(args.join(" "));
        break;
      case "/note":
        this.addNote(args.join(" "));
        break;
      case "/task":
        this.createTask(args.join(" "));
        break;
      case "/file":
        this.addFileToContext(args[0]);
        break;
      case "/files":
        this.showContextFiles();
        break;
      case "/context":
        this.showContext();
        break;
      case "/tokens":
        this.showTokenStats();
        break;
      case "/cache":
        this.showCacheStats();
        break;
      case "/rag":
        await this.handleRag(args.join(" "));
        break;
      case "/index":
        await this.buildCodebaseIndex();
        break;
      case "/map":
        this.showRepositoryMap();
        break;
      case "/search":
        this.searchSymbols(args.join(" "));
        break;
      case "/plugins":
        this.showPlugins();
        break;
      case "/mcp":
        await this.toggleMCP(args[0]);
        break;
      case "/model":
        await this.handleModelCommand(args.join(" "));
        break;
      case "/settings":
        this.showSettings();
        break;
      case "/status":
        this.showStatus();
        break;
      case "/reasoning":
        this.handleReasoningCommand(args[0]);
        break;
      case "/tools":
        this.showTools();
        break;
      case "/memory":
        this.showMemory();
        break;
      case "/exit":
      case "/quit":
        this.shutdown();
        return;
      default:
        this.messages.push({
          role: "system",
          content: `Unknown command: ${command}. Type /help for available commands.`,
          timestamp: new Date(),
        });
    }
    this.render();
  }

  private showHelp(): void {
    const text = `
OMK Commands:

Builtin Commands:
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
  /rag <query>       Retrieve compact local/web context
  /index             Build codebase index (for large projects)
  /map               Show repository overview
  /search <symbol>   Search symbols in codebase
  /plugins           List loaded plugins
  /mcp [start|stop]  Toggle MCP server
  /exit, /quit       Exit OMK

Skills (use with $ prefix):
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

Examples:
  $ralph "refactor auth module"
  $plan "design new API"
  /note Remember to update docs
  /file src/main.ts
`;
    this.messages.push({ role: "system", content: text.trim(), timestamp: new Date() });
  }

  private showSkills(): void {
    if (this.availableSkills.length === 0) {
      this.messages.push({
        role: "system",
        content: "No skills installed. Run omk setup to install built-in skills.",
        timestamp: new Date(),
      });
      return;
    }
    const lines = ["Available Skills:", ""];
    for (const skill of this.availableSkills) {
      lines.push(`  $${skill}`);
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showHistory(): void {
    const lines = ["Session History:", ""];
    for (const msg of this.messages) {
      const role = msg.role === "user" ? "You" : msg.role === "assistant" ? "Kimi" : "System";
      const preview = msg.content.slice(0, 100) + (msg.content.length > 100 ? "..." : "");
      lines.push(`${role}: ${preview}`);
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private async saveSession(name?: string): Promise<void> {
    const sessionName = name || `session-${Date.now()}`;
    const sessionPath = join(this.cwd, ".omk", "sessions", `${sessionName}.json`);
    mkdirSync(join(this.cwd, ".omk", "sessions"), { recursive: true });
    writeFileSync(
      sessionPath,
      JSON.stringify(
        this.messages.map((m) => ({ role: m.role, content: m.content })),
        null,
        2
      )
    );
    this.messages.push({
      role: "system",
      content: `[OK] Session saved: ${sessionName}`,
      timestamp: new Date(),
    });
  }

  private async loadSession(name?: string): Promise<void> {
    if (!name) {
      this.messages.push({
        role: "system",
        content: "Usage: /load <session-name>",
        timestamp: new Date(),
      });
      return;
    }
    const sessionPath = join(this.cwd, ".omk", "sessions", `${name}.json`);
    if (!existsSync(sessionPath)) {
      this.messages.push({
        role: "system",
        content: `Session not found: ${name}`,
        timestamp: new Date(),
      });
      return;
    }
    const data = JSON.parse(readFileSync(sessionPath, "utf-8"));
    this.messages = data.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(),
    }));
    this.messages.push({
      role: "system",
      content: `[OK] Session loaded: ${name} (${this.messages.length} messages)`,
      timestamp: new Date(),
    });
  }

  private addNote(text: string): void {
    if (!text) {
      this.messages.push({
        role: "system",
        content: "Usage: /note <text>",
        timestamp: new Date(),
      });
      return;
    }
    appendToNotepad(text, this.cwd);
    this.messages.push({ role: "system", content: "[OK] Note added.", timestamp: new Date() });
  }

  private createTask(title: string): void {
    if (!title) {
      this.messages.push({
        role: "system",
        content: "Usage: /task <title>",
        timestamp: new Date(),
      });
      return;
    }
    const task = createTask({ title, description: "Created from REPL", status: "pending" }, this.cwd);
    this.messages.push({
      role: "system",
      content: `[OK] Task created: ${task.id}`,
      timestamp: new Date(),
    });
  }

  private addFileToContext(filePath?: string): void {
    if (!filePath) {
      this.messages.push({
        role: "system",
        content: "Usage: /file <path>",
        timestamp: new Date(),
      });
      return;
    }
    const fullPath = join(this.cwd, filePath);
    if (!existsSync(fullPath)) {
      this.messages.push({
        role: "system",
        content: `File not found: ${filePath}`,
        timestamp: new Date(),
      });
      return;
    }
    if (!this.contextFiles.includes(filePath)) {
      this.contextFiles.push(filePath);
      this.messages.push({
        role: "system",
        content: `[OK] Added to context: ${filePath}`,
        timestamp: new Date(),
      });
    } else {
      this.messages.push({
        role: "system",
        content: `[INFO] Already in context: ${filePath}`,
        timestamp: new Date(),
      });
    }
  }

  private showContextFiles(): void {
    if (!this.contextFiles.length) {
      this.messages.push({
        role: "system",
        content: "No files in context. Use /file <path> to add.",
        timestamp: new Date(),
      });
      return;
    }
    const lines = ["Context Files:", ""];
    for (const file of this.contextFiles) {
      lines.push(`  - ${file}`);
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showContext(): void {
    const lines = [
      "Current Context:",
      `  CWD: ${this.cwd}`,
      `  Current Mode: ${this.mode}`,
      `  History Size: ${this.messages.length} messages`,
    ];
    if (this.contextFiles.length) {
      lines.push("  Files:");
      for (const file of this.contextFiles) {
        lines.push(`    - ${file}`);
      }
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showTokenStats(): void {
    const stats = this.contextManager.getStats(
      this.messages.map((m) => ({ role: m.role, content: m.content })),
      this.contextFiles
    );
    this.messages.push({
      role: "system",
      content: this.contextManager.formatStats(stats),
      timestamp: new Date(),
    });
  }

  private showCacheStats(): void {
    const cacheStats = this.contextManager.getCacheStats();
    const text = [
      "Semantic Cache:",
      `  Cached queries: ${cacheStats.size}`,
      `  Hit rate: ${cacheStats.hitRate}%`,
      `  Tokens saved: ${cacheStats.savedTokens.toLocaleString()}`,
    ].join("\n");
    this.messages.push({ role: "system", content: text, timestamp: new Date() });
  }

  private async handleRag(argsStr: string): Promise<void> {
    const args = this.parseRagArgs(argsStr);
    if (!args.query) {
      this.messages.push({
        role: "system",
        content:
          "Usage: /rag <query> [--web] [--rebuild] [--tokens <n>] [--files <n>] [--chunks <n>]",
        timestamp: new Date(),
      });
      return;
    }
    try {
      const { getRagSearchTool } = await import("../tools/rag.js");
      const result = await getRagSearchTool(this.cwd).search(args);
      this.messages.push({
        role: "system",
        content: `RAG result:\n${result.context}`,
        timestamp: new Date(),
      });
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `RAG retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    }
  }

  private parseRagArgs(argsStr: string): {
    query: string;
    includeWeb?: boolean;
    maxTokens?: number;
    maxFiles?: number;
    maxChunks?: number;
    maxWebResults?: number;
    rebuildIndex?: boolean;
  } {
    const tokens = argsStr.split(/\s+/).filter(Boolean);
    const queryParts: string[] = [];
    const args: any = { query: "" };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (token === "--web") args.includeWeb = true;
      else if (token === "--rebuild") args.rebuildIndex = true;
      else if (token === "--tokens" && next) {
        args.maxTokens = Number(next);
        i++;
      } else if (token === "--files" && next) {
        args.maxFiles = Number(next);
        i++;
      } else if (token === "--chunks" && next) {
        args.maxChunks = Number(next);
        i++;
      } else if (token === "--web-results" && next) {
        args.maxWebResults = Number(next);
        i++;
      } else {
        queryParts.push(token);
      }
    }
    args.query = queryParts.join(" ").trim();
    return args;
  }

  private async buildCodebaseIndex(): Promise<void> {
    this.messages.push({
      role: "system",
      content: "[Building codebase index...] This may take a while for large projects...",
      timestamp: new Date(),
    });
    this.render();
    try {
      this.repoMap = await this.codebaseIndexer.buildIndex((current, total) => {
        if (current % 100 === 0 || current === total) {
          stdout.write(`\r  Indexed: ${current}/${total} files`);
        }
      });
      stdout.write("\n");
      this.messages.push({
        role: "system",
        content: "[OK] Index built successfully!",
        timestamp: new Date(),
      });
      this.displayRepositoryMap();
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `Failed to build index: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    }
  }

  private displayRepositoryMap(): void {
    if (!this.repoMap) return;
    const map = this.repoMap;
    const lines = [
      "Repository Overview:",
      `  Files: ${map.totalFiles.toLocaleString()}`,
      `  Lines: ${map.totalLines.toLocaleString()}`,
      `  Symbols: ${map.totalSymbols.toLocaleString()}`,
      "",
      "Languages:",
    ];
    for (const [lang, stats] of Object.entries(map.languages).slice(0, 5)) {
      lines.push(`  ${lang}: ${stats.percentage}% (${stats.files} files, ${stats.lines.toLocaleString()} lines)`);
    }
    if (map.modules.length > 0) {
      lines.push("", "Top Modules:");
      for (const mod of map.modules.slice(0, 5)) {
        lines.push(`  ${mod.name}: ${mod.files} files, ${mod.lines.toLocaleString()} lines`);
      }
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showRepositoryMap(): void {
    if (!this.repoMap) {
      this.messages.push({
        role: "system",
        content: "No index available. Run /index first.",
        timestamp: new Date(),
      });
      return;
    }
    this.displayRepositoryMap();
  }

  private searchSymbols(query: string): void {
    if (!query) {
      this.messages.push({
        role: "system",
        content: "Usage: /search <symbol-name>",
        timestamp: new Date(),
      });
      return;
    }
    const stats = this.codebaseIndexer.getStats();
    if (stats.files === 0) {
      this.messages.push({
        role: "system",
        content: "No index available. Run /index first.",
        timestamp: new Date(),
      });
      return;
    }
    const results = this.codebaseIndexer.getSmartContext(query, 10);
    if (results.length === 0) {
      this.messages.push({
        role: "system",
        content: `No results found for "${query}"`,
        timestamp: new Date(),
      });
      return;
    }
    const lines = [`Search results for "${query}":`, ""];
    for (const result of results) {
      lines.push(`  ${result.path} (relevance: ${result.relevance})`);
      const preview = result.content.split("\n").slice(0, 5).join("\n  ");
      lines.push(`  ${preview}`, "");
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showPlugins(): void {
    const plugins = this.pluginManager.listPlugins();
    if (plugins.length === 0) {
      this.messages.push({ role: "system", content: "No plugins loaded.", timestamp: new Date() });
      return;
    }
    const lines = ["Loaded Plugins:", ""];
    for (const plugin of plugins) {
      lines.push(`  - ${plugin.name} v${plugin.version}`);
      if (plugin.description) {
        lines.push(`    ${plugin.description}`);
      }
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private async toggleMCP(action?: string): Promise<void> {
    if (action === "start") {
      startMCPServer(3000);
      this.messages.push({
        role: "system",
        content: "MCP server started on port 3000",
        timestamp: new Date(),
      });
    } else if (action === "stop") {
      stopMCPServer();
      this.messages.push({
        role: "system",
        content: "MCP server stopped",
        timestamp: new Date(),
      });
    } else {
      this.messages.push({
        role: "system",
        content: "Usage: /mcp [start|stop]",
        timestamp: new Date(),
      });
    }
  }

  private async handleModelCommand(args: string): Promise<void> {
    if (!args) {
      const current = this.providerManager.getCurrentType();
      const text = [
        `Current provider: ${current || "not initialized"}`,
        "Usage: /model <provider> [options]",
        "Providers: api, kimi, openrouter, custom, browser, cli, kimi-cli, gemini-cli, codex-cli",
      ].join("\n");
      this.messages.push({ role: "system", content: text, timestamp: new Date() });
      return;
    }
    const [provider] = args.split(" ");
    try {
      await this.providerManager.switchProvider(provider as any, {});
      this.currentModel = provider;
      this.messages.push({
        role: "system",
        content: `[OK] Switched to provider: ${provider}`,
        timestamp: new Date(),
      });
    } catch (err) {
      this.messages.push({
        role: "system",
        content: `Failed to switch provider: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      });
    }
  }

  private showSettings(): void {
    const lines = [
      "OMK Settings:",
      `  Provider: ${this.providerManager.getCurrentType() || "auto"}`,
      `  Working Directory: ${this.cwd}`,
      `  Global Config: ${this.globalOmkPath}`,
      `  History Size: ${this.messages.length}`,
      `  Context Files: ${this.contextFiles.length}`,
    ];
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private showStatus(): void {
    const lines = [
      "OMK Status:",
      `  Mode: ${this.mode}`,
      `  Provider: ${this.providerManager.getCurrentType() || "not initialized"}`,
      `  Session Messages: ${this.messages.length}`,
      `  Context Files: ${this.contextFiles.length}`,
    ];
    const activeModes = listActiveModes(this.cwd);
    if (activeModes.length > 0) {
      lines.push("  Active Modes:");
      for (const mode of activeModes) {
        lines.push(`    - ${mode.mode}: ${mode.current_phase}`);
      }
    }
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private handleReasoningCommand(level?: string): void {
    const validLevels = ["low", "medium", "high"];
    if (!level) {
      this.messages.push({
        role: "system",
        content: `Current reasoning: ${this.reasoning}\nUsage: /reasoning <low|medium|high>`,
        timestamp: new Date(),
      });
      return;
    }
    if (!validLevels.includes(level)) {
      this.messages.push({
        role: "system",
        content: "Invalid reasoning level. Use: low, medium, high",
        timestamp: new Date(),
      });
      return;
    }
    this.reasoning = level as ReasoningEffort;
    this.messages.push({
      role: "system",
      content: `[OK] Reasoning level set to: ${level}\nWill take effect on next request`,
      timestamp: new Date(),
    });
  }

  private showTools(): void {
    const text = `
Available Tools:

File System:
  $read_file <path>           Read file contents
  $write_file <path> <content>  Write to file
  $list_directory [path]      List directory contents
  $search_files <pattern>     Search files for pattern

Web:
  $web_fetch <url>            Fetch URL content
  $web_search <query>         Search web result links/snippets
  $rag_search <query>         Retrieve compact local/web RAG context

Code Intelligence:
  $diagnostics [path]         Run TypeScript diagnostics
  $document_symbols <file>    Extract symbols from file
  $find_references <symbol>   Find symbol references

Execution:
  $execute_command <cmd>      Execute shell command

Memory:
  $memory_read [section]      Read project memory
  $memory_write <type> <content>  Write to memory
`;
    this.messages.push({ role: "system", content: text.trim(), timestamp: new Date() });
  }

  private showMemory(): void {
    try {
      const memory = getMemoryTools(this.cwd);
      const info = memory.readMemory() as any;
      const lines = ["Project Memory:", ""];
      if (info.techStack) lines.push(`Tech Stack: ${info.techStack}`);
      if (info.conventions) lines.push(`Conventions: ${info.conventions}`);
      if (info.notes?.length > 0) {
        lines.push("", "Notes:");
        for (const note of info.notes.slice(-5)) {
          lines.push(`  [${note.category}] ${note.content.slice(0, 60)}...`);
        }
      }
      if (info.directives?.length > 0) {
        lines.push("", "Directives:");
        for (const d of info.directives.slice(-5)) {
          lines.push(`  [${d.priority}] ${d.directive.slice(0, 60)}...`);
        }
      }
      this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
    } catch {
      this.messages.push({
        role: "system",
        content: "No project memory found.",
        timestamp: new Date(),
      });
    }
  }

  private async handleSessions(): Promise<void> {
    const sessions = listSessions(this.cwd);
    if (sessions.length === 0) {
      this.messages.push({
        role: "system",
        content: "No saved sessions found. Sessions are saved automatically when you chat.",
        timestamp: new Date(),
      });
      return;
    }
    const lines = ["Saved Sessions:", ""];
    for (let i = 0; i < sessions.length; i++) {
      const session = sessions[i];
      const isCurrent = session.id === this.currentSessionId;
      const marker = isCurrent ? "→ " : "  ";
      const title = session.title || generateSessionTitle(session.first_message || "New session");
      const time = formatRelativeTime(session.updated_at);
      const messageCount = session.message_count || 0;
      lines.push(`${marker}${i + 1}. ${title}`);
      lines.push(`     ${time} · ${messageCount} msgs · ${session.id.slice(0, 8)}`);
      if (isCurrent) {
        lines.push(`     [current session]`);
      }
      lines.push("");
    }
    lines.push("Use /load <name> to restore a session");
    this.messages.push({ role: "system", content: lines.join("\n"), timestamp: new Date() });
  }

  private handleTitle(title?: string): void {
    if (!title) {
      if (this.sessionTitle) {
        this.messages.push({
          role: "system",
          content: `Current session title: ${this.sessionTitle}`,
          timestamp: new Date(),
        });
      } else if (this.currentSessionId) {
        this.messages.push({
          role: "system",
          content: `Current session: ${this.currentSessionId.slice(0, 8)}... (no title)\nUse /title <text> to set a title`,
          timestamp: new Date(),
        });
      } else {
        this.messages.push({
          role: "system",
          content: "No active session. Start chatting to create one.",
          timestamp: new Date(),
        });
      }
      return;
    }
    this.sessionTitle = title.slice(0, 200);
    if (this.currentSessionId) {
      updateSession(this.currentSessionId, { title: this.sessionTitle }, this.cwd);
    }
    this.messages.push({
      role: "system",
      content: `[OK] Session title set to: "${this.sessionTitle}"`,
      timestamp: new Date(),
    });
  }

  // Rendering

  private clearPreviousRender(): void {
    if (this.renderedLines <= 1) {
      stdout.write("\x1b[2K\r");
      return;
    }
    stdout.write("\r");
    stdout.write(`\x1b[${this.renderedLines - 1}A`);
    stdout.write("\x1b[J");
  }

  private render(): void {
    this.clearPreviousRender();

    const termWidth = stdout.columns || 80;
    const termHeight = stdout.rows || 24;

    const statusBarLines = 1;
    const suggestionLines = this.suggestions.length > 0
      ? Math.min(6, this.suggestions.length)
      : 0;
    const inputPhysicalLines = this.getInputPhysicalLines();
    const inputAreaLines = Math.max(1, inputPhysicalLines);
    const placeholderLines = this.input === "" && !this.isProcessing ? 1 : 0;

    const maxMessageAreaLines = Math.max(
      0,
      termHeight - statusBarLines - inputAreaLines - placeholderLines - suggestionLines
    );

    const lines: string[] = [];
    let renderedMessageLines = 0;

    if (maxMessageAreaLines > 0) {
      const messageLines = this.renderMessageLines(maxMessageAreaLines);
      renderedMessageLines = messageLines.length;
      lines.push(...messageLines);
    }

    lines.push(...this.renderInputLines());

    if (placeholderLines > 0) {
      lines.push("\x1b[90mAsk OMK, run /help, or invoke $plan...\x1b[0m");
    }

    if (suggestionLines > 0) {
      lines.push(...this.renderSuggestionLines(suggestionLines));
    }

    lines.push(this.renderStatusBar());

    stdout.write(lines.join("\n"));

    const { physicalLine, col } = this.getInputCursorPosition();
    const inputStartLine = renderedMessageLines;
    const cursorLine = inputStartLine + physicalLine;
    const lastLine = lines.length - 1;
    const linesUp = lastLine - cursorLine;

    if (linesUp > 0) {
      stdout.write(`\x1b[${linesUp}A`);
    }
    stdout.write(`\x1b[${col}G`);

    this.renderedLines = lines.length;
  }

  private wrapToPhysicalLines(text: string, width: number): string[] {
    if (width <= 0) return [text];
    if (text === "") return [""];
    const lines: string[] = [];
    let current = "";
    let currentWidth = 0;
    for (const cluster of getGraphemeClusters(text)) {
      const cw = getClusterWidth(cluster);
      if (currentWidth + cw > width && current.length > 0) {
        lines.push(current);
        current = cluster;
        currentWidth = cw;
      } else {
        current += cluster;
        currentWidth += cw;
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
    return lines;
  }

  private renderMessageLines(maxLines: number): string[] {
    const termWidth = stdout.columns || 80;
    const allLines: string[] = [];

    if (this.isProcessing && !this.isStreaming) {
      const spinner = SPINNER_FRAMES[this.spinnerFrame % SPINNER_FRAMES.length];
      const text = `${spinner}  [agent] thinking...`;
      allLines.push(`\x1b[90m${text}\x1b[0m`);
      allLines.push("");
    }

    for (const msg of this.messages) {
      const prefix =
        msg.role === "user"
          ? "\x1b[36muser \x1b[0m"
        : msg.role === "assistant"
          ? "\x1b[32mai   \x1b[0m"
          : "\x1b[33msys  \x1b[0m";
      const prefixWidth = getStringWidth(prefix);
      const availableWidth = termWidth - prefixWidth;

      const contentLines = msg.content.split("\n");
      for (let j = 0; j < contentLines.length; j++) {
        const wrapped = this.wrapToPhysicalLines(contentLines[j], availableWidth);
        for (let k = 0; k < wrapped.length; k++) {
          const p = j === 0 && k === 0 ? prefix : " ".repeat(prefixWidth);
          allLines.push(p + wrapped[k]);
        }
      }
      allLines.push("");
    }

    this.maxMessageScrollOffset = Math.max(0, allLines.length - maxLines);
    this.messageScrollOffset = Math.max(
      0,
      Math.min(this.maxMessageScrollOffset, this.messageScrollOffset)
    );

    let startIndex = Math.max(0, allLines.length - maxLines - this.messageScrollOffset);
    const endIndex = Math.min(allLines.length, startIndex + maxLines);
    const visibleLines = allLines.slice(startIndex, endIndex);

    return visibleLines;
  }

  private renderInputLines(): string[] {
    const lines = this.input.split("\n");
    const prompt = this.getPromptIcon();
    const promptWidth = getStringWidth(prompt);
    const termWidth = stdout.columns || 80;
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const prefix = i === 0 ? prompt : " ".repeat(promptWidth);
      const prefixWidth = promptWidth;
      const availableWidth = termWidth - prefixWidth;
      const wrapped = this.wrapToPhysicalLines(lines[i], availableWidth);
      for (const w of wrapped) {
        result.push(prefix + w);
      }
    }

    return result.length > 0 ? result : [this.getPromptIcon()];
  }

  private getInputPhysicalLines(): number {
    const lines = this.input.split("\n");
    const promptWidth = getStringWidth(this.getPromptIcon());
    const termWidth = stdout.columns || 80;
    let total = 0;
    for (let i = 0; i < lines.length; i++) {
      const prefixWidth = promptWidth;
      const availableWidth = termWidth - prefixWidth;
      const wrapped = this.wrapToPhysicalLines(lines[i], availableWidth);
      total += wrapped.length;
    }
    return total || 1;
  }

  private getInputCursorPosition(): { physicalLine: number; col: number } {
    const lines = this.input.split("\n");
    const promptWidth = getStringWidth(this.getPromptIcon());
    const termWidth = stdout.columns || 80;

    let physicalLine = 0;
    let remainingCursor = this.cursor;

    for (let i = 0; i < lines.length; i++) {
      const prefixWidth = promptWidth;
      const availableWidth = termWidth - prefixWidth;
      const clusters = getGraphemeClusters(lines[i]);

      let lineCursor = 0;
      let physLineInBlock = 0;
      let colInPhysLine = prefixWidth;
      let currentLineWidth = 0;

      for (const cluster of clusters) {
        if (lineCursor === remainingCursor) {
          return {
            physicalLine: physicalLine + physLineInBlock,
            col: colInPhysLine + 1,
          };
        }
        const cw = getClusterWidth(cluster);
        if (currentLineWidth + cw > availableWidth && currentLineWidth > 0) {
          physLineInBlock++;
          colInPhysLine = 0;
          currentLineWidth = 0;
        }
        currentLineWidth += cw;
        colInPhysLine += cw;
        lineCursor += cw;
      }

      if (remainingCursor <= lineCursor) {
        return {
          physicalLine: physicalLine + physLineInBlock,
          col: colInPhysLine + 1,
        };
      }

      remainingCursor -= lineCursor;
      physicalLine += Math.max(1, physLineInBlock + 1);
    }

    const lastPrefixWidth = promptWidth;
    const lastAvailableWidth = termWidth - lastPrefixWidth;
    const lastLine = lines[lines.length - 1] || "";
    const clusters = getGraphemeClusters(lastLine);
    let currentLineWidth = 0;
    let physLineInBlock = 0;
    let colInPhysLine = lastPrefixWidth;

    for (const cluster of clusters) {
      const cw = getClusterWidth(cluster);
      if (currentLineWidth + cw > lastAvailableWidth && currentLineWidth > 0) {
        physLineInBlock++;
        colInPhysLine = 0;
        currentLineWidth = 0;
      }
      currentLineWidth += cw;
      colInPhysLine += cw;
    }

    return {
      physicalLine: physicalLine + physLineInBlock,
      col: colInPhysLine + 1,
    };
  }

  private renderSuggestionLines(maxLines: number): string[] {
    const lines: string[] = [];

    for (let i = 0; i < this.suggestions.length && lines.length < maxLines; i++) {
      const sug = this.suggestions[i];
      const isSelected = i === this.selectedSuggestion;
      const prefix = isSelected ? "\x1b[7m" : "";
      const suffix = isSelected ? "\x1b[0m" : "";

      let icon = "  ";
      if (sug.type === "command") icon = "\x1b[36m/ \x1b[0m";
      else if (sug.type === "tool") icon = "\x1b[33m$ \x1b[0m";
      else if (sug.type === "skill") icon = "\x1b[35m$ \x1b[0m";
      else if (sug.type === "file") icon = "\x1b[32m@ \x1b[0m";

      const display = sug.display.padEnd(25);
      const hint = sug.hint ? `\x1b[90m${sug.hint.slice(0, 40)}\x1b[0m` : "";

      lines.push(`${prefix}${icon}${display}${hint}${suffix}`);
    }

    return lines;
  }

  private renderStatusBar(): string {
    const termWidth = stdout.columns || 80;
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const modeBadge = this.mode;
    const model = this.currentModel || "unknown";
    const yoloBadge = this.yolo ? " \x1b[31mYOLO\x1b[0m" : "";
    const ctxPercent = this.estimateContextPercent();
    const queueBadge = this.queuedMessages.length > 0 ? ` queue:${this.queuedMessages.length}` : "";
    const scrollBadge = this.maxMessageScrollOffset > 0
      ? ` scroll ${this.messageScrollOffset}/${this.maxMessageScrollOffset}`
      : "";
    const hints = "Ctrl-X mode  Ctrl-J newline  PgUp/PgDn scroll  Ctrl-C stop";

    const left = `\x1b[90m${time}  ${modeBadge} · ${model}${yoloBadge}  ctx ${ctxPercent}%${queueBadge}${scrollBadge}\x1b[0m`;
    const right = `\x1b[90m${hints}\x1b[0m`;

    const leftWidth = getStringWidth(stripAnsi(left));
    const rightWidth = getStringWidth(stripAnsi(right));
    const middleWidth = termWidth - leftWidth - rightWidth;

    if (middleWidth < 0) {
      return left.slice(0, termWidth);
    }

    return left + " ".repeat(middleWidth) + right;
  }

  private getPromptIcon(): string {
    if (this.isProcessing && !this.isStreaming) return "\x1b[35magent > \x1b[0m";
    if (this.isStreaming) return "\x1b[35magent > \x1b[0m";
    if (this.mode === "plan") return "\x1b[33mplan > \x1b[0m";
    if (this.mode === "shell") return "\x1b[32m$ \x1b[0m";
    return "\x1b[32momk > \x1b[0m";
  }

  private cycleMode(): void {
    if (this.mode === "agent") {
      this.mode = "shell";
    } else if (this.mode === "shell") {
      this.mode = "plan";
    } else {
      this.mode = "agent";
    }
  }

  private estimateContextPercent(): number {
    const totalText = this.messages.map((m) => m.content).join("");
    const tokens = Math.ceil(totalText.length / 4);
    const maxTokens = 128000;
    return Math.min(100, Math.floor((tokens / maxTokens) * 100));
  }

  private startSpinner(): void {
    if (this.spinnerInterval) return;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      if (this.isProcessing && !this.isStreaming) {
        this.render();
      }
    }, 80);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }
}

export async function startKimiREPL(
  cwd: string,
  options?: KimiREPLOptions
): Promise<void> {
  const repl = new KimiREPL(cwd, options);
  await repl.start();
}

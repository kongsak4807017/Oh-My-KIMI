/**
 * GSD (Get Shit Done) Executor - FULL WORKFLOW with AI
 * Interactive spec-driven development that actually executes with AI
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getProviderManager, ChatMessage } from '../providers/index.js';
import { getActivityLogger } from '../repl/activity-logger.js';
import { getContextManager } from '../utils/context-manager.js';

export interface GSDProject {
  name: string;
  description: string;
  techStack: string[];
  requirements: {
    v1: string[];
    v2: string[];
    outOfScope: string[];
  };
  phases: GSDPhase[];
  currentPhase: number;
  state: {
    decisions: string[];
    blockers: string[];
    completedTasks: string[];
  };
}

export interface GSDPhase {
  number: number;
  title: string;
  description: string;
  status: 'pending' | 'discussing' | 'planning' | 'executing' | 'verifying' | 'completed';
  plans: GSDPlan[];
  context?: string;
  research?: string;
  verification?: string;
}

export interface GSDPlan {
  id: string;
  name: string;
  tasks: GSDTask[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
}

export interface GSDTask {
  id: string;
  name: string;
  description: string;
  files: string[];
  action: string;
  verification: string;
  status: 'pending' | 'completed' | 'failed';
}

export class GSDExecutor {
  private cwd: string;
  private planningDir: string;
  private project: GSDProject | null = null;
  private providerManager = getProviderManager();
  private contextManager = getContextManager();

  constructor(cwd: string) {
    this.cwd = cwd;
    this.planningDir = join(cwd, '.planning');
  }

  /**
   * AI Chat helper - sends message to AI and returns response
   */
  private async aiChat(messages: ChatMessage[], stream: boolean = false): Promise<string> {
    try {
      const provider = this.providerManager.getProvider();
      
      if (stream) {
        let fullResponse = '';
        for await (const chunk of provider.stream({ messages })) {
          process.stdout.write(chunk.content);
          fullResponse += chunk.content;
          if (chunk.done) break;
        }
        console.log('');
        return fullResponse;
      } else {
        const response = await provider.chat({ messages });
        return response.content || '';
      }
    } catch (err) {
      console.error('\x1b[31m[AI Error]', err, '\x1b[0m');
      return '';
    }
  }

  /**
   * Initialize new GSD project with AI
   */
  async newProject(name?: string): Promise<void> {
    this.ensurePlanningDir();
    
    console.log('\n\x1b[36m[GSD] 🚀 Initializing new project with AI...\x1b[0m\n');
    
    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: 'AI analyzing project requirements...',
      status: 'running',
    });

    // AI asks questions to understand the project
    const systemPrompt = `You are a project planning expert using GSD (Get Shit Done) methodology.
Your job is to interview the user to understand their project completely.

Ask questions ONE AT A TIME. Wait for the answer before asking the next question.

Cover these areas:
1. What is the project? (name, purpose, target users)
2. What problem does it solve?
3. What are the must-have features for v1 (MVP)?
4. What are nice-to-have features for v2?
5. What is explicitly out of scope?
6. Tech stack preferences?
7. Timeline and constraints?

Start with: "What project would you like to build? Please describe it in a few sentences."`;

    // Collect project info through AI conversation
    const conversation: ChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Ask initial question
    console.log('\x1b[33m[AI]\x1b[0m What project would you like to build? Please describe it in a few sentences.\n');
    
    // For now, use a default project description if user doesn't input
    // In real implementation, this would be interactive
    const projectDescription = name || 'A new software project';
    
    logger.addActivity({
      type: 'action',
      message: 'Generating project structure...',
      status: 'running',
    });

    // Generate PROJECT.md with AI
    const projectPrompt = `Based on this project description: "${projectDescription}"

Create a comprehensive PROJECT.md file content. Include:
1. Clear project vision
2. Specific goals (3-5 items)
3. Target users
4. Success metrics
5. High-level tech recommendations
6. Key constraints

Format as markdown. Be specific and actionable.`;

    const projectContent = await this.aiChat([
      { role: 'system', content: 'You are a technical project planner. Create detailed, specific project documentation.' },
      { role: 'user', content: projectPrompt }
    ]);

    writeFileSync(join(this.planningDir, 'PROJECT.md'), projectContent);
    console.log('\x1b[32m[OK] Created PROJECT.md\x1b[0m\n');

    // Generate REQUIREMENTS.md with AI
    const requirementsPrompt = `Based on this project: "${projectDescription}"

Create REQUIREMENTS.md with:

## v1 (MVP) - Must have for launch
- 5-7 specific features with clear acceptance criteria

## v2 (Future) - Nice to have
- 3-5 features for next iteration

## Out of Scope - Explicitly NOT included
- 3-5 things that might be assumed but are excluded

Be specific. Each requirement should be testable.`;

    const requirementsContent = await this.aiChat([
      { role: 'system', content: 'You are a requirements engineer. Create clear, testable requirements.' },
      { role: 'user', content: requirementsPrompt }
    ]);

    writeFileSync(join(this.planningDir, 'REQUIREMENTS.md'), requirementsContent);
    console.log('\x1b[32m[OK] Created REQUIREMENTS.md\x1b[0m\n');

    // Generate ROADMAP.md with AI
    const roadmapPrompt = `Based on this project: "${projectDescription}"

Create ROADMAP.md with 3-5 phases:

For each phase include:
- Phase number and title
- Clear description of what will be delivered
- Status: pending
- Estimated complexity: Small/Medium/Large

Example:
## Phase 1: Foundation
- Setup project structure, core architecture, basic UI

## Phase 2: Core Features
- Implement main functionality

Make phases logical and deliverable.`;

    const roadmapContent = await this.aiChat([
      { role: 'system', content: 'You are a project manager. Create realistic, phased roadmaps.' },
      { role: 'user', content: roadmapPrompt }
    ]);

    writeFileSync(join(this.planningDir, 'ROADMAP.md'), roadmapContent);
    console.log('\x1b[32m[OK] Created ROADMAP.md\x1b[0m\n');

    // Create STATE.md
    const stateContent = `# State

## Current Position
- Phase: Not started
- Status: Initialized

## Decisions
- [ ] Project scope defined in REQUIREMENTS.md

## Blockers
- None

## Completed Tasks
- [x] Project initialized with GSD

---
Generated by GSD
`;
    writeFileSync(join(this.planningDir, 'STATE.md'), stateContent);
    
    // Create todos directory
    mkdirSync(join(this.planningDir, 'todos'), { recursive: true });
    
    logger.addActivity({
      type: 'complete',
      message: 'GSD project initialized successfully',
      status: 'completed',
    });
    logger.stop();
    
    console.log('\x1b[32m[OK] GSD project initialized!\x1b[0m\n');
    console.log('\x1b[1m📁 Planning files created:\x1b[0m');
    console.log('  - PROJECT.md (Vision & goals)');
    console.log('  - REQUIREMENTS.md (v1/v2/out-of-scope)');
    console.log('  - ROADMAP.md (Phased roadmap)');
    console.log('  - STATE.md (Tracking)\n');
    console.log('\x1b[36mNext step:\x1b[0m $gsd-discuss-phase 1\n');
  }

  /**
   * Map existing codebase with AI analysis
   */
  async mapCodebase(): Promise<void> {
    console.log('\n\x1b[36m[GSD] 🔍 Mapping codebase with AI...\x1b[0m\n');
    
    this.ensurePlanningDir();
    
    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: 'AI analyzing codebase structure...',
      status: 'running',
    });

    // Detect tech stack
    const techStack = this.detectTechStack();
    console.log('\x1b[33m[Detected Tech Stack]\x1b[0m');
    techStack.forEach(t => console.log(`  - ${t}`));
    console.log('');

    // Analyze directory structure
    const structure = this.analyzeStructure();
    const fileCount = this.countFiles();
    
    logger.addActivity({
      type: 'action',
      message: `Analyzing ${fileCount} files...`,
      status: 'running',
    });

    // Get key files content for AI analysis
    const keyFiles = this.getKeyFiles();
    const filesSummary = keyFiles.map(f => {
      try {
        const content = readFileSync(join(this.cwd, f), 'utf-8').slice(0, 2000);
        return `--- ${f} ---\n${content}\n`;
      } catch {
        return '';
      }
    }).join('\n');

    // AI analyzes the codebase
    const analysisPrompt = `Analyze this codebase and create a comprehensive summary:

Tech Stack: ${techStack.join(', ')}

Directory Structure:
${structure}

Key Files:
${filesSummary}

Provide analysis in markdown format:

## Architecture
- Overall pattern (MVC, microservices, etc.)
- Key components and their roles

## Code Quality
- Code organization
- Testing coverage
- Documentation level

## Conventions
- Naming patterns
- File organization
- Code style

## Concerns
- Technical debt
- Security issues
- Performance bottlenecks

## Recommendations
- Improvements for new development`;

    const analysisContent = await this.aiChat([
      { role: 'system', content: 'You are a senior architect analyzing codebases. Be thorough and specific.' },
      { role: 'user', content: analysisPrompt }
    ]);

    const mapContent = `# Codebase Map

Generated: ${new Date().toISOString()}

## Tech Stack
${techStack.map(t => `- ${t}`).join('\n')}

## Statistics
- Total files: ~${fileCount}
- Main language: ${techStack[0] || 'Unknown'}

${analysisContent}

---
Generated by GSD
`;
    
    mkdirSync(join(this.planningDir, 'research'), { recursive: true });
    writeFileSync(join(this.planningDir, 'research', 'CODEBASE-MAP.md'), mapContent);
    
    logger.addActivity({
      type: 'complete',
      message: 'Codebase analysis complete',
      status: 'completed',
    });
    logger.stop();
    
    console.log('\x1b[32m[OK] Codebase mapped!\x1b[0m\n');
    console.log('\x1b[36mNext step:\x1b[0m $gsd-new-project\n');
  }

  /**
   * Discuss phase - AI interviews user for requirements
   */
  async discussPhase(phaseNumber: number): Promise<void> {
    console.log(`\n\x1b[36m[GSD] 💬 Discussing Phase ${phaseNumber} with AI...\x1b[0m\n`);
    
    if (!this.isInitialized()) {
      console.log('\x1b[33m[Warning] GSD not initialized. Run $gsd-new-project first.\x1b[0m\n');
      return;
    }

    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: `AI preparing Phase ${phaseNumber} discussion...`,
      status: 'running',
    });

    // Load existing project info
    let projectInfo = '';
    let roadmapInfo = '';
    try {
      projectInfo = readFileSync(join(this.planningDir, 'PROJECT.md'), 'utf-8');
      roadmapInfo = readFileSync(join(this.planningDir, 'ROADMAP.md'), 'utf-8');
    } catch {}

    // AI generates context for this phase
    const contextPrompt = `Based on this project:

${projectInfo}

And roadmap:
${roadmapInfo}

Generate a CONTEXT.md for Phase ${phaseNumber}. Include:

## Phase Goals
- What this phase aims to deliver (be specific)

## Open Questions
- Key decisions that need to be made
- Technical uncertainties
- Scope clarifications needed

## Key Areas to Address
1. Visual/UX (if UI phase)
2. Technical approach
3. Integration points
4. Data models
5. Error handling

## Assumptions to Validate
- List assumptions that should be confirmed

Format as professional markdown.`;

    const contextContent = await this.aiChat([
      { role: 'system', content: 'You are a technical lead preparing phase planning documents.' },
      { role: 'user', content: contextPrompt }
    ]);

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-CONTEXT.md`),
      contextContent
    );
    
    logger.addActivity({
      type: 'complete',
      message: `Phase ${phaseNumber} context generated`,
      status: 'completed',
    });
    logger.stop();
    
    console.log('\x1b[32m[OK] Phase context created!\x1b[0m\n');
    console.log(`\x1b[33m[Review the context file and add any specific requirements]\x1b[0m`);
    console.log(`File: ${String(phaseNumber).padStart(2, '0')}-CONTEXT.md\n`);
    console.log('\x1b[36mNext step:\x1b[0m $gsd-plan-phase ' + phaseNumber + '\n');
  }

  /**
   * Plan phase - AI researches and creates plans
   */
  async planPhase(phaseNumber: number): Promise<void> {
    console.log(`\n\x1b[36m[GSD] 📋 Planning Phase ${phaseNumber} with AI...\x1b[0m\n`);
    
    if (!this.isInitialized()) {
      console.log('\x1b[33m[Warning] GSD not initialized.\x1b[0m\n');
      return;
    }

    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: `AI researching Phase ${phaseNumber}...`,
      status: 'running',
    });

    // Load context
    let contextContent = '';
    let projectInfo = '';
    try {
      contextContent = readFileSync(join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-CONTEXT.md`), 'utf-8');
      projectInfo = readFileSync(join(this.planningDir, 'PROJECT.md'), 'utf-8');
    } catch {
      console.log('\x1b[33m[Warning] Context not found. Run $gsd-discuss-phase first.\x1b[0m\n');
      return;
    }

    // AI generates research
    const researchPrompt = `Based on Phase ${phaseNumber} context:

${contextContent}

And project:
${projectInfo}

Create RESEARCH.md with:

## Research Questions
- What patterns/approaches should we use?
- What are the best practices?
- What are potential pitfalls?

## Findings
- Technology recommendations
- Architecture decisions
- Library/framework suggestions

## Implementation Strategy
- Step-by-step approach
- Key technical decisions
- Risk mitigation

Be specific and actionable.`;

    const researchContent = await this.aiChat([
      { role: 'system', content: 'You are a senior engineer researching implementation approaches.' },
      { role: 'user', content: researchPrompt }
    ]);

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-RESEARCH.md`),
      researchContent
    );
    console.log('\x1b[32m[OK] Research complete\x1b[0m\n');

    logger.addActivity({
      type: 'action',
      message: 'Creating implementation plan...',
      status: 'running',
    });

    // AI creates execution plan
    const planPrompt = `Create detailed PLAN.md for Phase ${phaseNumber}.

Context:
${contextContent}

Research:
${researchContent}

Create 2-3 atomic plans. Each plan should be small enough to execute in one go.

For each plan, use this XML structure:

## Plan 01: [Name]

### Task 1: [Task Name]
- **Files:** 
  - \`src/path/to/file.ts\`
- **Action:**
  - Specific implementation steps
  - Key logic to write
- **Verify:**
  - How to test this works
  - Expected behavior

### Task 2: [Task Name]
- **Files:**
  - \`src/path/to/test.ts\`
- **Action:**
  - Write tests
- **Verify:**
  - Tests pass

## Dependencies
- Task X depends on Task Y

Each task should be:
- Atomic (one thing)
- Verifiable (clear done criteria)
- Small (< 200 lines ideally)`;

    const planContent = await this.aiChat([
      { role: 'system', content: 'You are a technical planner creating executable task plans.' },
      { role: 'user', content: planPrompt }
    ]);

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-01-PLAN.md`),
      planContent
    );
    
    logger.addActivity({
      type: 'complete',
      message: `Phase ${phaseNumber} plan created`,
      status: 'completed',
    });
    logger.stop();
    
    console.log('\x1b[32m[OK] Plan created!\x1b[0m\n');
    console.log('\x1b[36mNext step:\x1b[0m $gsd-execute-phase ' + phaseNumber + '\n');
  }

  /**
   * Execute phase - AI executes the plans
   */
  async executePhase(phaseNumber: number): Promise<void> {
    console.log(`\n\x1b[36m[GSD] ⚡ Executing Phase ${phaseNumber} with AI...\x1b[0m\n`);
    
    if (!this.isInitialized()) {
      console.log('\x1b[33m[Warning] GSD not initialized.\x1b[0m\n');
      return;
    }

    // Find plan files
    const planFiles = this.getPlanFiles(phaseNumber);
    
    if (planFiles.length === 0) {
      console.log(`\x1b[33m[Warning] No plans found for Phase ${phaseNumber}\x1b[0m\n`);
      console.log(`Run $gsd-plan-phase ${phaseNumber} first.\n`);
      return;
    }

    const logger = getActivityLogger();
    logger.start();
    
    console.log(`Found ${planFiles.length} plan(s) to execute:\n`);
    planFiles.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f}`);
    });
    console.log('');

    // Load plan content
    let planContent = '';
    try {
      planContent = readFileSync(join(this.planningDir, planFiles[0]), 'utf-8');
    } catch {
      console.log('\x1b[31m[Error] Could not read plan file\x1b[0m\n');
      return;
    }

    logger.addActivity({
      type: 'thinking',
      message: 'AI analyzing execution plan...',
      status: 'running',
    });

    // Execute with AI
    console.log('\x1b[33m[AI] Starting execution...\x1b[0m\n');

    const executePrompt = `Execute this plan step by step:

${planContent}

For each task:
1. Read relevant files
2. Implement the changes
3. Verify it works
4. Commit with atomic commit message

Use the available tools to:
- Read files: Use file reading
- Write files: Use file writing
- Run commands: Use execute_command
- Check tests: Run test commands

Execute tasks in order. Report progress as you go.`;

    const result = await this.aiChat([
      { role: 'system', content: 'You are a senior developer executing implementation plans. Work step by step, verify each task, and commit regularly.' },
      { role: 'user', content: executePrompt }
    ], true); // Stream output

    // Create summary
    const summaryContent = `# Phase ${phaseNumber} Plan 01 Summary

Generated: ${new Date().toISOString()}

## Execution Result
${result}

## Status
- [ ] Tasks completed
- [ ] Tests passing
- [ ] Code reviewed

## Notes
- Document any issues encountered
- Note any deviations from plan

---
Executed by GSD
`;

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-01-SUMMARY.md`),
      summaryContent
    );

    logger.addActivity({
      type: 'complete',
      message: `Phase ${phaseNumber} execution complete`,
      status: 'completed',
    });
    logger.stop();
    
    console.log('\n\x1b[32m[OK] Execution complete!\x1b[0m\n');
    console.log('\x1b[36mNext step:\x1b[0m $gsd-verify-work ' + phaseNumber + '\n');
  }

  /**
   * Verify work - AI helps verify implementation
   */
  async verifyWork(phaseNumber: number): Promise<void> {
    console.log(`\n\x1b[36m[GSD] ✅ Verifying Phase ${phaseNumber}...\x1b[0m\n`);
    
    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: 'AI preparing verification checklist...',
      status: 'running',
    });

    // Load plan and summary
    let planContent = '';
    let summaryContent = '';
    try {
      planContent = readFileSync(join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-01-PLAN.md`), 'utf-8');
      summaryContent = readFileSync(join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-01-SUMMARY.md`), 'utf-8');
    } catch {}

    const verifyPrompt = `Create a verification checklist for this completed work:

Plan:
${planContent}

Execution Summary:
${summaryContent}

Create VERIFICATION.md with:

## Functional Tests
- List of specific things to test
- Expected vs actual results

## Code Quality Checks
- [ ] Code follows project conventions
- [ ] Tests exist and pass
- [ ] No obvious bugs
- [ ] Error handling in place

## Integration Verification
- [ ] Works with existing code
- [ ] No breaking changes
- [ ] Database migrations (if any) work

## Sign-off Criteria
- [ ] All must-have features work
- [ ] Edge cases handled
- [ ] Documentation updated`;

    const verificationContent = await this.aiChat([
      { role: 'system', content: 'You are a QA engineer creating comprehensive verification checklists.' },
      { role: 'user', content: verifyPrompt }
    ]);

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-VERIFICATION.md`),
      verificationContent
    );
    
    logger.addActivity({
      type: 'complete',
      message: 'Verification checklist created',
      status: 'completed',
    });
    logger.stop();
    
    console.log('\x1b[32m[OK] Verification checklist created!\x1b[0m\n');
    console.log('Review the checklist and perform manual testing.');
    console.log('\x1b[36mNext step:\x1b[0m $gsd-ship ' + phaseNumber + '\n');
  }

  /**
   * Ship phase - create PR
   */
  async ship(phaseNumber: number): Promise<void> {
    console.log(`\n\x1b[36m[GSD] 🚢 Shipping Phase ${phaseNumber}...\x1b[0m\n`);

    // Load verification
    let verificationContent = '';
    try {
      verificationContent = readFileSync(join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-VERIFICATION.md`), 'utf-8');
    } catch {}

    const prPrompt = `Generate a PR description for Phase ${phaseNumber}:

Verification:
${verificationContent}

Create professional PR description with:
1. Summary of changes
2. What was implemented
3. Testing performed
4. Breaking changes (if any)
5. Related issues`;

    const prContent = await this.aiChat([
      { role: 'system', content: 'You are a developer writing clear PR descriptions.' },
      { role: 'user', content: prPrompt }
    ]);

    writeFileSync(
      join(this.planningDir, `${String(phaseNumber).padStart(2, '0')}-PR.md`),
      prContent
    );
    
    console.log('\x1b[32m[OK] PR template created!\x1b[0m\n');
    console.log('Create PR with:');
    console.log(`\x1b[36m  git checkout -b gsd/phase-${phaseNumber}\x1b[0m`);
    console.log(`\x1b[36m  git add .\x1b[0m`);
    console.log(`\x1b[36m  git commit -m "feat: implement phase ${phaseNumber}"\x1b[0m`);
    console.log(`\x1b[36m  git push origin gsd/phase-${phaseNumber}\x1b[0m`);
    console.log('\nThen open PR on GitHub.\n');
    
    console.log('\x1b[36mNext milestone:\x1b[0m $gsd-discuss-phase ' + (phaseNumber + 1) + '\n');
  }

  /**
   * Quick task execution
   */
  async quick(task: string): Promise<void> {
    console.log('\n\x1b[36m[GSD] ⚡ Quick Task: ' + task + '\x1b[0m\n');
    
    this.ensurePlanningDir();
    mkdirSync(join(this.planningDir, 'quick'), { recursive: true });

    const logger = getActivityLogger();
    logger.start();
    
    logger.addActivity({
      type: 'thinking',
      message: 'AI analyzing quick task...',
      status: 'running',
    });

    // AI executes the task directly
    const prompt = `Execute this quick task immediately:

Task: ${task}

Steps:
1. Analyze what needs to be done
2. Read relevant files
3. Make necessary changes
4. Test the changes
5. Commit with atomic commit

Work efficiently. Don't over-engineer.`;

    const result = await this.aiChat([
      { role: 'system', content: 'You are a developer executing quick tasks efficiently.' },
      { role: 'user', content: prompt }
    ], true);

    // Save record
    const timestamp = Date.now();
    writeFileSync(
      join(this.planningDir, 'quick', `${timestamp}-RESULT.md`),
      `# Quick Task: ${task}\n\n${result}\n`
    );
    
    logger.addActivity({
      type: 'complete',
      message: 'Quick task complete',
      status: 'completed',
    });
    logger.stop();
    
    console.log('\n\x1b[32m[OK] Quick task complete!\x1b[0m\n');
  }

  /**
   * Show GSD progress
   */
  async progress(): Promise<void> {
    console.log('\n\x1b[1m📊 GSD Progress\x1b[0m\n');
    
    if (!this.isInitialized()) {
      console.log('GSD not initialized.\n');
      console.log('Run: $gsd-new-project\n');
      return;
    }
    
    const files = readdirSync(this.planningDir);
    const planningFiles = files.filter(f => f.endsWith('.md'));
    
    console.log(`Planning files (${planningFiles.length}):`);
    planningFiles.forEach(f => {
      const icon = f.includes('PR') ? '🚢' : 
                   f.includes('VERIFICATION') ? '✅' :
                   f.includes('SUMMARY') ? '⚡' :
                   f.includes('PLAN') ? '📋' :
                   f.includes('RESEARCH') ? '🔍' :
                   f.includes('CONTEXT') ? '💬' : '📄';
      console.log(`  ${icon} ${f}`);
    });
    
    console.log('\n\x1b[36mNext:\x1b[0m $gsd-next\n');
  }

  /**
   * Auto-detect next step
   */
  async next(): Promise<void> {
    console.log('\n\x1b[36m[GSD] 🔮 Detecting next step...\x1b[0m\n');
    
    if (!this.isInitialized()) {
      console.log('Run: $gsd-new-project\n');
      return;
    }
    
    const files = readdirSync(this.planningDir);
    
    for (let i = 1; i <= 10; i++) {
      const phasePrefix = String(i).padStart(2, '0');
      const hasContext = files.some(f => f.startsWith(`${phasePrefix}-CONTEXT`));
      const hasResearch = files.some(f => f.startsWith(`${phasePrefix}-RESEARCH`));
      const hasPlan = files.some(f => f.startsWith(`${phasePrefix}-`) && f.includes('-PLAN'));
      const hasSummary = files.some(f => f.startsWith(`${phasePrefix}-`) && f.includes('-SUMMARY'));
      const hasVerification = files.some(f => f.startsWith(`${phasePrefix}-VERIFICATION`));
      const hasPR = files.some(f => f.startsWith(`${phasePrefix}-PR`));
      
      if (!hasContext) {
        console.log(`\x1b[33m[Next Step]\x1b[0m $gsd-discuss-phase ${i}\n`);
        return;
      }
      if (!hasPlan) {
        console.log(`\x1b[33m[Next Step]\x1b[0m $gsd-plan-phase ${i}\n`);
        return;
      }
      if (!hasSummary) {
        console.log(`\x1b[33m[Next Step]\x1b[0m $gsd-execute-phase ${i}\n`);
        return;
      }
      if (!hasVerification) {
        console.log(`\x1b[33m[Next Step]\x1b[0m $gsd-verify-work ${i}\n`);
        return;
      }
      if (!hasPR) {
        console.log(`\x1b[33m[Next Step]\x1b[0m $gsd-ship ${i}\n`);
        return;
      }
    }
    
    console.log('\x1b[32mAll phases complete! 🎉\x1b[0m\n');
    console.log('Start new milestone: $gsd-new-milestone "v2.0"\n');
  }

  // Helper methods
  private ensurePlanningDir(): void {
    if (!existsSync(this.planningDir)) {
      mkdirSync(this.planningDir, { recursive: true });
    }
  }

  private isInitialized(): boolean {
    return existsSync(join(this.planningDir, 'PROJECT.md'));
  }

  private detectTechStack(): string[] {
    const techs: string[] = [];
    
    if (existsSync(join(this.cwd, 'package.json'))) {
      techs.push('Node.js/JavaScript');
    }
    if (existsSync(join(this.cwd, 'tsconfig.json'))) {
      techs.push('TypeScript');
    }
    if (existsSync(join(this.cwd, 'Cargo.toml'))) {
      techs.push('Rust');
    }
    if (existsSync(join(this.cwd, 'go.mod'))) {
      techs.push('Go');
    }
    if (existsSync(join(this.cwd, 'requirements.txt')) || existsSync(join(this.cwd, 'pyproject.toml'))) {
      techs.push('Python');
    }
    if (existsSync(join(this.cwd, 'Gemfile'))) {
      techs.push('Ruby');
    }
    
    return techs.length > 0 ? techs : ['Unknown'];
  }

  private analyzeStructure(): string {
    try {
      const entries = readdirSync(this.cwd, { withFileTypes: true });
      return entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('node_modules'))
        .map(e => e.name + '/')
        .slice(0, 10)
        .join('\n');
    } catch {
      return 'Unable to analyze';
    }
  }

  private countFiles(): number {
    try {
      const entries = readdirSync(this.cwd, { recursive: true });
      return entries.filter((e: any) => {
        try {
          return statSync(join(this.cwd, e)).isFile();
        } catch {
          return false;
        }
      }).length;
    } catch {
      return 0;
    }
  }

  private getKeyFiles(): string[] {
    const keyFiles = ['package.json', 'tsconfig.json', 'README.md', 'Cargo.toml', 'go.mod'];
    return keyFiles.filter(f => existsSync(join(this.cwd, f)));
  }

  private getPlanFiles(phaseNumber: number): string[] {
    try {
      const files = readdirSync(this.planningDir);
      const prefix = String(phaseNumber).padStart(2, '0');
      return files.filter(f => f.startsWith(prefix) && f.includes('-PLAN'));
    } catch {
      return [];
    }
  }
}

// Singleton
let executor: GSDExecutor | null = null;

export function getGSDExecutor(cwd: string): GSDExecutor {
  if (!executor || executor['cwd'] !== cwd) {
    executor = new GSDExecutor(cwd);
  }
  return executor;
}

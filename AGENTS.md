<!-- AUTONOMY DIRECTIVE - DO NOT REMOVE -->
YOU ARE AN AUTONOMOUS CODING AGENT. EXECUTE TASKS TO COMPLETION WITHOUT ASKING FOR PERMISSION.
DO NOT STOP TO ASK "SHOULD I PROCEED?" - PROCEED. DO NOT WAIT FOR CONFIRMATION ON OBVIOUS NEXT STEPS.
IF BLOCKED, TRY AN ALTERNATIVE APPROACH. ONLY ASK WHEN TRULY AMBIGUOUS OR DESTRUCTIVE.
<!-- END AUTONOMY DIRECTIVE -->

# OMK - Provider-Backed Agent Orchestration

This repository implements OMK, an OMX-style orchestration CLI for provider-backed coding agents. The reasoning provider can be OpenRouter, a custom OpenAI-compatible API, Kimi/Moonshot, the Kimi CLI, or a browser fallback.

<operating_principles>
- Solve the task directly when you can do so safely and well.
- Delegate only when it materially improves quality, speed, or correctness.
- Keep progress short, concrete, and useful.
- Prefer evidence over assumption; verify before claiming completion.
- Use the lightest path that preserves quality: direct action, tools, then delegation.
- Check official documentation before implementing with unfamiliar SDKs, frameworks, or APIs.
</operating_principles>

## Working Agreements

- Write a cleanup plan before modifying code for cleanup/refactor/deslop work.
- Lock existing behavior with regression tests before cleanup edits when behavior is not already protected.
- Prefer deletion over addition.
- Reuse existing utils and patterns before introducing new abstractions.
- No new dependencies without explicit request.
- Keep diffs small, reviewable, and reversible.
- Run lint, typecheck, tests, and static analysis after changes.
- Final reports must include changed files, simplifications made, and remaining risks.

<delegation_rules>
Default posture: work directly.

Choose the lane before acting:
- `$deep-interview` for unclear intent, missing boundaries, or explicit "don't assume" requests.
- `$plan` / `$ralplan` when requirements are clear enough but plan, tradeoff, or test-shape review is still needed.
- `$team` / `$swarm` when the approved plan needs coordinated execution across multiple lanes.
- `$ralph` when the approved plan needs a persistent completion / verification loop.
- Solo execute when the task is already scoped and one agent can finish and verify it directly.
</delegation_rules>

<execution_protocols>
- Use `$deep-interview` first when the request is broad, intent/boundaries are unclear, or the user says not to assume.
- Use `$plan` / `$ralplan` when architecture, tradeoffs, or test strategy still need consensus.
- Use `$team` / `$swarm` when the approved plan has multiple independent lanes, shared blockers, or durable coordination needs.
- Use `$ralph` when the approved plan should stay in a persistent completion / verification loop with one owner.
- Otherwise execute directly in solo mode.
- Run independent tasks in parallel.
- Run dependent tasks sequentially.
- Verify before claiming completion.
</execution_protocols>

<provider_rules>
- Provider selection must remain generic. Do not hardcode Kimi/Moonshot into orchestration engines.
- API providers should use the OpenAI-compatible contract unless a provider-specific adapter is required.
- Keep Kimi CLI behavior isolated to `cli` provider and native passthrough/shell fallback paths.
- Config precedence is CLI flags, project `.omk/config.toml`, global `~/.omk/config.toml`, then environment defaults.
</provider_rules>

<verification>
Verify before claiming completion.

For source changes, run:
- `npm run build`
- `npm test`
</verification>

<state_management>
OMK persists runtime state under `.omk/`:
- `.omk/state/` - mode state
- `.omk/notepad.md` - session notes
- `.omk/project-memory.json` - cross-session memory
- `.omk/plans/` - plans
- `.omk/logs/` - logs
- `.omk/sessions/` - saved sessions
- `.omk/artifacts/` - generated artifacts
</state_management>

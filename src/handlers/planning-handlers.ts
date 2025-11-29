import { Decision } from "../types/decision";
import { LogConfig, log } from "../utils/logging";
import { create_plan } from "../tools";
import { createPlanWithAI } from "../ai/api-calls";
import { MessageArray } from "../types/handlers";
import { AIProvider } from "../ai/ai-client";
import { withSpan, recordErrorSpan } from "../utils/observability";

export async function handleCreatePlan(
  decision: Decision,
  transcript: MessageArray,
  logConfig: LogConfig,
  aiProvider?: AIProvider
) {
  if (decision.action !== "create_plan") return;

  log(logConfig, "tool-call", "Executing create_plan", {
    stepCount: decision.tool_input.plan_steps?.length || 0,
    hasProjectContext: !!decision.tool_input.project_context,
  });

  let out;
  try {
    // Extract user goal from transcript
    const userGoal = transcript.find((msg) => msg.role === "user")?.content;

    // Use AI-powered planning if we have a user goal, otherwise fall back to basic planning
    if (userGoal && userGoal.trim()) {
      log(logConfig, "planning", "Using AI-powered planning", {
        userGoal:
          userGoal.substring(0, 100) + (userGoal.length > 100 ? "..." : ""),
        hasProjectContext: !!decision.tool_input.project_context,
      });

      out = await withSpan("tool.create_plan", async (span) => {
        if (span) {
          span.setAttribute("tool.name", "create_plan");
          span.setAttribute("tool.input.mode", "ai_powered");
          span.setAttribute("tool.input.has_user_goal", true);
          span.setAttribute("tool.input.has_project_context", !!decision.tool_input.project_context);
          span.setAttribute("tool.input.user_goal_preview", userGoal.substring(0, 200));
          span.setAttribute("tool.input.user_goal_length", userGoal.length);
          if (decision.tool_input.project_context) {
            span.setAttribute("tool.input.project_context_preview", decision.tool_input.project_context.substring(0, 200));
          }
        }
        const result = await createPlanWithAI(
          userGoal,
          decision.tool_input.project_context,
          logConfig,
          { provider: aiProvider }
        );
        if (span) {
          span.setAttribute("tool.output.step_count", result.steps.length);
          span.setAttribute("tool.output.required_steps_count", result.steps.filter((s) => s.required).length);
          span.setAttribute("tool.output.optional_steps_count", result.steps.filter((s) => !s.required).length);
          span.setAttribute("tool.output.has_project_context", !!result.projectContext);
          span.setAttribute("tool.output.user_goal", result.userGoal || "");
          span.setAttribute("tool.output.created_at", result.createdAt.toISOString());
          // Add step details
          result.steps.forEach((step, index) => {
            span.setAttribute(`tool.output.step.${index}.required`, step.required);
            span.setAttribute(`tool.output.step.${index}.has_dependencies`, !!(step.dependencies && step.dependencies.length > 0));
            if (step.dependencies && step.dependencies.length > 0) {
              span.setAttribute(`tool.output.step.${index}.dependencies_count`, step.dependencies.length);
            }
          });
        }
        return result;
      });
    } else {
      log(logConfig, "planning", "Using basic planning (no user goal found)", {
        planSteps: decision.tool_input.plan_steps,
      });

      out = await withSpan("tool.create_plan", async (span) => {
        if (span) {
          span.setAttribute("tool.name", "create_plan");
          span.setAttribute("tool.input.mode", "basic");
          span.setAttribute("tool.input.has_user_goal", false);
          span.setAttribute("tool.input.plan_steps_count", (decision.tool_input.plan_steps || []).length);
          span.setAttribute("tool.input.has_project_context", !!decision.tool_input.project_context);
        }
        const result = await create_plan(
          decision.tool_input.plan_steps || [],
          decision.tool_input.project_context,
          userGoal
        );
        if (span) {
          span.setAttribute("tool.output.step_count", result.steps.length);
          span.setAttribute("tool.output.required_steps_count", result.steps.filter((s) => s.required).length);
          span.setAttribute("tool.output.optional_steps_count", result.steps.filter((s) => !s.required).length);
          span.setAttribute("tool.output.has_project_context", !!result.projectContext);
          span.setAttribute("tool.output.user_goal", result.userGoal || "");
          span.setAttribute("tool.output.created_at", result.createdAt.toISOString());
        }
        return result;
      });
    }
  } catch (error) {
    log(logConfig, "tool-error", "create_plan failed", {
      error: String(error),
      planSteps: decision.tool_input.plan_steps,
    });

    await recordErrorSpan(error, "create_plan", {
      tool: "create_plan",
      planSteps: decision.tool_input.plan_steps,
      hasProjectContext: !!decision.tool_input.project_context,
    });

    // Return a default plan when creation fails
    out = {
      steps: [],
      projectContext: "Unknown project context",
      createdAt: new Date(),
      userGoal: "Unknown goal",
    };
  }

  log(logConfig, "tool-result", "create_plan completed", {
    stepCount: out.steps.length,
    requiredSteps: out.steps.filter((s) => s.required).length,
    hasProjectContext: !!out.projectContext,
  });

  // Add plan results to transcript
  transcript.push({
    role: "assistant",
    content: `create_plan:${JSON.stringify({
      stepCount: out.steps.length,
      requiredSteps: out.steps.filter((s) => s.required).length,
      projectContext: out.projectContext,
      userGoal: out.userGoal,
      createdAt: out.createdAt.toISOString(),
    })}`,
  });

  // Add a formatted plan summary for the model to understand
  const planSummary = `
EXECUTION PLAN CREATED:
- User Goal: ${out.userGoal}
- Project Context: ${out.projectContext || "Not specified"}
- Total Steps: ${out.steps.length}
- Required Steps: ${out.steps.filter((s) => s.required).length}
- Optional Steps: ${out.steps.filter((s) => !s.required).length}

PLAN STEPS:
${out.steps
  .map(
    (step, index) =>
      `${index + 1}. ${step.step} ${
        step.required ? "(REQUIRED)" : "(OPTIONAL)"
      }${
        step.dependencies
          ? ` [Depends on: ${step.dependencies.join(", ")}]`
          : ""
      }`
  )
  .join("\n")}

IMPORTANT GUIDANCE:
- Focus on completing REQUIRED steps first
- Optional steps can be skipped if they don't align with the user's goal
- Always consider dependencies when executing steps
- Reference this plan when making decisions about next actions
- If the user's goal is already achieved, consider final_answer instead of unnecessary steps
`;

  transcript.push({
    role: "assistant",
    content: `plan_summary:${planSummary}`,
  });
}

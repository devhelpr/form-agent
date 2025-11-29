import { spinner, log as clackLog } from "@clack/prompts";

export interface StepInfo {
  step: number;
  maxSteps: number;
  action?: string;
  toolName?: string;
  status?: "running" | "success" | "error";
  message?: string;
}

class UIManager {
  private currentSpinner: ReturnType<typeof spinner> | null = null;
  private currentStep: number = 0;
  private maxSteps: number = 0;
  private initialized: boolean = false;
  private lastAction: string = "";

  // Initialize with minimal header
  init(maxSteps: number) {
    this.maxSteps = maxSteps;
    this.initialized = true;
  }

  startStep(info: StepInfo) {
    this.currentStep = info.step;
    this.maxSteps = info.maxSteps;

    // Properly stop any existing spinner before starting a new one
    if (this.currentSpinner) {
      try {
        // Show the last action that was completed
        const lastActionText = this.lastAction || "Complete";
        this.currentSpinner.stop(lastActionText, 0);
      } catch (e) {
        // Ignore errors - spinner might already be stopped
      }
      this.currentSpinner = null;
    }

    // Minimal single-line status
    const actionName = info.action ? this.formatActionName(info.action) : "Working";
    this.lastAction = actionName;
    const message = `${info.step}/${info.maxSteps} ${actionName}`;

    this.currentSpinner = spinner();
    this.currentSpinner.start(message);
  }

  updateStep(info: Partial<StepInfo>) {
    if (!this.currentSpinner) return;

    const step = info.step || this.currentStep;
    const maxSteps = info.maxSteps || this.maxSteps;
    const actionName = info.action ? this.formatActionName(info.action) : "Working";
    this.lastAction = actionName;
    const message = `${step}/${maxSteps} ${actionName}`;

    this.currentSpinner.message(message);
  }

  completeStep(info: Partial<StepInfo> & { success: boolean; message?: string }) {
    if (!this.currentSpinner) return;

    // Show the last action that was completed
    try {
      const lastActionText = this.lastAction || "Complete";
      this.currentSpinner.stop(lastActionText, 0);
    } catch (e) {
      // Ignore errors - spinner might already be stopped
    }
    this.currentSpinner = null;
  }

  showError(message: string, details?: string) {
    if (this.currentSpinner) {
      try {
        // Show the last action that failed
        const lastActionText = this.lastAction || "Error";
        this.currentSpinner.stop(lastActionText, 1);
      } catch (e) {
        // Ignore errors - spinner might already be stopped
      }
      this.currentSpinner = null;
    }
    // Only show error, details go to logs/traces
    clackLog.error(message);
  }

  showInfo(message: string) {
    // Suppress info messages - they go to logs/traces
    // Only show critical info
  }

  showSuccess(message: string) {
    // Minimal success - just log, don't show verbose output
    // Success is indicated by completion
  }

  showWarning(message: string) {
    // Suppress warnings - they go to logs/traces
  }

  // Show planning phase in spinner
  showPlanning() {
    // Properly stop any existing spinner before starting planning spinner
    if (this.currentSpinner) {
      try {
        // Show the last action that was completed
        const lastActionText = this.lastAction || "Complete";
        this.currentSpinner.stop(lastActionText, 0);
      } catch (e) {
        // Ignore errors - spinner might already be stopped
      }
      this.currentSpinner = null;
    }
    
    this.lastAction = "Planning";
    this.currentSpinner = spinner();
    this.currentSpinner.start("Planning");
  }

  // Show decision/parsing phase in spinner
  // Removed "Deciding" message - not needed, step spinner shows actual action
  showDecision() {
    // No-op - don't show "Deciding" message
    // The step spinner will show the actual action soon
  }

  // Stop spinner before user prompts
  stopSpinner() {
    if (this.currentSpinner) {
      try {
        // Show the last action that was completed
        const lastActionText = this.lastAction || "Complete";
        this.currentSpinner.stop(lastActionText, 0);
      } catch (e) {
        // Ignore errors - spinner might already be stopped
      }
      // Clear reference immediately after stopping
      this.currentSpinner = null;
    }
  }

  private formatActionName(action: string): string {
    // Short, minimal action names
    const actionMap: Record<string, string> = {
      read_files: "Reading",
      search_repo: "Searching",
      write_patch: "Writing",
      run_cmd: "Running",
      evaluate_work: "Evaluating",
      create_plan: "Planning",
      validate_form_json: "Validating",
      generate_expression: "Expression",
      generate_translations: "Translations",
      generate_form_json: "Generating",
      final_answer: "Finalizing",
    };

    return actionMap[action] || action.replace(/_/g, " ");
  }
}

// Singleton instance
export const ui = new UIManager();


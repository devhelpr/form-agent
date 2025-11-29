import { spinner, log as clackLog, note, cancel } from "@clack/prompts";

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

  startStep(info: StepInfo) {
    this.currentStep = info.step;
    this.maxSteps = info.maxSteps;

    // Stop previous spinner if exists
    if (this.currentSpinner) {
      this.currentSpinner.stop();
    }

    const stepLabel = `Step ${info.step}/${info.maxSteps}`;
    let message = stepLabel;

    if (info.action) {
      const actionName = this.formatActionName(info.action);
      message = `${stepLabel} • ${actionName}`;
    }

    if (info.toolName) {
      message += ` • ${info.toolName}`;
    }

    this.currentSpinner = spinner();
    this.currentSpinner.start(message);
  }

  updateStep(info: Partial<StepInfo>) {
    if (!this.currentSpinner) return;

    const stepLabel = `Step ${info.step || this.currentStep}/${info.maxSteps || this.maxSteps}`;
    let message = stepLabel;

    if (info.action) {
      const actionName = this.formatActionName(info.action);
      message = `${stepLabel} • ${actionName}`;
    }

    if (info.toolName) {
      message += ` • ${info.toolName}`;
    }

    this.currentSpinner.message(message);
  }

  completeStep(info: Partial<StepInfo> & { success: boolean; message?: string }) {
    if (!this.currentSpinner) return;

    if (info.success) {
      this.currentSpinner.stop(`✅ ${info.message || "Completed"}`);
    } else {
      this.currentSpinner.stop(`❌ ${info.message || "Failed"}`);
    }
    this.currentSpinner = null;
  }

  showError(message: string, details?: string) {
    if (this.currentSpinner) {
      this.currentSpinner.stop(`❌ ${message}`);
      this.currentSpinner = null;
    }
    clackLog.error(message);
    if (details) {
      note(details, "Error Details");
    }
  }

  showInfo(message: string) {
    clackLog.info(message);
  }

  showSuccess(message: string) {
    clackLog.success(message);
  }

  showWarning(message: string) {
    clackLog.warn(message);
  }

  showNote(message: string, title?: string) {
    note(message, title);
  }

  private formatActionName(action: string): string {
    const actionMap: Record<string, string> = {
      read_files: "📖 Reading files",
      search_repo: "🔍 Searching",
      write_patch: "✏️  Writing",
      run_cmd: "⚡ Running command",
      evaluate_work: "📊 Evaluating",
      create_plan: "📋 Planning",
      analyze_project: "🔎 Analyzing",
      validate_form_json: "✓ Validating",
      generate_expression: "🧮 Generating expression",
      generate_translations: "🌐 Generating translations",
      generate_form_json: "🎨 Generating form",
      final_answer: "✨ Finalizing",
    };

    return actionMap[action] || action.replace(/_/g, " ");
  }
}

// Singleton instance
export const ui = new UIManager();


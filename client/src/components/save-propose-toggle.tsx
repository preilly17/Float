import { Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveProposeMode = "SAVE" | "PROPOSE";

interface SaveProposeToggleProps<T extends string = SaveProposeMode> {
  mode: T;
  onModeChange: (mode: T) => void;
  saveMode?: T;
  proposeMode?: T;
  saveLabel?: string;
  proposeLabel?: string;
  saveDescription?: string;
  proposeDescription?: string;
  disabled?: boolean;
  className?: string;
}

export function SaveProposeToggle<T extends string = SaveProposeMode>({
  mode,
  onModeChange,
  saveMode = "SAVE" as T,
  proposeMode = "PROPOSE" as T,
  saveLabel = "Schedule & Invite",
  proposeLabel = "Float to Group",
  saveDescription = "Add to your calendar now and send RSVP invites to selected members. They can Accept or Decline.",
  proposeDescription = "Float this idea to your group for voting and ranking. Not added to calendars until confirmed.",
  disabled = false,
  className = "",
}: SaveProposeToggleProps<T>) {
  const isSaveMode = mode === saveMode;
  const isProposeMode = mode === proposeMode;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange(saveMode)}
          disabled={disabled}
          data-testid="button-mode-save"
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full font-medium text-sm transition-all",
            isSaveMode
              ? "bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-400 text-white shadow-lg"
              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Send className="h-4 w-4" />
          {saveLabel}
        </button>
        <button
          type="button"
          onClick={() => onModeChange(proposeMode)}
          disabled={disabled}
          data-testid="button-mode-propose"
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full font-medium text-sm transition-all",
            isProposeMode
              ? "bg-gradient-to-r from-violet-500 via-purple-500 to-cyan-400 text-white shadow-lg"
              : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Users className="h-4 w-4" />
          {proposeLabel}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {isSaveMode ? saveDescription : proposeDescription}
      </p>
    </div>
  );
}

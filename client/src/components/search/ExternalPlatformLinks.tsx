import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExternalLinkButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  tooltip?: string;
  className?: string;
  "data-testid"?: string;
}

export function ExternalLinkButton({
  onClick,
  disabled,
  children,
  tooltip,
  className,
  "data-testid": testId,
}: ExternalLinkButtonProps) {
  const button = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn("w-full text-xs sm:text-sm sm:w-auto", className)}
      data-testid={testId}
    >
      {children}
    </Button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

interface ExternalPlatformLinksProps {
  children: ReactNode;
  label?: string;
  className?: string;
}

export function ExternalPlatformLinks({
  children,
  label = "Or book directly on:",
  className,
}: ExternalPlatformLinksProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-neutral-200",
        className,
      )}
    >
      <span className="text-xs sm:text-sm font-medium text-muted-foreground">{label}</span>
      <div className="grid grid-cols-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
        {children}
      </div>
    </div>
  );
}

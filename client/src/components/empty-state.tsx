import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  variant?: "card" | "inline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  variant = "card",
  size = "md",
  className = "",
}: EmptyStateProps) {
  const sizeClasses = {
    sm: {
      container: "py-8",
      icon: "h-10 w-10",
      title: "text-base",
      description: "text-sm",
    },
    md: {
      container: "py-12",
      icon: "h-12 w-12",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "py-16",
      icon: "h-16 w-16",
      title: "text-xl",
      description: "text-base",
    },
  };

  const sizes = sizeClasses[size];

  const content = (
    <div className={`flex flex-col items-center justify-center text-center ${sizes.container} ${className}`}>
      <div className="rounded-full bg-slate-800/60 border border-white/10 p-4 mb-4">
        <Icon className={`${sizes.icon} text-slate-400`} />
      </div>
      <h3 className={`${sizes.title} font-semibold text-white mb-2`} data-testid="empty-state-title">
        {title}
      </h3>
      <p className={`${sizes.description} text-slate-400 max-w-md mb-6`} data-testid="empty-state-description">
        {description}
      </p>
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-col sm:flex-row gap-3">
          {actionLabel && onAction && (
            <Button onClick={onAction} data-testid="empty-state-action">
              {actionLabel}
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" onClick={onSecondaryAction} data-testid="empty-state-secondary-action">
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (variant === "inline") {
    return content;
  }

  return (
    <Card data-testid="empty-state-card">
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}

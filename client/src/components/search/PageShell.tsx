import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div
      className={cn(
        "min-h-screen bg-gradient-to-br from-white via-primary/5 to-emerald-50/60 text-slate-900",
        className,
      )}
      style={{ colorScheme: "light" }}
    >
      {children}
    </div>
  );
}

interface PageHeaderBarProps {
  title: string;
  subtitle?: string;
  destination?: string;
  resultCount?: number;
  onBack?: () => void;
  backLabel?: string;
  primaryAction?: ReactNode;
  className?: string;
}

export function PageHeaderBar({
  title,
  subtitle,
  destination,
  resultCount,
  onBack,
  backLabel,
  primaryAction,
  className,
}: PageHeaderBarProps) {
  return (
    <div
      className={cn(
        "bg-white border-b border-gray-200 px-4 lg:px-8 py-6",
        className,
      )}
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {onBack && (
              <Button variant="ghost" onClick={onBack} className="p-2">
                <ArrowLeft className="w-5 h-5" />
                {backLabel && <span className="ml-2">{backLabel}</span>}
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">
                {title}
                {destination && (
                  <span className="text-lg font-normal text-neutral-500 ml-2">
                    in {destination}
                  </span>
                )}
                {resultCount !== undefined && resultCount > 0 && (
                  <span className="text-lg font-normal text-neutral-500 ml-2">
                    ({resultCount} available)
                  </span>
                )}
              </h1>
              {subtitle && <p className="text-neutral-600">{subtitle}</p>}
            </div>
          </div>
          {primaryAction && <div>{primaryAction}</div>}
        </div>
      </div>
    </div>
  );
}

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("px-4 lg:px-8 py-6", className)}>
      <div className="max-w-7xl mx-auto space-y-6">{children}</div>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  subtitle,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "bg-white border-b border-gray-200 px-4 lg:px-8 py-4",
        className,
      )}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          {subtitle && (
            <p className="text-sm text-neutral-600">{subtitle}</p>
          )}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

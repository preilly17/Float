import { forwardRef, type ReactNode, type ForwardedRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchFormCardProps {
  title: string;
  subtitle?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  resultCount?: number;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  id?: string;
}

export const SearchFormCard = forwardRef<HTMLDivElement, SearchFormCardProps>(
  (
    {
      title,
      subtitle,
      description,
      icon,
      children,
      onClose,
      closeLabel = "Hide search",
      resultCount,
      className,
      headerClassName,
      contentClassName,
      id,
    },
    ref,
  ) => {
    const displayDescription = description || subtitle;
    
    return (
      <Card
        ref={ref}
        id={id}
        className={cn(
          "border border-white/80 shadow-lg bg-white/95 backdrop-blur",
          className,
        )}
      >
        <CardHeader
          className={cn(
            "space-y-1 border-b border-neutral-200 bg-white/90 supports-[backdrop-filter]:bg-white/80 px-4 py-3 sm:px-6 sm:py-4",
            headerClassName,
          )}
        >
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-base sm:text-lg font-semibold text-neutral-900">
                  {icon}
                  <span className="truncate">{title}</span>
                </CardTitle>
                {resultCount !== undefined && resultCount > 0 && (
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {resultCount} options
                  </span>
                )}
              </div>
              {displayDescription && (
                <CardDescription className="text-xs sm:text-sm text-neutral-600 mt-1">
                  {displayDescription}
                </CardDescription>
              )}
            </div>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-neutral-500 hover:text-neutral-900 shrink-0 h-8 px-2 sm:px-3"
              >
                <X className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{closeLabel}</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-4 sm:space-y-6 p-4 sm:p-6", contentClassName)}>
          {children}
        </CardContent>
      </Card>
    );
  },
);

SearchFormCard.displayName = "SearchFormCard";

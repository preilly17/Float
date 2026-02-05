import type { ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchButtonProps extends Omit<ButtonProps, "children"> {
  children?: ReactNode;
  isLoading?: boolean;
  loadingText?: string;
  showIcon?: boolean;
}

export function SearchButton({
  children = "Search",
  isLoading = false,
  loadingText = "Searching...",
  showIcon = true,
  className,
  disabled,
  ...props
}: SearchButtonProps) {
  return (
    <Button
      type="submit"
      disabled={disabled || isLoading}
      className={cn("min-w-[140px]", className)}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        <>
          {showIcon && <Search className="mr-2 h-4 w-4" />}
          {children}
        </>
      )}
    </Button>
  );
}

interface ResetButtonProps extends Omit<ButtonProps, "children" | "type" | "variant"> {
  children?: ReactNode;
}

export function ResetButton({
  children = "Reset filters",
  className,
  ...props
}: ResetButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn("text-neutral-600 hover:text-neutral-900", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

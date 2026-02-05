import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TravelLoading } from "@/components/LoadingSpinners";

interface SearchResultsSectionProps {
  hasSearched: boolean;
  isLoading: boolean;
  isEmpty: boolean;
  children: ReactNode;
  loadingText?: string;
  loadingVariant?: "compass" | "luggage" | "mountain" | "postcard" | "plane" | "default";
  emptyTitle?: string;
  emptyDescription?: string;
  preSearchTitle?: string;
  preSearchDescription?: string;
  className?: string;
}

export function SearchResultsSection({
  hasSearched,
  isLoading,
  isEmpty,
  children,
  loadingText = "Searching...",
  loadingVariant = "compass",
  emptyTitle = "No results found",
  emptyDescription = "Try broadening your filters or searching a different location.",
  preSearchTitle = "Ready to search?",
  preSearchDescription = "Enter a destination and any filters, then run the search when you're ready.",
  className,
}: SearchResultsSectionProps) {
  return (
    <div className={cn("border-t border-neutral-200 pt-6", className)}>
      {!hasSearched ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <MapPin className="text-white w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-2">
            {preSearchTitle}
          </h3>
          <p className="text-neutral-600 max-w-md mx-auto">
            {preSearchDescription}
          </p>
        </div>
      ) : isLoading ? (
        <div className="py-12 text-center">
          <TravelLoading variant={loadingVariant} size="lg" text={loadingText} />
        </div>
      ) : isEmpty ? (
        <div className="py-12 text-center">
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">{emptyTitle}</h3>
          <p className="text-neutral-600">{emptyDescription}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  hasMore: boolean;
  className?: string;
}

export function LoadMoreButton({
  onClick,
  isLoading = false,
  hasMore,
  className,
}: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div className={cn("text-center", className)}>
      <Button onClick={onClick} disabled={isLoading} variant="outline">
        {isLoading ? "Loading more..." : "Load more results"}
      </Button>
    </div>
  );
}

import { useState, useId } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CollapsibleDetailsProps {
  children: React.ReactNode;
  label?: string;
  defaultExpanded?: boolean;
}

export function CollapsibleDetails({ 
  children, 
  label = "More details",
  defaultExpanded = false 
}: CollapsibleDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();
  
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground hover:bg-transparent"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3 w-3 mr-1" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3 mr-1" />
            {label}
          </>
        )}
      </Button>
      
      {isExpanded && (
        <div id={contentId} className="space-y-2 pl-1 border-l-2 border-muted">
          {children}
        </div>
      )}
    </div>
  );
}

import { User } from "lucide-react";

interface AttributionLabelProps {
  name: string;
  isCurrentUser?: boolean;
  variant?: "booked" | "proposed" | "added";
  className?: string;
}

export function AttributionLabel({ 
  name, 
  isCurrentUser = false, 
  variant = "added",
  className = ""
}: AttributionLabelProps) {
  const displayName = isCurrentUser ? "You" : name;
  
  const labels: Record<typeof variant, string> = {
    booked: "Booked by",
    proposed: "Proposed by",
    added: "Added by",
  };
  
  return (
    <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
      <User className="h-3 w-3" />
      <span>
        {labels[variant]} <span className="font-medium text-foreground">{displayName}</span>
      </span>
    </div>
  );
}

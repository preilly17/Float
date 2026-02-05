import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, XCircle, Users, Vote, Calendar, Crown, Activity, Plane, Hotel, Utensils } from "lucide-react";

export type ActivityStatus = "scheduled" | "proposed" | "needs-response" | "accepted" | "declined" | "pending" | "waitlisted";
export type ProposalStatus = "active" | "voting" | "voting-closed" | "confirmed" | "selected" | "booked" | "canceled" | "rejected" | "completed" | "in-progress" | "top-choice";

export interface ActivityStatusDescriptor {
  status: ActivityStatus;
  type?: "activity" | "proposal" | "invite" | "hotel" | "flight" | "restaurant";
  count?: {
    accepted?: number;
    pending?: number;
    declined?: number;
    total?: number;
  };
  deadline?: Date | string | null;
}

interface StatusBadgeProps {
  status: ActivityStatus | ProposalStatus | string;
  type?: "activity" | "proposal" | "invite" | "hotel" | "flight" | "restaurant";
  count?: {
    accepted?: number;
    pending?: number;
    declined?: number;
    total?: number;
  };
  averageRanking?: number;
  deadline?: Date | string | null;
  className?: string;
  showIcon?: boolean;
}

const STATUS_CONFIGS = {
  confirmed: {
    label: "Confirmed",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  scheduled: {
    label: "Scheduled",
    icon: Calendar,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  booked: {
    label: "Booked",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  selected: {
    label: "Selected",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  proposed: {
    label: "Floated",
    icon: Vote,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800",
  },
  active: {
    label: "Active Voting",
    icon: Vote,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800",
  },
  voting: {
    label: "Voting",
    icon: Vote,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100 border-blue-200 dark:border-blue-800",
  },
  "voting-closed": {
    label: "Voting Closed",
    icon: Clock,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800",
  },
  "in-progress": {
    label: "Happening Now",
    icon: Activity,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-100 border-sky-200 dark:border-sky-800",
  },
  "top-choice": {
    label: "Top Choice",
    icon: Crown,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800",
  },
  accepted: {
    label: "Going",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
  declined: {
    label: "Not Going",
    icon: XCircle,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800",
  },
  "needs-response": {
    label: "Needs Response",
    icon: Clock,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100 border-amber-200 dark:border-amber-800",
  },
  waitlisted: {
    label: "Waitlisted",
    icon: Users,
    className: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800",
  },
  canceled: {
    label: "Canceled",
    icon: XCircle,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800",
  },
  cancelled: {
    label: "Canceled",
    icon: XCircle,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-100 border-rose-200 dark:border-rose-800",
  },
  available: {
    label: "Available",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  },
} as const;

export function StatusBadge({
  status,
  type = "activity",
  count,
  averageRanking,
  deadline,
  className,
  showIcon = true,
}: StatusBadgeProps) {
  const getStatusConfig = () => {
    const normalizedStatus = status.toLowerCase().replace(/_/g, "-");

    if (averageRanking !== undefined && averageRanking <= 1.5 && normalizedStatus !== "canceled" && normalizedStatus !== "cancelled") {
      return STATUS_CONFIGS["top-choice"];
    }

    if (normalizedStatus in STATUS_CONFIGS) {
      const config = STATUS_CONFIGS[normalizedStatus as keyof typeof STATUS_CONFIGS];
      
      if ((normalizedStatus === "proposed" || normalizedStatus === "active" || normalizedStatus === "voting") && count?.accepted && count?.total) {
        return {
          ...config,
          label: `${count.accepted}/${count.total} votes`,
        };
      }
      
      return config;
    }

    const typeIcons = {
      hotel: Hotel,
      flight: Plane,
      restaurant: Utensils,
      activity: Calendar,
      proposal: Vote,
      invite: Users,
    };

    return {
      label: status,
      icon: typeIcons[type] || Calendar,
      className: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800",
    };
  };

  const isDeadlinePassed = deadline && new Date(deadline) < new Date();
  const normalizedStatus = status.toLowerCase().replace(/_/g, "-");
  
  const shouldShowVotingClosed = isDeadlinePassed && 
    (normalizedStatus === "proposed" || normalizedStatus === "active" || normalizedStatus === "voting");

  const config = shouldShowVotingClosed ? STATUS_CONFIGS["voting-closed"] : getStatusConfig();
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        config.className,
        className
      )}
      data-testid={`status-badge-${status.toLowerCase().replace(/_/g, "-")}`}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

// Helper function to determine activity status for display
export function getActivityDisplayStatus(activity: {
  type: string;
  inviteStatus?: string;
  status?: string;
  votingDeadline?: Date | string | null;
}): ActivityStatus {
  // If user has an invite status, prioritize showing that
  if (activity.inviteStatus) {
    if (activity.inviteStatus === "accepted") return "accepted";
    if (activity.inviteStatus === "declined") return "declined";
    if (activity.inviteStatus === "pending") return "needs-response";
    if (activity.inviteStatus === "waitlisted") return "waitlisted";
  }

  // Otherwise show the activity type/status
  if (activity.type === "SCHEDULED") {
    return "scheduled";
  }
  
  if (activity.type === "PROPOSE") {
    if (activity.votingDeadline && new Date(activity.votingDeadline) < new Date()) {
      return "proposed"; // Will be rendered as "Voting Closed"
    }
    return "proposed";
  }

  return "pending";
}

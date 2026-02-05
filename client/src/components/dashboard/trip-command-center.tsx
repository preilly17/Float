import { useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plane,
  Hotel,
  Utensils,
  MapPin,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TripWithDetails } from "@shared/schema";
import {
  getDaysUntilTrip,
  isTripOngoing,
  calculateTripPlanningProgress,
  countOpenDecisions,
  calculateGroupStatus,
  type TripWithPlanningData,
  type PlanningProgress,
  type OpenDecisions,
  type GroupStatus,
} from "@/lib/dashboardSelectors";

interface TripCommandCenterProps {
  nextTrip: TripWithDetails | null;
  upcomingTripsCount: number;
  today: Date;
  isLoading?: boolean;
  onCreateTrip?: () => void;
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  
  if (format(start, "MMM yyyy") === format(end, "MMM yyyy")) {
    return `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`;
  }
  return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`;
}

function NextTripCard({
  nextTrip,
  daysUntil,
  isOngoing,
  isLoading,
  onCreateTrip,
  upcomingTripsCount,
}: {
  nextTrip: TripWithDetails | null;
  daysUntil: number | null;
  isOngoing: boolean;
  isLoading?: boolean;
  onCreateTrip?: () => void;
  upcomingTripsCount: number;
}) {
  if (isLoading) {
    return (
      <Card className="dashboard-themed-card h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-20" />
        </CardContent>
      </Card>
    );
  }

  if (!nextTrip) {
    return (
      <Card className="dashboard-themed-card h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/60 dark:to-slate-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Plane className="h-4 w-4" />
            Next Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <div className="rounded-full bg-gradient-to-br from-cyan-100 to-violet-100 dark:from-cyan-900/30 dark:to-violet-900/30 p-4 mb-3">
            <Sparkles className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
            {upcomingTripsCount > 0
              ? "Unable to determine next trip"
              : "No upcoming trips planned"}
          </p>
          {upcomingTripsCount === 0 && (
            <Button
              size="sm"
              onClick={onCreateTrip}
              className="gap-1 bg-gradient-to-r from-cyan-500 to-violet-500 hover:from-cyan-600 hover:to-violet-600"
            >
              <Plus className="h-4 w-4" />
              Plan a New Trip
            </Button>
          )}
          {upcomingTripsCount > 0 && (
            <Link href="/trips">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
              >
                View All Trips <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  const dateStr = typeof nextTrip.startDate === "string"
    ? nextTrip.startDate
    : nextTrip.startDate.toISOString().split("T")[0];
  const endDateStr = typeof nextTrip.endDate === "string"
    ? nextTrip.endDate
    : nextTrip.endDate.toISOString().split("T")[0];

  return (
    <Card className="dashboard-themed-card h-full overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 dark:from-cyan-500/10 dark:to-violet-500/10 pointer-events-none" />
      <CardHeader className="pb-2 relative">
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Plane className="h-4 w-4" />
          Next Trip
        </CardTitle>
      </CardHeader>
      <CardContent className="relative space-y-3">
        <div>
          <Link href={`/trip/${nextTrip.id}`}>
            <h3 className="font-semibold text-lg text-slate-900 dark:text-white hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer">
              {nextTrip.name || nextTrip.destination}
            </h3>
          </Link>
          <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            <span>{nextTrip.destination}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDateRange(dateStr, endDateStr)}</span>
        </div>

        <div className="flex items-center justify-between">
          {isOngoing ? (
            <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0">
              <Clock className="h-3 w-3 mr-1" />
              Happening Now
            </Badge>
          ) : daysUntil !== null ? (
            <Badge 
              variant="secondary" 
              className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300 border-0"
            >
              {daysUntil === 0 ? "Today!" : daysUntil === 1 ? "Tomorrow" : `${daysUntil} days`}
            </Badge>
          ) : null}
          <Link href={`/trip/${nextTrip.id}`}>
            <Button variant="ghost" size="sm" className="gap-1 text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300">
              View <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanningProgressCard({
  nextTrip,
  progress,
  isLoading,
}: {
  nextTrip: TripWithDetails | null;
  progress: PlanningProgress;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="dashboard-themed-card h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-24" />
        </CardContent>
      </Card>
    );
  }

  if (!nextTrip) {
    return (
      <Card className="dashboard-themed-card h-full opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Planning Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Plan a trip to track progress
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-themed-card h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Planning Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              {progress.completedCount} / {progress.totalCount}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {progress.percentage}% complete
            </span>
          </div>
          <Progress 
            value={progress.percentage} 
            className="h-2 bg-slate-200 dark:bg-slate-700"
          />
        </div>

        <div className="space-y-1.5">
          {progress.items.slice(0, 3).map((item) => (
            <div key={item.key} className="flex items-center gap-2 text-sm">
              {item.complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600" />
              )}
              <span className={item.complete ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        <Link href={`/trip/${nextTrip.id}`}>
          <Button variant="outline" size="sm" className="w-full gap-1">
            Continue Planning <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function OpenDecisionsCard({
  nextTrip,
  decisions,
  isLoading,
}: {
  nextTrip: TripWithDetails | null;
  decisions: OpenDecisions;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="dashboard-themed-card h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!nextTrip) {
    return (
      <Card className="dashboard-themed-card h-full opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Open Decisions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No proposals to review
          </p>
        </CardContent>
      </Card>
    );
  }

  const categories = [
    { key: "flights", label: "Flights", icon: Plane, count: decisions.flights },
    { key: "hotels", label: "Hotels", icon: Hotel, count: decisions.hotels },
    { key: "activities", label: "Activities", icon: MapPin, count: decisions.activities },
    { key: "restaurants", label: "Restaurants", icon: Utensils, count: decisions.restaurants },
  ].filter(c => c.count > 0);

  return (
    <Card className="dashboard-themed-card h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Open Decisions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">
            {decisions.total}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {decisions.total === 1 ? "proposal" : "proposals"} awaiting
          </span>
        </div>

        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <Badge 
                key={cat.key} 
                variant="secondary"
                className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0"
              >
                <cat.icon className="h-3 w-3" />
                {cat.count} {cat.label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            All decisions made
          </p>
        )}

        <Link href={`/trip/${nextTrip.id}/proposals`}>
          <Button variant="outline" size="sm" className="w-full gap-1">
            Review Proposals <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function GroupStatusCard({
  nextTrip,
  status,
  isLoading,
}: {
  nextTrip: TripWithDetails | null;
  status: GroupStatus;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="dashboard-themed-card h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-24" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!nextTrip) {
    return (
      <Card className="dashboard-themed-card h-full opacity-60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Group Status
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Invite travelers to your trip
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-themed-card h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Users className="h-4 w-4" />
          Group Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-white">
            {status.memberCount}
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {status.memberCount === 1 ? "member" : "members"}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {status.confirmedMembers > 0 && (
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
              {status.confirmedMembers} confirmed
            </Badge>
          )}
          {status.pendingRsvps > 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">
              {status.pendingRsvps} pending
            </Badge>
          )}
        </div>

        <Link href={`/trip/${nextTrip.id}?view=members`}>
          <Button variant="outline" size="sm" className="w-full gap-1">
            Invite / Manage <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function TripCommandCenter({
  nextTrip,
  upcomingTripsCount,
  today,
  isLoading,
  onCreateTrip,
}: TripCommandCenterProps) {
  const daysUntil = useMemo(
    () => getDaysUntilTrip(nextTrip, today),
    [nextTrip, today]
  );

  const isOngoing = useMemo(
    () => nextTrip ? isTripOngoing(nextTrip, today) : false,
    [nextTrip, today]
  );

  const progress = useMemo(
    () => nextTrip ? calculateTripPlanningProgress(nextTrip as TripWithPlanningData) : { items: [], completedCount: 0, totalCount: 5, percentage: 0 },
    [nextTrip]
  );

  const decisions = useMemo(
    () => countOpenDecisions(nextTrip as TripWithPlanningData | null),
    [nextTrip]
  );

  const groupStatus = useMemo(
    () => calculateGroupStatus(nextTrip),
    [nextTrip]
  );

  return (
    <section aria-labelledby="trip-command-center" className="dashboard-themed-section p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 
          id="trip-command-center" 
          className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2"
        >
          <Sparkles className="h-5 w-5 text-cyan-500" />
          Trip Command Center
        </h2>
        {upcomingTripsCount > 1 && (
          <Link href="/trips">
            <Button variant="ghost" size="sm" className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
              View all {upcomingTripsCount} trips
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NextTripCard
          nextTrip={nextTrip}
          daysUntil={daysUntil}
          isOngoing={isOngoing}
          isLoading={isLoading}
          onCreateTrip={onCreateTrip}
          upcomingTripsCount={upcomingTripsCount}
        />
        <PlanningProgressCard
          nextTrip={nextTrip}
          progress={progress}
          isLoading={isLoading}
        />
        <OpenDecisionsCard
          nextTrip={nextTrip}
          decisions={decisions}
          isLoading={isLoading}
        />
        <GroupStatusCard
          nextTrip={nextTrip}
          status={groupStatus}
          isLoading={isLoading}
        />
      </div>
    </section>
  );
}

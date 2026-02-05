import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, type QueryKey } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { BasicInfoStep, TimingStep, AttendeesStep, ExtrasStep, type MemberOption as StepMemberOption } from "./steps";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  useCreateActivity,
  type ActivityCreateFormValues,
  type ActivityValidationError,
} from "@/lib/activities/createActivity";
import {
  scheduledActivitiesQueryKey as buildScheduledActivitiesKey,
  proposalActivitiesQueryKey as buildProposalActivitiesKey,
} from "@/lib/activities/queryKeys";
import { type ActivityType, type ActivityWithDetails, type TripMember, type User } from "@shared/schema";
import { resolveTripTimezone, formatDateInTimezone } from "@/lib/timezone";
import {
  ACTIVITY_CATEGORY_MESSAGE,
  ACTIVITY_CATEGORY_VALUES,
  ATTENDEE_REQUIRED_MESSAGE,
  END_TIME_AFTER_START_MESSAGE,
  MAX_ACTIVITY_DESCRIPTION_LENGTH,
  MAX_ACTIVITY_LOCATION_LENGTH,
  MAX_ACTIVITY_NAME_LENGTH,
  START_TIME_REQUIRED_FOR_END_MESSAGE,
  normalizeActivityTypeInput,
  normalizeAttendeeIds,
  normalizeCostInput,
  normalizeMaxCapacityInput,
} from "@shared/activityValidation";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const START_TIME_REQUIRED_MESSAGE = "Start time is required so we can place this on the calendar.";

const categories = [
  { value: "food", label: "Food & Dining" },
  { value: "sightseeing", label: "Sightseeing" },
  { value: "transport", label: "Transportation" },
  { value: "entertainment", label: "Entertainment" },
  { value: "shopping", label: "Shopping" },
  { value: "culture", label: "Culture" },
  { value: "outdoor", label: "Outdoor" },
  { value: "manual", label: "Manual" },
  { value: "other", label: "Other" },
] as const;

const dateInputPattern = /^\d{4}-\d{2}-\d{2}$/;

const formatReadableDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = parseISO(value);
    if (!isValid(parsed)) {
      return null;
    }

    return format(parsed, "MMM d, yyyy");
  } catch {
    return null;
  }
};

const buildDateRangeMessage = (min?: string | null, max?: string | null) => {
  const minLabel = formatReadableDate(min ?? null);
  const maxLabel = formatReadableDate(max ?? null);

  if (minLabel && maxLabel) {
    return `Pick a date between ${minLabel} and ${maxLabel}.`;
  }

  if (minLabel) {
    return `Pick a date on or after ${minLabel}.`;
  }

  if (maxLabel) {
    return `Pick a date on or before ${maxLabel}.`;
  }

  return "Pick a valid date for this trip.";
};

const buildDateRangeHint = (min?: string | null, max?: string | null) => {
  const minLabel = formatReadableDate(min ?? null);
  const maxLabel = formatReadableDate(max ?? null);

  if (minLabel && maxLabel) {
    return `Trip dates: ${minLabel} – ${maxLabel}.`;
  }

  if (minLabel) {
    return `Trip starts ${minLabel}.`;
  }

  if (maxLabel) {
    return `Trip ends ${maxLabel}.`;
  }

  return null;
};

const formFieldsSchema = z.object({
  name: z
    .string()
    .min(1, "Activity name is required")
    .max(MAX_ACTIVITY_NAME_LENGTH, `Activity name must be ${MAX_ACTIVITY_NAME_LENGTH} characters or fewer.`),
  description: z
    .string()
    .max(
      MAX_ACTIVITY_DESCRIPTION_LENGTH,
      `Description must be ${MAX_ACTIVITY_DESCRIPTION_LENGTH} characters or fewer.`,
    )
    .optional()
    .transform((value) => value ?? ""),
  startDate: z.string().min(1, "Start date is required"),
  startTime: z
    .string()
    .optional()
    .transform((value) => (value ?? "").trim())
    .refine((value) => value === "" || timePattern.test(value), {
      message: "Start time must be in HH:MM format.",
    }),
  endTime: z
    .string()
    .optional()
    .refine((value) => !value || timePattern.test(value), {
      message: "End time must be in HH:MM format.",
    }),
  location: z
    .string()
    .max(
      MAX_ACTIVITY_LOCATION_LENGTH,
      `Location must be ${MAX_ACTIVITY_LOCATION_LENGTH} characters or fewer.`,
    )
    .optional()
    .transform((value) => value ?? ""),
  cost: z.string().optional(),
  maxCapacity: z.string().optional(),
  attendeeIds: z
    .array(z.string(), { invalid_type_error: ATTENDEE_REQUIRED_MESSAGE })
    .default([]),
  category: z
    .string()
    .refine((value) => ACTIVITY_CATEGORY_VALUES.includes(value as (typeof ACTIVITY_CATEGORY_VALUES)[number]), {
      message: ACTIVITY_CATEGORY_MESSAGE,
    }),
  enableVotingDeadline: z.boolean().default(false),
  votingDeadlineDate: z.string().optional(),
  votingDeadlineTime: z
    .string()
    .optional()
    .refine((value) => !value || timePattern.test(value), {
      message: "Voting deadline time must be in HH:MM format.",
    }),
  bookingUrl: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formFieldsSchema>;

interface FormSchemaOptions {
  startDateMin?: string | null;
  startDateMax?: string | null;
}

const createFormSchema = (options: FormSchemaOptions = {}) => {
  const { startDateMin, startDateMax } = options;
  return formFieldsSchema.superRefine((data, ctx) => {
    if (data.cost) {
      const { error } = normalizeCostInput(data.cost);
      if (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cost"], message: error });
      }
    }

    if (data.maxCapacity) {
      const { error } = normalizeMaxCapacityInput(data.maxCapacity);
      if (error) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["maxCapacity"], message: error });
      }
    }

    if (data.endTime) {
      if (!data.startTime || data.startTime.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: START_TIME_REQUIRED_FOR_END_MESSAGE,
        });
        return;
      }

      const startDateTime = new Date(`${data.startDate}T${data.startTime}`);
      const endDateTime = new Date(`${data.startDate}T${data.endTime}`);
      if (Number.isNaN(endDateTime.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endTime"],
          message: "End time must be a valid time.",
        });
      } else if (!Number.isNaN(startDateTime.getTime()) && endDateTime <= startDateTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: END_TIME_AFTER_START_MESSAGE });
      }
    }

    const { value: normalizedCapacity } = normalizeMaxCapacityInput(data.maxCapacity);
    if (normalizedCapacity !== null) {
      const attendeeCount = new Set([...(data.attendeeIds ?? [])]).size;
      if (normalizedCapacity < attendeeCount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["maxCapacity"],
          message: "Max participants cannot be less than the number of selected attendees.",
        });
      }
    }

    const trimmedDate = typeof data.startDate === "string" ? data.startDate.trim() : data.startDate;
    if (!trimmedDate || !dateInputPattern.test(trimmedDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: "Provide a valid date.",
      });
      return;
    }

    if (startDateMin && trimmedDate < startDateMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: buildDateRangeMessage(startDateMin, startDateMax),
      });
      return;
    }

    if (startDateMax && trimmedDate > startDateMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startDate"],
        message: buildDateRangeMessage(startDateMin, startDateMax),
      });
      return;
    }

    // Voting deadline validation (proposals only)
    if (data.enableVotingDeadline) {
      if (!data.votingDeadlineDate || data.votingDeadlineDate.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["votingDeadlineDate"],
          message: "Voting deadline date is required when enabled.",
        });
        return;
      }

      const trimmedDeadlineDate = data.votingDeadlineDate.trim();
      if (!dateInputPattern.test(trimmedDeadlineDate)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["votingDeadlineDate"],
          message: "Provide a valid voting deadline date.",
        });
        return;
      }

      // Default to 23:59 if no time provided
      const deadlineTime = data.votingDeadlineTime?.trim() || "23:59";
      const deadlineDateTime = new Date(`${trimmedDeadlineDate}T${deadlineTime}`);
      
      if (Number.isNaN(deadlineDateTime.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["votingDeadlineTime"],
          message: "Voting deadline time must be valid.",
        });
        return;
      }

      // Deadline must be in the future
      const now = new Date();
      if (deadlineDateTime <= now) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["votingDeadlineDate"],
          message: "Voting deadline must be in the future.",
        });
        return;
      }
    }
  });
};

export type ActivityComposerPrefill = {
  name?: string;
  description?: string | null;
  startDate?: string | Date | null;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  cost?: string | null;
  maxCapacity?: string | null;
  category?: string | null;
  attendeeIds?: Array<string | number>;
  type?: ActivityType;
};

type TripMemberWithUser = TripMember & { user: User };

type MemberOption = {
  id: string;
  name: string;
  isCurrentUser: boolean;
};

export interface EditableActivity {
  id: number;
  name: string;
  description?: string | null;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  location?: string | null;
  cost?: number | string | null;
  maxCapacity?: number | null;
  category?: string | null;
  type?: ActivityType;
  votingDeadline?: string | Date | null;
}

interface AddActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: number;
  selectedDate?: Date | null;
  members: TripMemberWithUser[];
  defaultMode?: ActivityType;
  allowModeToggle?: boolean;
  currentUserId?: string;
  prefill?: ActivityComposerPrefill | null;
  tripStartDate?: string | Date | null;
  tripEndDate?: string | Date | null;
  tripTimezone?: string | null;
  scheduledActivitiesQueryKey?: QueryKey;
  proposalActivitiesQueryKey?: QueryKey;
  calendarActivitiesQueryKey?: QueryKey;
  onActivityCreated?: (activity: ActivityWithDetails) => void;
  editActivity?: EditableActivity | null;
  onActivityUpdated?: (activity: ActivityWithDetails) => void;
}

const getMemberDisplayName = (member: User | null | undefined, isCurrentUser: boolean) => {
  if (!member) {
    return isCurrentUser ? "You" : "Trip member";
  }

  const first = member.firstName?.trim();
  const last = member.lastName?.trim();
  const base = first && last ? `${first} ${last}` : first ?? member.username ?? member.email ?? "Trip member";

  return isCurrentUser ? `${base} (You)` : base;
};

const sanitizeOptional = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return "";
  }
  return value ?? "";
};

const toDateOnlyString = (value: string | Date | null | undefined, timeZone: string): string => {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (!isValid(value)) {
      return "";
    }
    return formatDateInTimezone(value, timeZone);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }

    if (dateInputPattern.test(trimmed)) {
      return trimmed;
    }

    try {
      const parsedIso = parseISO(trimmed);
      if (isValid(parsedIso)) {
        return formatDateInTimezone(parsedIso, timeZone);
      }
    } catch (error) {
      // Ignore parse errors and try a fallback below.
    }

    const fallback = new Date(trimmed);
    if (!Number.isNaN(fallback.getTime())) {
      return formatDateInTimezone(fallback, timeZone);
    }
  }

  return "";
};

const dateOnlyStringToDate = (value: string): Date | null => {
  if (!dateInputPattern.test(value)) {
    return null;
  }

  const [yearString, monthString, dayString] = value.split("-");
  const year = Number.parseInt(yearString, 10);
  const month = Number.parseInt(monthString, 10);
  const day = Number.parseInt(dayString, 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
};

const clampDateWithinRange = (value: string, min?: string | null, max?: string | null): string => {
  if (!value) {
    return value;
  }

  if (min && value < min) {
    return min;
  }

  if (max && value > max) {
    if (!min) {
      return max;
    }

    const candidateDate = dateOnlyStringToDate(value);
    const minDate = dateOnlyStringToDate(min);
    const maxDate = dateOnlyStringToDate(max);

    if (candidateDate && minDate && maxDate) {
      const diffToMin = Math.abs(candidateDate.getTime() - minDate.getTime());
      const diffToMax = Math.abs(candidateDate.getTime() - maxDate.getTime());
      return diffToMin <= diffToMax ? min : max;
    }

    return max;
  }

  return value;
};

const isDateWithinRange = (value: string, min?: string | null, max?: string | null): boolean => {
  if (!value || !dateInputPattern.test(value)) {
    return false;
  }

  if (min && value < min) {
    return false;
  }

  if (max && value > max) {
    return false;
  }

  return true;
};

const getTodayInTimezone = (timeZone: string): string => {
  return formatDateInTimezone(new Date(), timeZone);
};

export function AddActivityModal({
  open,
  onOpenChange,
  tripId,
  selectedDate,
  members,
  defaultMode = "SCHEDULED",
  allowModeToggle = true,
  currentUserId,
  prefill,
  tripStartDate,
  tripEndDate,
  tripTimezone,
  scheduledActivitiesQueryKey: scheduledActivitiesQueryKeyProp,
  proposalActivitiesQueryKey: proposalActivitiesQueryKeyProp,
  calendarActivitiesQueryKey: calendarActivitiesQueryKeyProp,
  onActivityCreated,
  editActivity,
  onActivityUpdated,
}: AddActivityModalProps) {
  const isEditMode = Boolean(editActivity);
  const { toast } = useToast();

  const fallbackScheduledActivitiesQueryKey = useMemo(
    () => buildScheduledActivitiesKey(tripId),
    [tripId],
  );
  const fallbackProposalActivitiesQueryKey = useMemo(
    () => buildProposalActivitiesKey(tripId),
    [tripId],
  );

  const scheduledActivitiesQueryKey = useMemo(
    () => scheduledActivitiesQueryKeyProp ?? fallbackScheduledActivitiesQueryKey,
    [scheduledActivitiesQueryKeyProp, fallbackScheduledActivitiesQueryKey],
  );

  const proposalActivitiesQueryKey = useMemo(
    () => proposalActivitiesQueryKeyProp ?? fallbackProposalActivitiesQueryKey,
    [proposalActivitiesQueryKeyProp, fallbackProposalActivitiesQueryKey],
  );

  const calendarActivitiesQueryKey = useMemo(
    () => calendarActivitiesQueryKeyProp ?? scheduledActivitiesQueryKey,
    [calendarActivitiesQueryKeyProp, scheduledActivitiesQueryKey],
  );
  const resolvedTimezone = useMemo(
    () => resolveTripTimezone({ tripTimezone }),
    [tripTimezone],
  );
  const startDateMin = useMemo(
    () => toDateOnlyString(tripStartDate, resolvedTimezone),
    [tripStartDate, resolvedTimezone],
  );
  const startDateMax = useMemo(
    () => toDateOnlyString(tripEndDate, resolvedTimezone),
    [tripEndDate, resolvedTimezone],
  );
  const dateRangeHint = useMemo(
    () => buildDateRangeHint(startDateMin, startDateMax),
    [startDateMin, startDateMax],
  );
  const formSchema = useMemo(
    () => createFormSchema({ startDateMin, startDateMax }),
    [startDateMin, startDateMax],
  );
  const formResolver = useMemo(() => zodResolver(formSchema), [formSchema]);

  const memberOptions = useMemo<MemberOption[]>(() => {
    const base = members.map((member) => ({
      id: String(member.userId),
      name: getMemberDisplayName(member.user, member.userId === currentUserId),
      isCurrentUser: member.userId === currentUserId,
    }));

    const hasCurrentUser = base.some((member) => member.isCurrentUser);

    if (hasCurrentUser || !currentUserId) {
      return base;
    }

    const fallbackName = (() => {
      const found = members.find((member) => member.userId === currentUserId);
      return getMemberDisplayName(found?.user, true);
    })();

    return [
      { id: String(currentUserId), name: fallbackName, isCurrentUser: true },
      ...base,
    ];
  }, [members, currentUserId]);

  const defaultAttendeeIds = useMemo(() => memberOptions.map((member) => member.id), [memberOptions]);
  const normalizedDefaultMode = useMemo(
    () => normalizeActivityTypeInput(defaultMode, "SCHEDULED"),
    [defaultMode],
  );
  const creatorMemberId = useMemo(
    () => memberOptions.find((member) => member.isCurrentUser)?.id ?? null,
    [memberOptions],
  );

  const determineInitialStartDate = useCallback(() => {
    const prefillCandidate = toDateOnlyString(prefill?.startDate, resolvedTimezone);
    const selectedCandidate = toDateOnlyString(selectedDate, resolvedTimezone);
    const today = getTodayInTimezone(resolvedTimezone);

    let candidate = (prefillCandidate || selectedCandidate || "").trim();

    if (!candidate) {
      if (isDateWithinRange(today, startDateMin || null, startDateMax || null)) {
        candidate = today;
      } else if (startDateMin) {
        candidate = startDateMin;
      } else if (startDateMax) {
        candidate = startDateMax;
      } else {
        candidate = today;
      }
    }

    return clampDateWithinRange(candidate, startDateMin || null, startDateMax || null);
  }, [prefill?.startDate, resolvedTimezone, selectedDate, startDateMin, startDateMax]);

  const computeDefaults = useCallback(() => {
    const attendeePrefill = Array.isArray(prefill?.attendeeIds)
      ? normalizeAttendeeIds(prefill?.attendeeIds).value
      : undefined;

    const normalizedStartDate = determineInitialStartDate();

    const extractDateFromIso = (isoString: string | Date | null | undefined): string => {
      if (!isoString) return "";
      try {
        const date = typeof isoString === 'string' ? parseISO(isoString) : isoString;
        if (!isValid(date)) return "";
        return formatDateInTimezone(date, resolvedTimezone);
      } catch {
        return "";
      }
    };

    const extractTimeFromIso = (isoString: string | Date | null | undefined): string => {
      if (!isoString) return "";
      try {
        const date = typeof isoString === 'string' ? parseISO(isoString) : isoString;
        if (!isValid(date)) return "";
        return format(date, "HH:mm");
      } catch {
        return "";
      }
    };

    if (editActivity) {
      const editStartDate = extractDateFromIso(editActivity.startTime);
      const editStartTime = extractTimeFromIso(editActivity.startTime);
      const editEndTime = extractTimeFromIso(editActivity.endTime);
      const editCost = editActivity.cost != null ? String(editActivity.cost) : "";
      const editMaxCapacity = editActivity.maxCapacity != null ? String(editActivity.maxCapacity) : "";
      
      const hasVotingDeadline = Boolean(editActivity.votingDeadline);
      const votingDeadlineDate = extractDateFromIso(editActivity.votingDeadline);
      const votingDeadlineTime = extractTimeFromIso(editActivity.votingDeadline) || "23:59";

      const values: FormValues = {
        name: editActivity.name ?? "",
        description: sanitizeOptional(editActivity.description),
        startDate: editStartDate || normalizedStartDate,
        startTime: editStartTime,
        endTime: editEndTime,
        location: sanitizeOptional(editActivity.location),
        cost: editCost,
        maxCapacity: editMaxCapacity,
        attendeeIds: defaultAttendeeIds,
        category: (() => {
          const candidate = (editActivity.category ?? "other")?.toLowerCase?.() ?? "other";
          return ACTIVITY_CATEGORY_VALUES.includes(candidate as (typeof ACTIVITY_CATEGORY_VALUES)[number])
            ? candidate
            : "other";
        })(),
        enableVotingDeadline: hasVotingDeadline,
        votingDeadlineDate: votingDeadlineDate,
        votingDeadlineTime: votingDeadlineTime,
        bookingUrl: "",
      } satisfies FormValues;

      const initialMode = normalizeActivityTypeInput(editActivity.type, normalizedDefaultMode);
      return { values, mode: initialMode };
    }

    const values: FormValues = {
      name: prefill?.name ?? "",
      description: sanitizeOptional(prefill?.description),
      startDate: normalizedStartDate,
      startTime: sanitizeOptional(prefill?.startTime ?? ""),
      endTime: sanitizeOptional(prefill?.endTime ?? ""),
      location: sanitizeOptional(prefill?.location),
      cost: sanitizeOptional(prefill?.cost),
      maxCapacity: sanitizeOptional(prefill?.maxCapacity),
      attendeeIds: attendeePrefill?.length ? attendeePrefill : defaultAttendeeIds,
      category: (() => {
        const candidate = (prefill?.category ?? "other")?.toLowerCase?.() ?? "other";
        return ACTIVITY_CATEGORY_VALUES.includes(candidate as (typeof ACTIVITY_CATEGORY_VALUES)[number])
          ? candidate
          : "other";
      })(),
      enableVotingDeadline: false,
      votingDeadlineDate: "",
      votingDeadlineTime: "",
      bookingUrl: "",
    } satisfies FormValues;

    const initialMode = normalizeActivityTypeInput(prefill?.type, normalizedDefaultMode);

    return { values, mode: initialMode };
  }, [
    defaultAttendeeIds,
    normalizedDefaultMode,
    determineInitialStartDate,
    prefill,
    editActivity,
    resolvedTimezone,
  ]);

  const { values: defaultValues, mode: initialMode } = computeDefaults();

  const form = useForm<FormValues>({
    resolver: formResolver,
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: defaultValues,
  });

  const [mode, setMode] = useState<ActivityType>(initialMode);
  const [enableVotingDeadline, setEnableVotingDeadline] = useState(defaultValues.enableVotingDeadline);
  const [memberConflicts, setMemberConflicts] = useState<Record<string, { activityId: number; activityName: string; startTime: string | null; endTime: string | null }[]>>({});

  useEffect(() => {
    form.register("attendeeIds");
  }, [form]);

  useEffect(() => {
    if (open) {
      const { values, mode: nextMode } = computeDefaults();
      form.reset(values);
      setMode(nextMode);
      setEnableVotingDeadline(values.enableVotingDeadline);
    }
  }, [open, computeDefaults, form]);

  useEffect(() => {
    if (!allowModeToggle) {
      setMode(normalizedDefaultMode);
    }
  }, [allowModeToggle, normalizedDefaultMode]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const candidate = determineInitialStartDate();
    const trimmedCandidate = typeof candidate === "string" ? candidate.trim() : "";

    const fieldState = form.getFieldState("startDate");
    if (fieldState.isDirty) {
      return;
    }

    const currentValue = (form.getValues("startDate") ?? "").trim();
    if (currentValue === trimmedCandidate) {
      return;
    }

    form.setValue("startDate", trimmedCandidate, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [open, determineInitialStartDate, form]);

  const watchedAttendeeIds = form.watch("attendeeIds");
  const selectedAttendeeIds = useMemo(() => {
    const value = Array.isArray(watchedAttendeeIds) ? watchedAttendeeIds : [];
    return normalizeAttendeeIds(value).value;
  }, [watchedAttendeeIds]);

  useEffect(() => {
    if (mode === "SCHEDULED" && creatorMemberId) {
      const currentValue = form.getValues("attendeeIds");
      const attendees = new Set(
        normalizeAttendeeIds(Array.isArray(currentValue) ? currentValue : []).value,
      );
      if (!attendees.has(creatorMemberId)) {
        attendees.add(creatorMemberId);
        form.setValue("attendeeIds", Array.from(attendees), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    }
  }, [mode, creatorMemberId, form]);

  useEffect(() => {
    if (!open || selectedAttendeeIds.length === 0) {
      setMemberConflicts({});
      return;
    }

    const startDate = form.watch("startDate");
    const startTime = form.watch("startTime");
    const endTime = form.watch("endTime");

    if (!startDate || !startTime) {
      setMemberConflicts({});
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const startDateTime = `${startDate}T${startTime}`;
        const endDateTime = endTime ? `${startDate}T${endTime}` : null;

        const response = await apiRequest(`/api/trips/${tripId}/check-conflicts`, {
          method: "POST",
          body: JSON.stringify({
            userIds: selectedAttendeeIds,
            startTime: startDateTime,
            endTime: endDateTime,
          }),
          headers: {
            "Content-Type": "application/json",
          },
        });

        const conflicts = await response.json() as Record<string, { activityId: number; activityName: string; startTime: string | null; endTime: string | null }[]>;
        setMemberConflicts(conflicts || {});
      } catch (error) {
        console.error("Failed to check member conflicts:", error);
        setMemberConflicts({});
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [open, tripId, selectedAttendeeIds, form.watch("startDate"), form.watch("startTime"), form.watch("endTime")]);

  const formErrors = form.formState.errors;
  const requireStartTime = mode === "SCHEDULED";
  const watchedStartDate = form.watch("startDate") ?? "";
  const watchedStartTime = form.watch("startTime") ?? "";
  const normalizedWatchedStartTime =
    typeof watchedStartTime === "string" ? watchedStartTime.trim() : "";
  const isStartTimeMissing = requireStartTime && normalizedWatchedStartTime.length === 0;
  const hasFormErrors = Object.keys(formErrors).length > 0;
  const isStartDateOutsideTrip = useMemo(() => {
    const candidate = typeof watchedStartDate === "string" ? watchedStartDate.trim() : "";

    if (!candidate || !dateInputPattern.test(candidate)) {
      return false;
    }

    return !isDateWithinRange(candidate, startDateMin || null, startDateMax || null);
  }, [watchedStartDate, startDateMin, startDateMax]);

  useEffect(() => {
    if (mode !== "PROPOSE") {
      return;
    }

    const fieldState = form.getFieldState("startTime");
    if (!fieldState.error) {
      return;
    }

    form.clearErrors("startTime");
  }, [form, mode]);

  const handleValidationError = useCallback(
    (error: ActivityValidationError) => {
      if (error.fieldErrors.length > 0) {
        error.fieldErrors.forEach(({ field, message }) => {
          if (field === "type") {
            return;
          }

          form.setError(field as Exclude<keyof FormValues, "type">, {
            type: "server",
            message,
          });
        });

        const focusField = error.fieldErrors[0]?.field;
        if (focusField && focusField !== "type") {
          try {
            form.setFocus(focusField as Exclude<keyof FormValues, "type">);
          } catch (focusError) {
            console.error("Failed to focus field", focusError);
          }
        }
      }

      const message = error.formMessage ?? error.fieldErrors[0]?.message;
      if (message) {
        toast({
          title: "Please review the activity details",
          description: message,
          variant: "destructive",
        });
      }
    },
    [form, toast],
  );

  const handleSuccess = useCallback(
    (activity: ActivityWithDetails, values: ActivityCreateFormValues) => {
      onActivityCreated?.(activity);

      const submissionType = normalizeActivityTypeInput(values.type, normalizedDefaultMode);

      toast({
        title: submissionType === "PROPOSE" ? "Floated to group" : "Scheduled and invites sent",
        description:
          submissionType === "PROPOSE"
            ? "We shared this idea with your group for feedback."
            : "RSVPs are on the way to everyone selected.",
      });

      const { values: resetValues, mode: resetMode } = computeDefaults();
      form.reset(resetValues);
      setMode(resetMode);
      onOpenChange(false);
    },
    [computeDefaults, form, normalizedDefaultMode, onActivityCreated, onOpenChange, toast],
  );

  const createActivity = useCreateActivity({
    tripId,
    scheduledActivitiesQueryKey,
    proposalActivitiesQueryKey,
    calendarActivitiesQueryKey,
    members,
    currentUserId,
    enabled: tripId > 0,
    onValidationError: handleValidationError,
    onSuccess: handleSuccess,
  });

  const updateActivityMutation = useMutation({
    mutationFn: async (data: {
      activityId: number;
      name: string;
      description?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      location?: string | null;
      cost?: number | null;
      maxCapacity?: number | null;
      category?: string;
      votingDeadline?: string | null;
    }) => {
      const response = await apiRequest(`/api/activities/${data.activityId}`, {
        method: "PATCH",
        body: {
          name: data.name,
          description: data.description,
          startTime: data.startTime,
          endTime: data.endTime,
          location: data.location,
          cost: data.cost,
          maxCapacity: data.maxCapacity,
          category: data.category,
          votingDeadline: data.votingDeadline,
        },
      });
      return response.json();
    },
    onSuccess: (activity: ActivityWithDetails) => {
      queryClient.invalidateQueries({ queryKey: scheduledActivitiesQueryKey });
      queryClient.invalidateQueries({ queryKey: proposalActivitiesQueryKey });
      if (calendarActivitiesQueryKey) {
        queryClient.invalidateQueries({ queryKey: calendarActivitiesQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-proposals"] });

      onActivityUpdated?.(activity);
      toast({
        title: "Activity updated",
        description: "Your changes have been saved.",
      });

      const { values: resetValues, mode: resetMode } = computeDefaults();
      form.reset(resetValues);
      setMode(resetMode);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update activity",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateAttendeeSelection = useCallback(
    (nextSelection: string[]) => {
      form.setValue("attendeeIds", nextSelection, {
        shouldDirty: true,
        shouldValidate: true,
      });

      if (nextSelection.length > 0) {
        form.clearErrors("attendeeIds");
      }
    },
    [form],
  );

  const handleToggleAttendee = useCallback(
    (userId: string, checked: boolean | "indeterminate") => {
      const normalized = String(userId);
      if (mode === "SCHEDULED" && creatorMemberId && normalized === creatorMemberId && checked !== true) {
        return;
      }

      const currentValue = form.getValues("attendeeIds");
      const current = new Set(
        normalizeAttendeeIds(Array.isArray(currentValue) ? currentValue : []).value,
      );
      if (checked === true) {
        current.add(normalized);
      } else if (checked === false) {
        current.delete(normalized);
      }

      updateAttendeeSelection(Array.from(current));
    },
    [creatorMemberId, form, mode, updateAttendeeSelection],
  );

  const handleSelectAll = useCallback(() => {
    updateAttendeeSelection(defaultAttendeeIds);
  }, [defaultAttendeeIds, updateAttendeeSelection]);

  const handleClearAttendees = useCallback(() => {
    if (mode === "SCHEDULED" && creatorMemberId) {
      updateAttendeeSelection([creatorMemberId]);
      return;
    }

    updateAttendeeSelection([]);
  }, [creatorMemberId, mode, updateAttendeeSelection]);

  const submitForm = form.handleSubmit((values) => {
    const normalizedStart =
      typeof values.startTime === "string" ? values.startTime.trim() : "";
    const submissionMode = normalizeActivityTypeInput(mode, normalizedDefaultMode);

    if (submissionMode === "SCHEDULED" && normalizedStart.length === 0) {
      form.setError("startTime", {
        type: "manual",
        message: START_TIME_REQUIRED_MESSAGE,
      });
      try {
        form.setFocus("startTime");
      } catch (error) {
        console.error("Failed to focus start time field", error);
      }
      return;
    }

    const formValue = form.getValues("attendeeIds");
    const trackedAttendees = normalizeAttendeeIds(Array.isArray(formValue) ? formValue : []).value;
    const fallbackAttendees = normalizeAttendeeIds(values.attendeeIds).value;
    const attendeeBase = trackedAttendees.length > 0 ? trackedAttendees : fallbackAttendees;
    const attendeeSelectionSet = new Set(attendeeBase);

    if (submissionMode === "SCHEDULED" && creatorMemberId) {
      attendeeSelectionSet.add(creatorMemberId);
    }
    const attendeeSelection = Array.from(attendeeSelectionSet);

    // Compose voting deadline if enabled
    let votingDeadline: string | null = null;
    if (values.enableVotingDeadline && values.votingDeadlineDate) {
      const deadlineTime = values.votingDeadlineTime?.trim() || "23:59";
      const deadlineDateTime = new Date(`${values.votingDeadlineDate.trim()}T${deadlineTime}`);
      votingDeadline = deadlineDateTime.toISOString();
    }

    // Compute start/end times as ISO strings
    const startDateValue = values.startDate.trim();
    const startTimeIso = normalizedStart.length > 0 && startDateValue
      ? new Date(`${startDateValue}T${normalizedStart}`).toISOString()
      : null;
    const endTimeIso = values.endTime?.trim() && startDateValue
      ? new Date(`${startDateValue}T${values.endTime.trim()}`).toISOString()
      : null;

    // If in edit mode, call the update mutation
    if (isEditMode && editActivity) {
      const costValue = values.cost?.trim() ? normalizeCostInput(values.cost).value : null;
      const maxCapacityValue = values.maxCapacity?.trim() ? normalizeMaxCapacityInput(values.maxCapacity).value : null;

      updateActivityMutation.mutate({
        activityId: editActivity.id,
        name: values.name,
        description: values.description || null,
        startTime: startTimeIso,
        endTime: endTimeIso,
        location: values.location || null,
        cost: costValue,
        maxCapacity: maxCapacityValue,
        category: values.category,
        votingDeadline: votingDeadline,
      });
      return;
    }

    const sanitized: ActivityCreateFormValues = {
      name: values.name,
      description: values.description,
      startDate: values.startDate.trim(),
      startTime: normalizedStart.length > 0 ? normalizedStart : undefined,
      endTime: values.endTime?.trim() ? values.endTime : undefined,
      location: values.location,
      cost: values.cost?.trim() ? values.cost : undefined,
      maxCapacity: values.maxCapacity?.trim() ? values.maxCapacity : undefined,
      attendeeIds: attendeeSelection,
      category: values.category,
      type: submissionMode,
      votingDeadline: votingDeadline,
      bookingUrl: values.bookingUrl?.trim() || undefined,
    };

    createActivity.submit(sanitized);
  });

  const isSubmitting = createActivity.isPending || updateActivityMutation.isPending;
  const isSubmitDisabled = isSubmitting || isStartTimeMissing || hasFormErrors;

  const handleDialogChange = (next: boolean) => {
    if (!next) {
      const { values, mode: resetMode } = computeDefaults();
      onOpenChange(false);
      form.reset(values);
      setMode(resetMode);
      return;
    }

    onOpenChange(true);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit activity" : "Create an activity"}</DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? "Update the details of your floated idea."
              : "Choose whether you're floating an idea or locking plans onto the schedule."
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submitForm} className="space-y-6">
          {/* Error Banner */}
          {hasFormErrors && (
            <div className="rounded-lg bg-red-50 p-3">
              <p className="mb-1 text-sm font-medium text-red-800">Please fix the highlighted fields.</p>
            </div>
          )}

          {/* Activity Type Toggle */}
          <TimingStep
            form={form}
            formErrors={form.formState.errors}
            mode={mode}
            allowModeToggle={isEditMode ? false : allowModeToggle}
            onModeChange={(newMode) => setMode(normalizeActivityTypeInput(newMode, normalizedDefaultMode))}
            startDateMin={startDateMin}
            startDateMax={startDateMax}
            dateRangeHint={dateRangeHint}
            isStartDateOutsideTrip={isStartDateOutsideTrip}
          />

          {/* Location & Category */}
          <BasicInfoStep
            form={form}
            formErrors={form.formState.errors}
          />

          {/* Extras (Description, Cost, Capacity, Voting Deadline) */}
          <ExtrasStep
            form={form}
            formErrors={form.formState.errors}
            mode={mode}
            enableVotingDeadline={enableVotingDeadline}
            onToggleVotingDeadline={(enabled) => {
              setEnableVotingDeadline(enabled);
              form.setValue("enableVotingDeadline", enabled);
            }}
          />

          {/* Who's Going */}
          <AttendeesStep
            form={form}
            formErrors={form.formState.errors}
            mode={mode}
            memberOptions={memberOptions as StepMemberOption[]}
            selectedAttendeeIds={selectedAttendeeIds}
            memberConflicts={memberConflicts}
            onToggleAttendee={handleToggleAttendee}
            onSelectAll={handleSelectAll}
            onClearAttendees={handleClearAttendees}
            creatorMemberId={creatorMemberId}
            defaultAttendeeIds={defaultAttendeeIds}
          />

          {/* Form Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-neutral-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogChange(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              className="bg-primary text-white hover:bg-red-600"
              disabled={isSubmitDisabled}
              data-testid="button-submit"
            >
              {isSubmitting 
                ? "Saving..." 
                : isEditMode 
                  ? "Save changes" 
                  : mode === "PROPOSE" 
                    ? "Propose to group" 
                    : "Add to schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

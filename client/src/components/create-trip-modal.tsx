import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTripCalendarSchema } from "@shared/schema";
import { z } from "zod";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { buildApiUrl } from "@/lib/api";
import { useLocation } from "wouter";
import SmartLocationSearch from "@/components/SmartLocationSearch";
import { AlertCircle, Loader2 } from "lucide-react";
import { CoverPhotoSection, type CoverPhotoValue } from "@/components/cover-photo-section";
import { createCoverPhotoBannerFile } from "@/lib/coverPhotoProcessing";

interface CreateTripModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formSchema = insertTripCalendarSchema
  .extend({
    name: z.string().trim().min(1, "Trip name is required"),
    destination: z.string().trim().min(1, "Destination is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
  })
  .superRefine((data, ctx) => {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (Number.isNaN(startDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start date must be a valid date",
        path: ["startDate"],
      });
    }

    if (Number.isNaN(endDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be a valid date",
        path: ["endDate"],
      });
    }

    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date cannot be before start date",
        path: ["endDate"],
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

export function CreateTripModal({ open, onOpenChange }: CreateTripModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingCoverPhotoFile, setPendingCoverPhotoFile] = useState<File | null>(null);
  const [pendingCoverPhotoMeta, setPendingCoverPhotoMeta] = useState<
    { size: number; type: string } | null
  >(null);
  const [isUploadingCoverPhoto, setIsUploadingCoverPhoto] = useState(false);

  const getCreateTripErrorMessage = useCallback((error: unknown): string => {
    if (error instanceof ApiError) {
      if (error.status === 403) {
        return "You don't have permission to create a trip.";
      }

      if (error.status === 400 || error.status === 422) {
        const backendMessage =
          error.data && typeof error.data === "object" && "message" in error.data && typeof error.data.message === "string"
            ? error.data.message.trim()
            : "";

        if (backendMessage && !/database|sql|constraint|column|insert/i.test(backendMessage)) {
          return backendMessage;
        }

        return "Please check the form fields and try again.";
      }

      if (error.status >= 500) {
        return "Something went wrong. Please try again.";
      }

      const fallbackMessage =
        error.data && typeof error.data === "object" && "message" in error.data && typeof error.data.message === "string"
          ? error.data.message.trim()
          : "";

      if (fallbackMessage && !/database|sql|constraint|column|insert/i.test(fallbackMessage)) {
        return fallbackMessage;
      }
    }

    if (error instanceof Error && error.message.trim().length > 0 && !/database|sql|constraint|column|insert/i.test(error.message)) {
      return error.message;
    }

    return "Failed to create trip. Please try again.";
  }, []);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      destination: "",
      startDate: "",
      endDate: "",
      geonameId: null,
      cityName: null,
      countryName: null,
      latitude: null,
      longitude: null,
      population: null,
      coverImageUrl: null,
      coverPhotoUrl: null,
      coverPhotoCardUrl: null,
      coverPhotoThumbUrl: null,
      coverPhotoAlt: null,
      coverPhotoAttribution: null,
      coverPhotoStorageKey: null,
      coverPhotoOriginalUrl: null,
      coverPhotoFocalX: 0.5,
      coverPhotoFocalY: 0.5,
      coverPhotoUploadSize: null,
      coverPhotoUploadType: null,
    },
  });

  const createTripMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const response = await apiRequest("/api/trips", {
        method: "POST",
        body: {
          ...data,
          name: data.name.trim(),
          destination: data.destination.trim(),
        },
      });
      return response.json();
    },
    onSuccess: async (trip) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/trips"] });

      queryClient.setQueryData(["/api/trips"], (oldData: any) => {
        if (!oldData) return [trip];
        return [...oldData, trip];
      });

      toast({
        title: "Trip created!",
        description: "Your new trip has been created successfully.",
      });
      
      form.reset();
      setSelectedDestination(null);
      setFormError(null);
      setPendingCoverPhotoFile(null);
      setPendingCoverPhotoMeta(null);
      setIsUploadingCoverPhoto(false);

      const rawTripId =
        trip && typeof trip === "object"
          ? (trip as { id?: unknown; trip?: { id?: unknown } }).id ??
            (trip as { id?: unknown; trip?: { id?: unknown } }).trip?.id
          : null;
      const tripId = typeof rawTripId === "number" ? rawTripId : Number(rawTripId);

      if (!Number.isFinite(tripId) || tripId <= 0) {
        setFormError("Trip was created, but we couldn't open it automatically. Please refresh and try again.");
        toast({
          title: "Trip created",
          description: "We created your trip, but couldn't determine its ID for navigation.",
          variant: "destructive",
        });
        return;
      }

      setLocation(`/trip/${tripId}`);
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      console.error("Trip creation error:", error);
      if (error instanceof ApiError && error.status === 401) {
        toast({
          title: "Session expired",
          description: "Your session has expired. Redirecting to login...",
          variant: "destructive",
        });
        return;
      }

      const errorMessage = getCreateTripErrorMessage(error);
      setFormError(errorMessage);

      toast({
        title: "Unable to create trip",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: FormData) => {
    if (createTripMutation.isPending || isUploadingCoverPhoto) {
      return;
    }

    setFormError(null);

    let uploadResult: UploadResponse | null = null;
    const normalizedFocalX = toNumericOrNull(data.coverPhotoFocalX);
    const normalizedFocalY = toNumericOrNull(data.coverPhotoFocalY);

    try {
      if (pendingCoverPhotoFile) {
        setIsUploadingCoverPhoto(true);

        let fileToUpload = pendingCoverPhotoFile;
        try {
          fileToUpload = await createCoverPhotoBannerFile(
            pendingCoverPhotoFile,
            typeof normalizedFocalX === "number" ? normalizedFocalX : 0.5,
            typeof normalizedFocalY === "number" ? normalizedFocalY : 0.5,
          );
        } catch (processingError) {
          console.error("Failed to prepare cover photo", processingError);
          setIsUploadingCoverPhoto(false);
          const message =
            processingError instanceof Error && processingError.message
              ? processingError.message
              : "Couldn't process that image. Try another one.";
          toast({
            title: "Unable to upload cover photo",
            description: message,
            variant: "destructive",
          });
          return;
        }

        try {
          uploadResult = await uploadCoverPhoto(fileToUpload);
        } catch (uploadError) {
          setIsUploadingCoverPhoto(false);
          const message =
            uploadError instanceof Error && uploadError.message
              ? uploadError.message
              : "Couldn't upload that image. Please try again.";
          toast({
            title: "Unable to upload cover photo",
            description: message,
            variant: "destructive",
          });
          return;
        }
      }

      const tripName = data.name.trim();
      const payload: FormData = {
        ...data,
        name: tripName,
        destination: data.destination.trim(),
        coverPhotoFocalX: normalizedFocalX,
        coverPhotoFocalY: normalizedFocalY,
        coverPhotoUploadSize: pendingCoverPhotoMeta?.size ?? null,
        coverPhotoUploadType: pendingCoverPhotoMeta?.type ?? null,
        coverPhotoAlt: data.coverPhotoAlt || `${tripName} cover photo`,
      };

      if (uploadResult) {
        payload.coverPhotoUrl = uploadResult.publicUrl;
        payload.coverImageUrl = uploadResult.publicUrl;
        payload.coverPhotoOriginalUrl = uploadResult.publicUrl;
        payload.coverPhotoStorageKey = uploadResult.storageKey;
        payload.coverPhotoCardUrl = null;
        payload.coverPhotoThumbUrl = null;
      }

      await createTripMutation.mutateAsync(payload);

      if (uploadResult) {
        setPendingCoverPhotoFile(null);
        setPendingCoverPhotoMeta(null);
      }
    } catch (error) {
      if (uploadResult?.storageKey) {
        await deleteUploadedFile(uploadResult.storageKey);
      }
    } finally {
      setIsUploadingCoverPhoto(false);
    }
  };

  const destinationValue = form.watch("destination");

  useEffect(() => {
    form.register("destination");
    return () => {
      form.unregister("destination");
    };
  }, [form]);

  const resetLocationMetadata = useCallback(() => {
    form.setValue("geonameId", null);
    form.setValue("cityName", null);
    form.setValue("countryName", null);
    form.setValue("latitude", null);
    form.setValue("longitude", null);
    form.setValue("population", null);
  }, [form]);

  type UploadResponse = {
    storageKey: string;
    publicUrl: string;
    size: number;
    mimeType: string;
  };

  const uploadCoverPhoto = useCallback(async (file: File): Promise<UploadResponse> => {
    const response = await fetch(buildApiUrl("/api/uploads/cover-photo"), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Filename": file.name,
        "X-Content-Type": file.type,
      },
      body: file,
      credentials: "include",
    });

    const text = await response.text();
    if (!response.ok) {
      let message = text || "Couldn't upload that image.";
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) {
          message = parsed.message;
        }
      } catch {
        // ignore parse error
      }
      throw new Error(message);
    }

    try {
      const payload = JSON.parse(text);
      return {
        storageKey: payload.storageKey,
        publicUrl: payload.publicUrl,
        size: payload.size,
        mimeType: payload.mimeType,
      };
    } catch {
      throw new Error("Couldn't upload that image. Please try again.");
    }
  }, []);

  const deleteUploadedFile = useCallback(async (storageKey: string) => {
    if (!storageKey) {
      return;
    }

    try {
      await fetch(
        buildApiUrl(`/api/uploads/cover-photo/${encodeURIComponent(storageKey)}`),
        {
          method: "DELETE",
          credentials: "include",
        },
      );
    } catch {
      // ignore cleanup error
    }
  }, []);

  const handleCoverPhotoChange = useCallback(
    (next: CoverPhotoValue) => {
      form.setValue("coverImageUrl", next.coverPhotoUrl ?? null, { shouldDirty: true });
      form.setValue("coverPhotoUrl", next.coverPhotoUrl ?? null, { shouldDirty: true });
      form.setValue("coverPhotoCardUrl", next.coverPhotoCardUrl ?? null, { shouldDirty: true });
      form.setValue("coverPhotoThumbUrl", next.coverPhotoThumbUrl ?? null, { shouldDirty: true });
      form.setValue("coverPhotoAlt", next.coverPhotoAlt ?? null, { shouldDirty: true });
      form.setValue("coverPhotoAttribution", next.coverPhotoAttribution ?? null, { shouldDirty: true });
      form.setValue("coverPhotoStorageKey", next.coverPhotoStorageKey ?? null, { shouldDirty: true });
      form.setValue("coverPhotoOriginalUrl", next.coverPhotoOriginalUrl ?? null, { shouldDirty: true });
      if (typeof next.coverPhotoFocalX === "number") {
        form.setValue("coverPhotoFocalX", next.coverPhotoFocalX, { shouldDirty: true });
      }
      if (typeof next.coverPhotoFocalY === "number") {
        form.setValue("coverPhotoFocalY", next.coverPhotoFocalY, { shouldDirty: true });
      }
    },
    [form],
  );

  const handlePendingFileChange = useCallback(
    (file: File | null, _previewUrl: string | null) => {
      setPendingCoverPhotoFile(file);
      if (file) {
        setPendingCoverPhotoMeta({ size: file.size, type: file.type });
        form.setValue("coverPhotoUploadSize", file.size, { shouldDirty: true });
        form.setValue("coverPhotoUploadType", file.type, { shouldDirty: true });
        form.setValue("coverPhotoStorageKey", null, { shouldDirty: true });
      } else {
        setPendingCoverPhotoMeta(null);
        form.setValue("coverPhotoUploadSize", null, { shouldDirty: true });
        form.setValue("coverPhotoUploadType", null, { shouldDirty: true });
        form.setValue("coverPhotoStorageKey", null, { shouldDirty: true });
      }
    },
    [form],
  );

  const toNumericOrNull = (value: unknown) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string" && value !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const watchedCoverPhotoUrl = form.watch("coverPhotoUrl");
  const watchedCoverImageUrl = form.watch("coverImageUrl");
  const watchedCoverPhotoOriginalUrl = form.watch("coverPhotoOriginalUrl");

  const resolvedCoverPhotoUrl =
    watchedCoverPhotoUrl ?? watchedCoverPhotoOriginalUrl ?? watchedCoverImageUrl ?? null;
  const resolvedCoverPhotoOriginalUrl =
    watchedCoverPhotoOriginalUrl ?? watchedCoverPhotoUrl ?? watchedCoverImageUrl ?? null;

  const coverPhotoValue: CoverPhotoValue = {
    coverPhotoUrl: resolvedCoverPhotoUrl,
    coverPhotoCardUrl: form.watch("coverPhotoCardUrl") ?? null,
    coverPhotoThumbUrl: form.watch("coverPhotoThumbUrl") ?? null,
    coverPhotoAlt: form.watch("coverPhotoAlt") ?? null,
    coverPhotoAttribution: form.watch("coverPhotoAttribution") ?? null,
    coverPhotoStorageKey: form.watch("coverPhotoStorageKey") ?? null,
    coverPhotoOriginalUrl: resolvedCoverPhotoOriginalUrl,
    coverPhotoFocalX: toNumericOrNull(form.watch("coverPhotoFocalX")),
    coverPhotoFocalY: toNumericOrNull(form.watch("coverPhotoFocalY")),
  };

  const watchedTripName = form.watch("name");
  const defaultCoverPhotoAlt = watchedTripName?.trim().length
    ? `${watchedTripName.trim()} cover photo`
    : "Trip cover photo";

  const isCoverPhotoBusy = isUploadingCoverPhoto || createTripMutation.isPending;
  const submitButtonLabel = isUploadingCoverPhoto
    ? "Uploading..."
    : createTripMutation.isPending
      ? "Creating..."
      : "Create Trip";

  const handleDestinationSelect = useCallback(
    (location: any) => {
      setSelectedDestination(location);

      const destinationText = location?.displayName || location?.label || location?.name || "";
      form.setValue("destination", destinationText, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.clearErrors("destination");

      const geonameIdValue =
        location?.geonameId !== undefined && location?.geonameId !== null
          ? Number(location.geonameId)
          : null;
      form.setValue("geonameId", Number.isFinite(geonameIdValue ?? NaN) ? geonameIdValue : null);
      form.setValue("cityName", location?.cityName ?? location?.name ?? null);
      form.setValue(
        "countryName",
        location?.countryName ?? location?.country ?? null,
      );
      const latitudeValue =
        typeof location?.latitude === "number"
          ? location.latitude
          : location?.latitude
            ? Number(location.latitude)
            : null;
      const longitudeValue =
        typeof location?.longitude === "number"
          ? location.longitude
          : location?.longitude
            ? Number(location.longitude)
            : null;
      form.setValue("latitude", Number.isFinite(latitudeValue ?? NaN) ? latitudeValue : null);
      form.setValue("longitude", Number.isFinite(longitudeValue ?? NaN) ? longitudeValue : null);
      const populationValue =
        typeof location?.population === "number"
          ? location.population
          : location?.population
            ? Number(location.population)
            : null;
      form.setValue("population", Number.isFinite(populationValue ?? NaN) ? populationValue : null);
    },
    [form],
  );

  const handleDestinationQueryChange = useCallback(
    (value: string) => {
      form.setValue("destination", value, {
        shouldDirty: true,
        shouldValidate: false,
      });

      const trimmed = value.trim();
      const selectedLabel =
        selectedDestination?.displayName ||
        selectedDestination?.label ||
        selectedDestination?.name ||
        "";
      const normalizedSelectedLabel = selectedLabel.trim().toLowerCase();
      const normalizedTrimmed = trimmed.toLowerCase();

      if (!trimmed) {
        setSelectedDestination(null);
        resetLocationMetadata();
        return;
      }

      form.clearErrors("destination");

      if (
        selectedDestination &&
        normalizedTrimmed.length > 0 &&
        normalizedTrimmed !== normalizedSelectedLabel
      ) {
        setSelectedDestination(null);
        resetLocationMetadata();
      }
    },
    [form, resetLocationMetadata, selectedDestination],
  );

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    form.reset();
    setSelectedDestination(null);
    setFormError(null);
    setPendingCoverPhotoFile(null);
    setPendingCoverPhotoMeta(null);
    setIsUploadingCoverPhoto(false);
  }, [form, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md max-h-[85vh] flex flex-col overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-semibold">Create New Trip</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0" aria-busy={isCoverPhotoBusy}>
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            <input type="hidden" {...form.register("coverImageUrl")} />
            <input type="hidden" {...form.register("coverPhotoUrl")} />
            <input type="hidden" {...form.register("coverPhotoCardUrl")} />
            <input type="hidden" {...form.register("coverPhotoThumbUrl")} />
            <input type="hidden" {...form.register("coverPhotoAlt")} />
            <input type="hidden" {...form.register("coverPhotoAttribution")} />
            <input type="hidden" {...form.register("coverPhotoStorageKey")} />
            <input type="hidden" {...form.register("coverPhotoOriginalUrl")} />
            <input type="hidden" {...form.register("coverPhotoFocalX", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("coverPhotoFocalY", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("coverPhotoUploadSize", { valueAsNumber: true })} />
            <input type="hidden" {...form.register("coverPhotoUploadType")} />

            {formError && (
              <Alert variant="destructive" role="alert" className="text-left">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Unable to create trip</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="font-semibold">Trip Name</Label>
              <Input
                id="name"
                placeholder="e.g., Japan Adventure 2025"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="destination" className="font-semibold">Destination</Label>
              <SmartLocationSearch
                id="destination"
                placeholder="e.g., Tokyo, Japan"
                value={destinationValue ?? ""}
                allowedTypes={["city"]}
                onLocationSelect={handleDestinationSelect}
                onQueryChange={handleDestinationQueryChange}
              />
              {form.formState.errors.destination && (
                <p className="text-sm text-red-600">{form.formState.errors.destination.message}</p>
              )}
            </div>

            <CoverPhotoSection
              value={coverPhotoValue}
              onChange={handleCoverPhotoChange}
              defaultAltText={defaultCoverPhotoAlt}
              onPendingFileChange={handlePendingFileChange}
              isBusy={isCoverPhotoBusy}
              label="Cover Photo"
              searchQuery={selectedDestination?.name || form.watch("destination") || ""}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startDate" className="font-semibold">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...form.register("startDate")}
                />
                {form.formState.errors.startDate && (
                  <p className="text-sm text-red-600">{form.formState.errors.startDate.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate" className="font-semibold">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  {...form.register("endDate")}
                />
                {form.formState.errors.endDate && (
                  <p className="text-sm text-red-600">{form.formState.errors.endDate.message}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isCoverPhotoBusy}
              aria-live="polite"
            >
              {isCoverPhotoBusy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {submitButtonLabel}
                </span>
              ) : (
                submitButtonLabel
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

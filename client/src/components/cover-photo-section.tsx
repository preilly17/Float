import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nanoid } from "nanoid";
import { ImageIcon, Search, Upload, X } from "lucide-react";
import { PhotoSearchModal, type PhotoResult } from "@/components/photo-search-modal";
import {
  COVER_PHOTO_MAX_FILE_SIZE_BYTES,
  COVER_PHOTO_MAX_FILE_SIZE_MB,
  COVER_PHOTO_MIN_HEIGHT,
  COVER_PHOTO_MIN_WIDTH,
} from "@shared/constants";
import { resolveMediaUrl } from "@/lib/media";

const ACCEPTED_FILE_TYPES =
  "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const loadImageDimensions = (src: string): Promise<{
  width: number;
  height: number;
}> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = src;
  });

export type CoverPhotoValue = {
  coverPhotoUrl: string | null;
  coverPhotoCardUrl?: string | null;
  coverPhotoThumbUrl?: string | null;
  coverPhotoAlt: string | null;
  coverPhotoAttribution?: string | null;
  coverPhotoStorageKey: string | null;
  coverPhotoOriginalUrl: string | null;
  coverPhotoFocalX: number | null;
  coverPhotoFocalY: number | null;
};

interface CoverPhotoSectionProps {
  value: CoverPhotoValue;
  onChange: (value: CoverPhotoValue) => void;
  defaultAltText: string;
  onPendingFileChange: (file: File | null, previewUrl: string | null) => void;
  isBusy?: boolean;
  label?: string;
  uploadButtonLabel?: string;
  searchQuery?: string;
}

type SelectedFileInfo = {
  name: string;
  size: number;
  width?: number;
  height?: number;
  previewUrl?: string;
};

const buildFileName = (label: string, extension: string) => {
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${normalized || "cover-photo"}-${nanoid(6)}${extension}`;
};

const createFileFromUrl = async (
  url: string,
  label: string,
): Promise<File> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to fetch remote image");
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error("UNSUPPORTED_TYPE");
  }
  const extension =
    mimeType === "image/png"
      ? ".png"
      : mimeType === "image/webp"
        ? ".webp"
        : ".jpg";
  return new File([blob], buildFileName(label, extension), { type: mimeType });
};

export function CoverPhotoSection({
  value,
  onChange,
  defaultAltText,
  onPendingFileChange,
  isBusy = false,
  label,
  searchQuery = "",
}: CoverPhotoSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isFetchingRemote, setIsFetchingRemote] = useState(false);
  const [selectedFileInfo, setSelectedFileInfo] = useState<SelectedFileInfo | null>(null);
  const [isPhotoSearchOpen, setIsPhotoSearchOpen] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const handlePhotoSelect = useCallback(
    async (photo: PhotoResult) => {
      setIsFetchingRemote(true);
      setError(null);
      try {
        const file = await createFileFromUrl(photo.largeUrl, photo.alt || "cover-photo");
        const objectUrl = URL.createObjectURL(file);
        try {
          const dimensions = await loadImageDimensions(objectUrl);
          setSelectedFileInfo({
            name: `Photo by ${photo.photographer}`,
            size: file.size,
            width: dimensions.width,
            height: dimensions.height,
            previewUrl: objectUrl,
          });
          const photoAlt = photo.alt || `Photo by ${photo.photographer}`;
          onPendingFileChange(file, objectUrl);
          onChange({
            ...value,
            coverPhotoAlt: photoAlt,
            coverPhotoAttribution: `Photo by ${photo.photographer} on Pexels`,
            coverPhotoStorageKey: null,
            coverPhotoFocalX: 0.5,
            coverPhotoFocalY: 0.5,
          });
        } catch {
          URL.revokeObjectURL(objectUrl);
          throw new Error("Failed to load image dimensions");
        }
      } catch (fetchError) {
        console.error("Failed to fetch photo from Pexels:", fetchError);
        setError("Failed to load the selected photo. Please try another one.");
      } finally {
        setIsFetchingRemote(false);
      }
    },
    [onPendingFileChange, onChange, value]
  );

  const hasPersistedImage = Boolean(
    value.coverPhotoUrl || value.coverPhotoOriginalUrl,
  );
  const hasPendingFile = Boolean(selectedFileInfo);
  const hasImage = hasPendingFile || hasPersistedImage;

  useEffect(() => {
    if (!hasPendingFile) {
      setWarning(null);
      setError(null);
    }
  }, [value.coverPhotoUrl, value.coverPhotoOriginalUrl, value.coverPhotoStorageKey, hasPendingFile]);

  const updateValue = useCallback(
    (patch: Partial<CoverPhotoValue>) => {
      onChange({
        coverPhotoUrl: patch.coverPhotoUrl ?? value.coverPhotoUrl ?? null,
        coverPhotoCardUrl:
          patch.coverPhotoCardUrl ?? value.coverPhotoCardUrl ?? null,
        coverPhotoThumbUrl:
          patch.coverPhotoThumbUrl ?? value.coverPhotoThumbUrl ?? null,
        coverPhotoAlt: patch.coverPhotoAlt ?? value.coverPhotoAlt ?? null,
        coverPhotoAttribution:
          patch.coverPhotoAttribution ?? value.coverPhotoAttribution ?? null,
        coverPhotoStorageKey:
          patch.coverPhotoStorageKey ?? value.coverPhotoStorageKey ?? null,
        coverPhotoOriginalUrl:
          patch.coverPhotoOriginalUrl ?? value.coverPhotoOriginalUrl ?? null,
        coverPhotoFocalX:
          typeof patch.coverPhotoFocalX === "number"
            ? patch.coverPhotoFocalX
            : typeof value.coverPhotoFocalX === "number"
              ? value.coverPhotoFocalX
              : 0.5,
        coverPhotoFocalY:
          typeof patch.coverPhotoFocalY === "number"
            ? patch.coverPhotoFocalY
            : typeof value.coverPhotoFocalY === "number"
              ? value.coverPhotoFocalY
              : 0.5,
      });
    },
    [onChange, value],
  );

  const applyFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        setError("Use JPG, PNG, or WebP format.");
        return;
      }

      if (file.size > COVER_PHOTO_MAX_FILE_SIZE_BYTES) {
        setError(`File exceeds ${COVER_PHOTO_MAX_FILE_SIZE_MB}MB limit.`);
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      try {
        const dimensions = await loadImageDimensions(objectUrl);
        const belowMinimum =
          dimensions.width < COVER_PHOTO_MIN_WIDTH ||
          dimensions.height < COVER_PHOTO_MIN_HEIGHT;

        if (belowMinimum) {
          setWarning(`Low resolution (${dimensions.width}×${dimensions.height})`);
        } else {
          setWarning(null);
        }
        setError(null);
        setSelectedFileInfo({
          name: file.name,
          size: file.size,
          width: dimensions.width,
          height: dimensions.height,
          previewUrl: objectUrl,
        });
        onPendingFileChange(file, objectUrl);
        updateValue({
          coverPhotoAlt: defaultAltText,
          coverPhotoStorageKey: null,
          coverPhotoOriginalUrl: value.coverPhotoOriginalUrl ?? null,
          coverPhotoFocalX: 0.5,
          coverPhotoFocalY: 0.5,
        });
      } catch {
        URL.revokeObjectURL(objectUrl);
        setError("Couldn't read this image.");
      }
    },
    [defaultAltText, onPendingFileChange, updateValue, value.coverPhotoOriginalUrl],
  );

  const handleFileInput = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      await applyFile(file);
      event.target.value = "";
    },
    [applyFile],
  );

  const openFilePicker = useCallback(() => {
    if (isBusy || isFetchingRemote) {
      return;
    }
    const input = fileInputRef.current;
    if (!input) {
      return;
    }
    try {
      if (typeof input.showPicker === "function") {
        input.showPicker();
      } else {
        input.click();
      }
    } catch {
      input.click();
    }
  }, [isBusy, isFetchingRemote]);

  const handleRemove = useCallback(() => {
    if (selectedFileInfo?.previewUrl) {
      URL.revokeObjectURL(selectedFileInfo.previewUrl);
    }
    setWarning(null);
    setError(null);
    setSelectedFileInfo(null);
    onPendingFileChange(null, null);
    updateValue({
      coverPhotoUrl: null,
      coverPhotoCardUrl: null,
      coverPhotoThumbUrl: null,
      coverPhotoAlt: null,
      coverPhotoAttribution: null,
      coverPhotoStorageKey: null,
      coverPhotoOriginalUrl: null,
      coverPhotoFocalX: 0.5,
      coverPhotoFocalY: 0.5,
    });
  }, [selectedFileInfo, onPendingFileChange, updateValue]);

  const persistedPreviewSrc = resolveMediaUrl(value.coverPhotoUrl || value.coverPhotoOriginalUrl);
  const previewSrc = selectedFileInfo?.previewUrl || persistedPreviewSrc;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewSrc]);

  return (
    <div className="space-y-2">
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        className="hidden"
        onChange={handleFileInput}
        aria-hidden="true"
      />

      <div className="flex items-center justify-between">
        <Label className="font-semibold">{label ?? "Cover Photo"}</Label>
        {hasImage && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isBusy || isFetchingRemote}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/50">
        {previewSrc && !previewFailed ? (
          <div className="relative aspect-[16/9] w-full">
            <img
              src={previewSrc}
              alt="Cover preview"
              className="w-full h-full object-cover"
              onError={() => {
                console.warn("Cover preview image failed to load", {
                  src: previewSrc,
                });
                setPreviewFailed(true);
              }}
            />
            {warning && (
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-amber-500/90 text-white text-xs rounded">
                {warning}
              </div>
            )}
          </div>
        ) : (
          <div className="aspect-[16/9] w-full flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
            <ImageIcon className="h-10 w-10" />
            <span className="text-sm">No cover photo</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openFilePicker}
          disabled={isBusy || isFetchingRemote}
          className="flex-1 gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsPhotoSearchOpen(true)}
          disabled={isBusy || isFetchingRemote}
          className="flex-1 gap-2"
        >
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <PhotoSearchModal
        open={isPhotoSearchOpen}
        onOpenChange={setIsPhotoSearchOpen}
        onSelectPhoto={handlePhotoSelect}
        initialQuery={searchQuery}
      />
    </div>
  );
}

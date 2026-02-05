import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Loader2, ImageIcon, ExternalLink } from "lucide-react";

interface PhotoResult {
  id: string;
  url: string;
  thumbnailUrl: string;
  mediumUrl: string;
  largeUrl: string;
  photographer: string;
  photographerUrl: string;
  alt: string;
  avgColor: string;
  width: number;
  height: number;
}

interface PhotoSearchResponse {
  photos: PhotoResult[];
  totalResults: number;
  hasMore: boolean;
}

interface PhotoSearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectPhoto: (photo: PhotoResult) => void;
  initialQuery?: string;
}

export function PhotoSearchModal({
  open,
  onOpenChange,
  onSelectPhoto,
  initialQuery = "",
}: PhotoSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (open && initialQuery) {
      setSearchQuery(initialQuery);
      setDebouncedQuery(initialQuery);
    }
  }, [open, initialQuery]);

  const { data: statusData } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/photos/status"],
    enabled: open,
  });

  const { data, isLoading, isFetching } = useQuery<PhotoSearchResponse>({
    queryKey: ["/api/photos/search", debouncedQuery, page],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        return { photos: [], totalResults: 0, hasMore: false };
      }
      const params = new URLSearchParams({
        q: debouncedQuery,
        page: String(page),
      });
      const response = await fetch(`/api/photos/search?${params}`);
      if (!response.ok) {
        throw new Error("Failed to search photos");
      }
      return response.json();
    },
    enabled: open && Boolean(debouncedQuery) && debouncedQuery.length >= 2 && statusData?.configured === true,
  });

  const handleSelect = useCallback(
    (photo: PhotoResult) => {
      onSelectPhoto(photo);
      onOpenChange(false);
    },
    [onSelectPhoto, onOpenChange]
  );

  const isConfigured = statusData?.configured === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Search Cover Photos
          </DialogTitle>
          <DialogDescription>
            Search for beautiful photos from Pexels to use as your trip cover
          </DialogDescription>
        </DialogHeader>

        {!isConfigured ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ImageIcon className="w-12 h-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Photo Search Not Available
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Photo search requires a Pexels API key. You can still upload your own photos.
            </p>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search for photos (e.g., Australia, beach, mountains)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
              )}
            </div>

            <div className="flex-1 overflow-y-auto mt-4">
              {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-video rounded-lg" />
                  ))}
                </div>
              ) : data?.photos && data.photos.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {data.photos.map((photo) => (
                      <button
                        key={photo.id}
                        type="button"
                        onClick={() => handleSelect(photo)}
                        className="group relative aspect-video rounded-lg overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 focus:outline-none transition-all"
                        style={{ backgroundColor: photo.avgColor }}
                      >
                        <img
                          src={photo.thumbnailUrl}
                          alt={photo.alt}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute bottom-0 left-0 right-0 p-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="truncate block">by {photo.photographer}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {data.hasMore && (
                    <div className="flex justify-center mt-4">
                      <Button
                        variant="outline"
                        onClick={() => setPage((p) => p + 1)}
                        disabled={isFetching}
                      >
                        {isFetching ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          "Load more photos"
                        )}
                      </Button>
                    </div>
                  )}

                  <p className="text-xs text-center text-slate-400 mt-4">
                    Photos provided by{" "}
                    <a
                      href="https://www.pexels.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-slate-600"
                    >
                      Pexels
                      <ExternalLink className="w-3 h-3 inline ml-1" />
                    </a>
                  </p>
                </>
              ) : debouncedQuery.length >= 2 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ImageIcon className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-slate-500">
                    No photos found for "{debouncedQuery}"
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    Try a different search term
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Search className="w-10 h-10 text-slate-300 mb-3" />
                  <p className="text-slate-500">
                    Type a destination to search for photos
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    e.g., "Australia", "Paris", "beach sunset"
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { PhotoResult };

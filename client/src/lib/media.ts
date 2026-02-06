import { buildApiUrl } from "@/lib/api";

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

export const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  if (isAbsoluteUrl(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return buildApiUrl(trimmed);
  }

  return trimmed;
};

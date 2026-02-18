import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { buildApiUrl } from "./api";

const shouldLogApiDebug =
  import.meta.env.DEV || import.meta.env.VITE_DEBUG_API === "true";

const redactHeaders = (headers: Record<string, string>): Record<string, string> => {
  const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "x-auth-token"]);

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
        return [key, "[REDACTED]"];
      }
      return [key, value];
    }),
  );
};

const sanitizePayload = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    try {
      return sanitizePayload(JSON.parse(value));
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item));
  }

  if (typeof value === "object") {
    const SENSITIVE_KEYS = new Set([
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "authorization",
      "cookie",
    ]);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
        if (SENSITIVE_KEYS.has(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, sanitizePayload(entryValue)];
      }),
    );
  }

  return value;
};

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const generateRequestId = (): string => {
  try {
    if (typeof crypto !== "undefined") {
      if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }

      if (typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      }
    }
  } catch {
    // ignore
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

async function throwIfResNotOk(res: Response) {
  if (res.ok) {
    return;
  }

  let responseText: string | null = null;
  let parsedData: unknown = null;

  try {
    responseText = await res.text();
    if (responseText) {
      try {
        parsedData = JSON.parse(responseText);
      } catch {
        parsedData = responseText;
      }
    }
  } catch {
    responseText = null;
    parsedData = null;
  }

  const body = parsedData ?? responseText ?? null;

  if (
    res.status === 401 &&
    body &&
    typeof body === "object" &&
    ("redirectToLogin" in body || "clearSession" in body)
  ) {
    console.log("Session expired - manual refresh required");
  }

  const message =
    body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
      ? (body as { message: string }).message
      : typeof body === "string" && body.trim().length > 0
        ? body
        : res.statusText;

  throw new ApiError(res.status, body, message);
}

export async function apiRequest(
  url: string,
  options: {
    method: string;
    body?: any;
    headers?: Record<string, string>;
  } = { method: "GET" },
): Promise<Response> {
  const requestUrl = buildApiUrl(url);
  const body =
    options.body !== undefined
      ? typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body)
      : undefined;

  const baseHeaders: Record<string, string> = body ? { "Content-Type": "application/json" } : {};
  const headers = { ...baseHeaders, ...(options.headers ?? {}) };
  if (!headers["X-Request-ID"] && !headers["x-request-id"]) {
    headers["X-Request-ID"] = generateRequestId();
  }

  try {
    const payloadKeys = (() => {
      const sanitized = sanitizePayload(body);
      if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
        return Object.keys(sanitized as Record<string, unknown>);
      }
      return [];
    })();

    console.info("[apiRequest] Request", {
      url: requestUrl,
      method: options.method,
      headers: redactHeaders(headers),
      payloadKeys,
      payload: shouldLogApiDebug ? sanitizePayload(body) : undefined,
    });

    const res = await fetch(requestUrl, {
      method: options.method,
      headers,
      body,
      credentials: "include",
    });

    const responseClone = res.clone();
    let responseBody: unknown = null;
    try {
      const responseText = await responseClone.text();
      if (responseText) {
        try {
          responseBody = JSON.parse(responseText);
        } catch {
          responseBody = responseText;
        }
      }
    } catch {
      responseBody = "[unreadable-response-body]";
    }

    console.info("[apiRequest] Response", {
      url: requestUrl,
      method: options.method,
      status: res.status,
      statusText: res.statusText,
      body: sanitizePayload(responseBody),
    });

    if (shouldLogApiDebug && !res.ok) {
      console.error("[apiRequest] Response error", {
        url: requestUrl,
        method: options.method,
        status: res.status,
        response: sanitizePayload(responseBody),
      });
    }

    await throwIfResNotOk(res);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      const redirectedPath = (() => {
        try {
          return new URL(res.url).pathname;
        } catch {
          return "";
        }
      })();

      const isAuthRedirect = res.redirected && redirectedPath.includes("/login");
      throw new ApiError(
        isAuthRedirect ? 401 : res.status || 500,
        null,
        isAuthRedirect
          ? "Unauthorized"
          : "API returned HTML instead of JSON",
      );
    }

    return res;
  } catch (error) {
    console.error("[apiRequest] Exception", {
      url: requestUrl,
      method: options.method,
      error,
      stack: error instanceof Error ? error.stack : error,
    });

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      const normalizedMessage = error.message.toLowerCase();
      if (normalizedMessage.includes("failed to fetch") || normalizedMessage.includes("networkerror")) {
        throw new Error("Network/CORS/API URL issue: failed to reach server.");
      }
      throw new Error(`Network/CORS/API URL issue: ${error.message}`);
    }

    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(buildApiUrl(queryKey.join("/") as string), {
      credentials: "include",
      cache: "no-store",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    // Check if response is HTML (development server issue)
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.warn('API returned HTML instead of JSON for:', queryKey.join("/"));
      // For auth/user endpoint, return null to indicate not authenticated
      if (queryKey.join("/").includes('/api/auth/user')) {
        return null;
      }
      throw new Error('API returned HTML instead of JSON');
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

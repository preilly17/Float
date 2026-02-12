import express from "express";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

type RouteHandler = (req: any, res: any, next?: any) => Promise<unknown> | unknown;

let setupRoutes: (app: express.Express) => import("http").Server;
let storageModule: any;
let storage: any;

const findRouteHandler = (
  app: express.Express,
  path: string,
  method: "get" | "post" | "put" | "delete" | "patch",
): RouteHandler => {
  const stack = ((app as unknown as { _router?: { stack?: any[] } })._router?.stack ?? []) as any[];

  for (const layer of stack) {
    if (layer?.route?.path === path && layer.route?.methods?.[method]) {
      const routeStack = layer.route.stack;
      // Return the last handler in the stack (the actual route handler, not middleware)
      return routeStack[routeStack.length - 1].handle as RouteHandler;
    }
  }

  throw new Error(`Route handler for ${method.toUpperCase()} ${path} not found`);
};

const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

beforeAll(async () => {
  jest.resetModules();
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ?? "postgres://user:pass@localhost:5432/test";

  await jest.unstable_mockModule("../observability", () => ({
    __esModule: true,
    logCoverPhotoFailure: jest.fn(),
    logActivityCreationFailure: jest.fn(),
    trackActivityCreationMetric: jest.fn(),
  }));

  await jest.unstable_mockModule("../vite", () => ({
    __esModule: true,
    log: jest.fn(),
    setupVite: jest.fn(),
    serveStatic: jest.fn(),
  }));

  await jest.unstable_mockModule("../sessionAuth", () => ({
    __esModule: true,
    setupAuth: jest.fn(),
    isAuthenticated: (_req: any, _res: any, next: any) => next?.(),
  }));

  await jest.unstable_mockModule("../coverPhotoUpload", () => ({
    __esModule: true,
    registerCoverPhotoUploadRoutes: jest.fn(),
  }));

  await jest.unstable_mockModule("ws", () => ({
    __esModule: true,
    WebSocketServer: jest.fn(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
    WebSocket: { OPEN: 1 },
  }));

  const routesModule: any = await import("../routes");
  setupRoutes = routesModule.setupRoutes;

  storageModule = await import("../storage");
  storage = storageModule.storage;
});

describe("POST /api/trips", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/trips", "post");
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("creates a missing user record before creating a trip", async () => {
    const req: any = {
      body: {
        name: "Ski Weekend",
        destination: "Denver",
        startDate: "2026-02-10",
        endDate: "2026-02-14",
      },
      session: { userId: "replit-user-42", authProvider: "replit" },
      user: {
        claims: {
          email: "traveler@example.com",
          first_name: "Travel",
          last_name: "Er",
        },
      },
    };

    const res = createMockResponse();

    const getUserSpy = jest.spyOn(storage, "getUser").mockResolvedValueOnce(undefined);
    const upsertUserSpy = jest.spyOn(storage, "upsertUser").mockResolvedValueOnce({
      id: "replit-user-42",
      email: "traveler@example.com",
    } as any);
    const createTripSpy = jest.spyOn(storage, "createTrip").mockResolvedValueOnce({
      id: 7,
      name: "Ski Weekend",
    } as any);

    await handler(req, res);

    expect(getUserSpy).toHaveBeenCalledWith("replit-user-42");
    expect(upsertUserSpy).toHaveBeenCalledWith({
      id: "replit-user-42",
      email: "traveler@example.com",
      firstName: "Travel",
      lastName: "Er",
      authProvider: "replit",
    });
    expect(createTripSpy).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: 7, name: "Ski Weekend" });
  });
});

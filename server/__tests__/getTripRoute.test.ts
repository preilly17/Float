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
      return layer.route.stack[0].handle as RouteHandler;
    }
  }

  throw new Error(`Route handler for ${method.toUpperCase()} ${path} not found`);
};

const createMockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
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

describe("GET /api/trips/:id", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/trips/:id", "get");
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("returns 400 for a non-numeric trip id", async () => {
    const req: any = {
      params: { id: "trip-abc" },
      session: { userId: "user-1" },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Trip ID must be a valid number" });
  });

  it("returns the trip for the creator without checking membership", async () => {
    const req: any = {
      params: { id: "28" },
      session: { userId: "owner-123" },
    };
    const res = createMockResponse();

    const getTripByIdSpy = jest.spyOn(storage, "getTripById").mockResolvedValueOnce({
      id: 28,
      createdBy: "owner-123",
      name: "Beach Escape",
    } as any);
    const isTripMemberSpy = jest
      .spyOn(storage, "isTripMember")
      .mockRejectedValueOnce(new Error("trip_members lookup failed"));

    await handler(req, res);

    expect(getTripByIdSpy).toHaveBeenCalledWith(28);
    expect(isTripMemberSpy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      id: 28,
      createdBy: "owner-123",
      name: "Beach Escape",
    });
  });
});

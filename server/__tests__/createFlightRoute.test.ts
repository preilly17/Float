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
let storage: any;

const findRouteHandler = (
  app: express.Express,
  path: string,
  method: "get" | "post" | "put" | "delete" | "patch",
): RouteHandler => {
  const stack = ((app as unknown as { _router?: { stack?: any[] } })._router?.stack ?? []) as any[];

  for (const layer of stack) {
    if (layer?.route?.path === path && layer.route?.methods?.[method]) {
      const routeStack = layer.route.stack as any[];
      // Return the last handler (after any middleware like isAuthenticated)
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

  const storageModule: any = await import("../storage");
  storage = storageModule.storage;
});

describe("POST /api/trips/:id/flights – flight_type inference", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;

  const baseFlight = {
    flightNumber: "AA100",
    airline: "American Airlines",
    airlineCode: "AA",
    departureAirport: "JFK",
    departureCode: "JFK",
    arrivalAirport: "LAX",
    arrivalCode: "LAX",
    departureTime: "2024-06-15T08:00:00Z",
    arrivalTime: "2024-06-15T11:00:00Z",
  };

  const tripWithDates = {
    id: 1,
    startDate: "2024-06-15",
    endDate: "2024-06-22",
    createdBy: "user1",
    members: [{ userId: "user1", user: { firstName: "Test" } }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/trips/:id/flights", "post");
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("infers 'outbound' when departure is near trip start", async () => {
    const createdFlight = { id: 10, ...baseFlight, flightType: "outbound" };

    jest.spyOn(storage, "getUser").mockResolvedValue({ id: "user1" } as any);
    jest.spyOn(storage, "getTripById").mockResolvedValueOnce(tripWithDates as any);
    jest.spyOn(storage, "addFlight").mockResolvedValueOnce(createdFlight as any);
    jest.spyOn(storage, "createFlightRsvpsForTripMembers").mockResolvedValueOnce(undefined);

    const req: any = {
      params: { id: "1" },
      body: { ...baseFlight },
      session: { userId: "user1" },
      isAuthenticated: jest.fn(() => true),
      user: { id: "user1" },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    // Verify addFlight was called with flightType set
    const addFlightArg = (storage.addFlight as jest.Mock).mock.calls[0][0];
    expect(addFlightArg.flightType).toBe("outbound");
  });

  it("infers 'return' when departure is near trip end", async () => {
    const returnFlight = {
      ...baseFlight,
      departureTime: "2024-06-22T10:00:00Z",
      arrivalTime: "2024-06-22T13:00:00Z",
    };
    const createdFlight = { id: 11, ...returnFlight, flightType: "return" };

    jest.spyOn(storage, "getUser").mockResolvedValue({ id: "user1" } as any);
    jest.spyOn(storage, "getTripById").mockResolvedValueOnce(tripWithDates as any);
    jest.spyOn(storage, "addFlight").mockResolvedValueOnce(createdFlight as any);
    jest.spyOn(storage, "createFlightRsvpsForTripMembers").mockResolvedValueOnce(undefined);

    const req: any = {
      params: { id: "1" },
      body: { ...returnFlight },
      session: { userId: "user1" },
      isAuthenticated: jest.fn(() => true),
      user: { id: "user1" },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const addFlightArg = (storage.addFlight as jest.Mock).mock.calls[0][0];
    expect(addFlightArg.flightType).toBe("return");
  });

  it("defaults to 'outbound' when trip lookup fails", async () => {
    const createdFlight = { id: 12, ...baseFlight, flightType: "outbound" };

    jest.spyOn(storage, "getUser").mockResolvedValue({ id: "user1" } as any);
    jest.spyOn(storage, "getTripById").mockRejectedValueOnce(new Error("DB error"));
    jest.spyOn(storage, "addFlight").mockResolvedValueOnce(createdFlight as any);
    jest.spyOn(storage, "createFlightRsvpsForTripMembers").mockResolvedValueOnce(undefined);

    const req: any = {
      params: { id: "1" },
      body: { ...baseFlight },
      session: { userId: "user1" },
      isAuthenticated: jest.fn(() => true),
      user: { id: "user1" },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const addFlightArg = (storage.addFlight as jest.Mock).mock.calls[0][0];
    expect(addFlightArg.flightType).toBe("outbound");
  });

  it("preserves explicit flightType when provided", async () => {
    const createdFlight = { id: 13, ...baseFlight, flightType: "return" };

    jest.spyOn(storage, "getUser").mockResolvedValue({ id: "user1" } as any);
    jest.spyOn(storage, "addFlight").mockResolvedValueOnce(createdFlight as any);
    jest.spyOn(storage, "createFlightRsvpsForTripMembers").mockResolvedValueOnce(undefined);

    const req: any = {
      params: { id: "1" },
      body: { ...baseFlight, flightType: "return" },
      session: { userId: "user1" },
      isAuthenticated: jest.fn(() => true),
      user: { id: "user1" },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const addFlightArg = (storage.addFlight as jest.Mock).mock.calls[0][0];
    expect(addFlightArg.flightType).toBe("return");
  });
});

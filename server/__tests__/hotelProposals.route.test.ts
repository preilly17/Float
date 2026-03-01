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
let createHotelMock: jest.SpyInstance;
let ensureHotelProposalMock: jest.SpyInstance;

const findRouteHandler = (
  app: express.Express,
  path: string,
  method: "get" | "post" | "put" | "delete" | "patch",
): RouteHandler => {
  const stack = ((app as unknown as { _router?: { stack?: any[] } })._router?.stack ?? []) as any[];

  for (const layer of stack) {
    if (layer?.route?.path === path && layer.route?.methods?.[method]) {
      const handlers = layer.route.stack ?? [];
      const last = handlers[handlers.length - 1];
      if (!last) {
        throw new Error(`No handlers found for ${method.toUpperCase()} ${path}`);
      }
      return last.handle as RouteHandler;
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

  await jest.unstable_mockModule("../db", () => ({
    __esModule: true,
    pool: {
      connect: jest.fn(),
      query: jest.fn(),
      end: jest.fn(),
    },
    query: jest.fn(),
  }));

  await jest.unstable_mockModule("../sessionAuth", () => ({
    __esModule: true,
    setupAuth: jest.fn(),
    createSessionMiddleware: () => (req: any, _res: any, next: any) => {
      req.session = req.session ?? {};
      return next();
    },
    isAuthenticated: (_req: any, _res: any, next: any) => next(),
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
});

describe("POST /api/trips/:tripId/proposals/hotels", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/trips/:tripId/proposals/hotels", "post");

    createHotelMock = jest.spyOn(storageModule.storage, "createHotel");
    ensureHotelProposalMock = jest.spyOn(
      storageModule.storage,
      "ensureHotelProposalForSavedHotel",
    );
  });

  afterEach(async () => {
    createHotelMock.mockRestore();
    ensureHotelProposalMock.mockRestore();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("creates a hotel before proposing when no hotelId is supplied", async () => {
    const checkInDate = new Date("2024-06-01T15:00:00Z").toISOString();
    const checkOutDate = new Date("2024-06-05T11:00:00Z").toISOString();

    createHotelMock.mockResolvedValueOnce({
      id: 77,
      tripId: 10,
    });

    ensureHotelProposalMock.mockResolvedValueOnce({
      proposal: {
        id: 991,
        tripId: 10,
        hotelName: "Riverside Inn",
      },
      wasCreated: true,
      stayId: 77,
    });

    const req: any = {
      params: { tripId: "10" },
      body: {
        tripId: 1,
        hotelName: "Riverside Inn",
        address: "500 River Rd",
        city: "Portland",
        country: "USA",
        checkInDate,
        checkOutDate,
        guestCount: 2,
        roomCount: 1,
        status: "tentative",
        currency: "USD",
      },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(createHotelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: 10,
        hotelName: "Riverside Inn",
        address: "500 River Rd",
        city: "Portland",
        country: "USA",
      }),
      "test-user",
    );

    expect(ensureHotelProposalMock).toHaveBeenCalledWith({
      hotelId: 77,
      tripId: 10,
      currentUserId: "test-user",
      overrideDetails: expect.objectContaining({
        hotelName: "Riverside Inn",
        address: "500 River Rd",
        city: "Portland",
        country: "USA",
      }),
    });

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 991,
        tripId: 10,
        hotelName: "Riverside Inn",
      }),
    );
  });


  it("rejects proposing a scheduled stay", async () => {
    ensureHotelProposalMock.mockRejectedValueOnce(new Error("Scheduled stays cannot be proposed"));

    const req: any = {
      params: { tripId: "10" },
      body: { hotelId: 77 },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "Scheduled stays cannot be proposed",
    });
  });

  it("returns a 400 with details when the saved stay is missing required data", async () => {
    ensureHotelProposalMock.mockRejectedValueOnce(
      new Error(
        "Saved stay is missing required details: hotel name, address, city, check-in date. Add them before sharing with the group.",
      ),
    );

    const req: any = {
      params: { tripId: "10" },
      body: { hotelId: 77 },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(ensureHotelProposalMock).toHaveBeenCalledWith({
      hotelId: 77,
      tripId: 10,
      currentUserId: "test-user",
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message:
        "Saved stay is missing required details: hotel name, address, city, check-in date. Add them before sharing with the group.",
    });
  });
});


describe("POST /api/hotel-proposals/:id/convert", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;
  let updateHotelProposalStatusMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/hotel-proposals/:id/convert", "post");
    updateHotelProposalStatusMock = jest.spyOn(storageModule.storage, "updateHotelProposalStatus");
  });

  afterEach(async () => {
    updateHotelProposalStatusMock.mockRestore();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("accepts confirmed status when converting a hotel proposal", async () => {
    updateHotelProposalStatusMock.mockResolvedValueOnce({
      id: 55,
      tripId: 10,
      status: "confirmed",
    });

    const req: any = {
      params: { id: "55" },
      body: { status: "confirmed" },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(updateHotelProposalStatusMock).toHaveBeenCalledWith(55, "confirmed", "test-user");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 55,
        status: "confirmed",
      }),
    );
  });

  it("rejects unsupported conversion status values", async () => {
    const req: any = {
      params: { id: "55" },
      body: { status: "active" },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(updateHotelProposalStatusMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "status must be either 'scheduled' or 'confirmed'",
    });
  });
});


describe("GET /api/trips/:id/restaurant-proposals", () => {
  let app: express.Express;
  let httpServer: import("http").Server;
  let handler: RouteHandler;
  let getTripByIdMock: jest.SpyInstance;
  let getTripRestaurantProposalsMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    httpServer = setupRoutes(app);
    handler = findRouteHandler(app, "/api/trips/:id/restaurant-proposals", "get");
    getTripByIdMock = jest.spyOn(storageModule.storage, "getTripById");
    getTripRestaurantProposalsMock = jest.spyOn(storageModule.storage, "getTripRestaurantProposals");
  });

  afterEach(async () => {
    getTripByIdMock.mockRestore();
    getTripRestaurantProposalsMock.mockRestore();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it("returns 403 instead of 500 when members payload is missing", async () => {
    getTripByIdMock.mockResolvedValueOnce({
      id: 10,
      createdBy: "owner",
      members: undefined,
    });

    const req: any = {
      params: { id: "10" },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(getTripRestaurantProposalsMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "You are no longer a member of this trip" });
  });

  it("returns 200 with restaurant proposals for a valid member", async () => {
    getTripByIdMock.mockResolvedValueOnce({
      id: 10,
      createdBy: "owner",
      members: [{ userId: "test-user" }],
    });

    getTripRestaurantProposalsMock.mockResolvedValueOnce([
      { id: 101, tripId: 10, restaurantName: "Kintsugi" },
    ]);

    const req: any = {
      params: { id: "10" },
      session: { userId: "test-user" },
      user: { id: "test-user" },
      headers: {},
      get: jest.fn(),
      header: jest.fn(),
    };

    const res = createMockResponse();

    await handler(req, res);

    expect(getTripRestaurantProposalsMock).toHaveBeenCalledWith(10, "test-user");
    expect(res.json).toHaveBeenCalledWith([
      { id: 101, tripId: 10, restaurantName: "Kintsugi" },
    ]);
  });
});

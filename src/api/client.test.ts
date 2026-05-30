// Unit tests for the drone API client.
//
// Risks defended against:
// - The login flow silently treats a non-OK response as success, letting an
//   unauthenticated user into the dashboard.
// - A future refactor changes login() to follow redirects again, breaking
//   the JSON-only contract with the onboard service.
// - The unauthorized handler does not fire on a 401 from `api.get`, leaving
//   the AuthContext stuck in the "loading" state forever.
// - A response with an empty body throws JSON.parse errors instead of being
//   treated as a no-content success.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, login, logout, setUnauthorizedHandler } from "./client";

// Replace global fetch with a vi.fn so each test can stage its own response
// and assert what the client actually sent on the wire.
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Small helper to build the minimum Response shape the client touches.
function mockResponse(opts: {
  status?: number;
  ok?: boolean;
  body?: unknown;
  statusText?: string;
}): Response {
  const status = opts.status ?? 200;
  const ok = opts.ok ?? (status >= 200 && status < 300);
  const text = opts.body === undefined ? "" : JSON.stringify(opts.body);
  return {
    ok,
    status,
    statusText: opts.statusText ?? "",
    text: async () => text,
  } as unknown as Response;
}

describe("login()", () => {
  it("posts form-encoded credentials to /login", async () => {
    // Happy path: the onboard service responds 200 JSON; the client must
    // resolve without throwing and send the credentials as form data.
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: { ok: true } }));

    await login("alex", "hunter2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/login");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    expect((init as RequestInit).headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    });
    const body = (init as RequestInit).body as string;
    expect(body).toContain("username=alex");
    expect(body).toContain("password=hunter2");
  });

  it("never sets redirect:'manual' (the contract is JSON-only)", async () => {
    // Regression guard: an earlier version of the client expected a 303
    // redirect and set redirect:'manual'. The current onboard service
    // returns JSON, so any redirect handling here is a code smell.
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: { ok: true } }));
    await login("a", "b");
    expect((fetchMock.mock.calls[0][1] as RequestInit).redirect).toBeUndefined();
  });

  it("throws ApiError(401) on invalid credentials", async () => {
    // The onboard service returns 401 with {error:'invalid_credentials'} on
    // a bad password. The client must surface that as an ApiError with the
    // matching status so the login form can render an error.
    fetchMock.mockResolvedValue(
      mockResponse({ status: 401, body: { error: "invalid_credentials" } }),
    );

    await expect(login("alex", "wrong")).rejects.toMatchObject({
      status: 401,
    });
    await expect(login("alex", "wrong")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with the upstream status on other failures", async () => {
    // Non-401 failures (500, 502, ...) must also raise ApiError so the
    // toast layer can show a useful message rather than silently swallow.
    fetchMock.mockResolvedValue(
      mockResponse({ status: 500, statusText: "Internal Server Error" }),
    );

    await expect(login("a", "b")).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe("logout()", () => {
  it("posts to /logout with credentials included", async () => {
    // Logout must be POST (the onboard service rejects GET on /logout) and
    // must include credentials so the cookie can be cleared.
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: { ok: true } }));

    await logout();

    expect(fetchMock).toHaveBeenCalledWith(
      "/logout",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });
});

describe("api.get / api.post", () => {
  it("returns parsed JSON on 2xx", async () => {
    // The generic request wrapper must JSON.parse the response body so
    // typed callers (api.get<DroneInfo>) get the right shape.
    fetchMock.mockResolvedValue(
      mockResponse({ status: 200, body: { connection: "udp://:14540" } }),
    );

    const out = await api.get<{ connection: string }>("/api/info");
    expect(out).toEqual({ connection: "udp://:14540" });
  });

  it("handles an empty body without throwing", async () => {
    // Endpoints like /api/cmd/* may return 200 with no body. The wrapper
    // must not throw a JSON.parse error in that case.
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: undefined }));

    await expect(api.post("/api/cmd/arm")).resolves.toBeNull();
  });

  it("invokes the unauthorized handler on 401", async () => {
    // A 401 from any API call must trigger the AuthContext's anonymous
    // funnel. The hook is set via setUnauthorizedHandler and must fire
    // exactly once per 401 before the ApiError is thrown.
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(mockResponse({ status: 401, body: { error: "unauthorized" } }));

    await expect(api.get("/api/state")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws ApiError with detail when backend returns {detail}", async () => {
    // FastAPI's HTTPException(detail=...) responses must surface their
    // detail string in ApiError.detail so toasts show the real reason
    // (e.g. "waypoint 0: alt must be in (0, 120] m").
    fetchMock.mockResolvedValue(
      mockResponse({ status: 400, body: { detail: "waypoint 0: lat/lon out of range" } }),
    );

    await expect(api.post("/api/mission", { waypoints: [] })).rejects.toMatchObject({
      status: 400,
      detail: "waypoint 0: lat/lon out of range",
    });
  });

  it("sends JSON body and Content-Type on POST", async () => {
    // The wrapper must set Content-Type: application/json on requests with
    // a body, and serialize the body itself, so the FastAPI Body() handler
    // sees the right shape.
    fetchMock.mockResolvedValue(mockResponse({ status: 200, body: { ok: true } }));

    await api.post("/api/cmd/takeoff", { alt_m: 25 });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ alt_m: 25 }));
  });
});

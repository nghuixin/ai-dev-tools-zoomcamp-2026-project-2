import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "../services/api";
import { fakeFetch } from "./render";

describe("api client", () => {
  it("notifies savers only after a 2xx", async () => {
    let ok = true;
    const api = createApi(fakeFetch({
      "POST /api/weights": () => (ok ? [201, { id: 1, measured_on: "2026-11-05", kg: 20 }] : [500, { error: "boom" }]),
    }));
    const heard = vi.fn();
    api.onSaved(heard);
    await api.addWeight("2026-11-05", 20);
    expect(heard).toHaveBeenCalledWith("weight");
    ok = false;
    await expect(api.addWeight("2026-11-05", 20)).rejects.toBeInstanceOf(ApiError);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("does not treat reads or medicine setup as record saves", async () => {
    const api = createApi(fakeFetch({
      "GET /api/medications": () => [200, []],
      "POST /api/medications": () => [201, {}],
    }));
    const heard = vi.fn();
    api.onSaved(heard);
    await api.listMedications();
    await api.createMedication({ name: "x", kind: "DRUG", dose: "1", per_day: 1, quantity: 1, started_on: "2026-11-05" });
    expect(heard).not.toHaveBeenCalled();
  });

  it("surfaces the server's error message", async () => {
    const api = createApi(fakeFetch({ "PUT /api/dog": () => [422, { error: "name: too short" }] }));
    await expect(api.putDog({ name: "", birth_date: null, sex: "UNKNOWN", breed: "", coat: "blue" }))
      .rejects.toMatchObject({ status: 422, message: "name: too short" });
  });

  it("reports a network failure plainly", async () => {
    const api = createApi(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api.getDog()).rejects.toMatchObject({ status: 0 });
  });
});

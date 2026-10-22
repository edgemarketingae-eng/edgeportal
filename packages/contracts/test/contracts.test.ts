import { describe, expect, it } from "vitest";
import { ApiError, authRoutes, buildPath, createClient, fieldErrorsFromIssues, zObjectId } from "../src";

describe("contracts", () => {
  it("builds paths and rejects missing params", () => {
    expect(buildPath("/api/v1/admin/enrollments/:id/approve", { id: "abc" })).toBe("/api/v1/admin/enrollments/abc/approve");
    expect(() => buildPath("/x/:id")).toThrow(/Missing path param/);
  });

  it("validates object ids", () => {
    expect(zObjectId.safeParse("65f1c2a3b4c5d6e7f8a9b0c1").success).toBe(true);
    expect(zObjectId.safeParse("nope").success).toBe(false);
  });

  it("signup schema enforces terms and normalises email", () => {
    const r = authRoutes.studentSignup.body!.safeParse({ name: "A B", email: " X@Y.COM ", phone: "+971500000000", password: "12345678", marketingConsent: false, terms: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrorsFromIssues(r.error.issues).terms).toMatch(/accept the terms/);
    const ok = authRoutes.studentSignup.body!.parse({ name: "A B", email: " X@Y.COM ", phone: "+971500000000", password: "12345678", marketingConsent: false, terms: true });
    expect(ok.email).toBe("x@y.com");
    expect(ok.channel).toBe("sms");
  });

  it("client maps error bodies to ApiError", async () => {
    const call = createClient(async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Nope" } }), { status: 403 }));
    await expect(call(authRoutes.sendLoginOtp, { body: { phone: "+971500000000" } })).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    const ok = createClient(async (path) => new Response(JSON.stringify({ ok: true, phone: path, message: "m" }), { status: 200 }));
    expect((await ok(authRoutes.sendLoginOtp, { body: { phone: "x" } })).phone).toBe("/api/v1/auth/otp/send");
    expect(new ApiError(400, "VALIDATION", "x", { a: "b" }).toBody().error.fieldErrors).toEqual({ a: "b" });
  });
});

import { describe, expect, it } from "vitest";

import {
  formatDocumentNumberInput,
  sanitizeDocumentNumberInput,
  sanitizeTrackingCodeInput,
} from "./project-tracking";

describe("project tracking utils", () => {
  it("normalizes tracking codes for lookup", () => {
    expect(sanitizeTrackingCodeInput(" valle-8f42k9 ")).toBe("VALLE-8F42K9");
    expect(sanitizeTrackingCodeInput("valle 8f42k9")).toBe("VALLE8F42K9");
  });

  it("sanitizes document numbers", () => {
    expect(sanitizeDocumentNumberInput("12.345.678/0001-99")).toBe("12345678000199");
    expect(sanitizeDocumentNumberInput("123.456.789-10")).toBe("12345678910");
  });

  it("formats cpf and cnpj values for display", () => {
    expect(formatDocumentNumberInput("12345678910")).toBe("123.456.789-10");
    expect(formatDocumentNumberInput("12345678000199")).toBe("12.345.678/0001-99");
  });
});

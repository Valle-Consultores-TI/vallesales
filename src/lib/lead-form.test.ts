import { describe, expect, it } from "vitest";

import { isIndicationLeadSource } from "./lead-form";

describe("lead form source helpers", () => {
  it("recognizes indication sources regardless of label formatting", () => {
    expect(isIndicationLeadSource("Indicacao")).toBe(true);
    expect(isIndicationLeadSource("Indicação")).toBe(true);
    expect(isIndicationLeadSource("Valle Indicacao")).toBe(true);
    expect(isIndicationLeadSource("Valle Indicação")).toBe(true);
    expect(isIndicationLeadSource("Indicacao: Ana")).toBe(true);
    expect(isIndicationLeadSource("Programa de Indicação: Ana")).toBe(true);
    expect(isIndicationLeadSource("Site")).toBe(false);
  });
});

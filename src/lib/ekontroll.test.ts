import { describe, expect, it } from "vitest";
import { aggregateMonths, fiscalTotal, matchesSearch, numericValue, periodError, personnelTotal, shiftMonth } from "./ekontroll";

describe("e-KONTROLL indicators", () => {
  it("preserves API decimals and reads localized amounts", () => {
    expect(numericValue({ value: "1234.56" }, ["value"])).toBe(1234.56);
    expect(numericValue({ value: "R$ 1.234,56" }, ["value"])).toBe(1234.56);
    expect(numericValue({ value: null, fallback: 12.5 }, ["value", "fallback"])).toBe(12.5);
    expect(numericValue({ value: 0, fallback: 12 }, ["value", "fallback"])).toBe(0);
  });
  it("adds distinct fiscal totals without counting their import subtotals twice", () => {
    expect(fiscalTotal({ entradas_total: 20, entradas_manual: 5, saidas_total: 30, servico_prestado_total: 10, cfe_total: 2 })).toBe(62);
    expect(personnelTotal({ admissao: 4, demissao: 2, ferias: 3, total_vinculos: 90 })).toBe(9);
  });
  it("keeps missing months separate from zero and sums links within each month", () => {
    const months = aggregateMonths({ fiscal: [], billing: [{ competencia: "2026-01", faturamento: "100.50" }, { competencia: "2026-03", faturamento: 0 }], payroll: [{ competencia: "2026-01", total_vinculos: 10 }, { competencia: "2026-01", total_vinculos: 20 }, { competencia: "2026-03", total_vinculos: 25 }] }, "2026-01", "2026-03");
    expect(months.map(month => month.billing)).toEqual([100.5, null, 0]);
    expect(months.map(month => month.links)).toEqual([30, null, 25]);
    expect(months.map(month => month.fiscal)).toEqual([null, null, null]);
  });
  it("validates a maximum of 12 inclusive months and shifts across years", () => {
    expect(periodError("2026-01", "2026-12")).toBe("");
    expect(periodError("2025-12", "2026-12")).not.toBe("");
    expect(periodError("2026-09", "2026-08")).not.toBe("");
    expect(periodError("", "2026-08")).not.toBe("");
    expect(periodError("2026-13", "2026-14")).not.toBe("");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("matches names without accents and documents without punctuation", () => {
    expect(matchesSearch("Comércio São José", "comercio sao")).toBe(true);
    expect(matchesSearch("Empresa 12.345.678/0001-90", "12345678000190")).toBe(true);
    expect(matchesSearch("Comércio São José", "xyz")).toBe(false);
  });
});

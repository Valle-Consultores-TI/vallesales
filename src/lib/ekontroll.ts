export type DataRow = Record<string, unknown>;

// API decimals use a dot; also accept the localized format returned by exports.
export const numericValue = (row: DataRow, keys: string[]) => {
  for (const key of keys) {
    const raw = row[key];
    if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") continue;
    const text = String(raw).trim().replace(/\s|R\$/g, "");
    if (!text) continue;
    const value = typeof raw === "number" ? raw : Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

export const monthFromDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const shiftMonth = (month: string, offset: number) => {
  const [year, number] = month.split("-").map(Number);
  return monthFromDate(new Date(year, number - 1 + offset, 1));
};
export const monthLabel = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(year, number - 1, 1)).replace(".", "");
};
export const periodError = (start: string, end: string) => {
  const valid = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && Number(month.slice(0, 4)) >= 1900;
  if (!valid(start) || !valid(end)) return "Preencha as duas competências.";
  if (start > end) return "A competência inicial deve ser anterior ou igual à final.";
  const distance = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5)) - Number(start.slice(5));
  return distance >= 12 ? "Selecione um intervalo de até 12 competências." : "";
};
export const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const matchesSearch = (text: string, search: string) => {
  const query = normalizeSearch(search);
  return normalizeSearch(text).includes(query) || (/^[\d./\s-]+$/.test(query) && text.replace(/\D/g, "").includes(query.replace(/\D/g, "")));
};

export const fiscalFields = ["servico_prestado_total", "entradas_total", "saidas_total", "servico_tomado_total", "bilhete_passagem_total", "cfe_total", "rdz_total"];
export const sumFields = (row: DataRow, keys: string[]) => keys.reduce((sum, key) => sum + numericValue(row, [key]), 0);
export const fiscalTotal = (row: DataRow) => sumFields(row, fiscalFields);
export const personnelTotal = (row: DataRow) => sumFields(row, ["admissao", "demissao", "ferias"]);

export type MonthlyData = {
  month: string;
  billing: number | null;
  fiscal: number | null;
  admissions: number | null;
  dismissals: number | null;
  vacations: number | null;
  links: number | null;
};
export type SummaryData = { fiscal: DataRow[]; payroll: DataRow[]; billing: DataRow[] };
export const aggregateMonths = (data: SummaryData | undefined, start: string, end: string): MonthlyData[] => {
  if (periodError(start, end)) return [];
  const months = new Map<string, MonthlyData>();
  for (let month = start; month <= end; month = shiftMonth(month, 1)) {
    months.set(month, { month, billing: null, fiscal: null, admissions: null, dismissals: null, vacations: null, links: null });
  }
  const target = (row: DataRow) => months.get(String(row.competencia ?? "").slice(0, 7));
  data?.billing.forEach(row => { const month = target(row); if (month) month.billing = (month.billing ?? 0) + numericValue(row, ["faturamento"]); });
  data?.fiscal.forEach(row => { const month = target(row); if (month) month.fiscal = (month.fiscal ?? 0) + fiscalTotal(row); });
  data?.payroll.forEach(row => {
    const month = target(row);
    if (!month) return;
    month.admissions = (month.admissions ?? 0) + numericValue(row, ["admissao"]);
    month.dismissals = (month.dismissals ?? 0) + numericValue(row, ["demissao"]);
    month.vacations = (month.vacations ?? 0) + numericValue(row, ["ferias"]);
    month.links = (month.links ?? 0) + numericValue(row, ["total_vinculos"]);
  });
  return [...months.values()];
};

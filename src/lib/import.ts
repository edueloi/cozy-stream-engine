import Papa from "papaparse";
import * as XLSX from "xlsx";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeHeader(k: string): string {
  return stripAccents(k.trim().toLowerCase()).replace(/\s+/g, " ");
}

const ALIASES: Record<string, string> = {
  company_name: "nome_fantasia",
  "nome fantasia": "nome_fantasia",
  "razao social": "razao_social",
  company: "nome_fantasia",
  empresa: "nome_fantasia",
  cnpj: "cnpj",
  segment: "segmento",
  industry: "segmento",
  city: "cidade",
  state: "estado",
  uf: "estado",
  website: "site",
  site: "site",
  url: "site",
  phone: "telefone",
  telefone: "telefone",
  whatsapp: "whatsapp",
  "whats app": "whatsapp",
  celular: "whatsapp",
  email: "email",
  "e-mail": "email",
  "e mail": "email",
  employees: "funcionarios_estimado",
  funcionarios: "funcionarios_estimado",
  revenue: "faturamento_estimado",
  faturamento: "faturamento_estimado",
  responsavel: "responsavel",
  "nome do responsavel": "responsavel",
  "nome do resposnsavel": "responsavel",
  contato: "responsavel",
  "nome contato": "responsavel",
};

const ALLOWED = new Set([
  "razao_social",
  "nome_fantasia",
  "cnpj",
  "cnae",
  "segmento",
  "cidade",
  "estado",
  "site",
  "telefone",
  "whatsapp",
  "email",
  "funcionarios_estimado",
  "faturamento_estimado",
  "notes",
  "responsavel",
]);

export type ImportedRow = Record<string, string | number | null>;

const JUNK_VALUES = new Set([
  "contato pelo site",
  "whatsapp disponivel pelo site",
  "n/a",
  "na",
  "-",
  "sem informacao",
  "sem informação",
]);

function cleanValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (JUNK_VALUES.has(stripAccents(s.toLowerCase()))) return null;
  return s;
}

export function mapRow(raw: Record<string, unknown>): ImportedRow {
  const out: ImportedRow = {};
  const notesExtras: string[] = [];
  for (const key of Object.keys(raw)) {
    const normalized = normalizeHeader(key);
    const target = ALIASES[normalized] ?? normalized;
    if (!ALLOWED.has(target)) {
      const v = cleanValue(raw[key]);
      if (v) notesExtras.push(`${key}: ${v}`);
      continue;
    }
    const cleaned = cleanValue(raw[key]);
    if (cleaned === null) {
      out[target] = null;
    } else if (target === "funcionarios_estimado" || target === "faturamento_estimado") {
      const n = Number(cleaned.replace(/[^\d.,-]/g, "").replace(",", "."));
      out[target] = isFinite(n) ? n : null;
    } else if (target === "email") {
      // basic email sanity — drop if not an email at all
      out[target] = /.+@.+\..+/.test(cleaned) ? cleaned : null;
    } else if (target === "whatsapp" || target === "telefone") {
      const digits = cleaned.replace(/\D/g, "");
      out[target] = digits.length >= 10 ? digits : null;
    } else {
      out[target] = cleaned;
    }
  }
  // Split combined "Cidade/UF" e.g. "Porto Feliz/SP"
  if (typeof out.cidade === "string" && !out.estado) {
    const m = /^(.+?)[\/\-,]\s*([A-Za-z]{2})\s*$/.exec(out.cidade);
    if (m) {
      out.cidade = m[1].trim();
      out.estado = m[2].toUpperCase();
    }
  }
  if (typeof out.estado === "string") out.estado = out.estado.toUpperCase().slice(0, 2);
  // Absorb "responsavel" and other extras into notes so nothing is lost.
  if (typeof out.responsavel === "string" && out.responsavel) {
    notesExtras.unshift(`Responsável: ${out.responsavel}`);
  }
  delete out.responsavel;
  if (notesExtras.length > 0) {
    const existing = typeof out.notes === "string" ? out.notes : "";
    out.notes = [existing, notesExtras.join(" | ")].filter(Boolean).join("\n");
  }
  return out;
}

export async function parseFile(file: File): Promise<ImportedRow[]> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => resolve(res.data.map(mapRow)),
        error: (err: unknown) => reject(err),
      });
    });
  }
  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return json.map(mapRow);
  }
  throw new Error("Formato não suportado. Use .csv, .xlsx ou .xls");
}
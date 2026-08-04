import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { parseFile, type ImportedRow } from "@/lib/import";
import { importLeads } from "@/lib/leads.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app-shell";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "Importar — JCS SDR" }] }),
  component: ImportPage,
});

function ImportPage() {
  const navigate = useNavigate();
  const doImport = useServerFn(importLeads);
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{
    inserted: number;
    failed: number;
    skipped: number;
    errors: Array<{ row: number; reason: string; lead: string }>;
  } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = await parseFile(f);
      setRows(parsed);
      toast.success(`${parsed.length} linhas lidas`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setBusy(true);
    setReport(null);
    try {
      const r = await doImport({ data: { rows: rows as never } });
      const skipped = (r as { skipped?: number }).skipped ?? 0;
      setReport({ inserted: r.inserted, failed: r.failed ?? 0, skipped, errors: r.errors ?? [] });
      if ((r.failed ?? 0) === 0 && skipped === 0) {
        toast.success(`${r.inserted} leads importados`);
        navigate({ to: "/leads" });
      } else {
        toast.warning(`${r.inserted} importados · ${skipped} duplicados ignorados · ${r.failed} rejeitados`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="w-full">
      <PageHeader
        title="Importar leads"
        description="Aceita CSV, XLSX e XLS. Colunas reconhecidas: razao_social, nome_fantasia, cnpj, segmento, cidade, estado, site, email, whatsapp, telefone, funcionarios_estimado, faturamento_estimado, notes."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arquivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept=".csv,.xlsx,.xls,.txt" onChange={onFile} />
          {rows.length > 0 && (
            <>
              <div className="text-sm">
                {rows.length} linhas · {headers.length} colunas reconhecidas:{" "}
                <span className="font-mono text-xs">{headers.join(", ")}</span>
              </div>
              <div className="border rounded-md overflow-x-auto max-h-80">
                <table className="text-xs w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="text-left px-3 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => (
                          <td key={h} className="px-3 py-1.5">
                            {String(r[h] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button onClick={handleImport} disabled={busy}>
                {busy ? "Importando..." : `Importar ${rows.length} leads`}
              </Button>
            </>
          )}
          {report && (
            <div className="border rounded-md p-3 space-y-2 text-sm">
              <div>
                <strong>{report.inserted}</strong> importados ·{" "}
                <strong>{report.skipped}</strong> duplicados ignorados ·{" "}
                <strong>{report.failed}</strong> rejeitados
              </div>
              {report.errors.length > 0 && (
                <div className="max-h-64 overflow-auto">
                  <table className="text-xs w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-2 py-1">Linha</th>
                        <th className="text-left px-2 py-1">Lead</th>
                        <th className="text-left px-2 py-1">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.errors.map((e, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-2 py-1">{e.row}</td>
                          <td className="px-2 py-1">{e.lead}</td>
                          <td className="px-2 py-1 text-destructive">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { updateLeadQualification } from "@/lib/qualification.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "nao_qualificado", label: "Não qualificado" },
  { value: "em_qualificacao", label: "Em qualificação" },
  { value: "qualificado", label: "Qualificado" },
  { value: "sem_perfil", label: "Sem perfil" },
  { value: "precisa_humano", label: "Precisa humano" },
  { value: "reuniao_agendada", label: "Reunião agendada" },
  { value: "perdido", label: "Perdido" },
];

type LeadQual = {
  qual_computers_count?: number | null;
  qual_has_internal_it?: boolean | null;
  qual_has_outsourced_it?: boolean | null;
  qual_main_pain?: string | null;
  qual_decision_maker?: string | null;
  qual_decision_role?: string | null;
  qual_interest?: string | null;
  qual_urgency?: string | null;
  qual_estimated_budget?: string | null;
  qual_next_step?: string | null;
  qual_seller_notes?: string | null;
  qual_manual_score?: number | null;
  qual_status?: string | null;
  qual_lost_reason?: string | null;
  qual_updated_by?: string | null;
  qual_updated_at?: string | null;
};

export function LeadQualificationCard({
  leadId,
  lead,
  onSaved,
}: {
  leadId: string;
  lead: LeadQual;
  onSaved?: () => void;
}) {
  const save = useServerFn(updateLeadQualification);
  const [form, setForm] = useState<LeadQual>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      qual_computers_count: lead.qual_computers_count ?? null,
      qual_has_internal_it: lead.qual_has_internal_it ?? null,
      qual_has_outsourced_it: lead.qual_has_outsourced_it ?? null,
      qual_main_pain: lead.qual_main_pain ?? "",
      qual_decision_maker: lead.qual_decision_maker ?? "",
      qual_decision_role: lead.qual_decision_role ?? "",
      qual_interest: lead.qual_interest ?? "",
      qual_urgency: lead.qual_urgency ?? "",
      qual_estimated_budget: lead.qual_estimated_budget ?? "",
      qual_next_step: lead.qual_next_step ?? "",
      qual_seller_notes: lead.qual_seller_notes ?? "",
      qual_manual_score: lead.qual_manual_score ?? null,
      qual_status: lead.qual_status ?? "nao_qualificado",
      qual_lost_reason: lead.qual_lost_reason ?? "",
    });
  }, [lead]);

  function set<K extends keyof LeadQual>(k: K, v: LeadQual[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (form.qual_status === "perdido" && !(form.qual_lost_reason ?? "").trim()) {
      toast.error("Informe o motivo da perda.");
      return;
    }
    setSaving(true);
    try {
      const patch = {
        qual_computers_count:
          form.qual_computers_count === null || form.qual_computers_count === undefined
            ? null
            : Number(form.qual_computers_count),
        qual_has_internal_it: form.qual_has_internal_it ?? null,
        qual_has_outsourced_it: form.qual_has_outsourced_it ?? null,
        qual_main_pain: form.qual_main_pain || null,
        qual_decision_maker: form.qual_decision_maker || null,
        qual_decision_role: form.qual_decision_role || null,
        qual_interest: form.qual_interest || null,
        qual_urgency: form.qual_urgency || null,
        qual_estimated_budget: form.qual_estimated_budget || null,
        qual_next_step: form.qual_next_step || null,
        qual_seller_notes: form.qual_seller_notes || null,
        qual_manual_score:
          form.qual_manual_score === null || form.qual_manual_score === undefined
            ? null
            : Number(form.qual_manual_score),
        qual_status: (form.qual_status ?? "nao_qualificado") as
          | "nao_qualificado"
          | "em_qualificacao"
          | "qualificado"
          | "sem_perfil"
          | "precisa_humano"
          | "reuniao_agendada"
          | "perdido",
        qual_lost_reason: form.qual_lost_reason || null,
      };
      await save({ data: { leadId, by: "vendedor", patch } });
      toast.success("Qualificação atualizada");
      onSaved?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const updatedBy = lead.qual_updated_by;
  const byLabel =
    updatedBy === "ambos"
      ? "IA + Vendedor"
      : updatedBy === "vendedor"
        ? "Vendedor"
        : updatedBy === "ia"
          ? "IA"
          : "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Qualificação do Lead</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Preenchido por: {byLabel}</Badge>
          {lead.qual_updated_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(lead.qual_updated_at).toLocaleString()}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Status da qualificação</Label>
            <Select
              value={form.qual_status ?? "nao_qualificado"}
              onValueChange={(v) => set("qual_status", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Score manual (0-100)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.qual_manual_score ?? ""}
              onChange={(e) =>
                set(
                  "qual_manual_score",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade de computadores</Label>
            <Input
              type="number"
              min={0}
              value={form.qual_computers_count ?? ""}
              onChange={(e) =>
                set(
                  "qual_computers_count",
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Possui TI interna?</Label>
              <p className="text-xs text-muted-foreground">
                Equipe própria de tecnologia
              </p>
            </div>
            <Switch
              checked={!!form.qual_has_internal_it}
              onCheckedChange={(v) => set("qual_has_internal_it", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label>Possui TI terceirizada?</Label>
              <p className="text-xs text-muted-foreground">
                Empresa parceira ou MSP
              </p>
            </div>
            <Switch
              checked={!!form.qual_has_outsourced_it}
              onCheckedChange={(v) => set("qual_has_outsourced_it", v)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            ["qual_main_pain", "Principal dor"],
            ["qual_decision_maker", "Responsável pela decisão"],
            ["qual_decision_role", "Cargo do decisor"],
            ["qual_interest", "Interesse"],
            ["qual_urgency", "Urgência"],
            ["qual_estimated_budget", "Orçamento estimado"],
          ].map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label>{label}</Label>
              <Input
                value={(form[k as keyof LeadQual] as string) ?? ""}
                onChange={(e) =>
                  set(k as keyof LeadQual, e.target.value as never)
                }
              />
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Próximo passo</Label>
          <Input
            value={form.qual_next_step ?? ""}
            onChange={(e) => set("qual_next_step", e.target.value)}
            placeholder="Ex.: Enviar proposta, agendar reunião..."
          />
        </div>

        <div className="space-y-1.5">
          <Label>Observações do vendedor</Label>
          <Textarea
            rows={3}
            value={form.qual_seller_notes ?? ""}
            onChange={(e) => set("qual_seller_notes", e.target.value)}
          />
        </div>

        {form.qual_status === "perdido" && (
          <div className="space-y-1.5">
            <Label>Motivo da perda (obrigatório)</Label>
            <Textarea
              rows={2}
              value={form.qual_lost_reason ?? ""}
              onChange={(e) => set("qual_lost_reason", e.target.value)}
            />
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar qualificação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
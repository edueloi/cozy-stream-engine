// Porta do scorer.py — calcula score do lead com base em sinais firmográficos e enriquecimento
export interface ScorableLead {
  segmento?: string | null;
  cidade?: string | null;
  estado?: string | null;
  funcionarios_estimado?: number | null;
  faturamento_estimado?: number | null;
  tecnologias?: unknown[] | null;
  redes_sociais?: Record<string, unknown> | null;
  decisores?: unknown[] | null;
  dores?: unknown[] | null;
  email?: string | null;
  whatsapp?: string | null;
  telefone?: string | null;
  site?: string | null;
}

export interface ScoreContext {
  icp_segmentos?: string[];
  icp_cidades?: string[];
}

export function calculateScore(lead: ScorableLead, ctx: ScoreContext = {}): number {
  let score = 0;
  // ICP fit
  if (lead.segmento && ctx.icp_segmentos?.length) {
    const seg = lead.segmento.toLowerCase();
    if (ctx.icp_segmentos.some((s) => seg.includes(s.toLowerCase()))) score += 20;
  }
  if (lead.cidade && ctx.icp_cidades?.length) {
    const cid = lead.cidade.toLowerCase();
    if (ctx.icp_cidades.some((c) => cid.includes(c.toLowerCase()))) score += 10;
  }

  // tamanho
  const func = lead.funcionarios_estimado ?? 0;
  if (func >= 200) score += 15;
  else if (func >= 50) score += 10;
  else if (func >= 10) score += 5;

  // canais de contato
  if (lead.email) score += 8;
  if (lead.whatsapp) score += 8;
  if (lead.telefone) score += 4;
  if (lead.site) score += 3;

  // enriquecimento
  const techCount = lead.tecnologias?.length ?? 0;
  score += Math.min(techCount, 5) * 2; // até 10
  const decisorCount = lead.decisores?.length ?? 0;
  score += Math.min(decisorCount, 3) * 4; // até 12
  const doresCount = lead.dores?.length ?? 0;
  score += Math.min(doresCount, 3) * 3; // até 9
  if (lead.redes_sociais && Object.keys(lead.redes_sociais).length > 0) score += 3;

  // bônus capado em 15
  if (score > 100) score = 100;
  if (score < 0) score = 0;
  return Math.round(score);
}

export function scoreBadgeVariant(score: number): "destructive" | "secondary" | "default" {
  if (score >= 60) return "default";
  if (score >= 30) return "secondary";
  return "destructive";
}
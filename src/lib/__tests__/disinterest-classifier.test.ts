import { describe, it, expect } from "vitest";
import {
  classifyDisinterestKind,
  hasExplicitMeetingIntent,
} from "@/lib/message-classification.server";

describe("classifyDisinterestKind — nunca descarta automaticamente", () => {
  it("'estamos estruturando o escritório' → sem_momento", () => {
    expect(
      classifyDisinterestKind(
        "Por enquanto ainda não temos, estamos migrando agora para a área contábil e ainda estruturando nosso escritório.",
      ),
    ).toBe("sem_momento");
  });
  it("'agora não' → sem_momento", () => {
    expect(classifyDisinterestKind("Agora não, obrigado.")).toBe("sem_momento");
  });
  it("'talvez no próximo semestre' → sem_momento", () => {
    expect(classifyDisinterestKind("Talvez no próximo semestre a gente converse."))
      .toBe("sem_momento");
  });
  it("'não é prioridade agora' → sem_momento", () => {
    expect(classifyDisinterestKind("Isso não é prioridade agora para a gente."))
      .toBe("sem_momento");
  });
  it("'sem orçamento no momento' → sem_momento", () => {
    expect(classifyDisinterestKind("Estamos sem orçamento no momento."))
      .toBe("sem_momento");
  });
  it("'já decidimos não contratar' → recusa_definitiva", () => {
    expect(classifyDisinterestKind("Já decidimos não contratar esse tipo de serviço."))
      .toBe("recusa_definitiva");
  });
  it("'não queremos esse serviço' → recusa_definitiva", () => {
    expect(classifyDisinterestKind("Não queremos esse serviço."))
      .toBe("recusa_definitiva");
  });
  it("mensagem neutra → neither", () => {
    expect(classifyDisinterestKind("Poderia me mandar mais informações?"))
      .toBe("neither");
  });
  it("meeting intent não é desinteresse", () => {
    expect(hasExplicitMeetingIntent("Vamos agendar uma reunião")).toBe(true);
    expect(classifyDisinterestKind("Vamos agendar uma reunião")).toBe("neither");
  });
});
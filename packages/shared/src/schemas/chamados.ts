import { z } from "zod";

// Status usados hoje
export const ChamadoStatus = z.enum(["Aberto", "Em Andamento", "Concluido", "Cancelado"]);
export const ChamadoStatusKey = z.enum(["aberto", "em_andamento", "concluido", "cancelado"]);

// Itens de checklist: aceita string ou objeto
export const ChecklistItemSchema = z.union([
  z.string().trim().min(1).transform((s: string) => ({ item: s, resposta: null as null })),
  z.object({
    item: z.string().trim().min(1),
    resposta: z.string().trim().nullish(),
    status: z.string().trim().optional(),
    comentario: z.string().trim().optional().nullable(),
  }).transform((o: { item: string; resposta?: string | null; status?: string; comentario?: string | null }) => ({
    item: o.item,
    resposta: (o.resposta == null && o.status == null)
      ? null as null
      : ((o.resposta ?? o.status ?? "sim").toLowerCase().startsWith("n") ? "nao" : "sim") as "sim" | "nao",
    comentario: o.comentario ?? undefined,
  })),
]);

// Criar chamado (o criador vem do header no back; aqui só payload)
const optionalNonEmptyString = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().trim().min(1).optional());

const optionalEmail = z.preprocess((v) => {
  if (typeof v === "string" && v.trim() === "") return undefined;
  return v;
}, z.string().email().optional());

export const CreateChamadoSchema = z
  .object({
    // Identificação da máquina (qualquer um dos 3)
    maquinaId: optionalNonEmptyString,
    maquinaTag: optionalNonEmptyString,
    maquinaNome: optionalNonEmptyString,

    descricao: z.string().trim().min(5),
    tipo: z.enum(["corretiva", "preventiva"]).optional(),
    manutentorEmail: optionalEmail,          // usado quando “assumir agora”
    checklistItems: z.array(z.string().trim().min(1)).optional(),
    status: z.string().trim().optional(),    // "Aberto" | "Em Andamento"
    agendamentoId: optionalNonEmptyString,

    // aceita mas não depende (pode vir do header)
    criadoPorEmail: optionalEmail,
  })
  .strip(); // descarta chaves desconhecidas em vez de falhar

// Concluir chamado
export const ConcluirChamadoSchema = z.object({
  checklist: z.array(ChecklistItemSchema).optional(), // usada em preventiva
  causa: z.string().trim().optional(),                // obrigatória em corretiva (regra no back)
  solucao: z.string().trim().optional(),              // obrigatória em corretiva (regra no back)
});

// Observação
export const ObservacaoSchema = z.object({
  texto: z.string().trim().min(2),
});

// PATCH checklist “ao vivo”
export const PatchChecklistSchema = z.object({
  checklist: z.array(ChecklistItemSchema),
  userEmail: z.string().email().optional(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type CreateChamadoInput = z.infer<typeof CreateChamadoSchema>;
export type ConcluirChamadoInput = z.infer<typeof ConcluirChamadoSchema>;
export type PatchChecklistInput = z.infer<typeof PatchChecklistSchema>;

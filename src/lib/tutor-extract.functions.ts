import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  mimeType: z.string().min(1).max(100),
  base64: z.string().min(1),
});

export interface ExtractedTutor {
  nome: string | null;
  cpf: string | null;
}

function parseResponse(content: string): ExtractedTutor {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar a resposta da IA.");
  const parsed = JSON.parse(match[0]) as Partial<ExtractedTutor>;
  const nome = parsed.nome != null ? String(parsed.nome).trim() : "";
  const cpfRaw = parsed.cpf != null ? String(parsed.cpf).replace(/\D/g, "") : "";
  return {
    nome: nome || null,
    cpf: cpfRaw.length === 11 ? cpfRaw : null,
  };
}

export const extractTutorFromImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mimeType: string; base64: string }) => schema.parse(input))
  .handler(async ({ data }): Promise<ExtractedTutor> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");

    if (!data.mimeType.startsWith("image/")) {
      throw new Error("Envie uma imagem (JPG, PNG, WEBP).");
    }

    const prompt = `Você é um extrator de dados cadastrais brasileiros. Analise a imagem (RG, CNH, comprovante, print de cadastro, etc.) e responda APENAS um JSON válido, sem markdown, com as chaves:
{"nome": string|null, "cpf": string|null}
- nome: NOME COMPLETO do titular/tutor (sem títulos, sem abreviações). Se houver vários nomes, escolha o do titular principal.
- cpf: CPF no formato "000.000.000-00". Se for CNPJ ou não houver CPF válido, retorne null.
Se não conseguir identificar um campo, retorne null nele. Não invente dados.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.base64}` } },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em alguns instantes.");
      if (resp.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na extração (${resp.status}): ${text.slice(0, 200)}`);
    }

    const json = await resp.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    return parseResponse(content);
  });

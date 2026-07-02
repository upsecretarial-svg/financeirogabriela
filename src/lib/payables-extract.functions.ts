import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  base64: z.string().min(1),
});

export interface ExtractedPayable {
  fornecedor: string | null;
  valor: number | null;
  data_vencimento: string | null;
  codigo_barras: string | null;
  descricao: string | null;
}

export const extractPayableFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filename: string; mimeType: string; base64: string }) => schema.parse(input))
  .handler(async ({ data }): Promise<ExtractedPayable> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");

    const prompt = `Você é um extrator de dados de boletos/faturas brasileiros. Analise o arquivo e responda APENAS um JSON válido, sem markdown, com as chaves:
{"fornecedor": string|null, "valor": number|null, "data_vencimento": "YYYY-MM-DD"|null, "codigo_barras": string|null, "descricao": string|null}
- valor em reais (número, use ponto decimal).
- data_vencimento no formato ISO YYYY-MM-DD.
- codigo_barras: apenas dígitos da linha digitável (44-48 dígitos), sem espaços/pontos.
- fornecedor: razão social ou nome do beneficiário/cedente.
- descricao: resumo curto do que está sendo cobrado.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "file",
                file: {
                  filename: data.filename,
                  file_data: `data:${data.mimeType};base64,${data.base64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Falha na extração (${resp.status}): ${text.slice(0, 200)}`);
    }

    const json = await resp.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Não foi possível interpretar a resposta da IA.");

    try {
      const parsed = JSON.parse(match[0]) as ExtractedPayable;
      return {
        fornecedor: parsed.fornecedor ?? null,
        valor: typeof parsed.valor === "number" ? parsed.valor : null,
        data_vencimento: parsed.data_vencimento ?? null,
        codigo_barras: parsed.codigo_barras ?? null,
        descricao: parsed.descricao ?? null,
      };
    } catch {
      throw new Error("JSON inválido retornado pela IA.");
    }
  });

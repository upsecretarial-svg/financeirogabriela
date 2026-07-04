import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  base64: z.string().min(1),
});

export interface ExtractedNf {
  nf_numero: string | null;
  tutor_cpf: string | null;
}

/** Parse the raw AI content string into a normalized ExtractedNf. */
export function parseExtractedNf(content: string): ExtractedNf {
  const cleaned = content.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Não foi possível interpretar a resposta da IA.");
  const parsed = JSON.parse(match[0]) as Partial<ExtractedNf>;
  const nf = parsed.nf_numero != null ? String(parsed.nf_numero).trim() : "";
  const cpf = parsed.tutor_cpf != null ? String(parsed.tutor_cpf).trim() : "";
  return {
    nf_numero: nf || null,
    tutor_cpf: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(cpf) ? cpf : null,
  };
}

/** Merge extracted values into current: only fill empty fields, preserve existing. */
export function mergeExtractedNf(
  current: { nf_numero: string | null; tutor_cpf: string | null },
  extracted: ExtractedNf,
): { nf_numero?: string; tutor_cpf?: string } {
  const update: { nf_numero?: string; tutor_cpf?: string } = {};
  if (extracted.nf_numero && !current.nf_numero) update.nf_numero = extracted.nf_numero;
  if (extracted.tutor_cpf && !current.tutor_cpf) update.tutor_cpf = extracted.tutor_cpf;
  return update;
}

export const extractNfFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { filename: string; mimeType: string; base64: string }) => schema.parse(input))
  .handler(async ({ data }): Promise<ExtractedNf> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada.");

    const prompt = `Você é um extrator de dados de Notas Fiscais brasileiras (NFS-e/NF-e). Analise o arquivo e responda APENAS um JSON válido, sem markdown, com as chaves:
{"nf_numero": string|null, "tutor_cpf": string|null}
- nf_numero: apenas o número da nota fiscal (dígitos), sem série e sem prefixos.
- tutor_cpf: CPF do tomador/cliente no formato "000.000.000-00". Se for CNPJ, retorne null.`;

    const isImage = data.mimeType.startsWith("image/");
    const contentPart = isImage
      ? { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.base64}` } }
      : { type: "file", file: { filename: data.filename, file_data: `data:${data.mimeType};base64,${data.base64}` } };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: [{ type: "text", text: prompt }, contentPart] }],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Falha na extração (${resp.status}): ${text.slice(0, 200)}`);
    }

    const json = await resp.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    try {
      return parseExtractedNf(content);
    } catch (err) {
      throw new Error((err as Error).message || "JSON inválido retornado pela IA.");
    }
  });

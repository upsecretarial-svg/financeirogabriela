import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const storageFileSchema = z.object({
  bucket: z.enum(["notas-fiscais"]),
  path: z.string().min(1).max(500).refine((value) => !value.includes(".."), {
    message: "Caminho de arquivo inválido.",
  }),
});

export const getStorageFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { bucket: "notas-fiscais"; path: string }) => storageFileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase.storage.from(data.bucket).download(data.path);

    if (error) throw new Error(error.message);
    if (!file) throw new Error("Arquivo não encontrado.");

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const fallbackName = data.path.split("/").pop() || "arquivo.pdf";

    return {
      base64,
      contentType: file.type || "application/pdf",
      filename: fallbackName,
    };
  });
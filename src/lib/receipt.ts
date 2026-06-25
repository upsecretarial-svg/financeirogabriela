import jsPDF from "jspdf";
import logoAsset from "@/assets/logo-kronhardt.png.asset.json";

export interface ReceiptData {
  numero: string;
  tutor: string;
  cpf?: string | null;
  pet: string;
  clinica?: string | null;
  valor: number;
  valorRecebido: number;
  dataPagamento?: string | null;
  formaPagamento?: string | null;
  baixaPor?: string | null;
  observacoes?: string | null;
}

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const extenso = (n: number) => {
  // formato simplificado: usa Intl para reais
  const inteiro = Math.floor(n);
  const cent = Math.round((n - inteiro) * 100);
  return `${inteiro} reais${cent ? ` e ${cent} centavos` : ""}`;
};

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoAsset.url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateReceiptPDF(data: ReceiptData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // Cabeçalho com logo + marca
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "PNG", 14, 12, 26, 26);
    } catch {
      /* ignora se formato incompatível */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Dra. Gabriela Kronhardt", 44, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text("Medicina Veterinária", 44, 26);
  doc.text("Recibo de pagamento", 44, 31);

  doc.setDrawColor(15, 27, 61);
  doc.setLineWidth(0.6);
  doc.line(14, 42, W - 14, 42);

  // Título grande
  doc.setTextColor(15, 27, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("RECIBO", W - 14, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(`Nº ${data.numero}`, W - 14, 29, { align: "right" });

  // Valor destaque
  doc.setFillColor(15, 27, 61);
  doc.rect(14, 50, W - 28, 18, "F");
  doc.setTextColor(255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(brl(data.valorRecebido || data.valor), 20, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Valor recebido", W - 20, 58, { align: "right" });
  doc.setFontSize(11);
  doc.text(fmtDate(data.dataPagamento), W - 20, 64, { align: "right" });

  // Corpo do recibo
  doc.setTextColor(30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = 80;
  const text =
    `Recebi de ${data.tutor}${data.cpf ? `, CPF ${data.cpf}` : ""}, a quantia de ` +
    `${brl(data.valorRecebido || data.valor)} (${extenso(data.valorRecebido || data.valor)}), ` +
    `referente ao atendimento veterinário do paciente ${data.pet}` +
    `${data.clinica ? ` realizado em ${data.clinica}` : ""}.`;
  const lines = doc.splitTextToSize(text, W - 28);
  doc.text(lines, 14, y);
  y += lines.length * 6 + 6;

  // Quadro de detalhes
  doc.setDrawColor(220);
  doc.roundedRect(14, y, W - 28, 38, 2, 2);
  doc.setFontSize(9);
  doc.setTextColor(110);
  const col1 = 18;
  const col2 = W / 2 + 4;
  doc.text("Forma de pagamento", col1, y + 8);
  doc.text("Data do pagamento", col2, y + 8);
  doc.text("Recebido por", col1, y + 22);
  doc.text("Atendimento", col2, y + 22);
  doc.setTextColor(30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(data.formaPagamento || "—", col1, y + 14);
  doc.text(fmtDate(data.dataPagamento), col2, y + 14);
  doc.text(data.baixaPor || "—", col1, y + 28);
  doc.text(data.numero, col2, y + 28);
  y += 46;

  if (data.observacoes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text("Observações:", 14, y);
    doc.setTextColor(30);
    const obs = doc.splitTextToSize(data.observacoes, W - 28);
    doc.text(obs, 14, y + 5);
    y += obs.length * 5 + 8;
  }

  // Assinatura
  y = Math.max(y, 220);
  doc.setDrawColor(120);
  doc.line(W / 2 - 40, y, W / 2 + 40, y);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("Dra. Gabriela Kronhardt — CRMV", W / 2, y + 5, { align: "center" });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    `Emitido em ${new Date().toLocaleString("pt-BR")}`,
    W / 2,
    doc.internal.pageSize.getHeight() - 10,
    { align: "center" },
  );

  doc.save(`recibo_${data.numero}.pdf`);
}

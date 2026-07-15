import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportXLSX(filename: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Relatório");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportXLSXMultiSheet(
  filename: string,
  sheets: { name: string; rows: Record<string, unknown>[] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "(sem dados)": "" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportPDF(
  filename: string,
  title: string,
  head: string[],
  body: (string | number)[][],
  summary?: Record<string, string>,
) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 25);

  let startY = 32;
  if (summary) {
    const lines = Object.entries(summary).map(([k, v]) => `${k}: ${v}`);
    doc.setTextColor(0);
    doc.text(lines, 14, startY);
    startY += lines.length * 6 + 4;
  }

  autoTable(doc, {
    head: [head],
    body,
    startY,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [217, 77, 138] },
  });

  doc.save(`${filename}.pdf`);
}

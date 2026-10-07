// Renders the seller's response as a one-page PDF. PayPal's sandbox accepted chargeback
// evidence only with a document attached, and the response text is the document we have.
// Plain PDF 1.4 with the built-in Helvetica font, so no dependency is needed.

export function evidencePdf(title: string, body: string): Blob {
  const esc = (s: string) => s.replace(/[^\x20-\x7e]/g, " ").replace(/([\\()])/g, "\\$1");
  const lines = [title, "", ...wrap(body, 95)].slice(0, 60);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 13 : 10} Tf 48 ${750 - i * 12} Td (${esc(l)}) Tj ET`).join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: "application/pdf" });
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split(/\n/)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if (line && line.length + word.length + 1 > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

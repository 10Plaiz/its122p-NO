// A minimal, complete PDF built by hand for tests: exact byte offsets, a real
// cross-reference table, and a trailer. No PDF library, so no test can change how
// it is made (jspdf, for one, breaks once another test defines a fake window).

export function syntheticPdf({ text = "Synthetic proof of residency", pages = 1, catalog = "", trailer = "" } = {}) {
  const objects: string[] = [];
  const pageIds = Array.from({ length: pages }, (_, index) => 4 + index * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R ${catalog}>>`;
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  for (const [index, id] of pageIds.entries()) {
    const content = `BT /F1 12 Tf 40 760 Td (${text} - page ${index + 1}) Tj ET`;
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  }

  let body = "%PDF-1.7\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R ${trailer}>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

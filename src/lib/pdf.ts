// Download one or more A6 cards as a PDF (each card on its own A6 page).
export async function cardsToPdf(cards: HTMLElement[], filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  await document.fonts?.ready;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
  for (let i = 0; i < cards.length; i++) {
    const canvas = await html2canvas(cards[i], { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
    if (i > 0) pdf.addPage('a6', 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 105, 148);
  }
  pdf.save(filename);
}

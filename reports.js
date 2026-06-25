// ── reports.js — Geração de PDF e Excel ──────────────────────────────────────

const fmtMoeda = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData  = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";

// ── PDF ───────────────────────────────────────────────────────────────────────
function gerarPDF(tipo, dados, cliente) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });

  const verde  = [15, 81, 50];
  const ouro   = [212, 175, 55];
  const cinza  = [100, 100, 100];
  const W = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(...verde);
  doc.rect(0, 0, W, 38, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16); doc.setTextColor(255, 255, 255);
  doc.text("HELMIGUI SERVIÇOS FINANCEIROS", 14, 16);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(tituloPDF(tipo), 14, 26);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, W - 14, 26, { align: "right" });

  if (cliente?.razaoSocial) {
    doc.setFontSize(8);
    doc.text(`Cliente: ${cliente.razaoSocial}  |  CNPJ: ${cliente.cnpj || "—"}`, 14, 33);
  }

  doc.setTextColor(0, 0, 0);
  let y = 50;

  if (tipo === "fluxo") {
    const entradas = dados.filter(l => l.tipo === "entrada");
    const saidas   = dados.filter(l => l.tipo === "saida");
    const totE     = entradas.reduce((s, l) => s + (l.valor || 0), 0);
    const totS     = saidas.reduce((s, l) => s + (l.valor || 0), 0);
    const saldo    = totE - totS;

    // Resumo
    doc.setFillColor(245, 248, 245);
    doc.roundedRect(14, y, W - 28, 22, 3, 3, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.setTextColor(...verde); doc.text(`Entradas: ${fmtMoeda(totE)}`, 20, y + 8);
    doc.setTextColor(168, 71, 46); doc.text(`Saídas: ${fmtMoeda(totS)}`, 80, y + 8);
    doc.setTextColor(saldo >= 0 ? verde[0] : 168, saldo >= 0 ? verde[1] : 71, saldo >= 0 ? verde[2] : 46);
    doc.text(`Saldo: ${fmtMoeda(saldo)}`, 150, y + 8);
    y += 30;

    doc.setTextColor(0, 0, 0);
    doc.autoTable({
      startY: y,
      head: [["Data", "Descrição", "Categoria", "Tipo", "Valor"]],
      body: dados.map(l => [
        fmtData(l.data || l.criadoEm),
        l.descricao || "—",
        l.categoria || "—",
        l.tipo === "entrada" ? "Entrada" : "Saída",
        fmtMoeda(l.valor),
      ]),
      headStyles: { fillColor: verde, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 248] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 4: { halign: "right" } },
    });

  } else if (tipo === "dre") {
    const receitas  = dados.filter(l => l.tipo === "entrada").reduce((s, l) => s + (l.valor || 0), 0);
    const despesas  = dados.filter(l => l.tipo === "saida").reduce((s, l) => s + (l.valor || 0), 0);
    const lucro     = receitas - despesas;
    const margem    = receitas > 0 ? ((lucro / receitas) * 100).toFixed(1) : 0;

    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text("DRE — Demonstração do Resultado", 14, y); y += 12;

    const linhas = [
      ["(+) Receitas Brutas", fmtMoeda(receitas)],
      ["(-) Despesas Operacionais", fmtMoeda(despesas)],
      ["(=) Resultado Operacional", fmtMoeda(lucro)],
      ["Margem de Lucro", margem + "%"],
    ];
    linhas.forEach(([label, valor], i) => {
      if (i === 2) { doc.setDrawColor(200); doc.line(14, y, W - 14, y); y += 4; }
      const isLucro = i === 2;
      doc.setFont("helvetica", isLucro ? "bold" : "normal"); doc.setFontSize(10);
      doc.setTextColor(isLucro ? (lucro >= 0 ? verde[0] : 168) : 0, isLucro ? (lucro >= 0 ? verde[1] : 71) : 0, isLucro ? verde[2] : 0);
      doc.text(label, 14, y);
      doc.text(valor, W - 14, y, { align: "right" });
      y += 10;
    });

    y += 10;
    doc.setTextColor(0, 0, 0);

    // Tabela por categoria
    const porCategoria = {};
    dados.forEach(l => {
      const k = (l.categoria || "Outros") + " | " + (l.tipo === "entrada" ? "Entrada" : "Saída");
      if (!porCategoria[k]) porCategoria[k] = 0;
      porCategoria[k] += l.valor || 0;
    });
    doc.autoTable({
      startY: y,
      head: [["Categoria / Tipo", "Total"]],
      body: Object.entries(porCategoria).map(([k, v]) => [k, fmtMoeda(v)]),
      headStyles: { fillColor: verde, textColor: 255, fontStyle: "bold", fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 1: { halign: "right" } },
    });

  } else if (tipo === "notas") {
    doc.autoTable({
      startY: y,
      head: [["Nº Nota", "Emitente", "Tipo", "Valor", "Vencimento", "Status"]],
      body: dados.map(n => [
        n.numero || "—",
        n.emissor || "—",
        n.tipo || "—",
        fmtMoeda(n.valor),
        n.vencimento || "—",
        n.status || "pendente",
      ]),
      headStyles: { fillColor: verde, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 248] },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: { 3: { halign: "right" } },
    });
  }

  // Rodapé em todas as páginas
  const totalPags = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPags; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(...cinza);
    doc.text("Helmigui Serviços Financeiros", 14, 290);
    doc.text(`Página ${i} de ${totalPags}`, W - 14, 290, { align: "right" });
    doc.setDrawColor(...ouro);
    doc.line(14, 284, W - 14, 284);
  }

  doc.save(`Helmigui_${tituloPDF(tipo).replace(/\s/g, "_")}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`);
}

function tituloPDF(tipo) {
  return { fluxo: "Fluxo de Caixa", dre: "DRE Simplificado", notas: "Notas Fiscais" }[tipo] || "Relatório";
}

// ── Excel ─────────────────────────────────────────────────────────────────────
function gerarExcel(tipo, dados, cliente) {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  let ws;
  if (tipo === "fluxo") {
    const rows = [
      ["Data", "Descrição", "Categoria", "Tipo", "Valor (R$)"],
      ...dados.map(l => [
        fmtData(l.data || l.criadoEm),
        l.descricao || "",
        l.categoria || "",
        l.tipo === "entrada" ? "Entrada" : "Saída",
        l.valor || 0,
      ]),
      [],
      ["TOTAIS"],
      ["Entradas", dados.filter(l => l.tipo === "entrada").reduce((s, l) => s + (l.valor || 0), 0)],
      ["Saídas",   dados.filter(l => l.tipo === "saida").reduce((s, l) => s + (l.valor || 0), 0)],
    ];
    ws = XLSX.utils.aoa_to_sheet(rows);
  } else if (tipo === "notas") {
    const rows = [
      ["Nº Nota", "Emitente", "CNPJ Emitente", "Tipo", "Valor (R$)", "Emissão", "Vencimento", "Status", "Obs"],
      ...dados.map(n => [n.numero, n.emissor, n.cnpjEmitente, n.tipo, n.valor, n.dataEmissao, n.vencimento, n.status, n.observacoes]),
    ];
    ws = XLSX.utils.aoa_to_sheet(rows);
  } else {
    ws = XLSX.utils.json_to_sheet(dados);
  }

  const nomeAba = tituloPDF(tipo).substring(0, 30);
  XLSX.utils.book_append_sheet(wb, ws, nomeAba);

  // Resumo do cliente
  if (cliente) {
    const wsInfo = XLSX.utils.aoa_to_sheet([
      ["Relatório Helmigui Serviços Financeiros"],
      ["Cliente", cliente.razaoSocial || "—"],
      ["CNPJ", cliente.cnpj || "—"],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
    ]);
    XLSX.utils.book_append_sheet(wb, wsInfo, "Informações");
  }

  XLSX.writeFile(wb, `Helmigui_${nomeAba.replace(/\s/g, "_")}_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`);
}

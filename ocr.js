// ── ocr.js — OCR Tesseract.js + classificação inteligente ────────────────────

let tesseractWorker = null;

async function iniciarTesseract() {
  if (tesseractWorker) return tesseractWorker;
  tesseractWorker = await Tesseract.createWorker("por", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const p = Math.round((m.progress || 0) * 100);
        const el = document.getElementById("ocr-progresso");
        if (el) el.textContent = `OCR: ${p}%`;
      }
    },
  });
  return tesseractWorker;
}

async function rodarOCR(origem) {
  const worker = await iniciarTesseract();
  const { data } = await worker.recognize(origem);
  return data.text || "";
}

// ── Extração de campos ────────────────────────────────────────────────────────

function extrairNumeroNota(t) {
  const padroes = [
    /n[uúo]mero\s*:?\s*(\d[\d.\/\-]{1,20})/i,
    /n[oº°]\s*\.?\s*(\d[\d.\/\-]{1,20})/i,
    /nf[se]?[-\s]*e?\s*n[oº°]?\s*(\d[\d.\/\-]{1,10})/i,
    /nota\s+fiscal\s+n[oº°]?\s*:?\s*(\d{1,10})/i,
    /\b(\d{4,8})\b/,
  ];
  for (const r of padroes) { const m = t.match(r); if (m) return m[1].trim(); }
  return "";
}

function extrairEmissor(t) {
  const linhas = t.split("\n").map(l => l.trim()).filter(Boolean);
  for (let i = 1; i < linhas.length; i++) {
    if (/cnpj|cpf|inscri/i.test(linhas[i])) return linhas[i - 1];
  }
  return linhas.find(l => l.length > 8 && /[a-zA-Z]{3}/.test(l)) || "";
}

function extrairCNPJ(t) {
  const m = t.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/);
  return m ? m[0].replace(/\s/g, "") : "";
}

function extrairValor(t) {
  const padroes = [
    /valor\s+total\s*:?\s*R?\$?\s*([\d.,]+)/i,
    /total\s+do\s+documento\s*:?\s*R?\$?\s*([\d.,]+)/i,
    /total\s+da\s+nota\s*:?\s*R?\$?\s*([\d.,]+)/i,
    /R\$\s*([\d.]+,\d{2})/i,
  ];
  for (const r of padroes) {
    const m = t.match(r);
    if (m) {
      const raw = m[1].replace(/\./g, "").replace(",", ".");
      const n = parseFloat(raw);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return 0;
}

function extrairDataEmissao(t) {
  const m = t.match(/(?:data\s+de\s+emiss[aã]o|emiss[aã]o)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i)
         || t.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
  return m ? m[1].replace(/[-\.]/g, "/") : "";
}

function extrairVencimento(t) {
  const m = t.match(/venc[ie]?\.?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  return m ? m[1].replace(/[-\.]/g, "/") : "";
}

// ── Classificação inteligente (tipo + categoria) ──────────────────────────────

function classificarTipo(t) {
  const T = t.toUpperCase();
  const servico  = ["NFS-E", "NOTA FISCAL DE SERVIÇOS", "ISS", "ISSQN", "PRESTAÇÃO DE SERVIÇOS", "TOMADOR"];
  const material = ["NF-E", "DANFE", "ICMS", "NOTA FISCAL DE PRODUTOS", "PRODUTO", "MERCADORIA"];
  let ps = 0, pm = 0;
  servico.forEach(p  => T.includes(p) && ps++);
  material.forEach(p => T.includes(p) && pm++);
  if (ps > pm) return "Serviço";
  if (pm > ps) return "Produto";
  return "";
}

function classificarCategoria(t, tipo) {
  const T = t.toUpperCase();
  if (/folha|salário|fgts|inss|rescis/i.test(T))      return "Folha de Pagamento";
  if (/aluguel|locaç|imóvel/i.test(T))                 return "Aluguel";
  if (/energia|luz|água|internet|telefone/i.test(T))   return "Utilidades";
  if (/transport|frete|entrega|logíst/i.test(T))       return "Transporte";
  if (/marketing|publicidad|propaganda/i.test(T))      return "Marketing";
  if (/material|escritório|informát/i.test(T))         return "Material de Escritório";
  if (/consultoria|assessoria/i.test(T))               return "Consultoria";
  if (/manutenção|reparo|assist/i.test(T))             return "Manutenção";
  if (/imposto|taxa|tributo|guia/i.test(T))            return "Impostos e Taxas";
  if (tipo === "Serviço")  return "Serviço";
  if (tipo === "Produto")  return "Fornecedor / Produto";
  return "Despesa Operacional";
}

function classificarFluxo(categoria, tipo) {
  // Notas fiscais recebidas são geralmente saídas (contas a pagar)
  // Mas se o emitente é o próprio cliente, é entrada
  const cats_entrada = ["Receita", "Venda"];
  if (cats_entrada.includes(categoria)) return "entrada";
  return "saida";
}

// ── Função principal ──────────────────────────────────────────────────────────
async function processarImagemOCR(origem) {
  const texto = await rodarOCR(origem);
  const tipo = classificarTipo(texto);
  const categoria = classificarCategoria(texto, tipo);
  return {
    numero:       extrairNumeroNota(texto),
    emissor:      extrairEmissor(texto),
    cnpjEmitente: extrairCNPJ(texto),
    valor:        extrairValor(texto),
    dataEmissao:  extrairDataEmissao(texto),
    vencimento:   extrairVencimento(texto),
    tipo,
    categoria,
    fluxo:        classificarFluxo(categoria, tipo),
    textoCompleto: texto,
  };
}

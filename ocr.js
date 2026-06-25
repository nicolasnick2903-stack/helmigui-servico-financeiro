// ── ocr.js — OCR via Tesseract.js + heurísticas para extração de dados da nota ──

let tesseractWorker = null;

/**
 * Inicializa o worker do Tesseract com idioma português.
 * Carregamento ocorre uma única vez.
 */
async function iniciarTesseract() {
  if (tesseractWorker) return tesseractWorker;
  tesseractWorker = await Tesseract.createWorker("por", 1, {
    logger: (m) => {
      if (m.status === "recognizing text") {
        const progresso = Math.round((m.progress || 0) * 100);
        const el = document.getElementById("ocr-progresso");
        if (el) el.textContent = `OCR: ${progresso}%`;
      }
    },
  });
  return tesseractWorker;
}

/**
 * Roda OCR em uma imagem (File, Blob ou URL de objeto).
 * @param {File|Blob|string} origem
 * @returns {Promise<string>} texto bruto reconhecido
 */
async function rodarOCR(origem) {
  const worker = await iniciarTesseract();
  const { data } = await worker.recognize(origem);
  return data.text || "";
}

// ── Heurísticas de extração ───────────────────────────────────────────────────

/**
 * Tenta encontrar o número da nota fiscal no texto reconhecido.
 * Padrões comuns: "Nº 000123", "Número: 123", "NF 456", "000.456"
 * @param {string} texto
 * @returns {string}
 */
function extrairNumeroNota(texto) {
  const padroes = [
    /n[uúo]mero\s*:?\s*(\d[\d.\/\-]{1,20})/i,
    /n[oº°]\s*\.?\s*(\d[\d.\/\-]{1,20})/i,
    /nf[se]?[-\s]*e?\s*n[oº°]?\s*(\d[\d.\/\-]{1,20})/i,
    /\bnota\s+fiscal\s+n[oº°]?\s*:?\s*(\d[\d.\/\-]{1,10})/i,
    /\b(\d{3,6})\b/,  // fallback: sequência de 3-6 dígitos
  ];

  for (const regex of padroes) {
    const m = texto.match(regex);
    if (m) return m[1].trim();
  }
  return "";
}

/**
 * Tenta encontrar o nome do emissor/razão social no texto.
 * Geralmente está nas primeiras linhas, antes de "CNPJ" ou "Inscrição".
 * @param {string} texto
 * @returns {string}
 */
function extrairEmissor(texto) {
  const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);

  // Procura linha antes de "CNPJ" ou "CPF" — costuma ser o nome da empresa
  for (let i = 1; i < linhas.length; i++) {
    if (/cnpj|cpf|inscri/i.test(linhas[i])) {
      return linhas[i - 1];
    }
  }

  // Fallback: primeira linha com mais de 5 caracteres
  return linhas.find((l) => l.length > 5) || "";
}

/**
 * Detecta o tipo da nota a partir de palavras-chave no texto.
 * Retorna "Serviço", "Material" ou "" (indeterminado).
 * @param {string} texto
 * @returns {"Serviço"|"Material"|""}
 */
function detectarTipoNota(texto) {
  const t = texto.toUpperCase();

  const palavrasServico = ["NFS-E", "NOTA FISCAL DE SERVIÇOS", "ISS", "ISSQN", "NOTA FISCAL DE SERVIÇO"];
  const palavrasMaterial = ["NF-E", "NOTA FISCAL ELETRÔNICA DE PRODUTOS", "ICMS", "DANFE", "NOTA FISCAL DE PRODUTOS"];

  let pontoServico = 0;
  let pontoMaterial = 0;

  for (const p of palavrasServico) if (t.includes(p)) pontoServico++;
  for (const p of palavrasMaterial) if (t.includes(p)) pontoMaterial++;

  if (pontoServico > pontoMaterial) return "Serviço";
  if (pontoMaterial > pontoServico) return "Material";
  return ""; // não conseguiu determinar — usuário seleciona manualmente
}

/**
 * Tenta extrair data de vencimento do texto via OCR (fallback quando não há código de barras).
 * Padrões: "Vencimento: 31/12/2024", "Venc. 31/12/24"
 * @param {string} texto
 * @returns {string}
 */
function extrairVencimentoOCR(texto) {
  const m = texto.match(/venc[ie]?\.?\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if (m) {
    // Normaliza para DD/MM/AAAA
    return m[1].replace(/[-\.]/g, "/");
  }
  return "";
}

/**
 * Função principal: roda OCR e retorna os campos extraídos.
 * @param {File|Blob|string} origem
 * @returns {Promise<{ numero, emissor, tipo, vencimentoOCR, textoCompleto }>}
 */
async function processarImagemOCR(origem) {
  const texto = await rodarOCR(origem);
  return {
    numero: extrairNumeroNota(texto),
    emissor: extrairEmissor(texto),
    tipo: detectarTipoNota(texto),
    vencimentoOCR: extrairVencimentoOCR(texto),
    textoCompleto: texto,
  };
}

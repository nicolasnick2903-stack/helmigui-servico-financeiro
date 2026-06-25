// ── barcode.js — Leitura de código de barras (ZXing) + decodificação Febraban ──

// Data-base Febraban para cálculo de vencimento a partir do fator
const DATA_BASE_FEBRABAN = new Date("1997-10-07T00:00:00.000Z");

/**
 * Decodifica a data de vencimento a partir do fator de vencimento Febraban.
 * O fator é um número de 4 dígitos presente na linha digitável do boleto.
 * Fator 0000 significa "sem vencimento" (boleto sem data definida).
 * @param {string|number} fator
 * @returns {string} data no formato DD/MM/AAAA ou "Sem vencimento"
 */
function decodificarFatorVencimento(fator) {
  const n = parseInt(fator, 10);
  if (!n || n === 0) return "Sem vencimento";
  const data = new Date(DATA_BASE_FEBRABAN);
  data.setDate(data.getDate() + n);
  return data.toLocaleDateString("pt-BR");
}

/**
 * Extrai valor e vencimento de uma linha digitável de boleto (padrão Febraban).
 * Linha digitável tem 47 dígitos (sem pontos/espaços).
 * Posições (0-indexed):
 *   - Fator de vencimento: índices 33–36 (4 dígitos)
 *   - Valor: índices 37–46 (10 dígitos, os dois últimos são centavos)
 * @param {string} linha47 — apenas dígitos, sem formatação
 * @returns {{ valor: string, vencimento: string } | null}
 */
function decodificarLinhaDigitavel(linha47) {
  const digits = linha47.replace(/\D/g, "");
  if (digits.length < 44) return null;

  // Padrão Febraban: campo livre começa diferente para boleto bancário vs. tributo
  // Boleto bancário: posição 5 é "9" (campo de livre) — estrutura 3+5+5+1+5+14 = 33 dig + 4 fator + 10 valor
  // Lemos o fator nas posições 33–36 e o valor em 37–46
  const fator = digits.substring(33, 37);
  const valorRaw = digits.substring(37, 47);
  const valorCentavos = parseInt(valorRaw, 10);
  const valor = (valorCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return {
    valor,
    valorNumerico: valorCentavos / 100,
    vencimento: decodificarFatorVencimento(fator),
  };
}

// ── Instância do leitor ZXing (carregado via CDN no HTML) ────────────────────
let zxingReader = null;
let leituraAtiva = false;

/**
 * Inicializa o leitor ZXing se ainda não foi inicializado.
 */
function obterLeitorZXing() {
  if (!zxingReader && window.ZXing) {
    const hints = new Map();
    hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      window.ZXing.BarcodeFormat.ITF,
      window.ZXing.BarcodeFormat.CODE_128,
      window.ZXing.BarcodeFormat.CODE_39,
    ]);
    zxingReader = new window.ZXing.BrowserMultiFormatReader(hints);
  }
  return zxingReader;
}

/**
 * Inicia a leitura contínua de código de barras a partir de um elemento <video>.
 * Chama onDetectado({ valor, vencimento }) ao detectar um boleto válido.
 * @param {HTMLVideoElement} videoEl
 * @param {function} onDetectado
 */
async function iniciarLeitorContinuo(videoEl, onDetectado) {
  const leitor = obterLeitorZXing();
  if (!leitor) {
    console.warn("ZXing não carregado ainda.");
    return;
  }

  leituraAtiva = true;

  // Cria um canvas auxiliar para capturar frames do vídeo
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  async function tentarFrame() {
    if (!leituraAtiva || videoEl.readyState < 2) {
      if (leituraAtiva) requestAnimationFrame(tentarFrame);
      return;
    }

    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    ctx.drawImage(videoEl, 0, 0);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const luminanceSource = new window.ZXing.HTMLCanvasElementLuminanceSource(canvas);
      const binaryBitmap = new window.ZXing.BinaryBitmap(
        new window.ZXing.HybridBinarizer(luminanceSource)
      );
      const resultado = leitor.decodeBitmap(binaryBitmap);

      if (resultado) {
        const texto = resultado.getText().replace(/\D/g, "");
        const dados = decodificarLinhaDigitavel(texto);
        if (dados) {
          leituraAtiva = false;
          onDetectado({ ...dados, codigoBruto: texto });
          return;
        }
      }
    } catch (_) {
      // Nenhum código detectado neste frame — continua tentando
    }

    if (leituraAtiva) requestAnimationFrame(tentarFrame);
  }

  requestAnimationFrame(tentarFrame);
}

/**
 * Para a leitura contínua.
 */
function pararLeitorContinuo() {
  leituraAtiva = false;
}

/**
 * Tenta ler código de barras de uma imagem (File ou Blob).
 * @param {File|Blob} arquivo
 * @returns {Promise<{ valor, vencimento, codigoBruto } | null>}
 */
async function lerCodigoDeImagem(arquivo) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      try {
        const leitor = obterLeitorZXing();
        if (!leitor) { resolve(null); return; }

        const luminanceSource = new window.ZXing.HTMLCanvasElementLuminanceSource(canvas);
        const binaryBitmap = new window.ZXing.BinaryBitmap(
          new window.ZXing.HybridBinarizer(luminanceSource)
        );
        const resultado = leitor.decodeBitmap(binaryBitmap);
        const texto = resultado.getText().replace(/\D/g, "");
        const dados = decodificarLinhaDigitavel(texto);
        resolve(dados ? { ...dados, codigoBruto: texto } : null);
      } catch (_) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ── app.js — Estado, telas e fluxo principal do app cliente Helmigui ─────────

// ── Estado global ─────────────────────────────────────────────────────────────
const Estado = {
  telaAtual: "home",
  stream: null,            // MediaStream da câmera
  imagemCapturada: null,   // Blob/File da foto capturada para OCR
  dadosExtracao: {},       // Dados mesclados (barcode + OCR) antes da confirmação
};

// ── Persistência (localStorage) ───────────────────────────────────────────────
function salvarNotas(notas) {
  localStorage.setItem("helmigui_notas", JSON.stringify(notas));
}
function carregarNotas() {
  return JSON.parse(localStorage.getItem("helmigui_notas") || "[]");
}
function salvarLancamentos(lancs) {
  localStorage.setItem("helmigui_lancamentos", JSON.stringify(lancs));
}
function carregarLancamentos() {
  return JSON.parse(localStorage.getItem("helmigui_lancamentos") || "[]");
}

// ── Navegação entre telas ─────────────────────────────────────────────────────
function irPara(tela) {
  pararCamera();
  Estado.telaAtual = tela;
  document.querySelectorAll(".tela").forEach((t) => t.classList.remove("ativa"));
  const el = document.getElementById("tela-" + tela);
  if (el) el.classList.add("ativa");

  // Renderiza a tela conforme necessário
  if (tela === "notas") renderizarListaNotas();
  if (tela === "fluxo") renderizarFluxo();
}

// ── Câmera ────────────────────────────────────────────────────────────────────
async function abrirCamera() {
  irPara("camera");
  const video = document.getElementById("video-camera");
  const btnCapturar = document.getElementById("btn-capturar");
  btnCapturar.disabled = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    Estado.stream = stream;
    video.srcObject = stream;
    await video.play();
    btnCapturar.disabled = false;

    // Leitura contínua automática de código de barras
    iniciarLeitorContinuo(video, (dadosBarcode) => {
      Estado.dadosExtracao = { ...Estado.dadosExtracao, ...dadosBarcode };
      capturarFrameEProcessar(video);
    });
  } catch (err) {
    mostrarErroCamera(err);
  }
}

function pararCamera() {
  pararLeitorContinuo();
  if (Estado.stream) {
    Estado.stream.getTracks().forEach((t) => t.stop());
    Estado.stream = null;
  }
}

function mostrarErroCamera(err) {
  const msg = document.getElementById("msg-camera");
  if (!msg) return;
  if (err.name === "NotAllowedError") {
    msg.textContent = "Permissão de câmera negada. Use o botão 'Enviar foto' abaixo.";
  } else {
    msg.textContent = "Câmera indisponível. Use o botão 'Enviar foto'.";
  }
  msg.style.display = "block";
}

// ── Captura manual de frame e processamento ───────────────────────────────────
async function capturarFrameManual() {
  const video = document.getElementById("video-camera");
  if (!video.srcObject) return;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  canvas.toBlob(async (blob) => {
    Estado.imagemCapturada = blob;
    await capturarFrameEProcessar(video);
  }, "image/jpeg", 0.92);
}

async function capturarFrameEProcessar(video) {
  pararCamera();
  irPara("processando");

  // Captura frame se ainda não tiver imagem
  if (!Estado.imagemCapturada) {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    Estado.imagemCapturada = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  }

  await processarImagem(Estado.imagemCapturada);
}

// ── Upload de arquivo ─────────────────────────────────────────────────────────
async function processarUpload(arquivo) {
  Estado.imagemCapturada = arquivo;
  irPara("processando");
  await processarImagem(arquivo);
}

// ── Processamento principal (barcode + OCR) ───────────────────────────────────
async function processarImagem(origem) {
  const status = document.getElementById("status-processando");

  try {
    // 1. Tenta ler código de barras
    if (status) status.textContent = "Lendo código de barras...";
    const dadosBarcode = await lerCodigoDeImagem(origem);
    if (dadosBarcode) {
      Estado.dadosExtracao = { ...Estado.dadosExtracao, ...dadosBarcode };
    }

    // 2. Roda OCR
    if (status) status.textContent = "Reconhecendo texto (OCR)...";
    const dadosOCR = await processarImagemOCR(origem);
    Estado.dadosExtracao = { ...Estado.dadosExtracao, ...dadosOCR };

    // Usa vencimento do barcode se disponível, senão tenta do OCR
    if (!Estado.dadosExtracao.vencimento && Estado.dadosExtracao.vencimentoOCR) {
      Estado.dadosExtracao.vencimento = Estado.dadosExtracao.vencimentoOCR;
    }

    irPara("confirmacao");
    preencherFormularioConfirmacao(Estado.dadosExtracao);
  } catch (err) {
    console.error("Erro no processamento:", err);
    if (status) status.textContent = "Erro ao processar. Tente novamente.";
    setTimeout(() => irPara("home"), 2500);
  }
}

// ── Tela de confirmação ───────────────────────────────────────────────────────
function preencherFormularioConfirmacao(dados) {
  document.getElementById("conf-numero").value = dados.numero || "";
  document.getElementById("conf-emissor").value = dados.emissor || "";
  document.getElementById("conf-vencimento").value = dados.vencimento || "";
  document.getElementById("conf-valor").value = dados.valorNumerico
    ? dados.valorNumerico.toFixed(2).replace(".", ",")
    : "";

  // Tipo: pré-seleciona se detectado, senão deixa em branco
  const selectTipo = document.getElementById("conf-tipo");
  selectTipo.value = dados.tipo || "";
}

function salvarNota(e) {
  e.preventDefault();
  const form = document.getElementById("form-confirmacao");
  const dados = {
    id: Date.now().toString(),
    numero: form["conf-numero"].value.trim(),
    emissor: form["conf-emissor"].value.trim(),
    vencimento: form["conf-vencimento"].value.trim(),
    valor: parseFloat(form["conf-valor"].value.replace(",", ".")) || 0,
    tipo: form["conf-tipo"].value,
    salvoEm: new Date().toLocaleDateString("pt-BR"),
  };

  // Salva nota
  const notas = carregarNotas();
  notas.unshift(dados);
  salvarNotas(notas);

  // Cria lançamento de SAÍDA automático no fluxo de caixa
  if (dados.valor > 0) {
    const lancamentos = carregarLancamentos();
    lancamentos.unshift({
      id: "nota-" + dados.id,
      tipo: "saida",
      descricao: `Nota ${dados.numero || "s/n"} — ${dados.emissor || "Emissor desconhecido"}`,
      valor: dados.valor,
      data: dados.vencimento || dados.salvoEm,
      origem: "nota",
    });
    salvarLancamentos(lancamentos);
  }

  Estado.imagemCapturada = null;
  Estado.dadosExtracao = {};
  irPara("notas");
}

// ── Lista de notas ────────────────────────────────────────────────────────────
function renderizarListaNotas() {
  const lista = document.getElementById("lista-notas");
  const notas = carregarNotas();

  if (!notas.length) {
    lista.innerHTML = '<p class="vazio">Nenhuma nota salva ainda.</p>';
    return;
  }

  lista.innerHTML = notas
    .map(
      (n) => `
    <div class="card-nota" data-id="${n.id}">
      <div class="nota-header">
        <span class="nota-emissor">${n.emissor || "Emissor desconhecido"}</span>
        <span class="badge-tipo ${n.tipo === "Serviço" ? "servico" : "material"}">${n.tipo || "—"}</span>
      </div>
      <div class="nota-linha">
        <span class="nota-label">Nº</span>
        <span class="nota-valor-txt">${n.numero || "—"}</span>
      </div>
      <div class="nota-linha">
        <span class="nota-label">Venc.</span>
        <span class="nota-valor-txt">${n.vencimento || "—"}</span>
      </div>
      <div class="nota-linha">
        <span class="nota-label">Valor</span>
        <span class="nota-valor-txt valor-destaque">${n.valor ? n.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</span>
      </div>
      <div class="nota-acoes">
        <button class="btn-secundario" onclick="editarNota('${n.id}')">Editar</button>
        <button class="btn-perigo" onclick="excluirNota('${n.id}')">Excluir</button>
      </div>
    </div>`
    )
    .join("");
}

function excluirNota(id) {
  if (!confirm("Excluir esta nota?")) return;
  const notas = carregarNotas().filter((n) => n.id !== id);
  salvarNotas(notas);
  // Remove lançamento vinculado
  const lancs = carregarLancamentos().filter((l) => l.id !== "nota-" + id);
  salvarLancamentos(lancs);
  renderizarListaNotas();
}

function editarNota(id) {
  const nota = carregarNotas().find((n) => n.id === id);
  if (!nota) return;
  Estado.dadosExtracao = nota;
  Estado.dadosExtracao._editandoId = id;
  irPara("confirmacao");
  preencherFormularioConfirmacao(nota);
}

function salvarNotaEditada(e) {
  e.preventDefault();
  const id = Estado.dadosExtracao._editandoId;
  if (!id) { salvarNota(e); return; }

  const form = document.getElementById("form-confirmacao");
  const notas = carregarNotas().map((n) => {
    if (n.id !== id) return n;
    return {
      ...n,
      numero: form["conf-numero"].value.trim(),
      emissor: form["conf-emissor"].value.trim(),
      vencimento: form["conf-vencimento"].value.trim(),
      valor: parseFloat(form["conf-valor"].value.replace(",", ".")) || 0,
      tipo: form["conf-tipo"].value,
    };
  });
  salvarNotas(notas);

  // Atualiza lançamento vinculado se houver
  const nota = notas.find((n) => n.id === id);
  if (nota && nota.valor > 0) {
    const lancs = carregarLancamentos().map((l) => {
      if (l.id !== "nota-" + id) return l;
      return {
        ...l,
        descricao: `Nota ${nota.numero || "s/n"} — ${nota.emissor || "Emissor desconhecido"}`,
        valor: nota.valor,
        data: nota.vencimento || nota.salvoEm,
      };
    });
    salvarLancamentos(lancs);
  }

  Estado.dadosExtracao = {};
  irPara("notas");
}

// ── Fluxo de caixa ────────────────────────────────────────────────────────────
function renderizarFluxo() {
  const lancamentos = carregarLancamentos();

  const totalEntradas = lancamentos
    .filter((l) => l.tipo === "entrada")
    .reduce((s, l) => s + l.valor, 0);
  const totalSaidas = lancamentos
    .filter((l) => l.tipo === "saida")
    .reduce((s, l) => s + l.valor, 0);
  const saldo = totalEntradas - totalSaidas;

  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  document.getElementById("saldo-atual").textContent = fmt(saldo);
  document.getElementById("saldo-atual").className =
    "saldo-valor " + (saldo >= 0 ? "positivo" : "negativo");
  document.getElementById("total-entradas").textContent = fmt(totalEntradas);
  document.getElementById("total-saidas").textContent = fmt(totalSaidas);

  renderizarGrafico(lancamentos);
  renderizarListaLancamentos(lancamentos);
}

function renderizarGrafico(lancamentos) {
  const canvas = document.getElementById("grafico-fluxo");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // Agrupa por mês (últimos 6 meses)
  const meses = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({
      label: d.toLocaleDateString("pt-BR", { month: "short" }),
      entrada: 0,
      saida: 0,
    });
  }

  lancamentos.forEach((l) => {
    const partes = (l.data || "").split("/");
    if (partes.length < 3) return;
    const dataLanc = new Date(+partes[2], +partes[1] - 1, +partes[0]);
    const diff = (hoje.getFullYear() - dataLanc.getFullYear()) * 12 +
      (hoje.getMonth() - dataLanc.getMonth());
    if (diff >= 0 && diff < 6) {
      const idx = 5 - diff;
      if (l.tipo === "entrada") meses[idx].entrada += l.valor;
      else meses[idx].saida += l.valor;
    }
  });

  const maxVal = Math.max(...meses.map((m) => Math.max(m.entrada, m.saida)), 1);
  const padL = 10, padR = 10, padT = 10, padB = 28;
  const areaW = W - padL - padR;
  const areaH = H - padT - padB;
  const colunaW = areaW / meses.length;

  ctx.clearRect(0, 0, W, H);

  meses.forEach((mes, i) => {
    const x = padL + i * colunaW;
    const barW = colunaW * 0.32;

    // Barra entrada (verde)
    const hE = (mes.entrada / maxVal) * areaH;
    ctx.fillStyle = "#2F6B3E";
    ctx.fillRect(x + colunaW * 0.1, padT + areaH - hE, barW, hE);

    // Barra saída (vermelho)
    const hS = (mes.saida / maxVal) * areaH;
    ctx.fillStyle = "#A8472E";
    ctx.fillRect(x + colunaW * 0.1 + barW + 2, padT + areaH - hS, barW, hS);

    // Label mês
    ctx.fillStyle = "#5B6B5E";
    ctx.font = "10px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(mes.label, x + colunaW / 2, H - 8);
  });

  // Legenda
  ctx.fillStyle = "#2F6B3E"; ctx.fillRect(padL, 2, 10, 8);
  ctx.fillStyle = "#5B6B5E"; ctx.font = "9px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("Entradas", padL + 13, 10);
  ctx.fillStyle = "#A8472E"; ctx.fillRect(padL + 70, 2, 10, 8);
  ctx.fillText("Saídas", padL + 83, 10);
}

function renderizarListaLancamentos(lancamentos) {
  const lista = document.getElementById("lista-lancamentos");
  if (!lista) return;

  if (!lancamentos.length) {
    lista.innerHTML = '<p class="vazio">Nenhum lançamento ainda.</p>';
    return;
  }

  lista.innerHTML = lancamentos
    .slice(0, 30)
    .map(
      (l) => `
    <div class="item-lancamento ${l.tipo}">
      <div class="lanc-info">
        <span class="lanc-descricao">${l.descricao}</span>
        <span class="lanc-data">${l.data || "—"}</span>
      </div>
      <span class="lanc-valor ${l.tipo}">${l.tipo === "entrada" ? "+" : "-"}${l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
      ${l.origem !== "nota" ? `<button class="btn-mini-perigo" onclick="excluirLancamento('${l.id}')">✕</button>` : ""}
    </div>`
    )
    .join("");
}

function excluirLancamento(id) {
  if (!confirm("Excluir este lançamento?")) return;
  salvarLancamentos(carregarLancamentos().filter((l) => l.id !== id));
  renderizarFluxo();
}

function adicionarEntrada(e) {
  e.preventDefault();
  const form = document.getElementById("form-entrada");
  const descricao = form["entrada-descricao"].value.trim();
  const valor = parseFloat(form["entrada-valor"].value.replace(",", "."));
  const data = form["entrada-data"].value;

  if (!descricao || !valor || valor <= 0) return;

  const [y, m, d] = data.split("-");
  const dataFmt = `${d}/${m}/${y}`;

  const lancs = carregarLancamentos();
  lancs.unshift({
    id: Date.now().toString(),
    tipo: "entrada",
    descricao,
    valor,
    data: dataFmt,
    origem: "manual",
  });
  salvarLancamentos(lancs);
  form.reset();
  form["entrada-data"].value = new Date().toISOString().slice(0, 10);
  renderizarFluxo();
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
function abrirWhatsApp() {
  const numero = CONFIG.ADMIN_WHATSAPP;
  const msg = encodeURIComponent(CONFIG.ADMIN_WHATSAPP_MENSAGEM);
  window.open(`https://wa.me/${numero}?text=${msg}`, "_blank");
}

// ── Banner de instalação PWA ──────────────────────────────────────────────────
let eventoInstalacao = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  eventoInstalacao = e;
  const banner = document.getElementById("banner-instalar-android");
  if (banner) banner.style.display = "flex";
});

function instalarApp() {
  if (!eventoInstalacao) return;
  eventoInstalacao.prompt();
  eventoInstalacao.userChoice.then(() => {
    eventoInstalacao = null;
    const banner = document.getElementById("banner-instalar-android");
    if (banner) banner.style.display = "none";
  });
}

function detectarIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
}

// ── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Registra service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  }

  // Data padrão do campo de entrada
  const dataInput = document.getElementById("entrada-data");
  if (dataInput) dataInput.value = new Date().toISOString().slice(0, 10);

  // Banner iOS
  if (detectarIOS()) {
    const banner = document.getElementById("banner-instalar-ios");
    if (banner) banner.style.display = "flex";
  }

  // Formulário de confirmação — chama salvarNotaEditada (que internamente chama salvarNota se não for edição)
  const form = document.getElementById("form-confirmacao");
  if (form) {
    form.addEventListener("submit", (e) => {
      if (Estado.dadosExtracao._editandoId) salvarNotaEditada(e);
      else salvarNota(e);
    });
  }

  // Formulário de entrada manual
  const formEntrada = document.getElementById("form-entrada");
  if (formEntrada) formEntrada.addEventListener("submit", adicionarEntrada);

  // Input de upload de arquivo
  const inputArquivo = document.getElementById("input-arquivo");
  if (inputArquivo) {
    inputArquivo.addEventListener("change", (e) => {
      const arquivo = e.target.files[0];
      if (arquivo) processarUpload(arquivo);
    });
  }

  // Botão de captura manual
  const btnCapturar = document.getElementById("btn-capturar");
  if (btnCapturar) btnCapturar.addEventListener("click", capturarFrameManual);

  irPara("home");
});

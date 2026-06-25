// ── app.js — Portal do Cliente Helmigui ───────────────────────────────────────

// ── Estado global ─────────────────────────────────────────────────────────────
const App = {
  uid: null,
  email: null,
  clienteId: null,
  cliente: null,
  notas: [],
  lancamentos: [],
  mensagens: [],
  periodoFluxo: "mes",
  graficoDash: null,
  streamCamera: null,
  cameraFacingMode: "environment",
  barcodeInterval: null,
  canvas: null,
  ctx: null,
};

// ── Inicialização ──────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  initFirebase();
  onAuthChange(async (user) => {
    if (user) {
      App.uid   = user.uid;
      App.email = user.email;
      await carregarSessao(user);
    } else {
      mostrarLogin();
    }
  });

  App.canvas = document.createElement("canvas");
  App.ctx    = App.canvas.getContext("2d");

  document.getElementById("form-conf").addEventListener("submit", confirmarNota);

  // Datas default para relatório (mês atual)
  const hoje = new Date();
  const y = hoje.getFullYear(), m = String(hoje.getMonth() + 1).padStart(2, "0");
  const ultimoDia = new Date(y, hoje.getMonth() + 1, 0).getDate();
  setVal("rel-de",   `${y}-${m}-01`);
  setVal("rel-ate",  `${y}-${m}-${String(ultimoDia).padStart(2, "0")}`);
  setVal("lanc-data", hoje.toISOString().split("T")[0]);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
async function fazerLogin() {
  const email = v("login-email").trim();
  const senha = v("login-senha");
  const erroEl = document.getElementById("login-erro");
  const btn    = document.getElementById("btn-login");

  erroEl.style.display = "none";
  if (!email || !senha) { mostrarErroLogin("Preencha e-mail e senha."); return; }

  btn.disabled    = true;
  btn.textContent = "Entrando...";

  try {
    const user = await loginComEmail(email, senha);
    if (isAdmin(user.email)) { window.location.href = "admin.html"; return; }
    App.uid   = user.uid;
    App.email = user.email;
    await carregarSessao(user);
  } catch (e) {
    const msgs = {
      "auth/invalid-credential":     "E-mail ou senha incorretos.",
      "auth/user-not-found":         "Usuário não encontrado.",
      "auth/wrong-password":         "Senha incorreta.",
      "auth/too-many-requests":      "Muitas tentativas. Aguarde.",
      "auth/network-request-failed": "Sem conexão com a internet.",
    };
    mostrarErroLogin(msgs[e.code] || "Erro ao entrar. Tente novamente.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "Entrar";
  }
}

function mostrarErroLogin(msg) {
  const el = document.getElementById("login-erro");
  el.textContent    = msg;
  el.style.display  = "block";
}

async function carregarSessao(user) {
  if (isAdmin(user.email)) { window.location.href = "admin.html"; return; }
  try {
    const todos   = await buscarClientes(true);
    App.cliente   = todos.find(c => c.uid === user.uid || c.email === user.email) || null;
    App.clienteId = App.cliente?.id || user.uid;
  } catch {
    App.clienteId = user.uid;
  }
  mostrarApp();
  await Promise.all([carregarDados(), carregarMensagens()]);
  renderDashboard();
}

async function carregarDados() {
  try {
    App.notas       = await buscarNotas(App.clienteId);
    App.lancamentos = await buscarLancamentos(App.clienteId);
  } catch { App.notas = []; App.lancamentos = []; }
}

async function carregarMensagens() {
  try {
    App.mensagens = await buscarMensagens(App.clienteId);
    const naoLidas = App.mensagens.filter(m => !m.lida).length;
    const badge    = document.getElementById("badge-msg");
    badge.style.display  = naoLidas > 0 ? "flex" : "none";
    badge.textContent    = naoLidas;
  } catch { App.mensagens = []; }
}

function mostrarLogin() {
  document.getElementById("topbar").style.display = "none";
  document.getElementById("nav-inf").style.display = "none";
  irParaTela("login");
}

function mostrarApp() {
  const nome = App.cliente?.razaoSocial || App.email?.split("@")[0] || "Cliente";
  document.getElementById("topbar-titulo").textContent = nome;
  document.getElementById("user-avatar").textContent   = nome[0].toUpperCase();
  document.getElementById("topbar").style.display = "flex";
  document.getElementById("nav-inf").style.display = "flex";
  irPara("dashboard");
}

async function confirmarLogout() {
  if (!confirm("Deseja sair da sua conta?")) return;
  pararCamera();
  await logout();
  mostrarLogin();
}

// ── Navegação ─────────────────────────────────────────────────────────────────
const TODAS_TELAS = ["login","dashboard","scanner","processando","confirmacao","fluxo","notas","relatorios","mensagens"];

function irParaTela(id) {
  TODAS_TELAS.forEach(t => {
    const el = document.getElementById("tela-" + t);
    if (!el) return;
    el.classList.remove("ativa");
    el.style.display = "";
  });
  const alvo = document.getElementById("tela-" + id);
  if (alvo) { alvo.style.display = "flex"; alvo.classList.add("ativa"); }
}

function irPara(secao) {
  if (secao !== "scanner" && secao !== "processando") pararCamera();
  irParaTela(secao);
  if (secao === "dashboard")  renderDashboard();
  if (secao === "fluxo")      renderFluxo();
  if (secao === "notas")      renderNotas("todas");
  if (secao === "mensagens")  renderMensagens();
  if (secao === "scanner")    iniciarCamera();
}

function ativarNav(btn) {
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("ativo"));
  btn.classList.add("ativo");
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const agora    = new Date();
  const lancMes  = App.lancamentos.filter(l => {
    const d = new Date(l.data || l.criadoEm || 0);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });

  const entradas = somarPor(lancMes, "entrada");
  const saidas   = somarPor(lancMes, "saida");
  const saldo    = entradas - saidas;

  const notasPend = App.notas.filter(n => (n.status || "pendente") === "pendente");
  const vlPagar   = somarPor(notasPend.filter(n => n.fluxo !== "entrada"), null, "valor");
  const vlReceber = somarPor(notasPend.filter(n => n.fluxo === "entrada"), null, "valor");

  el("dash-saldo").textContent = fmt(saldo);
  el("dash-saldo").className   = "saldo-valor " + (saldo >= 0 ? "pos" : "neg");
  el("dash-ent").textContent   = fmt(entradas);
  el("dash-sai").textContent   = fmt(saidas);
  el("dash-pagar").textContent  = fmt(vlPagar);
  el("dash-receber").textContent = fmt(vlReceber);
  el("dash-pagar-qtd").textContent  = notasPend.filter(n => n.fluxo !== "entrada").length + " pendentes";
  el("dash-receber-qtd").textContent = notasPend.filter(n => n.fluxo === "entrada").length + " pendentes";

  renderGraficoDash();
  renderUltimasNotas();
}

function renderGraficoDash() {
  const canvas = document.getElementById("grafico-dash");
  if (!canvas) return;
  const hoje = new Date();
  const meses = [], ents = [], sais = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const mes = d.getMonth(), ano = d.getFullYear();
    meses.push(d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
    const lm = App.lancamentos.filter(l => {
      const ld = new Date(l.data || l.criadoEm || 0);
      return ld.getMonth() === mes && ld.getFullYear() === ano;
    });
    ents.push(somarPor(lm, "entrada"));
    sais.push(somarPor(lm, "saida"));
  }
  if (App.graficoDash) App.graficoDash.destroy();
  App.graficoDash = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses,
      datasets: [
        { label: "Entradas", data: ents, backgroundColor: "rgba(26,122,74,.75)", borderRadius: 5 },
        { label: "Saídas",   data: sais, backgroundColor: "rgba(168,71,46,.65)", borderRadius: 5 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { font: { family: "Inter", size: 11 } } } },
      scales: {
        y: { ticks: { callback: n => n >= 1000 ? "R$" + (n/1000).toFixed(0) + "k" : "R$" + n, font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

function renderUltimasNotas() {
  const cont    = el("dash-notas-lista");
  const ultimas = App.notas.slice(0, 4);
  if (!ultimas.length) { cont.innerHTML = '<p class="vazio">Nenhuma nota ainda.</p>'; return; }
  cont.innerHTML = ultimas.map(n => `
    <div class="conta-item">
      <div style="flex:1;min-width:0">
        <div class="conta-desc">${esc(n.emissor || "Sem emitente")}</div>
        <div class="conta-data">${fmtDataStr(n.dataEmissao || n.criadoEm)} ·
          <span class="status-pill ${pillClass(n.status)}">${n.status || "pendente"}</span></div>
      </div>
      <div class="conta-val sai">${fmt(n.valor)}</div>
    </div>`).join("");
}

// ── Câmera / Scanner ──────────────────────────────────────────────────────────
async function iniciarCamera() {
  pararCamera();
  const video = document.getElementById("video-camera");
  const msgEl = document.getElementById("msg-camera");
  const btn   = document.getElementById("btn-capturar");
  const hint  = document.getElementById("camera-hint");
  msgEl.style.display = "none";
  btn.disabled = true;
  try {
    App.streamCamera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: App.cameraFacingMode, width: { ideal: 1280 } },
    });
    video.srcObject = App.streamCamera;
    await video.play();
    btn.disabled = false;
    iniciarBarcodeLoop(video, hint);
  } catch {
    msgEl.textContent   = "Câmera indisponível. Use o upload de imagem abaixo.";
    msgEl.style.display = "block";
  }
}

function iniciarBarcodeLoop(video, hintEl) {
  if (typeof ZXing === "undefined") return;
  try {
    const reader = new ZXing.BrowserMultiFormatReader();
    hintEl.textContent = "🔍 Buscando código de barras...";
    App.barcodeInterval = setInterval(async () => {
      if (!App.streamCamera || !video.videoWidth) return;
      App.canvas.width  = video.videoWidth;
      App.canvas.height = video.videoHeight;
      App.ctx.drawImage(video, 0, 0);
      try {
        const result = await reader.decodeFromCanvas(App.canvas);
        if (result?.getText()) {
          clearInterval(App.barcodeInterval);
          hintEl.textContent = "✅ Código lido!";
          await processarBarcode(result.getText(), App.canvas.toDataURL("image/jpeg", 0.9));
        }
      } catch { /* ainda buscando */ }
    }, 600);
  } catch { /* ZXing indisponível */ }
}

function pararCamera() {
  clearInterval(App.barcodeInterval);
  App.barcodeInterval = null;
  if (App.streamCamera) {
    App.streamCamera.getTracks().forEach(t => t.stop());
    App.streamCamera = null;
  }
  const video = document.getElementById("video-camera");
  if (video) video.srcObject = null;
}

function alternarCamera() {
  App.cameraFacingMode = App.cameraFacingMode === "environment" ? "user" : "environment";
  iniciarCamera();
}

async function capturarFoto() {
  const video = document.getElementById("video-camera");
  if (!video?.videoWidth) return;
  App.canvas.width  = video.videoWidth;
  App.canvas.height = video.videoHeight;
  App.ctx.drawImage(video, 0, 0);
  const dataUrl = App.canvas.toDataURL("image/jpeg", 0.92);
  pararCamera();
  await processarImagem(dataUrl);
}

async function processarArquivo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => { pararCamera(); await processarImagem(e.target.result); };
  reader.readAsDataURL(file);
  input.value = "";
}

async function processarBarcode(codigo, imagemDataUrl) {
  pararCamera();
  irParaTela("processando");
  el("status-proc").textContent = "Código lido! Analisando nota...";
  try {
    const dadosBarcode = decodificarBoleto(codigo);
    el("status-proc").textContent = "Extraindo texto com IA...";
    const dadosOCR = await processarImagemOCR(imagemDataUrl);
    preencherConfirmacao({ ...dadosOCR, ...dadosBarcode });
    irParaTela("confirmacao");
  } catch { toast("Erro ao processar. Tente novamente."); irPara("scanner"); }
}

async function processarImagem(dataUrl) {
  irParaTela("processando");
  el("status-proc").textContent = "Iniciando OCR...";
  el("ocr-progresso").textContent = "";
  try {
    // Tenta barcode primeiro
    if (typeof ZXing !== "undefined") {
      try {
        const reader = new ZXing.BrowserMultiFormatReader();
        const img = new Image();
        await new Promise(res => { img.onload = res; img.src = dataUrl; });
        const tmp = document.createElement("canvas");
        tmp.width = img.width; tmp.height = img.height;
        tmp.getContext("2d").drawImage(img, 0, 0);
        const result = await reader.decodeFromCanvas(tmp);
        if (result?.getText()) {
          el("status-proc").textContent = "Código de barras encontrado!";
          const dadosB   = decodificarBoleto(result.getText());
          const dadosOCR = await processarImagemOCR(dataUrl);
          preencherConfirmacao({ ...dadosOCR, ...dadosB });
          irParaTela("confirmacao");
          return;
        }
      } catch { /* sem barcode */ }
    }
    el("status-proc").textContent = "Extraindo texto com IA...";
    const dados = await processarImagemOCR(dataUrl);
    preencherConfirmacao(dados);
    irParaTela("confirmacao");
  } catch { toast("Erro no processamento."); irPara("scanner"); }
}

function decodificarBoleto(codigo) {
  const c = codigo.replace(/\D/g, "");
  let valor = 0, vencimento = "";
  if (c.length === 47 || c.length === 48) {
    const fator = parseInt(c.slice(33, 37));
    valor = parseInt(c.slice(37, 47)) / 100;
    if (fator > 1000) {
      const base = new Date(1997, 9, 7);
      base.setDate(base.getDate() + fator);
      vencimento = base.toLocaleDateString("pt-BR");
    }
  } else if (c.length === 44) {
    valor = parseInt(c.slice(9, 19)) / 100;
  }
  return { valor: valor || 0, vencimento, codigoBarras: codigo };
}

function preencherConfirmacao(dados) {
  setVal("cf-numero",    dados.numero       || "");
  setVal("cf-emissao",   dados.dataEmissao  || "");
  setVal("cf-emissor",   dados.emissor      || "");
  setVal("cf-cnpj",      dados.cnpjEmitente || "");
  setVal("cf-valor",     dados.valor        || "");
  setVal("cf-venc",      dados.vencimento   || "");
  setVal("cf-tipo",      dados.tipo         || "");
  setVal("cf-fluxo",     dados.fluxo        || "saida");
  setVal("cf-categoria", dados.categoria    || "");
  setVal("cf-obs",       "");
}

async function confirmarNota(e) {
  e.preventDefault();
  const nota = {
    numero:       v("cf-numero"),
    dataEmissao:  v("cf-emissao"),
    emissor:      v("cf-emissor"),
    cnpjEmitente: v("cf-cnpj"),
    valor:        parseFloat(v("cf-valor")) || 0,
    vencimento:   v("cf-venc"),
    tipo:         v("cf-tipo"),
    fluxo:        v("cf-fluxo"),
    categoria:    v("cf-categoria"),
    observacoes:  v("cf-obs"),
    status:       "pendente",
    criadoEm:     new Date().toISOString(),
  };
  try {
    await salvarNota(nota, App.clienteId);
    await salvarLancamento({
      descricao: `Nota: ${nota.emissor || nota.numero || "s/n"}`,
      valor:     nota.valor,
      tipo:      nota.fluxo,
      categoria: nota.categoria,
      data:      new Date().toISOString().split("T")[0],
    }, App.clienteId);
    enviarWhatsAppNota(nota, App.cliente?.razaoSocial || App.email, App.cliente?.cnpj, App.email);
    await carregarDados();
    toast("✔ Nota salva e enviada para análise!");
    irPara("dashboard");
  } catch (err) { toast("Erro ao salvar nota."); console.error(err); }
}

// ── Fluxo de Caixa ────────────────────────────────────────────────────────────
function filtrarFluxo(periodo, btn) {
  App.periodoFluxo = periodo;
  document.querySelectorAll("#tela-fluxo .filtro-btn").forEach(b => b.classList.remove("ativo"));
  if (btn) btn.classList.add("ativo");
  const custom = document.getElementById("filtro-custom");
  custom.style.display = periodo === "custom" ? "grid" : "none";
  if (periodo !== "custom") renderFluxo();
}

function abrirFiltroCustom(btn) {
  filtrarFluxo("custom", btn);
}

function aplicarCustom() {
  const de  = document.getElementById("fc-de").value;
  const ate = document.getElementById("fc-ate").value;
  if (de && ate) renderFluxo();
}

function lancsNoPeriodo() {
  const agora = new Date();
  return App.lancamentos.filter(l => {
    const d = new Date(l.data ? l.data + "T12:00:00" : l.criadoEm || 0);
    if (App.periodoFluxo === "hoje")   return mesmoDia(d, agora);
    if (App.periodoFluxo === "semana") return d >= diaMenos(agora, 7);
    if (App.periodoFluxo === "mes")    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
    if (App.periodoFluxo === "ano")    return d.getFullYear() === agora.getFullYear();
    if (App.periodoFluxo === "custom") {
      const de  = new Date(document.getElementById("fc-de").value + "T00:00:00");
      const ate = new Date(document.getElementById("fc-ate").value + "T23:59:59");
      return d >= de && d <= ate;
    }
    return true;
  });
}

function renderFluxo() {
  const lancs = lancsNoPeriodo();
  const ent   = somarPor(lancs, "entrada");
  const sai   = somarPor(lancs, "saida");
  const saldo = ent - sai;

  el("fluxo-saldo").textContent = fmt(saldo);
  el("fluxo-saldo").style.color = saldo >= 0 ? "#6EE7A0" : "#FCA5A5";
  el("fluxo-ent").textContent   = fmt(ent);
  el("fluxo-sai").textContent   = fmt(sai);

  const cont = el("fluxo-lista");
  if (!lancs.length) { cont.innerHTML = '<p class="vazio">Nenhum lançamento no período.</p>'; return; }
  cont.innerHTML = lancs.map(l => `
    <div class="lanc-item">
      <div class="lanc-icone ${l.tipo}">${l.tipo === "entrada" ? "🟢" : "🔴"}</div>
      <div class="lanc-info">
        <div class="lanc-desc">${esc(l.descricao || "—")}</div>
        <div class="lanc-cat">${esc(l.categoria || "—")} · ${fmtDataStr(l.data || l.criadoEm)}</div>
      </div>
      <div class="lanc-val ${l.tipo}">${fmt(l.valor)}</div>
      <button class="btn-del-lanc" onclick="excluirLanc('${esc(l.id || "")}')" title="Excluir">🗑</button>
    </div>`).join("");
}

async function salvarLancamentoManual(e) {
  if (e) e.preventDefault();
  const tipo  = v("lanc-tipo");
  const valor = parseFloat(v("lanc-valor"));
  const desc  = v("lanc-desc").trim();
  const cat   = v("lanc-cat");
  const data  = v("lanc-data");
  if (!desc || !valor || valor <= 0 || !data) { toast("Preencha todos os campos."); return; }
  try {
    await salvarLancamento({ tipo, valor, descricao: desc, categoria: cat, data }, App.clienteId);
    await carregarDados();
    document.getElementById("form-lanc").reset();
    setVal("lanc-data", new Date().toISOString().split("T")[0]);
    renderFluxo();
    toast("✔ Lançamento registrado!");
  } catch (err) { toast("Erro: " + err.message); }
}

async function excluirLanc(id) {
  if (!id || !confirm("Excluir este lançamento?")) return;
  try {
    await excluirLancamento(App.clienteId, id);
    App.lancamentos = App.lancamentos.filter(l => l.id !== id);
    renderFluxo();
    toast("Lançamento excluído.");
  } catch { toast("Erro ao excluir."); }
}

// ── Notas ─────────────────────────────────────────────────────────────────────
function filtrarNotas(filtro, btn) {
  document.querySelectorAll("#tela-notas .filtro-btn").forEach(b => b.classList.remove("ativo"));
  if (btn) btn.classList.add("ativo");
  renderNotas(filtro);
}

function renderNotas(filtro) {
  const lista = App.notas.filter(n => filtro === "todas" || (n.status || "pendente") === filtro);
  const cont  = el("notas-lista");
  if (!lista.length) { cont.innerHTML = '<p class="vazio">Nenhuma nota nesta categoria.</p>'; return; }
  cont.innerHTML = lista.map(n => `
    <div class="nota-card">
      <div class="nota-header">
        <div style="min-width:0">
          <div class="nota-emissor">${esc(n.emissor || "Sem emitente")}</div>
          <div class="nota-num">Nº ${esc(n.numero || "—")}</div>
        </div>
        <span class="badge ${badgeTipo(n.tipo)}">${esc(n.tipo || "—")}</span>
      </div>
      <div class="nota-linha"><span class="nota-lbl">Valor</span>
        <span class="nota-val-dinheiro">${fmt(n.valor)}</span></div>
      <div class="nota-linha"><span class="nota-lbl">Emissão</span>
        <span>${fmtDataStr(n.dataEmissao)}</span></div>
      <div class="nota-linha"><span class="nota-lbl">Vencimento</span>
        <span>${n.vencimento || "—"}</span></div>
      <div class="nota-linha"><span class="nota-lbl">Categoria</span>
        <span>${esc(n.categoria || "—")}</span></div>
      ${n.observacoes ? `<div class="nota-linha"><span class="nota-lbl">Obs</span><span>${esc(n.observacoes)}</span></div>` : ""}
      <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <span class="status-pill ${pillClass(n.status)}">${n.status || "pendente"}</span>
        ${n.observacaoAdmin ? `<span style="font-size:.72rem;color:var(--muted)">Admin: ${esc(n.observacaoAdmin)}</span>` : ""}
      </div>
    </div>`).join("");
}

// ── Relatórios ────────────────────────────────────────────────────────────────
async function exportar(tipo, formato) {
  const de  = document.getElementById("rel-de")?.value;
  const ate = document.getElementById("rel-ate")?.value;
  let dados = tipo === "notas" ? App.notas : App.lancamentos;

  if (tipo !== "notas" && de && ate) {
    const dDe  = new Date(de  + "T00:00:00");
    const dAte = new Date(ate + "T23:59:59");
    dados = dados.filter(l => {
      const d = new Date(l.data ? l.data + "T12:00:00" : l.criadoEm || 0);
      return d >= dDe && d <= dAte;
    });
  }

  if (!dados.length) { toast("Sem dados no período selecionado."); return; }
  try {
    if (formato === "pdf") gerarPDF(tipo, dados, App.cliente);
    else                   gerarExcel(tipo, dados, App.cliente);
    toast("✔ Relatório gerado!");
  } catch (e) { toast("Erro ao gerar relatório."); console.error(e); }
}

// ── Mensagens ─────────────────────────────────────────────────────────────────
async function renderMensagens() {
  const cont = el("msgs-lista");
  if (!App.mensagens.length) { cont.innerHTML = '<p class="vazio">Nenhuma mensagem recebida.</p>'; return; }
  cont.innerHTML = App.mensagens.map(m => `
    <div class="msg-item ${m.lida ? "" : "nao-lida"}">
      <div class="msg-header">
        <span class="msg-de">${esc(m.de || "Helmigui")}</span>
        <span class="msg-hora">${fmtDataStr(m.criadoEm)}</span>
      </div>
      <div class="msg-corpo">${esc(m.texto || m.corpo || "")}</div>
    </div>`).join("");

  setTimeout(async () => {
    for (const m of App.mensagens.filter(x => !x.lida)) {
      try { await marcarMensagemLida(App.clienteId, m.id); m.lida = true; } catch {}
    }
    document.getElementById("badge-msg").style.display = "none";
  }, 2000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt    = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const v      = (id) => document.getElementById(id)?.value || "";
const el     = (id) => document.getElementById(id);
const esc    = (s)  => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.value = val ?? ""; };
const somarPor = (arr, tipo, campo = "valor") =>
  arr.filter(i => tipo == null || i.tipo === tipo).reduce((s, i) => s + (i[campo] || 0), 0);
const mesmoDia = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
const diaMenos = (d, n) => { const t = new Date(d); t.setDate(t.getDate() - n); return t; };

function fmtDataStr(s) {
  if (!s) return "—";
  try { const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleDateString("pt-BR"); }
  catch { return String(s); }
}

function pillClass(status) {
  if (status === "aprovada")  return "pill-pago";
  if (status === "rejeitada") return "pill-venc";
  return "pill-pend";
}

function badgeTipo(tipo) {
  if (tipo === "Serviço")    return "badge-serv";
  if (tipo === "Produto")    return "badge-prod";
  if (tipo === "Fornecedor") return "badge-forn";
  return "badge-desp";
}

let _toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("vis");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("vis"), 2800);
}

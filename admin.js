// ── admin.js — Painel Administrativo Helmigui ─────────────────────────────────

// ── Estado ────────────────────────────────────────────────────────────────────
const Admin = {
  uid: null,
  email: null,
  clientes: [],
  todasNotas: [],
  lancFin: [],
  graficoAdmin: null,
  secaoAtual: "dashboard",
};

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  initFirebase();
  onAuthChange(async (user) => {
    if (!user) { mostrarLogin(); return; }
    if (!isAdmin(user.email)) { window.location.href = "app.html"; return; }
    Admin.uid   = user.uid;
    Admin.email = user.email;
    mostrarApp();
    await carregarTudo();
    renderDashboard();
  });

  // Datas default relatório (mês atual)
  const hoje = new Date();
  const y = hoje.getFullYear(), m = String(hoje.getMonth() + 1).padStart(2, "0");
  const ultimo = new Date(y, hoje.getMonth() + 1, 0).getDate();
  setVal("rel-de",   `${y}-${m}-01`);
  setVal("rel-ate",  `${y}-${m}-${String(ultimo).padStart(2, "0")}`);
  setVal("fin-data", hoje.toISOString().split("T")[0]);
});

// ── Auth ──────────────────────────────────────────────────────────────────────
async function fazerLogin() {
  const email = v("login-email").trim();
  const senha = v("login-senha");
  const erroEl = document.getElementById("login-erro");
  const btn    = document.getElementById("btn-login");
  erroEl.style.display = "none";
  if (!email || !senha) { erroEl.textContent = "Preencha e-mail e senha."; erroEl.style.display = "block"; return; }
  btn.disabled = true; btn.textContent = "Entrando...";
  try {
    const user = await loginComEmail(email, senha);
    if (!isAdmin(user.email)) {
      await logout();
      erroEl.textContent = "Acesso negado — conta sem permissão admin.";
      erroEl.style.display = "block";
      return;
    }
    Admin.uid   = user.uid;
    Admin.email = user.email;
    mostrarApp();
    await carregarTudo();
    renderDashboard();
  } catch (e) {
    const msgs = {
      "auth/invalid-credential":    "E-mail ou senha incorretos.",
      "auth/user-not-found":        "Usuário não encontrado.",
      "auth/wrong-password":        "Senha incorreta.",
      "auth/too-many-requests":     "Muitas tentativas. Aguarde.",
    };
    erroEl.textContent  = msgs[e.code] || "Erro ao entrar.";
    erroEl.style.display = "block";
  } finally { btn.disabled = false; btn.textContent = "Entrar"; }
}

async function fazerLogout() {
  if (!confirm("Deseja sair?")) return;
  await logout();
  mostrarLogin();
}

function mostrarLogin() {
  document.getElementById("tela-login").style.display = "flex";
  document.getElementById("admin-shell").style.display = "none";
}

function mostrarApp() {
  document.getElementById("tela-login").style.display = "none";
  document.getElementById("admin-shell").style.display = "flex";
  document.getElementById("admin-email-label").textContent = Admin.email;
}

// ── Dados ─────────────────────────────────────────────────────────────────────
async function carregarTudo() {
  try {
    Admin.clientes = await buscarClientes();
  } catch { Admin.clientes = []; }

  try {
    Admin.todasNotas = await buscarTodasNotas(200);
  } catch {
    // fallback: busca nota a nota de cada cliente
    Admin.todasNotas = [];
    for (const c of Admin.clientes) {
      try {
        const notas = await buscarNotas(c.id);
        notas.forEach(n => { n._clienteNome = c.razaoSocial; n._clienteId = c.id; });
        Admin.todasNotas.push(...notas);
      } catch {}
    }
  }

  // Lançamentos financeiros internos (armazenados em localStorage por simplicidade)
  Admin.lancFin = JSON.parse(localStorage.getItem("helmigui_fin_interno") || "[]");

  // Popula selects de cliente
  popularSelectClientes();
}

function popularSelectClientes() {
  const ids    = ["msg-cliente-id", "rel-cliente-id"];
  const opts   = Admin.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.razaoSocial)}</option>`).join("");
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const first = el.options[0].outerHTML;
    el.innerHTML = first + opts;
  });
}

// ── Navegação ─────────────────────────────────────────────────────────────────
function irPara(secao, btn) {
  document.querySelectorAll(".main-content").forEach(s => s.classList.remove("ativo"));
  document.querySelectorAll(".sidebar-btn").forEach(b => b.classList.remove("ativo"));
  const sec = document.getElementById("sec-" + secao);
  if (sec) sec.classList.add("ativo");
  if (btn) btn.classList.add("ativo");
  const titulos = {
    dashboard: "Dashboard", clientes: "Gestão de Clientes",
    "cadastro-cliente": "Cadastro de Cliente", notas: "Notas Fiscais",
    mensageria: "Mensageria", alertas: "Alertas Automáticos",
    financeiro: "Gestão Financeira", relatorios: "Relatórios",
    usuarios: "Usuários & Acesso",
  };
  document.getElementById("topbar-titulo").textContent = titulos[secao] || secao;
  Admin.secaoAtual = secao;

  if (secao === "dashboard")     renderDashboard();
  if (secao === "clientes")      renderClientes();
  if (secao === "notas")         renderNotasAdmin();
  if (secao === "mensageria")    { renderMsgRecebidas(); }
  if (secao === "alertas")       renderAlertas();
  if (secao === "financeiro")    renderFinanceiro();
  if (secao === "usuarios")      renderUsuarios();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  const totalClientes = Admin.clientes.length;
  const mesAtual = new Date().getMonth(), anoAtual = new Date().getFullYear();
  const notasMes  = Admin.todasNotas.filter(n => {
    const d = new Date(n.criadoEm || 0);
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
  });

  // Busca lançamentos de todos os clientes para KPI (simplificado: usamos notas)
  const totalEntradas = Admin.todasNotas.filter(n => n.fluxo === "entrada").reduce((s, n) => s + (n.valor || 0), 0);
  const totalSaidas   = Admin.todasNotas.filter(n => n.fluxo !== "entrada").reduce((s, n) => s + (n.valor || 0), 0);

  el("kpi-clientes").textContent  = totalClientes;
  el("kpi-notas").textContent     = notasMes.length;
  el("kpi-entradas").textContent  = fmtCompact(totalEntradas);
  el("kpi-saidas").textContent    = fmtCompact(totalSaidas);

  // Últimas notas
  const dashNotas = el("dash-notas");
  const ultimasNotas = Admin.todasNotas.slice(0, 6);
  dashNotas.innerHTML = ultimasNotas.length ? ultimasNotas.map(n => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.8rem">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n._clienteNome || n.clienteId || "—")}</div>
        <div style="color:var(--muted)">${esc(n.emissor || "—")}</div>
      </div>
      <div style="font-family:'IBM Plex Mono',monospace;font-size:0.78rem;color:var(--clay)">${fmt(n.valor)}</div>
      <span class="badge ${pillAdm(n.status)}">${n.status || "pendente"}</span>
    </div>`).join("")
  : '<p class="vazio">Nenhuma nota.</p>';

  // Clientes recentes
  const dashCl = el("dash-clientes");
  dashCl.innerHTML = Admin.clientes.slice(0, 6).map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.8rem">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${esc(c.razaoSocial)}</div>
        <div style="color:var(--muted)">${esc(c.segmento || "—")}</div>
      </div>
      <span class="badge ${c.status === "ativo" ? "badge-verde" : c.status === "inativo" ? "badge-clay" : "badge-ouro"}">${c.status || "pendente"}</span>
    </div>`).join("") || '<p class="vazio">Nenhum cliente.</p>';

  renderGraficoAdmin();
}

function renderGraficoAdmin() {
  const canvas = document.getElementById("grafico-admin");
  if (!canvas) return;
  const hoje = new Date();
  const meses = [], ents = [], sais = [];
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const ms = d.getMonth(), an = d.getFullYear();
    meses.push(d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""));
    const notas = Admin.todasNotas.filter(n => {
      const nd = new Date(n.criadoEm || 0);
      return nd.getMonth() === ms && nd.getFullYear() === an;
    });
    ents.push(notas.filter(n => n.fluxo === "entrada").reduce((s, n) => s + (n.valor || 0), 0));
    sais.push(notas.filter(n => n.fluxo !== "entrada").reduce((s, n) => s + (n.valor || 0), 0));
  }
  if (Admin.graficoAdmin) Admin.graficoAdmin.destroy();
  Admin.graficoAdmin = new Chart(canvas, {
    type: "bar",
    data: {
      labels: meses,
      datasets: [
        { label: "Entradas (notas)", data: ents, backgroundColor: "rgba(26,122,74,.75)", borderRadius: 5 },
        { label: "Saídas (notas)",   data: sais, backgroundColor: "rgba(168,71,46,.65)", borderRadius: 5 },
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

// ── Clientes ──────────────────────────────────────────────────────────────────
function renderClientes() {
  filtrarClientes();
}

function filtrarClientes() {
  const busca  = v("busca-cliente").toLowerCase();
  const status = v("filtro-status-cl");
  let lista = Admin.clientes;
  if (busca)  lista = lista.filter(c =>
    (c.razaoSocial||"").toLowerCase().includes(busca) ||
    (c.cnpj||"").includes(busca) ||
    (c.email||"").toLowerCase().includes(busca));
  if (status) lista = lista.filter(c => (c.status || "pendente") === status);

  const tbody = el("tbody-clientes");
  if (!lista.length) { tbody.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum cliente encontrado.</td></tr>`; return; }
  tbody.innerHTML = lista.map(c => `
    <tr>
      <td><strong>${esc(c.razaoSocial)}</strong><br><small style="color:var(--muted)">${esc(c.nomeFantasia||"")}</small></td>
      <td class="td-mono">${esc(c.cnpj||"—")}</td>
      <td>${esc(c.email||"—")}</td>
      <td>${esc(c.segmento||"—")}</td>
      <td><span class="badge ${c.status==="ativo"?"badge-verde":c.status==="inativo"?"badge-clay":"badge-ouro"}">${c.status||"pendente"}</span></td>
      <td>
        <div class="td-actions">
          <button class="btn btn-sec btn-xs" onclick="editarCliente('${esc(c.id)}')">✏️ Editar</button>
          <button class="btn btn-ouro btn-xs" onclick="abrirModalCliente('${esc(c.id)}')">👁 Ver</button>
          <button class="btn btn-clay btn-xs" onclick="toggleStatusCliente('${esc(c.id)}','${esc(c.status||"ativo")}')">
            ${c.status==="ativo"?"❌ Inativar":"✅ Ativar"}
          </button>
        </div>
      </td>
    </tr>`).join("");
}

async function salvarClienteForm(e) {
  e.preventDefault();
  const email  = v("cl-email").trim();
  const senha  = v("cl-senha");
  const senha2 = v("cl-senha2");
  const isNovo = !v("cl-id");

  if (!v("cl-razao").trim() || !v("cl-cnpj").trim() || !email) {
    toast("Preencha Razão Social, CNPJ e E-mail."); return;
  }
  if (isNovo && !senha) {
    toast("Defina uma senha de acesso para o cliente."); return;
  }
  if (senha && senha !== senha2) {
    toast("As senhas não coincidem."); return;
  }
  if (senha && senha.length < 6) {
    toast("A senha deve ter pelo menos 6 caracteres."); return;
  }

  const dados = {
    id:           v("cl-id") || null,
    razaoSocial:  v("cl-razao").trim(),
    nomeFantasia: v("cl-fantasia").trim(),
    cnpj:         v("cl-cnpj").trim(),
    ie:           v("cl-ie").trim(),
    email,
    telefone:     v("cl-tel").trim(),
    whatsapp:     v("cl-wpp").trim(),
    segmento:     v("cl-segmento"),
    cep:          v("cl-cep").trim(),
    endereco:     v("cl-end").trim(),
    cidade:       v("cl-cidade").trim(),
    estado:       v("cl-estado"),
    responsavel:  v("cl-responsavel").trim(),
    cargo:        v("cl-cargo").trim(),
    dataInicio:   v("cl-inicio"),
    plano:        v("cl-plano"),
    observacoes:  v("cl-obs").trim(),
    status:       v("cl-status"),
    atualizadoEm: new Date().toISOString(),
  };

  try {
    const id = await salvarCliente(dados);
    dados.id = id;

    // Salva credenciais de acesso no localStorage (modo sem Firebase)
    if (senha) {
      salvarUsuarioLocal({
        uid:         id,
        email:       email.toLowerCase(),
        senha,
        clienteId:   id,
        razaoSocial: dados.razaoSocial,
        status:      dados.status,
      });
    } else {
      // Atualiza nome/status sem trocar senha
      const usuarios = carregarUsuariosLocal();
      const idx      = usuarios.findIndex(u => u.email === email.toLowerCase());
      if (idx >= 0) {
        usuarios[idx].razaoSocial = dados.razaoSocial;
        usuarios[idx].status      = dados.status;
        salvarTodosUsuariosLocal(usuarios);
      }
    }

    toast("✔ Cliente salvo! Login: " + email);
    await carregarTudo();
    limparFormCliente();
    irPara("clientes", null);
  } catch (err) { toast("Erro ao salvar: " + err.message); }
}

function limparFormCliente() {
  setVal("cl-id", "");
  ["cl-razao","cl-fantasia","cl-cnpj","cl-ie","cl-email","cl-tel","cl-wpp",
   "cl-cep","cl-end","cl-cidade","cl-responsavel","cl-cargo","cl-obs",
   "cl-senha","cl-senha2"].forEach(id => setVal(id, ""));
  setVal("cl-segmento", ""); setVal("cl-estado", "SP"); setVal("cl-plano", "");
  setVal("cl-status", "ativo");
  document.getElementById("cadastro-titulo").textContent = "Novo Cliente";
}

async function editarCliente(id) {
  const c = Admin.clientes.find(x => x.id === id);
  if (!c) return;
  setVal("cl-id",          c.id);
  setVal("cl-razao",       c.razaoSocial || "");
  setVal("cl-fantasia",    c.nomeFantasia || "");
  setVal("cl-cnpj",        c.cnpj || "");
  setVal("cl-ie",          c.ie || "");
  setVal("cl-email",       c.email || "");
  setVal("cl-tel",         c.telefone || "");
  setVal("cl-wpp",         c.whatsapp || "");
  setVal("cl-segmento",    c.segmento || "");
  setVal("cl-cep",         c.cep || "");
  setVal("cl-end",         c.endereco || "");
  setVal("cl-cidade",      c.cidade || "");
  setVal("cl-estado",      c.estado || "SP");
  setVal("cl-responsavel", c.responsavel || "");
  setVal("cl-cargo",       c.cargo || "");
  setVal("cl-inicio",      c.dataInicio || "");
  setVal("cl-plano",       c.plano || "");
  setVal("cl-obs",         c.observacoes || "");
  setVal("cl-status",      c.status || "ativo");
  setVal("cl-senha",  ""); // não pré-preenche — deixa vazio para não alterar senha
  setVal("cl-senha2", "");
  document.getElementById("cadastro-titulo").textContent = "Editar: " + c.razaoSocial;
  irPara("cadastro-cliente", null);
  // Ativa sidebar btn correto
  document.querySelectorAll(".sidebar-btn").forEach(b => {
    b.classList.toggle("ativo", b.textContent.includes("Novo Cliente"));
  });
}

async function toggleStatusCliente(id, statusAtual) {
  const novoStatus = statusAtual === "ativo" ? "inativo" : "ativo";
  if (!confirm(`${novoStatus === "inativo" ? "Inativar" : "Ativar"} este cliente?`)) return;
  try {
    await atualizarStatusCliente(id, novoStatus);
    const idx = Admin.clientes.findIndex(c => c.id === id);
    if (idx >= 0) Admin.clientes[idx].status = novoStatus;
    renderClientes();
    toast(`✔ Cliente ${novoStatus === "ativo" ? "ativado" : "inativado"}.`);
  } catch { toast("Erro ao atualizar status."); }
}

function abrirModalCliente(id) {
  const c = Admin.clientes.find(x => x.id === id);
  if (!c) return;
  const linhas = [
    ["Razão Social", c.razaoSocial],
    ["Nome Fantasia", c.nomeFantasia],
    ["CNPJ", c.cnpj],
    ["IE", c.ie],
    ["E-mail", c.email],
    ["Telefone", c.telefone],
    ["WhatsApp", c.whatsapp],
    ["Segmento", c.segmento],
    ["Endereço", [c.endereco, c.cidade, c.estado].filter(Boolean).join(", ")],
    ["Responsável", [c.responsavel, c.cargo].filter(Boolean).join(" — ")],
    ["Plano", c.plano],
    ["Data Início", fmtDataStr(c.dataInicio)],
    ["Obs", c.observacoes],
  ].filter(([,val]) => val);

  el("modal-cliente-corpo").innerHTML = linhas.map(([l, val]) =>
    `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--muted);min-width:120px;font-size:.78rem">${l}</span>
      <span style="font-size:.85rem;font-weight:500">${esc(val)}</span>
    </div>`).join("") +
    `<div style="margin-top:12px"><span class="badge ${c.status==="ativo"?"badge-verde":c.status==="inativo"?"badge-clay":"badge-ouro"}">${c.status||"pendente"}</span></div>`;

  el("modal-cliente-acoes").innerHTML = `
    <button class="btn btn-prim btn-sm" onclick="fecharModal('modal-cliente');editarCliente('${esc(id)}')">✏️ Editar</button>
    ${c.whatsapp ? `<button class="btn btn-wpp btn-sm" onclick="msgWppCliente('${esc(c.whatsapp)}')">💬 WhatsApp</button>` : ""}`;
  document.getElementById("modal-cliente").classList.add("ativo");
}

async function buscarCEP(input) {
  const cep = input.value.replace(/\D/g, "");
  if (cep.length !== 8) return;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return;
    setVal("cl-end",    (d.logradouro ? d.logradouro + ", " : "") + (d.bairro || ""));
    setVal("cl-cidade", d.localidade || "");
    setVal("cl-estado", d.uf || "");
  } catch {}
}

// ── Notas Fiscais (admin) ─────────────────────────────────────────────────────
function renderNotasAdmin() { filtrarNotasAdmin(); }

function filtrarNotasAdmin() {
  const statusFiltro = v("filtro-status-nota");
  const busca = v("busca-nota").toLowerCase();
  let lista = Admin.todasNotas;
  if (statusFiltro) lista = lista.filter(n => (n.status || "pendente") === statusFiltro);
  if (busca) lista = lista.filter(n =>
    (n.emissor||"").toLowerCase().includes(busca) ||
    (n._clienteNome||"").toLowerCase().includes(busca));

  const tbody = el("tbody-notas");
  if (!lista.length) { tbody.innerHTML = `<tr><td colspan="8" class="vazio">Nenhuma nota encontrada.</td></tr>`; return; }
  tbody.innerHTML = lista.map(n => {
    const clienteId = n._clienteId || n.clienteId || "";
    return `<tr>
      <td>${esc(n._clienteNome || clienteId || "—")}</td>
      <td>${esc(n.emissor || "—")}</td>
      <td class="td-mono">${esc(n.numero || "—")}</td>
      <td class="td-mono" style="color:var(--clay)">${fmt(n.valor)}</td>
      <td>${n.vencimento || "—"}</td>
      <td><span class="badge badge-cinza">${esc(n.tipo||"—")}</span></td>
      <td>
        <select class="nota-status-sel" onchange="mudarStatusNota('${esc(clienteId)}','${esc(n.id)}',this.value)" title="Alterar status">
          <option value="pendente"  ${(n.status||"pendente")==="pendente"  ?"selected":""}>⏳ Pendente</option>
          <option value="aprovada"  ${(n.status||"")==="aprovada"  ?"selected":""}>✅ Aprovada</option>
          <option value="rejeitada" ${(n.status||"")==="rejeitada" ?"selected":""}>❌ Rejeitada</option>
        </select>
      </td>
      <td>
        <div class="td-actions">
          <button class="btn btn-sec btn-xs" onclick="abrirModalNota('${esc(n.id)}','${esc(clienteId)}')">👁 Ver</button>
          <button class="btn btn-clay btn-xs" onclick="apagarNota('${esc(clienteId)}','${esc(n.id)}')">🗑</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

async function mudarStatusNota(clienteId, notaId, novoStatus) {
  if (!clienteId || !notaId) return;
  try {
    const obs = novoStatus === "rejeitada" ? prompt("Motivo da rejeição (opcional):") || "" : "";
    await atualizarStatusNota(clienteId, notaId, novoStatus, obs);
    const nota = Admin.todasNotas.find(n => n.id === notaId);
    if (nota) { nota.status = novoStatus; nota.observacaoAdmin = obs; }

    // Notifica cliente por WhatsApp se configurado
    const cliente = Admin.clientes.find(c => c.id === clienteId);
    if (cliente?.whatsapp && (novoStatus === "aprovada" || novoStatus === "rejeitada")) {
      const msg = novoStatus === "aprovada"
        ? `✅ Sua nota fiscal ${nota?.numero || ""} foi *APROVADA* pela Helmigui. Entre no portal para mais detalhes.`
        : `❌ Sua nota fiscal ${nota?.numero || ""} foi *REJEITADA*${obs ? ": " + obs : ""}. Entre em contato conosco.`;
      enviarWhatsAppMensagem(cliente.whatsapp, msg);
    }

    toast(`✔ Status alterado para ${novoStatus}.`);
    filtrarNotasAdmin();
  } catch { toast("Erro ao alterar status."); }
}

function abrirModalNota(notaId, clienteId) {
  const n = Admin.todasNotas.find(x => x.id === notaId);
  if (!n) return;
  const campos = [
    ["Cliente", n._clienteNome || clienteId || "—"],
    ["Emitente", n.emissor], ["CNPJ Emitente", n.cnpjEmitente],
    ["Número", n.numero], ["Data de Emissão", n.dataEmissao],
    ["Vencimento", n.vencimento], ["Valor", fmt(n.valor)],
    ["Tipo", n.tipo], ["Categoria", n.categoria],
    ["Fluxo", n.fluxo === "entrada" ? "🟢 Entrada" : "🔴 Saída"],
    ["Observações", n.observacoes], ["Obs Admin", n.observacaoAdmin],
    ["Status", n.status || "pendente"],
    ["Enviado em", fmtDataStr(n.criadoEm)],
  ].filter(([,val]) => val);

  el("modal-nota-corpo").innerHTML = campos.map(([l, val]) =>
    `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--muted);min-width:120px;font-size:.75rem">${l}</span>
      <span style="font-size:.82rem;font-weight:500">${esc(String(val))}</span>
    </div>`).join("");

  el("modal-nota-acoes").innerHTML = `
    <select class="nota-status-sel" style="padding:8px 12px;font-size:.82rem" id="modal-nota-status">
      <option value="pendente" ${(n.status||"pendente")==="pendente"?"selected":""}>⏳ Pendente</option>
      <option value="aprovada" ${n.status==="aprovada"?"selected":""}>✅ Aprovar</option>
      <option value="rejeitada" ${n.status==="rejeitada"?"selected":""}>❌ Rejeitar</option>
    </select>
    <button class="btn btn-prim btn-sm" onclick="mudarStatusNota('${esc(clienteId)}','${esc(notaId)}',document.getElementById('modal-nota-status').value);fecharModal('modal-nota')">Confirmar</button>
    <button class="btn btn-sec btn-sm" onclick="fecharModal('modal-nota')">Fechar</button>`;

  document.getElementById("modal-nota").classList.add("ativo");
}

async function apagarNota(clienteId, notaId) {
  if (!confirm("Excluir esta nota?")) return;
  try {
    await excluirNota(clienteId, notaId);
    Admin.todasNotas = Admin.todasNotas.filter(n => n.id !== notaId);
    filtrarNotasAdmin();
    toast("Nota excluída.");
  } catch { toast("Erro ao excluir."); }
}

// ── Mensageria ────────────────────────────────────────────────────────────────
async function enviarMensagemAdmin(e) {
  e.preventDefault();
  const dest    = v("msg-dest");
  const idEspec = v("msg-cliente-id");
  const canal   = v("msg-canal");
  const assunto = v("msg-assunto").trim();
  const corpo   = v("msg-corpo").trim();
  if (!assunto || !corpo) { toast("Preencha assunto e mensagem."); return; }

  let alvos = [];
  if (idEspec) {
    const c = Admin.clientes.find(x => x.id === idEspec);
    if (c) alvos = [c];
  } else if (dest === "ativos") {
    alvos = Admin.clientes.filter(c => c.status === "ativo");
  } else {
    alvos = Admin.clientes;
  }

  if (!alvos.length) { toast("Nenhum cliente encontrado."); return; }

  let enviados = 0;
  for (const c of alvos) {
    try {
      // Salva mensagem no Firestore do cliente
      await salvarMensagem({
        de: "Helmigui", assunto, texto: corpo, lida: false, canal,
        criadoEm: new Date().toISOString(),
      }, c.id);

      // WhatsApp via Evolution API
      if ((canal === "whatsapp" || canal === "todos") && c.whatsapp) {
        await enviarWhatsAppMensagem(c.whatsapp, `*${assunto}*\n\n${corpo}`);
      }

      enviados++;
    } catch {}
  }

  toast(`✔ Mensagem enviada para ${enviados} cliente(s).`);
  document.getElementById("form-msg").reset();
}

async function enviarWppMassa() {
  const corpo = v("msg-corpo").trim();
  if (!corpo) { toast("Digite a mensagem antes de enviar por WhatsApp."); return; }
  const ativos = Admin.clientes.filter(c => c.status === "ativo" && c.whatsapp);
  if (!ativos.length) { toast("Nenhum cliente ativo com WhatsApp cadastrado."); return; }
  if (!confirm(`Enviar WhatsApp para ${ativos.length} cliente(s)?`)) return;
  let ok = 0;
  for (const c of ativos) {
    const res = await enviarWhatsAppMensagem(c.whatsapp, corpo);
    if (res) ok++;
  }
  toast(`✔ WhatsApp enviado para ${ok}/${ativos.length} clientes.`);
}

async function renderMsgRecebidas() {
  const cont = el("msg-recebidas-lista");
  cont.innerHTML = '<p class="vazio">Carregando...</p>';
  const todas = [];
  for (const c of Admin.clientes.slice(0, 10)) {
    try {
      const msgs = await buscarMensagens(c.id);
      msgs.forEach(m => { m._clienteNome = c.razaoSocial; });
      // Filtra apenas as enviadas pelo cliente (de: cliente)
      todas.push(...msgs.filter(m => m.de !== "Helmigui"));
    } catch {}
  }
  if (!todas.length) { cont.innerHTML = '<p class="vazio">Nenhuma mensagem dos clientes.</p>'; return; }
  cont.innerHTML = todas.slice(0, 20).map(m => `
    <div class="msg-card ${m.lida ? "" : "nao-lida"}" style="margin-bottom:8px">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
        <span style="font-weight:700;font-size:.8rem">${esc(m._clienteNome || "Cliente")}</span>
        <span style="font-size:.68rem;color:var(--muted);margin-left:auto">${fmtDataStr(m.criadoEm)}</span>
      </div>
      <div style="font-size:.82rem;color:var(--ink)">${esc(m.texto || m.corpo || "")}</div>
    </div>`).join("");
}

function msgWppCliente(wpp) {
  fecharModal("modal-cliente");
  const texto = prompt("Mensagem para enviar ao cliente:");
  if (!texto) return;
  enviarWhatsAppMensagem(wpp, texto).then(ok => toast(ok ? "✔ WhatsApp enviado!" : "Erro ao enviar WhatsApp."));
}

// ── Alertas ───────────────────────────────────────────────────────────────────
function renderAlertas() {
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 7);

  const proximas = Admin.todasNotas.filter(n => {
    if (!n.vencimento) return false;
    const partes = n.vencimento.split("/");
    if (partes.length !== 3) return false;
    const d = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    return d >= hoje && d <= limite && (n.status === "pendente" || !n.status);
  });

  const cont = el("alertas-lista");
  if (!proximas.length) { cont.innerHTML = '<p class="vazio">Nenhuma nota vencendo nos próximos 7 dias. ✅</p>'; return; }
  cont.innerHTML = `
    <div class="tabela-wrap">
      <table>
        <thead><tr><th>Cliente</th><th>Emitente</th><th>Valor</th><th>Vencimento</th><th>Ação</th></tr></thead>
        <tbody>${proximas.map(n => `
          <tr>
            <td>${esc(n._clienteNome || "—")}</td>
            <td>${esc(n.emissor || "—")}</td>
            <td class="td-mono" style="color:var(--clay)">${fmt(n.valor)}</td>
            <td style="color:var(--clay);font-weight:600">${n.vencimento}</td>
            <td><button class="btn btn-wpp btn-xs" onclick="alertarVencimento('${esc(n._clienteId||"")}','${esc(n.id)}')">💬 Alertar</button></td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

async function alertarVencimento(clienteId, notaId) {
  const nota    = Admin.todasNotas.find(n => n.id === notaId);
  const cliente = Admin.clientes.find(c => c.id === clienteId);
  if (!nota || !cliente?.whatsapp) { toast("WhatsApp do cliente não cadastrado."); return; }
  const msg = `⚠️ *Atenção* — Sua nota *${nota.numero || ""}* no valor de *${fmt(nota.valor)}* vence em *${nota.vencimento}*.\n\nRegularize-a o quanto antes no portal Helmigui.`;
  const ok = await enviarWhatsAppMensagem(cliente.whatsapp, msg);
  toast(ok ? "✔ Alerta WhatsApp enviado!" : "Erro ao enviar WhatsApp.");
}

function salvarAlertas() {
  toast("✔ Configurações salvas!");
}

// ── Financeiro interno ────────────────────────────────────────────────────────
function renderFinanceiro() {
  const tbody = el("tbody-fin");
  if (!Admin.lancFin.length) { tbody.innerHTML = `<tr><td colspan="6" class="vazio">Nenhum lançamento registrado.</td></tr>`; return; }
  tbody.innerHTML = Admin.lancFin.slice().reverse().map((l, i) => `
    <tr>
      <td>${fmtDataStr(l.data)}</td>
      <td>${esc(l.descricao)}</td>
      <td>${esc(l.categoria)}</td>
      <td><span class="badge ${l.tipo==="entrada"?"badge-verde":"badge-clay"}">${l.tipo}</span></td>
      <td class="td-mono" style="color:${l.tipo==="entrada"?"var(--verde-l)":"var(--clay)"}">${fmt(l.valor)}</td>
      <td><button class="btn btn-clay btn-xs" onclick="removerLancFin(${Admin.lancFin.length - 1 - i})">🗑</button></td>
    </tr>`).join("");
}

async function adicionarLancFin(e) {
  e.preventDefault();
  const lanc = {
    tipo:      v("fin-tipo"),
    valor:     parseFloat(v("fin-valor")) || 0,
    descricao: v("fin-desc").trim(),
    categoria: v("fin-cat"),
    data:      v("fin-data"),
    id:        Date.now().toString(),
  };
  if (!lanc.descricao || !lanc.valor || !lanc.data) { toast("Preencha todos os campos."); return; }
  Admin.lancFin.push(lanc);
  localStorage.setItem("helmigui_fin_interno", JSON.stringify(Admin.lancFin));
  document.getElementById("form-fin").reset();
  setVal("fin-data", new Date().toISOString().split("T")[0]);
  renderFinanceiro();
  toast("✔ Lançamento registrado.");
}

function removerLancFin(idx) {
  if (!confirm("Excluir este lançamento?")) return;
  Admin.lancFin.splice(idx, 1);
  localStorage.setItem("helmigui_fin_interno", JSON.stringify(Admin.lancFin));
  renderFinanceiro();
  toast("Lançamento excluído.");
}

// ── Relatórios ────────────────────────────────────────────────────────────────
async function exportarAdmin(tipo, formato) {
  const clienteId = v("rel-cliente-id");
  const de  = v("rel-de");
  const ate = v("rel-ate");

  let dados;
  let cliente = null;

  if (tipo === "notas") {
    dados = clienteId ? Admin.todasNotas.filter(n => (n._clienteId || n.clienteId) === clienteId) : Admin.todasNotas;
    cliente = Admin.clientes.find(c => c.id === clienteId) || null;
  } else {
    // Lançamentos: busca do cliente ou internos
    if (clienteId) {
      try { dados = await buscarLancamentos(clienteId); } catch { dados = []; }
      cliente = Admin.clientes.find(c => c.id === clienteId) || null;
    } else {
      dados = Admin.lancFin;
    }
    if (de && ate) {
      const dDe  = new Date(de  + "T00:00:00");
      const dAte = new Date(ate + "T23:59:59");
      dados = dados.filter(l => {
        const d = new Date(l.data ? l.data + "T12:00:00" : l.criadoEm || 0);
        return d >= dDe && d <= dAte;
      });
    }
  }

  if (!dados?.length) { toast("Sem dados para exportar."); return; }
  try {
    if (formato === "pdf") gerarPDF(tipo, dados, cliente);
    else                   gerarExcel(tipo, dados, cliente);
    toast("✔ Relatório gerado!");
  } catch (e) { toast("Erro ao gerar."); console.error(e); }
}

// ── Modais ────────────────────────────────────────────────────────────────────
function fecharModal(id) {
  document.getElementById(id).classList.remove("ativo");
}

// ── Usuários & Acesso ─────────────────────────────────────────────────────────
function carregarUsuariosLocal() {
  return JSON.parse(localStorage.getItem("helmigui_usuarios") || "[]");
}

function salvarTodosUsuariosLocal(lista) {
  localStorage.setItem("helmigui_usuarios", JSON.stringify(lista));
}

function salvarUsuarioLocal(u) {
  const lista = carregarUsuariosLocal();
  const idx   = lista.findIndex(x => x.email === u.email.toLowerCase());
  const novo  = { ...u, email: u.email.toLowerCase() };
  if (idx >= 0) lista[idx] = { ...lista[idx], ...novo };
  else lista.unshift(novo);
  salvarTodosUsuariosLocal(lista);
}

function renderUsuarios() {
  const usuarios = carregarUsuariosLocal();
  const tbody    = el("tbody-usuarios");

  if (!usuarios.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="vazio">Nenhum cliente cadastrado com acesso ao portal.</td></tr>`;
    return;
  }

  tbody.innerHTML = usuarios.map((u, i) => `
    <tr>
      <td><strong>${esc(u.razaoSocial || "—")}</strong></td>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:.8rem">${esc(u.email)}</td>
      <td><span class="badge ${u.status === "ativo" ? "badge-verde" : "badge-clay"}">${u.status || "ativo"}</span></td>
      <td>
        <div class="td-actions">
          <button class="btn btn-ouro btn-xs" onclick="redefinirSenha(${i})">🔑 Redefinir Senha</button>
          <button class="btn btn-clay btn-xs" onclick="removerAcessoUsuario(${i})">🗑 Remover Acesso</button>
        </div>
      </td>
    </tr>`).join("");
}

function redefinirSenha(idx) {
  const usuarios = carregarUsuariosLocal();
  const u        = usuarios[idx];
  if (!u) return;
  const novaSenha = prompt(`Nova senha para ${u.email} (mín. 6 caracteres):`);
  if (!novaSenha) return;
  if (novaSenha.length < 6) { toast("Senha muito curta. Mínimo 6 caracteres."); return; }
  usuarios[idx].senha = novaSenha;
  salvarTodosUsuariosLocal(usuarios);
  toast(`✔ Senha de ${u.email} redefinida.`);
}

function removerAcessoUsuario(idx) {
  const usuarios = carregarUsuariosLocal();
  const u        = usuarios[idx];
  if (!u) return;
  if (!confirm(`Remover acesso ao portal de ${u.email}?`)) return;
  usuarios.splice(idx, 1);
  salvarTodosUsuariosLocal(usuarios);
  renderUsuarios();
  toast(`Acesso de ${u.email} removido.`);
}

function alterarSenhaAdmin(e) {
  e.preventDefault();
  const email    = Admin.email?.toLowerCase() || "";
  const atual    = v("adm-senha-atual");
  const nova     = v("adm-senha-nova");
  const conf     = v("adm-senha-conf");

  if (nova !== conf) { toast("As senhas não coincidem."); return; }
  if (nova.length < 6) { toast("Nova senha muito curta."); return; }

  // Verifica senha atual
  const senhasConfig = CONFIG.ADMIN_SENHAS || {};
  const chaveLocal   = "helmigui_admin_senhas";
  const senhasLocal  = JSON.parse(localStorage.getItem(chaveLocal) || "{}");
  const senhaAtual   = senhasLocal[email] || senhasConfig[email] || "";

  if (senhaAtual && atual !== senhaAtual) {
    toast("Senha atual incorreta."); return;
  }

  senhasLocal[email] = nova;
  localStorage.setItem(chaveLocal, JSON.stringify(senhasLocal));
  toast("✔ Senha alterada com sucesso!");
  document.getElementById("form-senha-admin").reset();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt       = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtCompact = (n) => {
  if (n >= 1000000) return "R$" + (n/1000000).toFixed(1) + "M";
  if (n >= 1000)    return "R$" + (n/1000).toFixed(0) + "k";
  return fmt(n);
};
const v      = (id) => document.getElementById(id)?.value || "";
const el     = (id) => document.getElementById(id);
const esc    = (s)  => String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.value = val ?? ""; };

function fmtDataStr(s) {
  if (!s) return "—";
  try { const d = new Date(s); return isNaN(d) ? String(s) : d.toLocaleDateString("pt-BR"); }
  catch { return String(s); }
}

function pillAdm(status) {
  if (status === "aprovada")  return "badge-verde";
  if (status === "rejeitada") return "badge-clay";
  return "badge-ouro";
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

// ── admin.js — Visão admin: menu hambúrguer, clientes ────────────────────────

// ── Persistência ──────────────────────────────────────────────────────────────
function salvarClientes(clientes) {
  localStorage.setItem("helmigui_clientes", JSON.stringify(clientes));
}
function carregarClientes() {
  return JSON.parse(localStorage.getItem("helmigui_clientes") || "[]");
}

// ── Menu hambúrguer ───────────────────────────────────────────────────────────
function toggleMenu() {
  const menu = document.getElementById("menu-lateral");
  menu.classList.toggle("aberto");
}

function fecharMenu() {
  const menu = document.getElementById("menu-lateral");
  menu.classList.remove("aberto");
}

function toggleSubmenuCliente() {
  const sub = document.getElementById("submenu-cliente");
  sub.classList.toggle("aberto");
}

// ── Navegação entre telas admin ───────────────────────────────────────────────
function irParaAdmin(tela) {
  fecharMenu();
  document.querySelectorAll(".tela-admin").forEach((t) => t.classList.remove("ativa"));
  const el = document.getElementById("admin-" + tela);
  if (el) el.classList.add("ativa");

  if (tela === "clientes-ativos") renderizarClientesAtivos();
}

// ── Máscara de CNPJ: 00.000.000/0000-00 ─────────────────────────────────────
function mascaraCNPJ(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 14);
  if (v.length > 12) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*/, "$1.$2.$3/$4-$5");
  else if (v.length > 8) v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/, "$1.$2.$3/$4");
  else if (v.length > 5) v = v.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, "$1.$2.$3");
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,3}).*/, "$1.$2");
  input.value = v;
}

// ── Máscara de telefone: (00) 00000-0000 ─────────────────────────────────────
function mascaraTelefone(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 11);
  if (v.length > 6) v = v.replace(/^(\d{2})(\d{4,5})(\d{0,4}).*/, "($1) $2-$3");
  else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
  else if (v.length > 0) v = v.replace(/^(\d{0,2})/, "($1");
  input.value = v;
}

// ── Campo WhatsApp condicional ────────────────────────────────────────────────
function atualizarCampoWhatsApp() {
  const ehWpp = document.getElementById("eh-whatsapp").value;
  const campoWpp = document.getElementById("campo-whatsapp-extra");
  campoWpp.style.display = ehWpp === "nao" ? "block" : "none";
  if (ehWpp === "sim") {
    document.getElementById("wpp-extra").value = "";
  }
}

// ── Cadastro de cliente ───────────────────────────────────────────────────────
function salvarCliente(e) {
  e.preventDefault();
  const form = document.getElementById("form-cliente");
  const ehWpp = form["eh-whatsapp"].value === "sim";
  const telefone = form["cli-telefone"].value.trim();

  const cliente = {
    id: form["cli-id"].value || Date.now().toString(),
    nome: form["cli-nome"].value.trim(),
    cnpj: form["cli-cnpj"].value.trim(),
    telefone,
    ehWhatsapp: ehWpp,
    whatsapp: ehWpp ? telefone : (form["wpp-extra"].value.trim() || telefone),
    endereco: form["cli-endereco"].value.trim(),
    banco: form["cli-banco"].value.trim(),
    status: "ativo",
    criadoEm: form["cli-id"].value ? undefined : new Date().toLocaleDateString("pt-BR"),
  };

  const clientes = carregarClientes();
  const idx = clientes.findIndex((c) => c.id === cliente.id);
  if (idx >= 0) {
    clientes[idx] = { ...clientes[idx], ...cliente };
  } else {
    clientes.unshift(cliente);
  }
  salvarClientes(clientes);

  form.reset();
  form["cli-id"].value = "";
  document.getElementById("campo-whatsapp-extra").style.display = "none";
  document.getElementById("msg-cliente-salvo").style.display = "block";
  setTimeout(() => {
    document.getElementById("msg-cliente-salvo").style.display = "none";
  }, 2500);
}

// ── Lista de clientes ativos ──────────────────────────────────────────────────
function renderizarClientesAtivos() {
  const lista = document.getElementById("lista-clientes");
  const clientes = carregarClientes().filter((c) => c.status === "ativo");

  if (!clientes.length) {
    lista.innerHTML = '<p class="vazio">Nenhum cliente cadastrado ainda.</p>';
    return;
  }

  lista.innerHTML = clientes
    .map(
      (c) => `
    <div class="card-cliente" data-id="${c.id}">
      <div class="cliente-nome">${c.nome}</div>
      <div class="cliente-detalhe">CNPJ: <span class="mono">${c.cnpj || "—"}</span></div>
      <div class="cliente-detalhe">Tel: ${c.telefone || "—"}${c.ehWhatsapp ? " <span class='badge-wpp'>WhatsApp</span>" : ""}</div>
      ${!c.ehWhatsapp && c.whatsapp ? `<div class="cliente-detalhe">WhatsApp: ${c.whatsapp}</div>` : ""}
      <div class="cliente-detalhe">Banco: ${c.banco || "—"}</div>
      <div class="cliente-detalhe">Endereço: ${c.endereco || "—"}</div>
      <div class="cliente-acoes">
        <button class="btn-secundario" onclick="editarCliente('${c.id}')">Editar</button>
        <button class="btn-perigo" onclick="inativarCliente('${c.id}')">Inativar</button>
      </div>
    </div>`
    )
    .join("");
}

function editarCliente(id) {
  const c = carregarClientes().find((c) => c.id === id);
  if (!c) return;
  irParaAdmin("cadastrar-cliente");

  const form = document.getElementById("form-cliente");
  form["cli-id"].value = c.id;
  form["cli-nome"].value = c.nome;
  form["cli-cnpj"].value = c.cnpj;
  form["cli-telefone"].value = c.telefone;
  form["eh-whatsapp"].value = c.ehWhatsapp ? "sim" : "nao";
  form["cli-endereco"].value = c.endereco;
  form["cli-banco"].value = c.banco;
  atualizarCampoWhatsApp();
  if (!c.ehWhatsapp) form["wpp-extra"].value = c.whatsapp || "";
}

function inativarCliente(id) {
  if (!confirm("Inativar este cliente?")) return;
  const clientes = carregarClientes().map((c) =>
    c.id === id ? { ...c, status: "inativo" } : c
  );
  salvarClientes(clientes);
  renderizarClientesAtivos();
}

// ── Inicialização ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch(console.error);
  }

  const formCliente = document.getElementById("form-cliente");
  if (formCliente) formCliente.addEventListener("submit", salvarCliente);

  const cnpjInput = document.getElementById("cli-cnpj");
  if (cnpjInput) cnpjInput.addEventListener("input", () => mascaraCNPJ(cnpjInput));

  const telInput = document.getElementById("cli-telefone");
  if (telInput) telInput.addEventListener("input", () => mascaraTelefone(telInput));

  const wppInput = document.getElementById("wpp-extra");
  if (wppInput) wppInput.addEventListener("input", () => mascaraTelefone(wppInput));

  // Inicia na tela de clientes ativos
  irParaAdmin("clientes-ativos");
});

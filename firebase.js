// ── firebase.js — Serviço Firebase (Auth + Firestore) ────────────────────────
// Usa SDK v9 compat via CDN (carregado no HTML antes deste arquivo)

let _db = null, _auth = null, _app = null;

function initFirebase() {
  if (_app) return;
  const cfg = CONFIG.FIREBASE || {};
  // Só inicializa se a apiKey estiver preenchida
  if (!cfg.apiKey) {
    console.info("Firebase não configurado — usando localStorage como armazenamento.");
    return;
  }
  try {
    _app  = firebase.initializeApp(cfg);
    _db   = firebase.firestore();
    _auth = firebase.auth();
    _db.settings({ experimentalForceLongPolling: true });
    console.info("Firebase inicializado com sucesso.");
  } catch (e) {
    console.warn("Falha ao inicializar Firebase — usando localStorage:", e.message);
    _app = null; _db = null; _auth = null;
  }
}

function db()   { return _db; }
function auth() { return _auth; }

// ── Auth ──────────────────────────────────────────────────────────────────────
async function loginComEmail(email, senha) {
  initFirebase();
  if (_auth) {
    const cred = await _auth.signInWithEmailAndPassword(email, senha);
    return cred.user;
  }

  // Modo localStorage: admin entra com qualquer senha (simplificado para desenvolvimento)
  // Para produção, substitua pelo Firebase com Auth configurado
  const emailLower = (email || "").toLowerCase().trim();
  const admins     = (CONFIG.ADMIN_EMAILS || []).map(e => e.toLowerCase());

  // Simula usuários clientes armazenados localmente
  const usuarios = JSON.parse(localStorage.getItem("helmigui_usuarios") || "[]");
  const usuario  = usuarios.find(u => u.email.toLowerCase() === emailLower);

  if (admins.includes(emailLower)) {
    // Admin: aceita qualquer senha em modo localStorage (sem Firebase não há verificação real)
    const user = { uid: "admin-" + emailLower, email };
    localStorage.setItem("helmigui_uid",     user.uid);
    localStorage.setItem("helmigui_email",   email);
    localStorage.setItem("helmigui_isAdmin", "true");
    return user;
  } else if (usuario && usuario.senha === senha) {
    const user = { uid: usuario.uid || emailLower, email };
    localStorage.setItem("helmigui_uid",   user.uid);
    localStorage.setItem("helmigui_email", email);
    return user;
  } else {
    const err = new Error("E-mail ou senha incorretos.");
    err.code  = "auth/invalid-credential";
    throw err;
  }
}

async function logout() {
  if (_auth) try { await _auth.signOut(); } catch {}
  localStorage.removeItem("helmigui_uid");
  localStorage.removeItem("helmigui_email");
  localStorage.removeItem("helmigui_isAdmin");
}

function onAuthChange(cb) {
  initFirebase();
  if (!_auth) {
    // Modo localStorage: restaura sessão do localStorage
    const uid   = localStorage.getItem("helmigui_uid");
    const email = localStorage.getItem("helmigui_email");
    if (uid && email) cb({ uid, email });
    else cb(null);
    return;
  }
  _auth.onAuthStateChanged(cb);
}

function isAdmin(email) {
  return (CONFIG.ADMIN_EMAILS || []).includes((email || "").toLowerCase());
}

// ── Clientes ──────────────────────────────────────────────────────────────────
async function salvarCliente(dados) {
  if (!_db) { return salvarLocalStorage("helmigui_clientes_admin", dados, "id"); }
  const ref = dados.id
    ? _db.collection("clientes").doc(dados.id)
    : _db.collection("clientes").doc();
  dados.id = ref.id;
  await ref.set(dados, { merge: true });
  return dados.id;
}

async function buscarClientes(apenasAtivos = false) {
  if (!_db) return carregarLocalStorage("helmigui_clientes_admin");
  let q = _db.collection("clientes").orderBy("razaoSocial");
  if (apenasAtivos) q = q.where("status", "==", "ativo");
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function buscarCliente(id) {
  if (!_db) {
    const lista = carregarLocalStorage("helmigui_clientes_admin");
    return lista.find(c => c.id === id) || null;
  }
  const snap = await _db.collection("clientes").doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function atualizarStatusCliente(id, status) {
  if (!_db) return atualizarLocalStorage("helmigui_clientes_admin", id, { status });
  await _db.collection("clientes").doc(id).update({ status, atualizadoEm: new Date().toISOString() });
}

async function excluirCliente(id) {
  if (!_db) return excluirLocalStorage("helmigui_clientes_admin", id);
  await _db.collection("clientes").doc(id).delete();
}

// ── Notas fiscais ─────────────────────────────────────────────────────────────
async function salvarNota(dados, clienteId) {
  if (!_db) { return salvarLocalStorage("helmigui_notas_" + clienteId, dados, "id"); }
  const ref = _db.collection("clientes").doc(clienteId).collection("notas").doc();
  dados.id = ref.id;
  dados.clienteId = clienteId;
  dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
  await ref.set(dados);
  return dados.id;
}

async function buscarNotas(clienteId, filtros = {}) {
  if (!_db) return carregarLocalStorage("helmigui_notas_" + clienteId);
  let q = _db.collection("clientes").doc(clienteId).collection("notas")
    .orderBy("criadoEm", "desc");
  if (filtros.status) q = q.where("status", "==", filtros.status);
  const snap = await q.get();
  return snap.docs.map(d => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm?.toDate?.()?.toISOString() || new Date().toISOString() }));
}

async function buscarTodasNotas(limite = 50) {
  if (!_db) return [];
  // Busca subcoleções de todos os clientes (requer collectionGroup)
  const snap = await _db.collectionGroup("notas").orderBy("criadoEm", "desc").limit(limite).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm?.toDate?.()?.toISOString() || new Date().toISOString() }));
}

async function atualizarStatusNota(clienteId, notaId, status, obs) {
  if (!_db) return;
  await _db.collection("clientes").doc(clienteId).collection("notas").doc(notaId)
    .update({ status, observacaoAdmin: obs || "", atualizadoEm: new Date().toISOString() });
}

async function excluirNota(clienteId, notaId) {
  if (!_db) return excluirLocalStorage("helmigui_notas_" + clienteId, notaId);
  await _db.collection("clientes").doc(clienteId).collection("notas").doc(notaId).delete();
}

// ── Lançamentos de fluxo de caixa ─────────────────────────────────────────────
async function salvarLancamento(dados, clienteId) {
  if (!_db) { return salvarLocalStorage("helmigui_lanc_" + clienteId, dados, "id"); }
  const ref = _db.collection("clientes").doc(clienteId).collection("lancamentos").doc();
  dados.id = ref.id;
  dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
  await ref.set(dados);
  return dados.id;
}

async function buscarLancamentos(clienteId) {
  if (!_db) return carregarLocalStorage("helmigui_lanc_" + clienteId);
  const snap = await _db.collection("clientes").doc(clienteId).collection("lancamentos")
    .orderBy("criadoEm", "desc").limit(200).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm?.toDate?.()?.toISOString() || new Date().toISOString() }));
}

async function excluirLancamento(clienteId, lancId) {
  if (!_db) return excluirLocalStorage("helmigui_lanc_" + clienteId, lancId);
  await _db.collection("clientes").doc(clienteId).collection("lancamentos").doc(lancId).delete();
}

// ── Mensagens ─────────────────────────────────────────────────────────────────
async function salvarMensagem(dados, clienteId) {
  if (!_db) { return salvarLocalStorage("helmigui_msg_" + clienteId, dados, "id"); }
  const ref = _db.collection("clientes").doc(clienteId).collection("mensagens").doc();
  dados.id = ref.id;
  dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
  await ref.set(dados);
  return dados.id;
}

async function buscarMensagens(clienteId) {
  if (!_db) return carregarLocalStorage("helmigui_msg_" + clienteId);
  const snap = await _db.collection("clientes").doc(clienteId).collection("mensagens")
    .orderBy("criadoEm", "desc").limit(50).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data(), criadoEm: d.data().criadoEm?.toDate?.()?.toISOString() || new Date().toISOString() }));
}

async function marcarMensagemLida(clienteId, msgId) {
  if (!_db) return;
  await _db.collection("clientes").doc(clienteId).collection("mensagens").doc(msgId)
    .update({ lida: true });
}

// ── Helpers localStorage (fallback sem Firebase) ──────────────────────────────
function carregarLocalStorage(chave) {
  return JSON.parse(localStorage.getItem(chave) || "[]");
}

function salvarLocalStorage(chave, item, campo = "id") {
  const lista = carregarLocalStorage(chave);
  if (!item[campo]) item[campo] = Date.now().toString();
  const idx = lista.findIndex(i => i[campo] === item[campo]);
  if (idx >= 0) lista[idx] = item; else lista.unshift(item);
  localStorage.setItem(chave, JSON.stringify(lista));
  return item[campo];
}

function atualizarLocalStorage(chave, id, patch) {
  const lista = carregarLocalStorage(chave).map(i => i.id === id ? { ...i, ...patch } : i);
  localStorage.setItem(chave, JSON.stringify(lista));
}

function excluirLocalStorage(chave, id) {
  const lista = carregarLocalStorage(chave).filter(i => i.id !== id);
  localStorage.setItem(chave, JSON.stringify(lista));
}

// ── WhatsApp Evolution API ────────────────────────────────────────────────────
async function enviarWhatsAppNota(dados, clienteNome, clienteCNPJ, usuarioNome) {
  const url = CONFIG.EVOLUTION_API_URL;
  const key = CONFIG.EVOLUTION_API_KEY;
  const inst = CONFIG.EVOLUTION_INSTANCE;
  if (!url || url.includes("SUA-EVOLUTION")) return;

  const fmtVal = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const msg = `📄 *Nova Nota Fiscal Recebida*\n\n` +
    `👤 Cliente: *${clienteNome}*\n` +
    `🏢 CNPJ Cliente: ${clienteCNPJ || "—"}\n` +
    `📋 Número da Nota: ${dados.numero || "—"}\n` +
    `🏭 Emitente: ${dados.emissor || "—"}\n` +
    `🆔 CNPJ Emitente: ${dados.cnpjEmitente || "—"}\n` +
    `💰 Valor: *${fmtVal(dados.valor)}*\n` +
    `📅 Emissão: ${dados.dataEmissao || "—"}\n` +
    `📂 Tipo: ${dados.tipo || "—"}\n` +
    `👤 Enviado por: ${usuarioNome || "—"}\n` +
    `⏰ Data do envio: ${new Date().toLocaleString("pt-BR")}\n\n` +
    `✅ Nota cadastrada automaticamente no sistema.`;

  try {
    await fetch(`${url}/message/sendText/${inst}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": key },
      body: JSON.stringify({ number: CONFIG.ADMIN_WHATSAPP, text: msg }),
    });

    // Alerta para notas acima do limite
    if (dados.valor > CONFIG.ALERTA_VALOR_ALTO) {
      const alertMsg = `🚨 *ALERTA: Nota de alto valor!*\nCliente: ${clienteNome}\nValor: ${fmtVal(dados.valor)}\nAcima do limite de ${fmtVal(CONFIG.ALERTA_VALOR_ALTO)}`;
      await fetch(`${url}/message/sendText/${inst}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": key },
        body: JSON.stringify({ number: CONFIG.ADMIN_WHATSAPP, text: alertMsg }),
      });
    }
  } catch (e) {
    console.warn("Erro ao enviar WhatsApp:", e.message);
  }
}

async function enviarWhatsAppMensagem(numero, texto) {
  const url = CONFIG.EVOLUTION_API_URL;
  if (!url || url.includes("SUA-EVOLUTION")) return false;
  try {
    const r = await fetch(`${url}/message/sendText/${CONFIG.EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": CONFIG.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: numero, text: texto }),
    });
    return r.ok;
  } catch { return false; }
}

// ── Configurações da plataforma Helmigui ──────────────────────────────────────
// Edite este arquivo para ativar Firebase, WhatsApp e EmailJS.
// Enquanto os campos tiverem "SUA_*", o sistema usa armazenamento local (localStorage).

const CONFIG = {

  // ── ADMINISTRAÇÃO ───────────────────────────────────────────────────────────
  // Número WhatsApp com DDI (sem espaços ou traços): ex. 5511999999999
  ADMIN_WHATSAPP: "5511999999999",
  ADMIN_NOME:     "Helmigui Serviços Financeiros",

  // E-mails que têm acesso ao painel ADMIN (admin.html)
  // Adicione aqui todos os e-mails que devem ser administradores
  ADMIN_EMAILS: [
    "admin@helmigui.com.br",
    "helmigui@helmigui.com.br",
  ],

  // ── SENHAS DOS ADMINS (modo localStorage, sem Firebase) ─────────────────────
  // Mapeamento email → senha. Usado apenas quando Firebase NÃO está configurado.
  // Quando Firebase estiver ativo, as senhas são gerenciadas por lá (mais seguro).
  ADMIN_SENHAS: {
    "admin@helmigui.com.br":    "Helmigui@2025",   // ← troque para sua senha
    "helmigui@helmigui.com.br": "Helmigui@2025",   // ← troque para sua senha
  },

  // ── EVOLUTION API — WhatsApp Business ───────────────────────────────────────
  // Preencha quando tiver o servidor Evolution API rodando
  // Exemplo de URL: "https://api.seudominio.com.br"
  EVOLUTION_API_URL:      "SUA_EVOLUTION_API_URL",   // ← substitua aqui
  EVOLUTION_API_KEY:      "SUA_EVOLUTION_API_KEY",   // ← substitua aqui
  EVOLUTION_INSTANCE:     "helmigui",                // nome da instância criada na Evolution API

  // ── FIREBASE ────────────────────────────────────────────────────────────────
  // Deixe assim para usar localStorage (modo offline).
  // Para ativar Firebase: vá em https://console.firebase.google.com → seu projeto
  // → Configurações do projeto → Seus apps → SDK → copie e cole aqui
  FIREBASE: {
    apiKey:            "",   // ← cole aqui a apiKey do Firebase
    authDomain:        "",   // ← ex: "helmigui-app.firebaseapp.com"
    projectId:         "",   // ← ex: "helmigui-app"
    storageBucket:     "",   // ← ex: "helmigui-app.appspot.com"
    messagingSenderId: "",   // ← número de 12 dígitos
    appId:             "",   // ← ex: "1:000...web:abc..."
  },

  // ── EMAILJS — formulário de contato do site (index.html) ───────────────────
  // Cadastre em https://www.emailjs.com e preencha abaixo
  EMAILJS_PUBLIC_KEY:  "SUA_PUBLIC_KEY",
  EMAILJS_SERVICE_ID:  "SUA_SERVICE_ID",
  EMAILJS_TEMPLATE_ID: "SUA_TEMPLATE_ID",

  // ── ALERTAS AUTOMÁTICOS ─────────────────────────────────────────────────────
  // Se uma nota tiver valor acima deste número, um alerta extra é enviado no WhatsApp
  ALERTA_VALOR_ALTO: 10000,

  // Mensagem padrão para o botão flutuante de WhatsApp no site
  ADMIN_WHATSAPP_MENSAGEM: "Olá! Gostaria de conhecer os serviços da Helmigui.",
};

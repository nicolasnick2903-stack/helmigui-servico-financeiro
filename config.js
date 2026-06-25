// ── Configurações da plataforma Helmigui — edite aqui ────────────────────────
const CONFIG = {
  // WhatsApp da administradora (Evolution API)
  ADMIN_WHATSAPP: "5511999999999",
  ADMIN_NOME: "Helmigui Serviços Financeiros",

  // Evolution API — WhatsApp Business
  EVOLUTION_API_URL: "https://SUA-EVOLUTION-API.com",   // URL do servidor Evolution API
  EVOLUTION_API_KEY: "SUA_API_KEY",                     // API Key da Evolution API
  EVOLUTION_INSTANCE: "helmigui",                       // Nome da instância

  // Firebase — substitua com seus dados do Firebase Console
  FIREBASE: {
    apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    authDomain:        "helmigui-app.firebaseapp.com",
    projectId:         "helmigui-app",
    storageBucket:     "helmigui-app.appspot.com",
    messagingSenderId: "000000000000",
    appId:             "1:000000000000:web:XXXXXXXXXXXXXXXXXX",
  },

  // E-mail do admin (login no painel)
  ADMIN_EMAILS: ["admin@helmigui.com.br", "helmigui@helmigui.com.br"],

  // EmailJS (formulário de contato do site)
  EMAILJS_PUBLIC_KEY:  "SUA_PUBLIC_KEY",
  EMAILJS_SERVICE_ID:  "SUA_SERVICE_ID",
  EMAILJS_TEMPLATE_ID: "SUA_TEMPLATE_ID",

  // Alertas automáticos
  ALERTA_VALOR_ALTO: 10000,   // Alerta se nota > R$10.000

  // Mensagem padrão WhatsApp cliente→admin
  ADMIN_WHATSAPP_MENSAGEM: "Olá! Gostaria de conhecer os serviços da Helmigui Serviços Financeiros.",
};

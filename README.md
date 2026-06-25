# Helmigui Serviços Financeiros — PWA

App PWA para clientes da Helmigui: leitura de notas fiscais/boletos com câmera,
fluxo de caixa automático e gestão de clientes pelo painel admin.

---

## Como rodar localmente

```bash
# Instale o serve (uma vez)
npm install -g serve

# Dentro da pasta do projeto
cd "Helmigui serviços financeiros"
serve .
```

Acesse `http://localhost:3000` no navegador.

> **Importante:** o app PRECISA rodar via servidor HTTP (não pelo sistema de arquivos `file://`)
> porque `getUserMedia` (câmera) e os scripts do ZXing/Tesseract exigem contexto seguro (HTTPS ou localhost).

---

## Identidade visual — configure antes de usar

Copie os arquivos para as pastas indicadas:

| Arquivo de origem | Destino no projeto |
|---|---|
| `identidade-visual/logo-oficial.png` | já está lá — usado no cabeçalho e splash |
| `identidade-visual/icon-mark.png` | já está lá — favicon e ícone compacto |
| `identidade-visual/icons/icon-192.png` | → copie para `icons/icon-192.png` |
| `identidade-visual/icons/icon-512.png` | → copie para `icons/icon-512.png` |
| `identidade-visual/icons/apple-touch-icon.png` | → copie para `identidade-visual/icons/apple-touch-icon.png` |

---

## Configuração do WhatsApp da administradora

Abra `config.js` e altere a constante:

```js
ADMIN_WHATSAPP: "5511999999999",  // <- coloque o número aqui (somente dígitos)
```

---

## Testar a leitura de nota

1. Abra o app em `http://localhost:3000`
2. Clique em **Escanear Nota**
3. Use o botão **"Enviar foto da nota"** e selecione uma foto de boleto do celular
4. O app rodará o OCR + leitura de código de barras e mostrará a tela de confirmação
5. Revise e clique em **Salvar nota** — ela aparece em "Notas Lidas" e gera uma saída no Fluxo de Caixa

---

## Testar a câmera no celular

Hospede o app com HTTPS (ex.: via [Vercel](https://vercel.com), [Netlify](https://netlify.com) ou `ngrok`):

```bash
# Via ngrok (após instalar)
ngrok http 3000
```

Acesse o URL gerado pelo ngrok no celular — a câmera funcionará normalmente.

---

## Painel Admin

Acesse `admin.html` (link "Admin" no canto do cabeçalho do app cliente).

- **Menu hambúrguer** → Clientes → Cadastrar / Clientes Ativos
- Em desktop (>900px): menu lateral fica fixo na lateral esquerda automaticamente

---

## Estrutura de arquivos

```
helmigui-servico-financeiro/
├── index.html         # App cliente (3 botões: Escanear, Fluxo, WhatsApp)
├── admin.html         # Painel admin (gestão de clientes)
├── app.js             # Lógica principal: câmera, OCR, notas, fluxo de caixa
├── barcode.js         # ZXing: leitura de código de barras + decodificação Febraban
├── ocr.js             # Tesseract.js: OCR + heurísticas (número nota, emissor, tipo)
├── admin.js           # Lógica admin: cadastro/listagem de clientes, máscaras
├── config.js          # Constantes configuráveis (WhatsApp, versão cache)
├── manifest.json      # PWA manifest (ícones, cores, modo standalone)
├── service-worker.js  # Cache offline + instalação PWA
├── icons/
│   ├── icon-192.png   # Ícone PWA 192×192 (copiar de identidade-visual/icons/)
│   └── icon-512.png   # Ícone PWA 512×512 (copiar de identidade-visual/icons/)
└── identidade-visual/
    ├── logo-oficial.png
    ├── icon-mark.png
    └── icons/
        ├── icon-192.png
        ├── icon-512.png
        └── apple-touch-icon.png
```

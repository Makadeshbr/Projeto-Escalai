# 🤖 AI Guide — EscalaiApp

> **Documento de referência obrigatória para qualquer IA que trabalhe neste projeto.**
> Contém regras, fluxos e armadilhas que, se ignoradas, quebram a build ou o update do app.

---

## 📋 Stack Técnica

| Item | Valor |
|------|-------|
| Framework | Expo (React Native) com Expo Router |
| Build System | EAS Build (cloud) |
| OTA Updates | `expo-updates` via EAS Update |
| Backend | Aether BaaS (API REST + SDK) |
| Styling | NativeWind (TailwindCSS para React Native) |
| Linguagem | TypeScript |
| Package Manager | npm |

---

## 🏗️ Como Gerar um APK

### Comando único (sem interação):
```bash
npx eas-cli build -p android --profile preview --non-interactive
```

### Perfis de build (`eas.json`):

| Perfil | Formato | Channel OTA | Uso |
|--------|---------|-------------|-----|
| `preview` | APK | `preview` | Testes internos, distribuição direta |
| `production` | AAB | `production` | Google Play Store |
| `development` | Dev Client | `development` | Desenvolvimento local |

### ⚠️ REGRAS CRÍTICAS para build:
1. **NUNCA** altere o `runtimeVersion` em `app.json` sem gerar um novo APK. Se mudar o runtime, o OTA para de funcionar para APKs existentes.
2. **NUNCA** remova o plugin `expo-updates` de `app.json`. Sem ele, o APK perde a capacidade de receber OTA.
3. **NUNCA** altere o `expo.extra.eas.projectId` — é o identificador único do projeto EAS.
4. O campo `channel` em `eas.json` define qual canal OTA o APK escuta. Não mude sem necessidade.

---

## 📡 Over-The-Air (OTA) Updates

### Como funciona:
1. Usuário abre o app → `OTAUpdater.tsx` verifica automaticamente
2. Se há update → Modal aparece: "Atualização Disponível"
3. Usuário clica → Spinner: "Baixando pacote..."
4. Download completa → Check verde: "Tudo Pronto!"
5. Após 1.2s → `Updates.reloadAsync()` reinicia o app

### 🚨 MAPEAMENTO CHANNEL ↔ BRANCH (CRÍTICO)

O APK instalado no celular dos motoristas escuta um **channel** específico (definido no momento do `eas build`).
O `eas update` publica numa **branch**. O EAS só entrega o update se a **branch** estiver mapeada no **channel** correto.

| Channel no APK | Branch para publicar | Quem usa |
|:--------------:|:--------------------:|:--------:|
| `preview` | `preview` | **APKs atuais dos motoristas (distribuição interna)** |
| `production` | `production` | APKs da Google Play Store (quando houver) |
| `development` | `development` | Dev client local |

> **⚠️ ARMADILHA FATAL:** Se o APK foi buildado com `--profile preview` (channel `preview`),
> publicar um update no `--branch production` **NÃO CHEGA** nos dispositivos dos motoristas.
> O update fica invisível. O modal de atualização simplesmente não aparece.

### Como descobrir qual channel o APK dos motoristas usa:
```bash
# Lista channels existentes e branches mapeadas:
npx eas-cli channel:list
```

### Publicar uma atualização OTA:
```bash
# ✅ COMANDO CORRETO para os motoristas receberem (APK preview):
npx eas-cli update --branch preview --message "descrição breve da mudança"

# Para channel production (só se o APK foi buildado com --profile production):
npx eas-cli update --branch production --message "descrição breve da mudança"
```

> **REGRA DE OURO:** Sempre confirme o channel com `eas channel:list` antes de publicar.
> Se em dúvida, use `--branch preview` — é onde os APKs de distribuição interna escutam.

### ⚠️ REGRAS CRÍTICAS para OTA:
1. **OTA só atualiza código JS/TS**. Mudanças nativas (plugins, permissões, app.json nativo) exigem nova build.
2. **O `checkAutomatically` default é `ON_LOAD`** (NÃO é WIFI_ONLY). Funciona em 4G/5G. Não adicione `checkAutomatically` desnecessariamente.
3. **O OTA só funciona em builds standalone** (APK/AAB). Em Expo Go ou `__DEV__`, o `OTAUpdater` retorna `null` silenciosamente.
4. **Branch e Channel são 1:1**. A branch do `eas update` deve corresponder ao channel do perfil de build.
5. **Não confunda `eas update` com `eas build`**:
   - `eas build` = gera novo APK/AAB (demora ~10min)
   - `eas update` = envia update JS para APKs existentes (demora ~30s)

### Quando fazer `eas build` vs `eas update`:

| Cenário | Usar |
|---------|------|
| Mudou qualquer arquivo `.tsx`, `.ts`, `.js` | `eas update` ✅ |
| Mudou estilos, textos, lógica de negócio | `eas update` ✅ |
| Adicionou/removeu um plugin no `app.json` | `eas build` 🔨 |
| Mudou permissões Android/iOS | `eas build` 🔨 |
| Instalou pacote com código nativo | `eas build` 🔨 |
| Mudou `version` ou `runtimeVersion` | `eas build` 🔨 |
| Mudou `google-services.json` | `eas build` 🔨 |

---

## 📁 Arquivos-Chave (NÃO MODIFIQUE sem saber o impacto)

| Arquivo | Função | Risco se alterado errado |
|---------|--------|--------------------------|
| `app.json` | Config do Expo, plugins, OTA URL, runtimeVersion | Quebra build ou OTA |
| `eas.json` | Perfis de build, channels OTA | APK pode parar de receber updates |
| `src/components/OTAUpdater.tsx` | Modal de atualização OTA | Usuário não recebe updates |
| `app/_layout.tsx` | Root layout, monta OTAUpdater | Se remover OTAUpdater, OTA para |
| `src/lib/aether.ts` | Client Aether, config de conexão, `aetherFetchAll` | Quebra toda comunicação com backend |
| `google-services.json` | Firebase/FCM para push notifications | Push para de funcionar |

---

## 🔐 Arquitetura de Dados (Admin ↔ Motorista)

### Fontes de dados de motoristas:

| Fonte | Tabela/Endpoint | O que contém | Quem popula |
|-------|-----------------|-------------|-------------|
| Auth Users | `GET /v1/projects/:id/admin/users` | TODOS os cadastrados (e-mail, nome, role) | Admin cria no painel Aether |
| Driver Status | Collection `driver_status` | Motoristas que JÁ LOGARAM (nome, placa, push token) | Login do motorista no app |
| Driver Availability | Collection `driver_availability` | Disponibilidade por turno/data | Motorista preenche no app |
| Assignments | Collection `assignments` | Despachos de rotas | Admin cria no dashboard |

### Regra fundamental:
> **Um motorista só aparece em `driver_status` DEPOIS do primeiro login no app.**
> Se há 54 no Auth mas 50 em `driver_status`, os 4 restantes nunca abriram o app.

A tela `admin/drivers.tsx` faz merge das duas fontes para mostrar TODOS, com badge "Nunca acessou" para quem não tem `driver_status`.

---

## 🧪 Ambiente de Desenvolvimento

### Iniciar dev server:
```bash
npx expo start
```

### Variáveis de ambiente relevantes:
```
EXPO_PUBLIC_AETHER_API_URL=https://api-plataforma-production-a92f.up.railway.app
EXPO_PUBLIC_AETHER_PROJECT_ID=d937f7a3-5752-45ec-8dd7-15ab4ef8b140
```

### Testes em Expo Go:
- OTA **não funciona** em Expo Go (sem módulo nativo)
- Push Notifications **não funcionam** em Expo Go
- Para testar essas features, use uma build `development` ou `preview`

---

## 🚨 Erros Comuns que IAs Cometem

| Erro | Consequência | Como evitar |
|------|-------------|-------------|
| Adicionar `checkAutomatically: "ON_LOAD"` | Redundante (já é o default) | Não adicione — o default já é correto |
| Mudar `runtimeVersion` sem nova build | OTA quebra para todos os APKs | Só mude se for fazer nova build |
| Usar `require()` dinâmico para módulos | Pode falhar em runtime | Use imports estáticos no topo do arquivo |
| Alterar `expo.extra.eas.projectId` | Desvincula do projeto EAS | NUNCA altere este campo |
| Colocar lógica de negócio sensível no client | Inseguro | Use o backend Aether (Security Rules) |
| Remover `"expo-updates"` dos plugins | OTA para de funcionar silenciosamente | Mantenha sempre no array de plugins |
| Filtrar motoristas por `role` somente no backend | Pode excluir drivers com role errado | Sempre verifique client-side também |

---

## 📐 Convenções do Projeto

- **Código** (variáveis, funções, classes): em **INGLÊS**
- **Comentários e Documentação**: em **PORTUGUÊS BR**
- Tema visual: dark mode obrigatório, cores em `src/constants/theme.ts`
- Fontes: SpaceGrotesk (Bold e Regular)
- Componentes UI reutilizáveis: `src/components/ui/`
- Hooks de dados: `src/hooks/`
- Collections/Interfaces: `src/lib/collections.ts`

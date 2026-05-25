# Configuração segura do google-services.json

O arquivo `google-services.json` contém configuração sensível do projeto Firebase/Google e não deve ser versionado no Git.

## Desenvolvimento local

1. Baixe um novo `google-services.json` no Firebase Console/Google Cloud Console.
2. Coloque o arquivo na raiz do projeto apenas localmente.
3. Confirme que o arquivo continua ignorado pelo Git:

```bash
git status --ignored --short google-services.json
```

## Build no EAS

Salve o conteúdo do `google-services.json` como variável secreta em Base64:

```bash
base64 -i google-services.json | eas env:create --name GOOGLE_SERVICES_JSON_BASE64 --value - --visibility secret --environment production
```

Repita para `preview` e `development` se esses ambientes também gerarem builds com push notifications.

Durante o build, `app.config.js` lê `GOOGLE_SERVICES_JSON_BASE64`, valida o JSON e recria `google-services.json` somente no ambiente de build.

## Rotação obrigatória após vazamento

Depois de uma credencial ter sido publicada em repositório público, remover o arquivo do Git não torna a chave antiga segura. Gere uma nova chave no Google/Firebase, restrinja por pacote Android e SHA-1/SHA-256 quando aplicável, substitua o segredo no EAS e revogue a chave antiga.

Também revise o histórico do repositório. Se o provedor exigir remoção total do histórico público, use uma ferramenta de limpeza de histórico como `git filter-repo` ou BFG Repo-Cleaner e force-push com cuidado.

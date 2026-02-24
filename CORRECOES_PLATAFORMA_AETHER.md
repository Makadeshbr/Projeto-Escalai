# Correções - Driver Status

## O Problema

O erro era:
```
[AetherError: Acesso deny pelas regras de segurana.]
```

**Causa:** Sua regra atual do `driver_status` só permite escrita por admin:
```javascript
allow write: if auth != null && auth.role == 'admin';
```

Mas o app tenta criar o registro como o próprio motorista (não admin) → BLOQUEADO!

---

## SOLUÇÃO

### Altere a regra do driver_status

Na plataforma Aether, em **Database** → **Rules**, encontre a seção do `driver_status` e **substitua**:

**De:**
```javascript
match /driver_status/{document=**} {
  allow read: if auth != null;
  allow write: if auth != null && auth.role == 'admin';
}
```

**Para:**
```javascript
match /driver_status/{document=**} {
  allow read: if auth != null;
  allow write: if auth != null && (auth.role == 'admin' || auth.uid == resource.id || auth.uid == request.resource.id);
}
```

### Explicação:
- Admin continua podendo escrever ✅
- Motorista agora pode criar/atualizar **seu próprio** registro ✅

---

## Após ajustar a regra:

1. **Rebuild do app:**
```bash
npx expo run:android
```

2. **Teste:**
   - Faça login como motorista
   - Acesse o dashboard
   - Verifique se `driver_status` agora tem registros

---

## Resumo

| Problema | Solução |
|----------|---------|
| Regra só permitia admin | Adicionar condição para driver poder criar próprio registro |
| `auth.role == 'admin'` | `auth.role == 'admin' \|\| auth.uid == resource.id \|\| auth.uid == request.resource.id` |

Agora é só ajustar a regra e fazer rebuild!

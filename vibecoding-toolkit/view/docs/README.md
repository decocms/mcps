# Documentação do Frontend

> Guias e boas práticas para desenvolvimento frontend da aplicação

## 📚 Documentos Disponíveis

### 1. [Zustand - Best Practices](./ZUSTAND_BEST_PRACTICES.md)

Guia completo sobre gerenciamento de estado com Zustand.

**Quando usar:**

- Criando um novo store do zero
- Refatorando store existente
- Entendendo conceitos fundamentais
- Troubleshooting de problemas de performance

**Conteúdo:**

- ✅ Padrões corretos e anti-padrões
- 🏗️ Estrutura detalhada de stores
- ⚡ Performance e otimização
- 💡 Exemplos práticos completos
- 🔍 Troubleshooting detalhado

---

### 2. [Zustand - Quick Reference](./ZUSTAND_QUICK_REFERENCE.md)

Referência rápida para consulta durante desenvolvimento.

**Quando usar:**

- Desenvolvimento dia-a-dia
- Consulta rápida de padrões
- Snippets e templates
- Debug rápido

**Conteúdo:**

- 🚀 Templates prontos para copiar
- ✅ Checklists rápidos
- 📋 Padrões mais comuns
- 🔧 Snippets úteis
- 🐛 Tips de debug

---

## 🎯 Fluxo de Trabalho Recomendado

### Criando um Novo Store

1. **Planejar primeiro:**
   - Quais dados preciso armazenar?
   - Quais actions preciso expor?
   - Será usado em quantos componentes?

2. **Consultar template:**
   - Abrir [Quick Reference](./ZUSTAND_QUICK_REFERENCE.md#quick-start)
   - Copiar template de store completo
   - Adaptar para suas necessidades

3. **Implementar seguindo checklist:**
   - [ ] Store com currying `create<Type>()()`
   - [ ] Store não exportado
   - [ ] Actions em namespace
   - [ ] Defaults separados
   - [ ] Hooks atômicos exportados

4. **Usar em componentes:**
   - Importar hooks específicos
   - NUNCA importar o store diretamente
   - Usar pattern: selectors + actions

5. **Verificar performance:**
   - Testar re-renders com React DevTools
   - Confirmar que componentes só renderizam quando necessário

### Refatorando Store Existente

1. **Identificar problemas:**
   - Store está exportado diretamente?
   - Componentes usam `useStore()` sem selector?
   - Actions misturadas com state?

2. **Seguir guia de migração:**
   - Ler seção
     [Migrando Store Existente](./ZUSTAND_BEST_PRACTICES.md#migrando-store-existente)
   - Aplicar mudanças passo a passo
   - Testar após cada etapa

3. **Atualizar componentes:**
   - Substituir uso direto do store
   - Usar hooks atômicos
   - Verificar performance melhorou

---

## 🔍 Encontrando Informações

### Por Tópico

| Tópico                  | Documento       | Seção                    |
| ----------------------- | --------------- | ------------------------ |
| **Template de Store**   | Quick Reference | Quick Start              |
| **Estrutura Completa**  | Best Practices  | Estrutura de um Store    |
| **Hooks para Exportar** | Best Practices  | Exportação de Hooks      |
| **Uso em Componentes**  | Quick Reference | Uso em Componentes       |
| **Performance**         | Best Practices  | Performance e Re-renders |
| **Exemplos**            | Best Practices  | Exemplos Práticos        |
| **Debug**               | Quick Reference | Debug                    |
| **Troubleshooting**     | Best Practices  | Troubleshooting          |

---

## 🚨 Problemas Comuns e Soluções Rápidas

### "Meu componente re-renderiza demais"

**Solução:** Você provavelmente está usando selector não-atômico.

📖 Ver:
[Quick Reference - Anti-Padrões](./ZUSTAND_QUICK_REFERENCE.md#anti-padrões-comuns)

### "TypeScript não infere os tipos"

**Solução:** Você esqueceu o `()` extra no `create`.

```typescript
// ❌ Errado
create<State>((set) => ...)

// ✅ Correto
create<State>()((set) => ...)
```

📖 Ver:
[Best Practices - TypeScript](./ZUSTAND_BEST_PRACTICES.md#typescript-sem-currying)

### "Actions não funcionam"

**Solução:** Verifique se está chamando a action, não apenas referenciando.

```typescript
// ❌ Errado
actions.setValue; // Só retorna a função

// ✅ Correto
actions.setValue("foo"); // Executa a função
```

### "Como combinar múltiplos valores?"

**Solução:** Use hooks atômicos individuais, não um selector que retorna objeto.

```typescript
// ❌ Evitar
const { a, b } = useStore((s) => ({ a: s.a, b: s.b }));

// ✅ Preferir
const a = useA();
const b = useB();
```

📖 Ver:
[Quick Reference - Snippets](./ZUSTAND_QUICK_REFERENCE.md#snippets-úteis)

---

## 🎓 Recursos de Aprendizado

### Para Iniciantes

1. Começar com [Quick Reference](./ZUSTAND_QUICK_REFERENCE.md)
2. Copiar e adaptar templates
3. Seguir checklists

### Para Aprofundar

1. Ler [Best Practices](./ZUSTAND_BEST_PRACTICES.md) completo
2. Entender conceitos de performance
3. Estudar exemplos práticos

### Para Troubleshooting

1. Consultar seção de problemas comuns
2. Verificar anti-padrões
3. Usar debug tips

---

## 📝 Contribuindo

### Adicionando Nova Documentação

1. Criar arquivo `.md` nesta pasta
2. Adicionar link neste README
3. Seguir padrão de formatação existente

### Atualizando Documentação Existente

1. Manter exemplos atualizados com versão do Zustand
2. Adicionar novos padrões descobertos
3. Documentar soluções de problemas encontrados

### Padrão de Commits

```bash
docs(frontend): adiciona exemplo de store com paginação
docs(zustand): atualiza troubleshooting com novo problema
docs(guide): corrige typo em exemplo
```

---

## 🔗 Links Externos Úteis

- [Zustand Official Docs](https://docs.pmnd.rs/zustand)
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [TkDodo Blog - Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
- [React Query + Zustand](https://tkdodo.eu/blog/react-query-and-forms)

---

## 📊 Estado da Documentação

| Documento       | Status      | Última Atualização |
| --------------- | ----------- | ------------------ |
| Best Practices  | ✅ Completo | Nov 2025           |
| Quick Reference | ✅ Completo | Nov 2025           |

---

## 🤝 Feedback

Encontrou algo confuso? Tem sugestão de melhoria? Abra uma issue ou PR!

---

**Mantido por:** Equipe de Desenvolvimento\
**Última revisão:** Novembro 2025

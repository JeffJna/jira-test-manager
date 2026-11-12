# Gestor de Testes para Jira (open source)

Gestão de casos de teste **dentro do Jira Cloud**, gratuita e open source (MIT).
Construído sobre o [Atlassian Forge](https://developer.atlassian.com/platform/forge/): roda na
infraestrutura da Atlassian, sem servidor próprio.

> Status: **v0.1, em desenvolvimento.** Ainda não é recomendado para produção.

## O que já funciona

- **Tipo de issue "Teste"**: criado com um clique pela página de administração do app.
- **Passos do teste**: painel no issue para adicionar, editar, remover e reordenar passos
  (ação, dados de teste, resultado esperado).
- **Execuções**: aba no mesmo painel para iniciar uma execução e registrar o resultado de cada
  passo (pendente / passou / falhou / bloqueado) com comentário. O status geral é calculado
  automaticamente, e cada execução guarda uma cópia dos passos, então editar o teste não altera
  o histórico. São mantidas as 100 execuções mais recentes por teste.
- **Importação de resultados do CI (JUnit XML)**: o pipeline envia o relatório para uma URL do
  app e cada teste vinculado ganha uma execução marcada como "CI". Veja abaixo.
- **Cobertura de requisitos**: o painel "Cobertura de testes" aparece na lateral de todo issue.
  - Numa story, lista os testes que a cobrem com o resultado da última execução e um status
    geral: **Passando**, **Falhando**, **Bloqueado**, **Não executado** ou **Sem cobertura**.
  - Num "Teste", lista os requisitos que ele cobre.

  A ligação usa vínculos nativos do Jira com o tipo **"Cobertura de teste"** (testa / é testado
  por), criado pela página de admin: no issue "Teste", use **Vincular issue → testa** e escolha a
  story. Cada pessoa só vê os testes e vínculos que tem permissão para ver.

## Importar resultados do CI

1. Em **Configurações → Apps → Gestor de Testes**, clique em **Gerar token de importação**.
   Copie o token (ele só aparece uma vez) e a URL de importação.
2. Guarde os dois como segredos no CI, por exemplo `JIRA_TESTS_URL` e `JIRA_TESTS_TOKEN`.
3. Vincule cada teste automatizado ao issue "Teste" pela chave Jira, de uma destas formas:
   - no nome do teste: `login com senha errada [QA-12]`
   - ou como propriedade do testcase no XML: `<property name="test_key" value="QA-12"/>`
     (aceita várias chaves separadas por vírgula)
4. Envie o relatório depois dos testes:

```bash
curl -X POST "$JIRA_TESTS_URL?name=Build%20$BUILD_NUMBER" \
  -H "Authorization: Bearer $JIRA_TESTS_TOKEN" \
  -H "Content-Type: application/xml" \
  --data-binary @report.xml
```

Exemplo no GitHub Actions:

```yaml
- name: Enviar resultados para o Jira
  if: always()   # envia mesmo se os testes falharem
  run: |
    curl -sS --fail-with-body -X POST "${{ secrets.JIRA_TESTS_URL }}?name=Run%20${{ github.run_number }}" \
      -H "Authorization: Bearer ${{ secrets.JIRA_TESTS_TOKEN }}" \
      -H "Content-Type: application/xml" \
      --data-binary @reports/junit.xml
```

Mapeamento de resultados: sucesso → **Passou**; `<failure>` ou `<error>` → **Falhou**, com a
mensagem no comentário; `<skipped>` → **Pendente**. Vários testcases com a mesma chave viram uma
única execução com um resultado por testcase.

A resposta é um JSON que lista os testes importados e os testcases não vinculados, com o motivo
(sem chave, issue inexistente ou issue de outro tipo). Limites por envio: 5 MB, 5.000 testcases e
50 issues "Teste".

## Roadmap

- [x] Execuções de teste com status por passo
- [x] Importar resultados de CI (JUnit XML) via webtrigger
- [ ] Anexar evidências (prints, arquivos) aos resultados
- [ ] Execuções agrupando vários testes (por sprint/versão)
- [x] Cobertura: ver na story quais testes a cobrem e o último resultado
- [ ] Relatório de cobertura por sprint/versão (todas as stories de uma vez)
- [ ] Status de cobertura pesquisável por JQL (entity properties)
- [ ] Importar Cucumber JSON e TestNG
- [ ] Planos de teste e relatório de cobertura por sprint/versão
- [ ] Importar/exportar CSV

## Instalação no seu Jira (self-deploy)

Pré-requisitos:

- Node.js compatível com o Forge CLI atual (`^22.23.4`, `^24.22.1` ou `>=26.12.1`)
- Um site Jira Cloud onde você seja administrador. Para testar, crie um site de desenvolvimento
  gratuito em <https://developer.atlassian.com/console/>.
- Um [API token Atlassian](https://id.atlassian.com/manage-profile/security/api-tokens)

```bash
npm install -g @forge/cli
forge login              # informe seu e-mail e API token
npm install
forge register           # gera o app id e atualiza o manifest.yml
forge deploy
forge install            # escolha "Jira" e o seu site
```

Depois de instalar:

1. No Jira, vá em **Configurações → Apps → Gestor de Testes** e clique em
   **Criar tipo de issue "Teste"** e em **Criar tipo de vínculo** (para a cobertura).
2. Adicione o tipo "Teste" ao esquema de tipos de issue dos projetos que vão usá-lo.
3. Crie um issue do tipo "Teste" e abra o painel **Passos do teste** pelo botão de apps do issue.

Durante o desenvolvimento, `forge tunnel` recarrega as mudanças sem precisar de novo deploy.

## Desenvolvimento

```
src/
├── index.js           # resolver (backend): passos, execuções e configuração
├── webtrigger.js      # endpoint de importação JUnit chamado pelo CI
├── store.js           # acesso ao Forge KVS
├── auth.js            # token de importação (só o hash é armazenado)
├── junit.js           # leitura do XML JUnit e vínculo com as chaves Jira
├── coverage.js        # regras de cobertura (vínculos e status geral)
├── steps.js           # regras dos passos, sem dependência do Forge
├── runs.js            # regras das execuções, sem dependência do Forge
└── frontend/
    ├── panel.jsx      # painel "Passos do teste" (UI Kit)
    ├── coverage.jsx   # painel lateral "Cobertura de testes"
    └── admin.jsx      # página de administração
tests/                 # testes unitários (node:test)
```

```bash
npm test     # testes unitários
npm run lint # forge lint (requer forge login)
```

Dados no Forge KVS:

| Chave | Conteúdo |
|---|---|
| `steps:<issueId>` | passos do teste |
| `runs:<issueId>` | resumo das execuções (mais recente primeiro) |
| `run:<issueId>:<runId>` | execução completa: cópia dos passos e resultados |
| `config:junit-token` | hash SHA-256 do token de importação do CI |

## Custos

O app é gratuito. O Forge tem uma cota de uso gratuita e cobra pelo excedente. Para times
pequenos e médios o uso deve ficar dentro da cota, mas confira os limites atuais na
documentação da Atlassian.

## Licença

[MIT](LICENSE). Este projeto não tem relação com a Atlassian nem com outros fornecedores de
apps de teste.

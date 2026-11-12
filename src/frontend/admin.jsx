import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Button,
  CodeBlock,
  Heading,
  Inline,
  List,
  ListItem,
  SectionMessage,
  Spinner,
  Stack,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const formatDate = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');

function curlExample(url, token) {
  return [
    `curl -X POST "${url}?name=Build%20123" \\`,
    `  -H "Authorization: Bearer ${token}" \\`,
    '  -H "Content-Type: application/xml" \\',
    '  --data-binary @target/surefire-reports/TEST-report.xml',
  ].join('\n');
}

function IssueTypeSection({ issueType, busy, onCreate }) {
  if (issueType) {
    return (
      <SectionMessage appearance="success" title='Tipo de issue "Teste" pronto'>
        <Text>Próximos passos:</Text>
        <List type="ordered">
          <ListItem>
            Adicione o tipo "Teste" ao esquema de tipos de issue dos projetos que vão usá-lo.
          </ListItem>
          <ListItem>Crie um issue do tipo "Teste".</ListItem>
          <ListItem>No issue, abra o painel "Passos do teste" pelo botão de apps.</ListItem>
        </List>
      </SectionMessage>
    );
  }
  return (
    <Stack space="space.100">
      <Text>
        O app usa um tipo de issue chamado "Teste" para representar casos de teste. Ele ainda não
        existe neste site.
      </Text>
      <Inline>
        <Button appearance="primary" isDisabled={busy} onClick={onCreate}>
          Criar tipo de issue "Teste"
        </Button>
      </Inline>
    </Stack>
  );
}

function LinkTypeSection({ linkType, busy, onCreate }) {
  return (
    <Stack space="space.100">
      <Heading size="small">Cobertura de requisitos</Heading>
      {linkType ? (
        <SectionMessage appearance="success" title='Tipo de vínculo "Cobertura de teste" pronto'>
          <Text>
            Em um issue "Teste", use "Vincular issue" → "testa" e escolha a story. A cobertura aparece
            no painel "Cobertura de testes" de cada issue.
          </Text>
        </SectionMessage>
      ) : (
        <>
          <Text>
            A cobertura usa vínculos nativos do Jira com o tipo "Cobertura de teste" (testa / é
            testado por). Ele ainda não existe neste site.
          </Text>
          <Inline>
            <Button appearance="primary" isDisabled={busy} onClick={onCreate}>
              Criar tipo de vínculo
            </Button>
          </Inline>
        </>
      )}
    </Stack>
  );
}

function ImportSection({ config, newToken, busy, onGenerate }) {
  const [confirming, setConfirming] = useState(false);
  const hasToken = Boolean(config?.tokenCreatedAt);

  return (
    <Stack space="space.150">
      <Heading size="small">Importação de resultados do CI (JUnit XML)</Heading>
      <Text>
        O CI envia o relatório JUnit para a URL abaixo. Cada testcase é vinculado ao issue "Teste"
        pela chave Jira: use a propriedade test_key no testcase ou coloque a chave no nome do teste
        (ex.: "login com senha errada [QA-12]").
      </Text>

      <Text>URL de importação deste site:</Text>
      <CodeBlock language="text" text={config?.url ?? '(indisponível)'} shouldWrapLongLines />

      {newToken ? (
        <SectionMessage appearance="warning" title="Copie o token agora">
          <Stack space="space.100">
            <Text>
              Este token não será mostrado de novo. Guarde-o como segredo no CI (ex.: JIRA_TESTS_TOKEN).
            </Text>
            <CodeBlock language="text" text={newToken} shouldWrapLongLines />
            <Text>Exemplo de envio:</Text>
            <CodeBlock language="bash" text={curlExample(config?.url ?? '<URL>', newToken)} shouldWrapLongLines />
          </Stack>
        </SectionMessage>
      ) : (
        <Text>
          {hasToken
            ? `Token ativo, gerado em ${formatDate(config.tokenCreatedAt)}.`
            : 'Nenhum token gerado: a importação está desativada.'}
        </Text>
      )}

      {hasToken && !confirming && !newToken && (
        <Inline>
          <Button isDisabled={busy} onClick={() => setConfirming(true)}>
            Gerar novo token
          </Button>
        </Inline>
      )}
      {hasToken && confirming && (
        <SectionMessage appearance="warning" title="Substituir o token?">
          <Stack space="space.100">
            <Text>O token atual deixará de funcionar imediatamente em todos os pipelines.</Text>
            <Inline space="space.100">
              <Button
                appearance="warning"
                isDisabled={busy}
                onClick={async () => {
                  await onGenerate();
                  setConfirming(false);
                }}
              >
                Substituir token
              </Button>
              <Button appearance="subtle" onClick={() => setConfirming(false)}>
                Cancelar
              </Button>
            </Inline>
          </Stack>
        </SectionMessage>
      )}
      {!hasToken && (
        <Inline>
          <Button appearance="primary" isDisabled={busy} onClick={onGenerate}>
            Gerar token de importação
          </Button>
        </Inline>
      )}
    </Stack>
  );
}

const App = () => {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [newToken, setNewToken] = useState(null);
  const [busy, setBusy] = useState(false);

  const call = async (name) => {
    setBusy(true);
    setError(null);
    try {
      const result = await invoke(name);
      if (result?.error) {
        setError(result.error);
        return null;
      }
      setStatus((previous) => ({ ...previous, ...result }));
      return result;
    } catch (err) {
      setError(err?.message ?? 'Falha de comunicação com o app.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    call('getSetupStatus');
  }, []);

  if (status === null && !error) {
    return <Spinner label="Verificando configuração" />;
  }

  return (
    <Stack space="space.300">
      {error && (
        <SectionMessage appearance="error" title="Algo deu errado">
          <Text>{error}</Text>
        </SectionMessage>
      )}

      {status && (
        <>
          <IssueTypeSection
            issueType={status.issueType}
            busy={busy}
            onCreate={() => call('createTestIssueType')}
          />
          <LinkTypeSection
            linkType={status.linkType}
            busy={busy}
            onCreate={() => call('createCoverageLinkType')}
          />
          <ImportSection
            config={status.importConfig}
            newToken={newToken}
            busy={busy}
            onGenerate={async () => {
              const result = await call('generateImportToken');
              if (result?.token) setNewToken(result.token);
            }}
          />
        </>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

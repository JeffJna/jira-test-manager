import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Inline,
  Link,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const COVERAGE = {
  NOT_COVERED: { label: 'Sem cobertura', appearance: 'default' },
  NOT_RUN: { label: 'Não executado', appearance: 'inprogress' },
  PASSED: { label: 'Passando', appearance: 'success' },
  FAILED: { label: 'Falhando', appearance: 'removed' },
  BLOCKED: { label: 'Bloqueado', appearance: 'moved' },
};

const RUN = {
  TODO: { label: 'Pendente', appearance: 'default' },
  EXECUTING: { label: 'Em andamento', appearance: 'inprogress' },
  PASSED: { label: 'Passou', appearance: 'success' },
  FAILED: { label: 'Falhou', appearance: 'removed' },
  BLOCKED: { label: 'Bloqueado', appearance: 'moved' },
};

const rowStyle = xcss({
  paddingBlock: 'space.075',
  borderBottomColor: 'color.border',
  borderBottomWidth: 'border.width',
  borderBottomStyle: 'solid',
});

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

function IssueLine({ item }) {
  return (
    <Text>
      <Link href={`/browse/${item.key}`}>{item.key}</Link> {item.summary}
    </Text>
  );
}

function LinkHint({ isTest, linkTypeReady }) {
  if (!linkTypeReady) {
    return (
      <SectionMessage appearance="information" title="Cobertura ainda não configurada">
        <Text>
          Peça a um administrador para criar o tipo de vínculo "Cobertura de teste" em Configurações →
          Apps → Gestor de Testes.
        </Text>
      </SectionMessage>
    );
  }
  return (
    <Text>
      {isTest
        ? 'Este teste ainda não cobre nenhum requisito. Use "Vincular issue" → "testa" e escolha a story.'
        : 'Nenhum teste cobre este issue. Em um issue "Teste", use "Vincular issue" → "testa" e escolha este issue.'}
    </Text>
  );
}

function StoryCoverage({ data }) {
  const overall = COVERAGE[data.status] ?? COVERAGE.NOT_COVERED;
  const { counts } = data;
  return (
    <Stack space="space.150">
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance={overall.appearance} isBold>
          {overall.label}
        </Lozenge>
        {counts.total > 0 && (
          <Text>
            {counts.total} {counts.total === 1 ? 'teste' : 'testes'} · {counts.PASSED} passando ·{' '}
            {counts.FAILED} falhando · {counts.BLOCKED} bloqueado · {counts.NOT_RUN} sem resultado
          </Text>
        )}
      </Inline>

      {data.tests.length === 0 ? (
        <LinkHint isTest={false} linkTypeReady={data.linkTypeReady} />
      ) : (
        <Stack>
          {data.tests.map((test) => {
            const run = test.lastRun ? RUN[test.lastRun.status] ?? RUN.TODO : null;
            return (
              <Box key={test.id} xcss={rowStyle}>
                <Stack space="space.050">
                  <IssueLine item={test} />
                  <Inline space="space.100" alignBlock="center">
                    {run ? (
                      <>
                        <Lozenge appearance={run.appearance}>{run.label}</Lozenge>
                        {test.lastRun.source === 'junit' && <Lozenge appearance="new">CI</Lozenge>}
                        <Text>{formatDate(test.lastRun.updatedAt ?? test.lastRun.createdAt)}</Text>
                      </>
                    ) : (
                      <Lozenge>Nunca executado</Lozenge>
                    )}
                  </Inline>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function TestRequirements({ data }) {
  if (data.requirements.length === 0) {
    return <LinkHint isTest linkTypeReady={data.linkTypeReady} />;
  }
  return (
    <Stack space="space.100">
      <Text>
        Este teste cobre {data.requirements.length}{' '}
        {data.requirements.length === 1 ? 'requisito' : 'requisitos'}:
      </Text>
      <Stack>
        {data.requirements.map((req) => (
          <Box key={req.id} xcss={rowStyle}>
            <Inline space="space.100" alignBlock="center" spread="space-between">
              <IssueLine item={req} />
              {req.statusName && <Lozenge>{req.statusName}</Lozenge>}
            </Inline>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

const App = () => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('getCoverage');
      if (result?.error) setError(result.error);
      else setData(result);
    } catch (err) {
      setError(err?.message ?? 'Falha de comunicação com o app.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (!data && !error) {
    return <Spinner label="Calculando cobertura" />;
  }

  return (
    <Stack space="space.150">
      {error && (
        <SectionMessage appearance="error" title="Algo deu errado">
          <Text>{error}</Text>
        </SectionMessage>
      )}
      {data && (data.isTest ? <TestRequirements data={data} /> : <StoryCoverage data={data} />)}
      <Inline>
        <Button appearance="subtle" isDisabled={loading} onClick={load}>
          {loading ? 'Atualizando…' : 'Atualizar'}
        </Button>
      </Inline>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

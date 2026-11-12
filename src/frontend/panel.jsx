import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  EmptyState,
  Heading,
  Inline,
  Label,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  User,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const EMPTY_STEP = { action: '', data: '', expected: '' };

const STATUS = {
  TODO: { label: 'Pendente', appearance: 'default' },
  EXECUTING: { label: 'Em andamento', appearance: 'inprogress' },
  PASSED: { label: 'Passou', appearance: 'success' },
  FAILED: { label: 'Falhou', appearance: 'removed' },
  BLOCKED: { label: 'Bloqueado', appearance: 'moved' },
};

const STEP_STATUS_OPTIONS = ['TODO', 'PASSED', 'FAILED', 'BLOCKED'].map((value) => ({
  value,
  label: STATUS[value].label,
}));

const cardStyle = xcss({
  padding: 'space.150',
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius',
});

const tabPanelStyle = xcss({ paddingBlockStart: 'space.200', width: '100%' });

const formatDate =(iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '');

function StatusLozenge({ status }) {
  const info = STATUS[status] ?? STATUS.TODO;
  return <Lozenge appearance={info.appearance}>{info.label}</Lozenge>;
}

function SourceLozenge({ source }) {
  if (source !== 'junit') return null;
  return (
    <Lozenge appearance="new" isBold>
      CI
    </Lozenge>
  );
}

function ErrorMessage({ error }) {
  if (!error) return null;
  return (
    <SectionMessage appearance="error" title="Algo deu errado">
      <Text>{error}</Text>
    </SectionMessage>
  );
}

// Chama um resolver e trata { error } / falhas de rede de forma uniforme.
function useResolver() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const call = async (name, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await invoke(name, payload);
      if (result?.error) {
        setError(result.error);
        return null;
      }
      return result;
    } catch (err) {
      setError(err?.message ?? 'Falha de comunicação com o app.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  return { busy, error, call };
}

// Resultados importados do CI usam stepId "auto-N": ação = nome do teste, dados = classe.
const isAutomated = (step) => String(step.stepId ?? '').startsWith('auto-');

function StepDetails({ step }) {
  const automated = isAutomated(step);
  return (
    <>
      <Text>
        <Strong>{automated ? 'Teste:' : 'Ação:'}</Strong> {step.action}
      </Text>
      {step.data && (
        <Text>
          <Strong>{automated ? 'Classe:' : 'Dados:'}</Strong> {step.data}
        </Text>
      )}
      {step.expected && (
        <Text>
          <Strong>Esperado:</Strong> {step.expected}
        </Text>
      )}
    </>
  );
}

// --- Aba "Passos" -----------------------------------------------------------

function StepForm({ initial = EMPTY_STEP, submitLabel, onSubmit, onCancel, busy, idPrefix }) {
  const [values, setValues] = useState(initial);
  const update = (field) => (event) => setValues({ ...values, [field]: event.target.value });

  return (
    <Stack space="space.100">
      <Label labelFor={`${idPrefix}-action`}>Ação *</Label>
      <TextArea id={`${idPrefix}-action`} value={values.action} onChange={update('action')} />
      <Label labelFor={`${idPrefix}-data`}>Dados de teste</Label>
      <TextArea id={`${idPrefix}-data`} value={values.data} onChange={update('data')} />
      <Label labelFor={`${idPrefix}-expected`}>Resultado esperado</Label>
      <TextArea id={`${idPrefix}-expected`} value={values.expected} onChange={update('expected')} />
      <ButtonGroup>
        <Button
          appearance="primary"
          isDisabled={busy || !values.action.trim()}
          onClick={() => onSubmit(values)}
        >
          {submitLabel}
        </Button>
        {onCancel && (
          <Button appearance="subtle" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </ButtonGroup>
    </Stack>
  );
}

function StepCard({ step, index, total, busy, onEdit, onRemove, onMove }) {
  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Lozenge appearance="new">Passo {index + 1}</Lozenge>
          <ButtonGroup>
            <Button appearance="subtle" isDisabled={busy || index === 0} onClick={() => onMove('up')}>
              ↑
            </Button>
            <Button
              appearance="subtle"
              isDisabled={busy || index === total - 1}
              onClick={() => onMove('down')}
            >
              ↓
            </Button>
            <Button appearance="subtle" isDisabled={busy} onClick={onEdit}>
              Editar
            </Button>
            <Button appearance="subtle" isDisabled={busy} onClick={onRemove}>
              Remover
            </Button>
          </ButtonGroup>
        </Inline>
        <StepDetails step={step} />
      </Stack>
    </Box>
  );
}

function StepsTab({ steps, setSteps }) {
  const { busy, error, call } = useResolver();
  const [editingId, setEditingId] = useState(null);
  const [addFormKey, setAddFormKey] = useState(0);

  const mutate = async (name, payload) => {
    const result = await call(name, payload);
    if (result) setSteps(result.steps);
    return Boolean(result);
  };

  return (
    <Stack space="space.200">
      <ErrorMessage error={error} />

      {steps.length === 0 ? (
        <EmptyState
          header="Nenhum passo ainda"
          description="Descreva abaixo o que deve ser feito e o resultado esperado."
        />
      ) : (
        steps.map((step, index) =>
          editingId === step.id ? (
            <Box key={step.id} xcss={cardStyle}>
              <StepForm
                idPrefix={`edit-${step.id}`}
                initial={step}
                submitLabel="Salvar"
                busy={busy}
                onCancel={() => setEditingId(null)}
                onSubmit={async (values) => {
                  if (await mutate('updateStep', { id: step.id, step: values })) setEditingId(null);
                }}
              />
            </Box>
          ) : (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              total={steps.length}
              busy={busy}
              onEdit={() => setEditingId(step.id)}
              onRemove={() => mutate('removeStep', { id: step.id })}
              onMove={(direction) => mutate('moveStep', { id: step.id, direction })}
            />
          ),
        )
      )}

      <Heading size="small">Adicionar passo</Heading>
      <StepForm
        key={addFormKey}
        idPrefix="new"
        submitLabel="Adicionar passo"
        busy={busy}
        onSubmit={async (values) => {
          if (await mutate('addStep', { step: values })) setAddFormKey((key) => key + 1);
        }}
      />
    </Stack>
  );
}

// --- Aba "Execuções" --------------------------------------------------------

function ResultEditor({ result, index, busy, onSave }) {
  const [status, setStatus] = useState(result.status);
  const [comment, setComment] = useState(result.comment ?? '');
  const dirty = status !== result.status || comment.trim() !== (result.comment ?? '');
  const selectId = `status-${result.stepId}`;

  return (
    <Box xcss={cardStyle}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" spread="space-between">
          <Lozenge appearance="new">{isAutomated(result) ? "Teste" : "Passo"} {index + 1}</Lozenge>
          <StatusLozenge status={result.status} />
        </Inline>
        <StepDetails step={result} />
        <Label labelFor={selectId}>Resultado</Label>
        <Select
          inputId={selectId}
          options={STEP_STATUS_OPTIONS}
          value={STEP_STATUS_OPTIONS.find((option) => option.value === status)}
          onChange={(option) => setStatus(option?.value ?? 'TODO')}
        />
        <Label labelFor={`comment-${result.stepId}`}>Comentário / evidência</Label>
        <TextArea
          id={`comment-${result.stepId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <Inline space="space.100" alignBlock="center">
          <Button
            appearance="primary"
            isDisabled={busy || !dirty}
            onClick={() => onSave({ status, comment })}
          >
            Salvar resultado
          </Button>
          {result.executedBy && (
            <Inline space="space.050" alignBlock="center">
              <Text>Registrado em {formatDate(result.executedAt)} por</Text>
              <User accountId={result.executedBy} />
            </Inline>
          )}
        </Inline>
      </Stack>
    </Box>
  );
}

function RunDetail({ runId, onBack, onRunsChange }) {
  const { busy, error, call } = useResolver();
  const [run, setRun] = useState(null);

  useEffect(() => {
    call('getRun', { runId }).then((result) => result && setRun(result.run));
  }, [runId]);

  if (!run) {
    return error ? <ErrorMessage error={error} /> : <Spinner label="Carregando execução" />;
  }

  return (
    <Stack space="space.200">
      <Inline space="space.100" alignBlock="center" spread="space-between">
        <Button appearance="subtle" onClick={onBack}>
          ← Voltar
        </Button>
        <StatusLozenge status={run.status} />
      </Inline>
      {run.source === 'junit' ? (
        <Inline space="space.100" alignBlock="center">
          <SourceLozenge source={run.source} />
          <Text>
            Importada do CI em {formatDate(run.createdAt)}
            {run.label ? ` · ${run.label}` : ''}
          </Text>
        </Inline>
      ) : (
        <Inline space="space.050" alignBlock="center">
          <Text>
            Execução iniciada em {formatDate(run.createdAt)}
            {run.createdBy ? ' por' : ''}
          </Text>
          {run.createdBy && <User accountId={run.createdBy} />}
        </Inline>
      )}
      <ErrorMessage error={error} />
      {run.results.map((result, index) => (
        <ResultEditor
          key={result.stepId}
          result={result}
          index={index}
          busy={busy}
          onSave={async (input) => {
            const saved = await call('recordStepResult', {
              runId: run.id,
              stepId: result.stepId,
              result: input,
            });
            if (saved) {
              setRun(saved.run);
              onRunsChange(saved.runs);
            }
          }}
        />
      ))}
    </Stack>
  );
}

function RunsTab({ steps }) {
  const { busy, error, call } = useResolver();
  const [runs, setRuns] = useState(null);
  const [openRunId, setOpenRunId] = useState(null);

  useEffect(() => {
    call('listRuns').then((result) => result && setRuns(result.runs));
  }, []);

  if (openRunId) {
    return <RunDetail runId={openRunId} onBack={() => setOpenRunId(null)} onRunsChange={setRuns} />;
  }

  if (runs === null) {
    return error ? <ErrorMessage error={error} /> : <Spinner label="Carregando execuções" />;
  }

  const startRun = async () => {
    const result = await call('createRun');
    if (result) {
      setRuns(result.runs);
      setOpenRunId(result.run.id);
    }
  };

  const removeRun = async (runId) => {
    const result = await call('removeRun', { runId });
    if (result) setRuns(result.runs);
  };

  return (
    <Stack space="space.200">
      <ErrorMessage error={error} />
      <Inline>
        <Button appearance="primary" isDisabled={busy || steps.length === 0} onClick={startRun}>
          Nova execução
        </Button>
      </Inline>
      {steps.length === 0 && <Text>Adicione passos na aba "Passos" antes de executar.</Text>}

      {runs.length === 0 ? (
        <EmptyState header="Nenhuma execução ainda" description="Inicie uma execução para registrar resultados." />
      ) : (
        runs.map((summary) => (
          <Box key={summary.id} xcss={cardStyle}>
            <Inline space="space.100" alignBlock="center" spread="space-between">
              <Stack space="space.050">
                <Inline space="space.100" alignBlock="center">
                  <StatusLozenge status={summary.status} />
                  <SourceLozenge source={summary.source} />
                  <Text>
                    {formatDate(summary.createdAt)}
                    {summary.label ? ` · ${summary.label}` : ''}
                  </Text>
                </Inline>
                <Text>
                  {summary.counts.PASSED} passou · {summary.counts.FAILED} falhou ·{' '}
                  {summary.counts.BLOCKED} bloqueado · {summary.counts.TODO} pendente
                </Text>
              </Stack>
              <ButtonGroup>
                <Button appearance="subtle" onClick={() => setOpenRunId(summary.id)}>
                  Abrir
                </Button>
                <Button appearance="subtle" isDisabled={busy} onClick={() => removeRun(summary.id)}>
                  Excluir
                </Button>
              </ButtonGroup>
            </Inline>
          </Box>
        ))
      )}
    </Stack>
  );
}

// --- Painel -----------------------------------------------------------------

const App = () => {
  const { error, call } = useResolver();
  const [steps, setSteps] = useState(null);

  useEffect(() => {
    call('getSteps').then((result) => result && setSteps(result.steps));
  }, []);

  if (steps === null) {
    return error ? <ErrorMessage error={error} /> : <Spinner label="Carregando teste" />;
  }

  return (
    <Tabs id="test-panel">
      <TabList>
        <Tab>Passos ({steps.length})</Tab>
        <Tab>Execuções</Tab>
      </TabList>
      <TabPanel>
        <Box xcss={tabPanelStyle}>
          <StepsTab steps={steps} setSteps={setSteps} />
        </Box>
      </TabPanel>
      <TabPanel>
        <Box xcss={tabPanelStyle}>
          <RunsTab steps={steps} />
        </Box>
      </TabPanel>
    </Tabs>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

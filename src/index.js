import Resolver from '@forge/resolver';
import api, { route, webTrigger } from '@forge/api';
import { randomUUID } from 'node:crypto';
import { addStep, moveStep, removeStep, StepError, updateStep } from './steps';
import { createRun, recordStepResult, removeSummary } from './runs';
import { generateToken, hashToken } from './auth';
import { COVERAGE_LINK_TYPE, coverageCounts, coverageStatus, linkedIssues } from './coverage';
import {
  deleteRun,
  loadImportToken,
  loadRun,
  loadRunsIndex,
  loadSteps,
  saveImportToken,
  saveRun,
  saveSteps,
} from './store';
import { TEST_ISSUE_TYPE_NAME } from './webtrigger';

const JUNIT_WEBTRIGGER_KEY = 'junit-import';
const ADMIN_MODULE_KEY = 'admin-page';

const resolver = new Resolver();

// O issue vem sempre do contexto do Forge, nunca do payload do front-end.
function issueIdFrom(context) {
  const id = context?.extension?.issue?.id;
  if (!id) {
    throw new StepError('Este painel só funciona dentro de um issue do Jira.');
  }
  return String(id);
}

// Erros de validação viram mensagem para o usuário; o resto é logado e genérico.
async function safely(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof StepError) {
      return { error: error.message };
    }
    console.error(error);
    return { error: 'Erro inesperado. Tente novamente.' };
  }
}

// --- Passos -----------------------------------------------------------------

function mutateSteps(context, change) {
  return safely(async () => {
    const issueId = issueIdFrom(context);
    const current = await loadSteps(issueId);
    const next = change(current);
    if (next !== current) {
      await saveSteps(issueId, next);
    }
    return { steps: next };
  });
}

resolver.define('getSteps', ({ context }) => mutateSteps(context, (steps) => steps));

resolver.define('addStep', ({ payload, context }) =>
  mutateSteps(context, (steps) => addStep(steps, payload?.step, randomUUID())),
);

resolver.define('updateStep', ({ payload, context }) =>
  mutateSteps(context, (steps) => updateStep(steps, payload?.id, payload?.step)),
);

resolver.define('removeStep', ({ payload, context }) =>
  mutateSteps(context, (steps) => removeStep(steps, payload?.id)),
);

resolver.define('moveStep', ({ payload, context }) =>
  mutateSteps(context, (steps) => moveStep(steps, payload?.id, payload?.direction)),
);

// --- Execuções --------------------------------------------------------------

resolver.define('listRuns', ({ context }) =>
  safely(async () => ({ runs: await loadRunsIndex(issueIdFrom(context)) })),
);

resolver.define('getRun', ({ payload, context }) =>
  safely(async () => ({ run: await loadRun(issueIdFrom(context), payload?.runId) })),
);

resolver.define('createRun', ({ context }) =>
  safely(async () => {
    const issueId = issueIdFrom(context);
    const run = createRun(await loadSteps(issueId), {
      id: randomUUID(),
      accountId: context.accountId,
      now: new Date().toISOString(),
    });
    const runs = await saveRun(issueId, run);
    return { run, runs };
  }),
);

resolver.define('recordStepResult', ({ payload, context }) =>
  safely(async () => {
    const issueId = issueIdFrom(context);
    const current = await loadRun(issueId, payload?.runId);
    const run = recordStepResult(current, payload?.stepId, payload?.result, {
      accountId: context.accountId,
      now: new Date().toISOString(),
    });
    const runs = await saveRun(issueId, run);
    return { run, runs };
  }),
);

resolver.define('removeRun', ({ payload, context }) =>
  safely(async () => {
    const issueId = issueIdFrom(context);
    const runs = removeSummary(await loadRunsIndex(issueId), payload?.runId);
    await deleteRun(issueId, payload.runId, runs);
    return { runs };
  }),
);

// --- Cobertura --------------------------------------------------------------

async function findCoverageLinkType() {
  const response = await api.asUser().requestJira(route`/rest/api/3/issueLinkType`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Falha ao listar tipos de vínculo (${response.status}).`);
  }
  const { issueLinkTypes = [] } = await response.json();
  return issueLinkTypes.find((type) => type.name === COVERAGE_LINK_TYPE.name) ?? null;
}

// asUser: quem está vendo só enxerga os vínculos e issues que tem permissão para ver.
resolver.define('getCoverage', ({ context }) =>
  safely(async () => {
    const issueId = issueIdFrom(context);
    const response = await api
      .asUser()
      .requestJira(route`/rest/api/3/issue/${issueId}?fields=issuetype,issuelinks`, {
        headers: { Accept: 'application/json' },
      });
    if (!response.ok) {
      throw new StepError(`Não foi possível ler o issue (${response.status}).`);
    }
    const issue = await response.json();
    const isTest = issue.fields?.issuetype?.name === TEST_ISSUE_TYPE_NAME;
    const links = issue.fields?.issuelinks ?? [];
    const items = linkedIssues(links, { wantTests: !isTest, testTypeName: TEST_ISSUE_TYPE_NAME });

    // Sem nada vinculado: avisa se o tipo de vínculo ainda não foi criado pelo admin.
    const linkTypeReady = items.length > 0 || Boolean(await findCoverageLinkType());

    if (isTest) {
      return { isTest, linkTypeReady, requirements: items };
    }

    const tests = await Promise.all(
      items.map(async (test) => ({ ...test, lastRun: (await loadRunsIndex(test.id))[0] ?? null })),
    );
    return {
      isTest,
      linkTypeReady,
      tests,
      status: coverageStatus(tests),
      counts: coverageCounts(tests),
    };
  }),
);

// --- Página de administração ------------------------------------------------

// Só a página de admin, aberta por um administrador do Jira, pode mexer na configuração.
async function requireAdmin(context) {
  if (context?.moduleKey !== ADMIN_MODULE_KEY) {
    throw new StepError('Ação disponível apenas na página de administração.');
  }
  const response = await api
    .asUser()
    .requestJira(route`/rest/api/3/mypermissions?permissions=ADMINISTER`, { headers: { Accept: 'application/json' } });
  const body = response.ok ? await response.json() : null;
  if (!body?.permissions?.ADMINISTER?.havePermission) {
    throw new StepError('Apenas administradores do Jira podem fazer isso.');
  }
}

async function findTestIssueType() {
  const response = await api.asUser().requestJira(route`/rest/api/3/issuetype`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Falha ao listar tipos de issue (${response.status}).`);
  }
  const types = await response.json();
  return types.find((type) => type.name === TEST_ISSUE_TYPE_NAME && !type.scope) ?? null;
}

async function importConfig() {
  const token = await loadImportToken();
  return {
    url: await webTrigger.getUrl(JUNIT_WEBTRIGGER_KEY),
    tokenCreatedAt: token?.createdAt ?? null,
  };
}

resolver.define('getSetupStatus', ({ context }) =>
  safely(async () => {
    await requireAdmin(context);
    return {
      issueType: await findTestIssueType(),
      linkType: await findCoverageLinkType(),
      importConfig: await importConfig(),
    };
  }),
);

resolver.define('createCoverageLinkType', ({ context }) =>
  safely(async () => {
    await requireAdmin(context);
    const existing = await findCoverageLinkType();
    if (existing) {
      return { linkType: existing };
    }
    const response = await api.asUser().requestJira(route`/rest/api/3/issueLinkType`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(COVERAGE_LINK_TYPE),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new StepError(
        `Não foi possível criar o tipo de vínculo (${response.status}). Verifique se o vínculo de issues está ativado no Jira. ${detail}`,
      );
    }
    return { linkType: await response.json() };
  }),
);

resolver.define('createTestIssueType', ({ context }) =>
  safely(async () => {
    await requireAdmin(context);
    const existing = await findTestIssueType();
    if (existing) {
      return { issueType: existing, importConfig: await importConfig() };
    }
    const response = await api.asUser().requestJira(route`/rest/api/3/issuetype`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: TEST_ISSUE_TYPE_NAME,
        description: 'Caso de teste gerenciado pelo Assay.',
        hierarchyLevel: 0,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new StepError(`Não foi possível criar o tipo de issue (${response.status}): ${detail}`);
    }
    return { issueType: await response.json(), importConfig: await importConfig() };
  }),
);

// Gera (ou substitui) o token do CI. O token só é devolvido nesta resposta.
resolver.define('generateImportToken', ({ context }) =>
  safely(async () => {
    await requireAdmin(context);
    const token = generateToken();
    await saveImportToken({
      hash: hashToken(token),
      createdAt: new Date().toISOString(),
      createdBy: context.accountId ?? null,
    });
    return { token, importConfig: await importConfig() };
  }),
);

export const handler = resolver.getDefinitions();

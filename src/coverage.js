// Cobertura de requisitos: quais issues "Teste" cobrem uma story (e vice-versa) e com que resultado.
//
// A ligação usa vínculos nativos do Jira com um tipo próprio, criado pela página de admin.
// Aceitamos o vínculo nas duas direções para tolerar quem vincular "ao contrário".

export const COVERAGE_LINK_TYPE = {
  name: 'Cobertura de teste',
  outward: 'testa',
  inward: 'é testado por',
};

export const MAX_COVERAGE_ITEMS = 100;

// Extrai os issues ligados pelo tipo de cobertura.
// wantTests=true → issues do tipo "Teste" (visão da story); false → os demais (visão do teste).
export function linkedIssues(issuelinks, { wantTests, testTypeName, linkTypeName = COVERAGE_LINK_TYPE.name }) {
  const seen = new Set();
  const out = [];
  for (const link of issuelinks ?? []) {
    if (link?.type?.name !== linkTypeName) continue;
    const other = link.inwardIssue ?? link.outwardIssue;
    if (!other?.id || seen.has(other.id)) continue;
    const isTest = other.fields?.issuetype?.name === testTypeName;
    if (isTest !== wantTests) continue;
    seen.add(other.id);
    out.push({
      id: String(other.id),
      key: other.key,
      summary: other.fields?.summary ?? '',
      statusName: other.fields?.status?.name ?? '',
      statusCategory: other.fields?.status?.statusCategory?.key ?? null,
    });
    if (out.length >= MAX_COVERAGE_ITEMS) break;
  }
  return out.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
}

// Status geral da cobertura a partir da última execução de cada teste.
//   NOT_COVERED  nenhum teste vinculado
//   FAILED       algum teste falhou na última execução
//   BLOCKED      algum bloqueado (e nenhum falhou)
//   NOT_RUN      algum teste ainda sem execução concluída
//   PASSED       todos os testes passaram
export function coverageStatus(tests) {
  if (tests.length === 0) return 'NOT_COVERED';
  const statuses = tests.map((test) => test.lastRun?.status ?? 'NONE');
  if (statuses.includes('FAILED')) return 'FAILED';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  if (statuses.every((status) => status === 'PASSED')) return 'PASSED';
  return 'NOT_RUN';
}

export function coverageCounts(tests) {
  const counts = { total: tests.length, PASSED: 0, FAILED: 0, BLOCKED: 0, NOT_RUN: 0 };
  for (const test of tests) {
    const status = test.lastRun?.status;
    if (status === 'PASSED' || status === 'FAILED' || status === 'BLOCKED') counts[status] += 1;
    else counts.NOT_RUN += 1;
  }
  return counts;
}

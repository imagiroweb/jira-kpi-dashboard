import {
  supportBuildRatioCacheKey,
  supportKpiCacheKey,
} from './WorklogApplicationService';

describe('support KPI cache keys (issue #37)', () => {
  it('supportKpiCacheKey — sprint actif', () => {
    expect(supportKpiCacheKey(undefined, undefined, true)).toBe('support-kpi:active');
    expect(supportKpiCacheKey('2026-01-01', '2026-01-31', true)).toBe('support-kpi:active');
  });

  it('supportKpiCacheKey — plage custom', () => {
    expect(supportKpiCacheKey('2026-01-01', '2026-03-31', false)).toBe(
      'support-kpi:range:2026-01-01:2026-03-31'
    );
  });

  it('supportBuildRatioCacheKey', () => {
    expect(supportBuildRatioCacheKey(2026, '2026-04-01', '2026-04-15')).toBe(
      'support-build-ratio:2026:2026-04-01:2026-04-15'
    );
    expect(supportBuildRatioCacheKey(2026, null, null)).toBe('support-build-ratio:2026:none:none');
  });
});

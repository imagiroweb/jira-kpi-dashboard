/**
 * TU — Modèle PerformanceCycle
 */
import { PerformanceCycle, PERFORMANCE_CYCLE_STATUSES } from './PerformanceCycle';

describe('PerformanceCycle', () => {
  it('expose le modèle mongoose', () => {
    expect(PerformanceCycle).toBeDefined();
    expect(PerformanceCycle.modelName).toBe('PerformanceCycle');
  });

  it('a un schéma avec label/startDate/endDate requis et status par défaut draft', () => {
    const schema = PerformanceCycle.schema;
    expect(schema.paths.label.options.required).toBe(true);
    expect(schema.paths.startDate.options.required).toBe(true);
    expect(schema.paths.endDate.options.required).toBe(true);
    expect(schema.paths.status.options.enum).toEqual(PERFORMANCE_CYCLE_STATUSES);
    expect(schema.paths.status.options.default).toBe('draft');
  });

  it('refuse un cycle sans dates', () => {
    const cycle = new PerformanceCycle({ label: 'S2-2026' });
    const error = cycle.validateSync();
    expect(error?.errors.startDate).toBeDefined();
    expect(error?.errors.endDate).toBeDefined();
  });

  it('accepte un cycle complet', () => {
    const cycle = new PerformanceCycle({
      label: 'S2-2026',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-12-31'),
      status: 'active'
    });
    expect(cycle.validateSync()).toBeUndefined();
  });
});

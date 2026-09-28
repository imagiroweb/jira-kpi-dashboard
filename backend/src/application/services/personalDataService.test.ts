/**
 * TU — Export et anonymisation des données personnelles
 */
import mongoose from 'mongoose';

const m = {
  userFindById: jest.fn(),
  userUpdateOne: jest.fn(),
  roleFindById: jest.fn(),
  teamFindById: jest.fn(),
  teamFind: jest.fn(),
  teamUpdateMany: jest.fn(),
  orgFindById: jest.fn(),
  reviewFind: jest.fn(),
  reviewDeleteMany: jest.fn(),
  reviewUpdateMany: jest.fn(),
  reviewUpdateOne: jest.fn(),
  cycleFind: jest.fn(),
  logFind: jest.fn(),
  logDeleteMany: jest.fn(),
  dashFind: jest.fn(),
  dashUpdateMany: jest.fn(),
  supportFind: jest.fn(),
  supportUpdateMany: jest.fn(),
  meetingFind: jest.fn(),
  meetingUpdateMany: jest.fn()
};
const chain = (fn: jest.Mock) => (...a: unknown[]) => {
  const leanResult = () => fn(...a);
  const c = { select: () => c, sort: () => c, lean: leanResult };
  return c;
};

jest.mock('../../domain/user/entities/User', () => ({
  User: { findById: (...a: unknown[]) => chain(m.userFindById)(...a), updateOne: (...a: unknown[]) => m.userUpdateOne(...a) }
}));
jest.mock('../../domain/user/entities/Role', () => ({ Role: { findById: (...a: unknown[]) => chain(m.roleFindById)(...a) } }));
jest.mock('../../domain/team/entities/Team', () => ({
  Team: {
    findById: (...a: unknown[]) => chain(m.teamFindById)(...a),
    find: (...a: unknown[]) => chain(m.teamFind)(...a),
    updateMany: (...a: unknown[]) => m.teamUpdateMany(...a)
  }
}));
jest.mock('../../domain/organization/entities/Organization', () => ({
  Organization: { findById: (...a: unknown[]) => chain(m.orgFindById)(...a) }
}));
jest.mock('../../domain/performance/entities/PerformanceReview', () => ({
  PerformanceReview: {
    find: (...a: unknown[]) => chain(m.reviewFind)(...a),
    deleteMany: (...a: unknown[]) => m.reviewDeleteMany(...a),
    updateMany: (...a: unknown[]) => m.reviewUpdateMany(...a),
    updateOne: (...a: unknown[]) => m.reviewUpdateOne(...a)
  }
}));
jest.mock('../../domain/performance/entities/PerformanceCycle', () => ({
  PerformanceCycle: { find: (...a: unknown[]) => chain(m.cycleFind)(...a) }
}));
jest.mock('../../domain/user/entities/UserActivityLog', () => ({
  UserActivityLog: { find: (...a: unknown[]) => chain(m.logFind)(...a), deleteMany: (...a: unknown[]) => m.logDeleteMany(...a) }
}));
jest.mock('../../domain/sprint/entities/DashboardSprintSnapshot', () => ({
  DashboardSprintSnapshot: { find: (...a: unknown[]) => chain(m.dashFind)(...a), updateMany: (...a: unknown[]) => m.dashUpdateMany(...a) }
}));
jest.mock('../../domain/support/entities/SupportSprintSnapshot', () => ({
  SupportSprintSnapshot: { find: (...a: unknown[]) => chain(m.supportFind)(...a), updateMany: (...a: unknown[]) => m.supportUpdateMany(...a) }
}));
jest.mock('../../domain/meeting/entities/WeeklySprintMeeting', () => ({
  WeeklySprintMeeting: { find: (...a: unknown[]) => chain(m.meetingFind)(...a), updateMany: (...a: unknown[]) => m.meetingUpdateMany(...a) }
}));
jest.mock('../../utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

import { anonymizeUser, anonymizedEmail, exportPersonalData, ANONYMIZED_AUTHOR_NAME } from './personalDataService';

const USER_ID = new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(m)) fn.mockResolvedValue([]);
  m.userUpdateOne.mockResolvedValue({});
  m.logDeleteMany.mockResolvedValue({ deletedCount: 7 });
  m.reviewDeleteMany.mockResolvedValue({ deletedCount: 2 });
});

describe('exportPersonalData', () => {
  it('retourne null pour un compte inexistant', async () => {
    m.userFindById.mockResolvedValue(null);
    expect(await exportPersonalData(USER_ID)).toBeNull();
  });

  it('exporte compte, rattachements, fiches, logs et contenus rédigés, sans secret', async () => {
    m.userFindById.mockResolvedValue({
      _id: USER_ID,
      email: 'jean@adoria.com',
      firstName: 'Jean',
      provider: 'microsoft',
      isActive: true,
      roleId: 'r1',
      teamId: 't1',
      organizationId: 'o1',
      hourlyRates: [{ startDate: null, rate: 50 }],
      createdAt: new Date('2026-01-01')
    });
    m.roleFindById.mockResolvedValue({ name: 'Dev' });
    m.teamFindById.mockResolvedValue({ name: 'Choco' });
    m.orgFindById.mockResolvedValue({ name: 'Adoria' });
    m.reviewFind.mockResolvedValue([{ _id: 'rv1', user: USER_ID, cycle: 'c1', __v: 3, objectives: [{ title: 'O1' }], status: 'draft' }]);
    m.cycleFind.mockResolvedValue([{ _id: 'c1', label: 'S2-26', startDate: new Date('2026-07-01'), endDate: new Date('2026-12-31') }]);
    m.logFind.mockResolvedValue([{ type: 'login', timestamp: new Date('2026-09-01') }]);
    m.dashFind.mockResolvedValue([{ _id: 's1', sprintName: 'Sprint 42', savedAt: new Date('2026-09-02') }]);
    m.teamFind.mockResolvedValue([{ name: 'Choco' }]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lecture libre de l'export JSON dans le test
    const data = (await exportPersonalData(USER_ID)) as Record<string, any>;

    expect(data.account).toEqual(
      expect.objectContaining({ email: 'jean@adoria.com', role: 'Dev', team: 'Choco', organization: 'Adoria', leadOfTeams: ['Choco'] })
    );
    expect(data.account.hourlyRates).toEqual([{ startDate: null, rate: 50 }]);
    expect(data.performanceReviews[0]).toEqual(
      expect.objectContaining({ id: 'rv1', cycle: expect.objectContaining({ label: 'S2-26' }), objectives: [{ title: 'O1' }] })
    );
    expect(data.performanceReviews[0]).not.toHaveProperty('__v');
    expect(data.activityLogs).toEqual([{ type: 'login', timestamp: new Date('2026-09-01'), meta: null }]);
    expect(data.authoredContent.dashboardSnapshots).toEqual([{ id: 's1', sprintName: 'Sprint 42', savedAt: new Date('2026-09-02') }]);
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/password|tokenVersion|passwordResetToken/);
  });
});

describe('anonymizeUser', () => {
  it('efface l’identité, révoque les sessions, supprime les logs, anonymise les fiches et renomme l’auteur', async () => {
    m.userFindById.mockResolvedValue({ _id: USER_ID });
    m.reviewFind.mockResolvedValue([
      {
        _id: 'rv-old',
        user: USER_ID,
        cycle: 'c-2025',
        objectives: [{ id: 'o1', title: 'Objectif', managerAssessment: { status: 'atteint', comment: 'Très bien' } }],
        qualitative: { successes: { self: 'Mon bilan' } },
        createdBy: { id: USER_ID, name: 'Jean Dupont' }
      },
      { _id: 'rv-new', user: USER_ID, cycle: 'c-2026', objectives: [], qualitative: {}, createdBy: { id: 'lead', name: 'Lead' } }
    ]);

    const report = await anonymizeUser(USER_ID, 'request');

    expect(report).toEqual({ userId: USER_ID, activityLogsDeleted: 7, performanceReviewsAnonymized: 2 });
    // fiches conservées (jamais supprimées) mais anonymisées et détachées du compte
    expect(m.reviewDeleteMany).not.toHaveBeenCalled();
    const [reviewFilter, reviewUpdate] = m.reviewUpdateOne.mock.calls[0];
    expect(reviewFilter).toEqual({ _id: 'rv-old' });
    expect(reviewUpdate.$set.user).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(reviewUpdate.$set.user)).not.toBe(USER_ID);
    expect(reviewUpdate.$set.anonymizedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(reviewUpdate.$set)).not.toMatch(/Très bien|Mon bilan|Jean Dupont/);
    expect(reviewUpdate.$set.objectives[0]).toEqual(expect.objectContaining({ title: 'Objectif', managerAssessment: { status: 'atteint' } }));
    const [filter, update] = m.userUpdateOne.mock.calls[0];
    expect(filter).toEqual({ _id: USER_ID });
    expect(update.$set).toEqual(
      expect.objectContaining({ email: anonymizedEmail(USER_ID), isActive: false, anonymizedAt: expect.any(Date), roleId: null })
    );
    expect(Object.keys(update.$unset)).toEqual(
      expect.arrayContaining(['firstName', 'lastName', 'microsoftId', 'password', 'hourlyRates', 'preferences'])
    );
    expect(update.$inc).toEqual({ tokenVersion: 1 });
    expect(m.teamUpdateMany).toHaveBeenCalledWith({ leadIds: USER_ID }, { $pull: { leadIds: USER_ID } });
    expect(m.logDeleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(m.reviewFind).toHaveBeenCalledWith({ user: USER_ID, anonymizedAt: null });
    expect(m.reviewUpdateMany).toHaveBeenCalledWith({ 'createdBy.id': USER_ID }, { $set: { 'createdBy.name': ANONYMIZED_AUTHOR_NAME } });
    expect(m.reviewUpdateMany).toHaveBeenCalledWith(
      { 'objectives.krs.progressHistory.updatedBy.id': USER_ID },
      expect.any(Object),
      { arrayFilters: [{ 'p.updatedBy.id': USER_ID }] }
    );
    expect(m.dashUpdateMany).toHaveBeenCalledWith(
      { 'savedBy.id': USER_ID },
      { $set: { 'savedBy.name': ANONYMIZED_AUTHOR_NAME, 'savedBy.email': anonymizedEmail(USER_ID) } }
    );
    expect(m.meetingUpdateMany).toHaveBeenCalledWith(
      { 'actions.createdBy.id': USER_ID },
      { $set: { 'actions.$[row].createdBy.name': ANONYMIZED_AUTHOR_NAME } },
      { arrayFilters: [{ 'row.createdBy.id': USER_ID }] }
    );
  });

  it('ne fait rien pour un identifiant invalide ou un compte inexistant', async () => {
    expect(await anonymizeUser('pas-un-id', 'request')).toBeNull();
    m.userFindById.mockResolvedValue(null);
    expect(await anonymizeUser(USER_ID, 'retention')).toBeNull();
    expect(m.userUpdateOne).not.toHaveBeenCalled();
  });

  it('l’email anonymisé reste un email syntaxiquement valide et unique', () => {
    expect(anonymizedEmail(USER_ID)).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    expect(anonymizedEmail(USER_ID)).toContain(USER_ID);
  });
});

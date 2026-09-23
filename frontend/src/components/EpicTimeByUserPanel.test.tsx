import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import type { EpicTimeByUserResponse, EpicTimeByUserRow } from '../services/api';
import { EpicTimeByUserPanel } from './EpicTimeByUserPanel';

/** Montant tel qu'affiché, espaces insécables de fr-FR ramenés à des espaces (comme toHaveTextContent). */
const eur = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n).replace(/\s/g, ' ');

const person = (over: Partial<EpicTimeByUserRow>): EpicTimeByUserRow => ({
  accountId: 'acc',
  displayName: 'X',
  avatarUrl: null,
  role: null,
  timeSpentSeconds: 0,
  percent: 0,
  worklogCount: 1,
  issueCount: 1,
  firstWorklogAt: '2026-02-01T09:00:00.000+0100',
  lastWorklogAt: '2026-03-01T09:00:00.000+0100',
  ...over,
});

const BASE: EpicTimeByUserResponse = {
  epicKey: 'AD-6346',
  issueCount: 9,
  totalSeconds: 48600,
  people: [
    person({ accountId: 'c', displayName: 'Caroline Martin', role: 'Développeuse', timeSpentSeconds: 37800, percent: 77.8, issueCount: 5 }),
    person({ accountId: 'g', displayName: 'Guilhem Leroy', timeSpentSeconds: 10800, percent: 22.2 }),
  ],
  byRole: [
    { role: 'Développeuse', timeSpentSeconds: 37800, percent: 77.8, peopleCount: 1 },
    { role: null, timeSpentSeconds: 10800, percent: 22.2, peopleCount: 1 },
  ],
};

const WITH_COSTS: EpicTimeByUserResponse = {
  ...BASE,
  people: [
    {
      ...BASE.people[0],
      hourlyRates: [
        { startDate: null, rate: 50 },
        { startDate: '2026-07-01', rate: 60 },
      ],
      cost: 525,
    },
    { ...BASE.people[1], hourlyRates: [], cost: null },
  ],
  byRole: [
    { ...BASE.byRole[0], cost: 525, peopleWithoutCost: 0 },
    { ...BASE.byRole[1], cost: null, peopleWithoutCost: 1 },
  ],
  totalCost: 525,
  peopleWithoutCost: 1,
};

const renderPanel = (data: EpicTimeByUserResponse | null, ticketTimeSpentSeconds = 48600, error: string | null = null) =>
  renderWithProviders(<EpicTimeByUserPanel data={data} error={error} ticketTimeSpentSeconds={ticketTimeSpentSeconds} />);

describe('EpicTimeByUserPanel', () => {
  it('liste le temps passé par personne avec son poste', async () => {
    renderPanel(BASE);

    const people = await screen.findByRole('list', { name: 'Temps passé par personne' });
    const items = within(people).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Caroline Martin');
    expect(items[0]).toHaveTextContent('Développeuse · 5 ticket(s)');
    expect(items[0]).toHaveTextContent('10.5h');
    expect(items[1]).toHaveTextContent('Poste non renseigné');
    expect(items[1]).toHaveTextContent('3.0h');
    expect(screen.getByText(/2 personne\(s\) · 13.5h sur 9 ticket\(s\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Écart de/)).not.toBeInTheDocument();
  });

  it('affiche la répartition du temps par rôle, poste non renseigné compris', async () => {
    renderPanel(BASE);

    const roles = within(await screen.findByRole('list', { name: 'Répartition par rôle' })).getAllByRole('listitem');
    expect(roles[0]).toHaveTextContent('Développeuse10.5h77.8 %');
    expect(roles[1]).toHaveTextContent('Poste non renseigné3.0h22.2 %');
  });

  it("n'affiche aucun coût si le serveur n'en renvoie pas", async () => {
    renderPanel(BASE);

    await screen.findByRole('list', { name: 'Temps passé par personne' });
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it('affiche les coûts par personne, par rôle et au total quand ils sont fournis', async () => {
    renderPanel(WITH_COSTS);

    const people = within(await screen.findByRole('list', { name: 'Temps passé par personne' })).getAllByRole('listitem');
    expect(people[0]).toHaveTextContent(eur(525));
    expect(within(people[0]).getByTitle('50 €/h · 60 €/h dès le 01/07/2026')).toBeInTheDocument();
    expect(people[1]).toHaveTextContent('— €');
    expect(within(people[1]).getByTitle('Coût horaire non renseigné')).toBeInTheDocument();

    const roles = within(screen.getByRole('list', { name: 'Répartition par rôle' })).getAllByRole('listitem');
    expect(roles[0]).toHaveTextContent(eur(525));
    expect(roles[1]).toHaveTextContent('— €');

    expect(screen.getByText(/13.5h sur 9 ticket\(s\) · 525\s€/)).toBeInTheDocument();
    expect(screen.getByText(/1 personne\(s\) sans coût horaire/)).toBeInTheDocument();
  });

  it('signale un écart avec le temps passé des tickets', async () => {
    renderPanel(
      {
        ...BASE,
        totalSeconds: 3600,
        people: [person({ timeSpentSeconds: 3600, percent: 100 })],
        byRole: [{ role: null, timeSpentSeconds: 3600, percent: 100, peopleCount: 1 }],
      },
      7200
    );

    expect(await screen.findByText(/Écart de 1.0h/)).toBeInTheDocument();
  });

  it("indique l'absence de temps saisi", async () => {
    renderPanel({ ...BASE, totalSeconds: 0, people: [], byRole: [] }, 0);

    expect(await screen.findByText('Aucun temps saisi sur cette épic.')).toBeInTheDocument();
  });

  it('indique le chargement tant que les worklogs ne sont pas lus', () => {
    renderPanel(null);

    expect(screen.getByText('Lecture des worklogs…')).toBeInTheDocument();
  });

  it("affiche l'erreur de chargement", () => {
    renderPanel(null, 0, 'Impossible de charger le temps passé par personne.');

    expect(screen.getByText(/Impossible de charger le temps passé par personne/)).toBeInTheDocument();
    expect(screen.queryByText('Lecture des worklogs…')).not.toBeInTheDocument();
  });
});

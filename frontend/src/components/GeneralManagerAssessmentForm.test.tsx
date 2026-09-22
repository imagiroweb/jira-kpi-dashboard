import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneralManagerAssessmentForm } from './GeneralManagerAssessmentForm';
import { GeneralAssessmentAxes, GeneralAssessmentReferentialProfile, emptyGeneralAssessmentAxes } from '../domain/performance';

const DEV_BACK_PROFILE: GeneralAssessmentReferentialProfile = {
  roleProfile: 'dev_back',
  label: 'D\u00e9veloppeur Back',
  axes: {
    technique: [
      {
        label: 'Qualit\u00e9 du code & revues',
        answers: [
          { text: 'Tr\u00e8s faible', points: 1 },
          { text: 'Faible', points: 2 },
          { text: 'Correct', points: 3 },
          { text: 'Bon', points: 4 },
          { text: 'Excellent', points: 5 }
        ]
      }
    ],
    impact: [],
    collaboration: [],
    leadership: []
  },
  updatedAt: '2026-09-01T00:00:00.000Z'
};

const QA_PROFILE: GeneralAssessmentReferentialProfile = {
  roleProfile: 'qa',
  label: 'QA',
  axes: {
    technique: [
      {
        label: 'Couverture des tests',
        answers: [
          { text: 'Tr\u00e8s faible', points: 1 },
          { text: 'Faible', points: 2 },
          { text: 'Correct', points: 3 },
          { text: 'Bon', points: 4 },
          { text: 'Excellent', points: 5 }
        ]
      }
    ],
    impact: [],
    collaboration: [],
    leadership: []
  },
  updatedAt: '2026-09-01T00:00:00.000Z'
};

function emptyAxes(): GeneralAssessmentAxes {
  return emptyGeneralAssessmentAxes();
}

describe('GeneralManagerAssessmentForm', () => {
  it('affiche un message de chargement quand le r\u00e9f\u00e9rentiel est en cours de chargement', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[]}
        loadingReferential
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText('Chargement des r\u00e9f\u00e9rentiels\u2026')).toBeInTheDocument();
  });

  it("affiche un message quand aucun r\u00e9f\u00e9rentiel n'est configur\u00e9", () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[]}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Aucun r\u00e9f\u00e9rentiel de notation n'est encore configur\u00e9.")).toBeInTheDocument();
  });

  it('invite \u00e0 choisir un profil de poste avant de montrer la grille', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(
      screen.getByText('Choisissez un profil de poste ci-dessus pour afficher la grille de notation.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Qualit\u00e9 du code & revues')).not.toBeInTheDocument();
  });

  it('pr\u00e9s\u00e9lectionne le profil de poste d\u00e9j\u00e0 m\u00e9moris\u00e9 sur la fiche et affiche sa grille', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE, QA_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Profil de poste')).toHaveValue('dev_back');
    expect(screen.getByLabelText('Qualit\u00e9 du code & revues')).toBeInTheDocument();
  });

  it('affiche la r\u00e9ponse manager d\u00e9j\u00e0 enregistr\u00e9e comme valeur initiale du s\u00e9lecteur', () => {
    const managerAxes = emptyAxes();
    managerAxes.technique = [{ label: 'Qualit\u00e9 du code & revues', score: 4, answer: 'Bon' }];

    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={managerAxes}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Qualit\u00e9 du code & revues')).toHaveValue('Bon');
  });

  it('change la grille affich\u00e9e quand le manager change de profil de poste', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[DEV_BACK_PROFILE, QA_PROFILE]}
        onSave={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'dev_back' } });
    expect(screen.getByLabelText('Qualit\u00e9 du code & revues')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'qa' } });
    expect(screen.queryByLabelText('Qualit\u00e9 du code & revues')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Couverture des tests')).toBeInTheDocument();
  });

  it("signale un d\u00e9saccord quand l'\u00e9cart avec l'auto-\u00e9valuation atteint le seuil", () => {
    const selfAxes = emptyAxes();
    selfAxes.technique = [{ label: 'Qualit\u00e9 du code & revues', score: 5 }];

    render(
      <GeneralManagerAssessmentForm
        selfAxes={selfAxes}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText('D\u00e9saccord')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Qualit\u00e9 du code & revues'), { target: { value: 'Bon' } });
    expect(screen.queryByText('D\u00e9saccord')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Qualit\u00e9 du code & revues'), { target: { value: 'Faible' } });
    expect(screen.getByText('D\u00e9saccord')).toBeInTheDocument();
  });

  it('ne signale pas de d\u00e9saccord tant que la r\u00e9ponse manager est vide', () => {
    const selfAxes = emptyAxes();
    selfAxes.technique = [{ label: 'Qualit\u00e9 du code & revues', score: 5 }];

    render(
      <GeneralManagerAssessmentForm
        selfAxes={selfAxes}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText('D\u00e9saccord')).not.toBeInTheDocument();
  });

  it("d\u00e9sactive le bouton d'enregistrement tant qu'aucun profil de poste n'est choisi", () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Enregistrer la grille manager/i })).toBeDisabled();
  });

  it('construit le payload de sauvegarde avec la r\u00e9ponse choisie et le profil de poste s\u00e9lectionn\u00e9', () => {
    const onSave = vi.fn();
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'dev_back' } });
    fireEvent.change(screen.getByLabelText('Qualit\u00e9 du code & revues'), { target: { value: 'Excellent' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la grille manager/i }));

    expect(onSave).toHaveBeenCalledWith({
      axes: {
        technique: [{ label: 'Qualit\u00e9 du code & revues', answer: 'Excellent' }],
        impact: [],
        collaboration: [],
        leadership: []
      },
      roleProfile: 'dev_back'
    });
  });

  it('omet les sous-crit\u00e8res non r\u00e9pondus du payload de sauvegarde', () => {
    const onSave = vi.fn();
    const profileWithTwoCriteria: GeneralAssessmentReferentialProfile = {
      ...DEV_BACK_PROFILE,
      axes: {
        ...DEV_BACK_PROFILE.axes,
        technique: [
          ...DEV_BACK_PROFILE.axes.technique,
          {
            label: 'Autonomie technique',
            answers: [
              { text: 'Tr\u00e8s faible', points: 1 },
              { text: 'Faible', points: 2 },
              { text: 'Correct', points: 3 },
              { text: 'Bon', points: 4 },
              { text: 'Excellent', points: 5 }
            ]
          }
        ]
      }
    };

    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        referentialProfiles={[profileWithTwoCriteria]}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getByLabelText('Profil de poste'), { target: { value: 'dev_back' } });
    fireEvent.change(screen.getByLabelText('Qualit\u00e9 du code & revues'), { target: { value: 'Bon' } });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer la grille manager/i }));

    expect(onSave).toHaveBeenCalledWith({
      axes: expect.objectContaining({
        technique: [{ label: 'Qualit\u00e9 du code & revues', answer: 'Bon' }]
      }),
      roleProfile: 'dev_back'
    });
  });

  it('n\u2019affiche pas le bouton de sauvegarde en mode d\u00e9sactiv\u00e9', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        disabled
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Enregistrer la grille manager/i })).not.toBeInTheDocument();
  });

  it('d\u00e9sactive le s\u00e9lecteur de r\u00e9ponse en mode d\u00e9sactiv\u00e9', () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        disabled
        onSave={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Qualit\u00e9 du code & revues')).toBeDisabled();
  });

  it("d\u00e9sactive le bouton d'enregistrement pendant la sauvegarde", () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        saving
        onSave={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Enregistrer la grille manager/i })).toBeDisabled();
  });

  it('affiche la note du collaborateur en regard de chaque sous-crit\u00e8re', () => {
    const selfAxes = emptyAxes();
    selfAxes.technique = [{ label: 'Qualit\u00e9 du code & revues', score: 3 }];

    render(
      <GeneralManagerAssessmentForm
        selfAxes={selfAxes}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    const criterionRow = screen.getByLabelText('Qualit\u00e9 du code & revues').closest('.space-y-1') as HTMLElement;
    expect(within(criterionRow).getByText('Collaborateur : 3/5')).toBeInTheDocument();
  });

  it("affiche un tiret pour la note du collaborateur quand elle n'est pas connue", () => {
    render(
      <GeneralManagerAssessmentForm
        selfAxes={emptyAxes()}
        managerAxes={emptyAxes()}
        roleProfile="dev_back"
        referentialProfiles={[DEV_BACK_PROFILE]}
        onSave={vi.fn()}
      />
    );

    const criterionRow = screen.getByLabelText('Qualit\u00e9 du code & revues').closest('.space-y-1') as HTMLElement;
    expect(within(criterionRow).getByText('Collaborateur : \u2014')).toBeInTheDocument();
  });
});

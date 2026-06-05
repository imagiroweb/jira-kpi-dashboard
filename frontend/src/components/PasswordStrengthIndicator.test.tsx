import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

describe('PasswordStrengthIndicator', () => {
  it('ne rend rien si le mot de passe est vide', () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('affiche les 5 règles de validation', () => {
    render(<PasswordStrengthIndicator password="a" />);

    expect(screen.getByText('12 caractères minimum')).toBeInTheDocument();
    expect(screen.getByText('Une lettre majuscule')).toBeInTheDocument();
    expect(screen.getByText('Une lettre minuscule')).toBeInTheDocument();
    expect(screen.getByText('Un chiffre')).toBeInTheDocument();
    expect(screen.getByText(/Un caractère spécial/)).toBeInTheDocument();
    expect(screen.getByText('1/5 critères')).toBeInTheDocument();
  });

  it('affiche le niveau Faible pour un mot de passe très court', () => {
    render(<PasswordStrengthIndicator password="a" />);
    expect(screen.getByText('Faible')).toBeInTheDocument();
  });

  it('affiche le niveau Moyen pour 2 critères validés', () => {
    render(<PasswordStrengthIndicator password="Abcdef" />);
    expect(screen.getByText('Moyen')).toBeInTheDocument();
    expect(screen.getByText('2/5 critères')).toBeInTheDocument();
  });

  it('affiche le niveau Fort pour 3 ou 4 critères validés', () => {
    render(<PasswordStrengthIndicator password="MonMotDePasse1" />);
    expect(screen.getByText('Fort')).toBeInTheDocument();
    expect(screen.getByText('4/5 critères')).toBeInTheDocument();
  });

  it('affiche le niveau Très fort quand tous les critères sont validés', () => {
    render(<PasswordStrengthIndicator password="MonMotDePasse123!" />);
    expect(screen.getByText('Très fort')).toBeInTheDocument();
    expect(screen.getByText('5/5 critères')).toBeInTheDocument();
  });

  it('affiche l’astuce de longueur quand tous les critères sont validés mais < 16 caractères', () => {
    render(<PasswordStrengthIndicator password="MonMotDePasse1!" />);
    expect(screen.getByText(/16\+ caractères/)).toBeInTheDocument();
  });
});

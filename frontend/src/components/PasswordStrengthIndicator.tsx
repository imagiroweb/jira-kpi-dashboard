import { useMemo } from 'react';
import { Check, X, Shield, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

interface PasswordStrengthIndicatorProps {
  password: string;
  className?: string;
}

const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: '12 caractères minimum',
    test: (pwd) => pwd.length >= 12
  },
  {
    id: 'uppercase',
    label: 'Une lettre majuscule',
    test: (pwd) => /[A-Z]/.test(pwd)
  },
  {
    id: 'lowercase',
    label: 'Une lettre minuscule',
    test: (pwd) => /[a-z]/.test(pwd)
  },
  {
    id: 'number',
    label: 'Un chiffre',
    test: (pwd) => /[0-9]/.test(pwd)
  },
  {
    id: 'special',
    label: 'Un caractère spécial (!@#$%^&*...)',
    test: (pwd) => /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)
  }
];

type StrengthLevel = 'weak' | 'medium' | 'strong' | 'very-strong';

interface StrengthConfig {
  label: string;
  color: string;
  bgColor: string;
  barColor: string;
  icon: React.ComponentType<{ className?: string }>;
}

const STRENGTH_CONFIG: Record<StrengthLevel, StrengthConfig> = {
  weak: {
    label: 'Faible',
    color: 'text-danger-400',
    bgColor: 'bg-danger-500/20',
    barColor: 'bg-danger-500',
    icon: ShieldX
  },
  medium: {
    label: 'Moyen',
    color: 'text-warning-400',
    bgColor: 'bg-warning-500/20',
    barColor: 'bg-warning-500',
    icon: ShieldAlert
  },
  strong: {
    label: 'Fort',
    color: 'text-success-400',
    bgColor: 'bg-success-500/20',
    barColor: 'bg-success-500',
    icon: Shield
  },
  'very-strong': {
    label: 'Très fort',
    color: 'text-accent-400',
    bgColor: 'bg-accent-500/20',
    barColor: 'bg-gradient-to-r from-success-500 to-accent-500',
    icon: ShieldCheck
  }
};

export function PasswordStrengthIndicator({ password, className = '' }: PasswordStrengthIndicatorProps) {
  const analysis = useMemo(() => {
    const passedRules = PASSWORD_RULES.filter(rule => rule.test(password));
    const score = passedRules.length;
    
    // Calculate strength level
    let strength: StrengthLevel;
    if (score <= 1) {
      strength = 'weak';
    } else if (score <= 2) {
      strength = 'medium';
    } else if (score <= 4) {
      strength = 'strong';
    } else {
      strength = 'very-strong';
    }

    // Additional scoring for extra security
    let bonusScore = 0;
    if (password.length >= 16) bonusScore += 1;
    if (password.length >= 20) bonusScore += 1;
    if ((password.match(/[A-Z]/g) || []).length >= 2) bonusScore += 0.5;
    if ((password.match(/[0-9]/g) || []).length >= 2) bonusScore += 0.5;

    const percentage = Math.min(100, ((score + bonusScore) / 7) * 100);

    return {
      passedRules,
      score,
      strength,
      percentage,
      allRulesPassed: score === PASSWORD_RULES.length
    };
  }, [password]);

  if (!password) {
    return null;
  }

  const config = STRENGTH_CONFIG[analysis.strength];
  const IconComponent = config.icon;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Strength Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <IconComponent className={`w-4 h-4 ${config.color}`} />
            <span className={config.color}>{config.label}</span>
          </div>
          <span className="text-surface-500">
            {analysis.score}/{PASSWORD_RULES.length} critères
          </span>
        </div>
        
        {/* Progress bar */}
        <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${config.barColor}`}
            style={{ width: `${analysis.percentage}%` }}
          />
        </div>
      </div>

      {/* Rules Checklist */}
      <div className="grid grid-cols-1 gap-1.5">
        {PASSWORD_RULES.map((rule) => {
          const isPassed = rule.test(password);
          return (
            <div
              key={rule.id}
              className={`flex items-center gap-2 text-xs transition-all duration-200 ${
                isPassed ? 'text-success-400' : 'text-surface-500'
              }`}
            >
              <div className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                isPassed 
                  ? 'bg-success-500/20' 
                  : 'bg-surface-800'
              }`}>
                {isPassed ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </div>
              <span>{rule.label}</span>
            </div>
          );
        })}
      </div>

      {/* Security Tips */}
      {analysis.allRulesPassed && password.length < 16 && (
        <p className="text-xs text-surface-500 bg-surface-800/50 p-2 rounded-lg">
          💡 Astuce : Un mot de passe plus long (16+ caractères) est encore plus sécurisé
        </p>
      )}
    </div>
  );
}


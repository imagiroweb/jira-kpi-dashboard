/**
 * Garde-fou RGPD : aucun appel au logger ne doit journaliser un email (logs applicatifs =
 * minimisation, art. 5.1.c). Journaliser l'identifiant utilisateur à la place.
 */
import fs from 'fs';
import path from 'path';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('logs sans données personnelles', () => {
  it('aucun logger.* ne contient un email interpolé (un nombre d’emails reste autorisé)', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(path.resolve(__dirname, '..'))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/logger\.(info|warn|error|debug)\(/.test(line) && /\$\{[^}]*email(?!s?\.length)[^}]*\}/i.test(line)) {
            offenders.push(`${path.relative(path.resolve(__dirname, '..'), file)}:${i + 1}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

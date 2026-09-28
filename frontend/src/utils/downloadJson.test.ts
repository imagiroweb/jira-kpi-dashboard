import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson, personalDataFilename } from './downloadJson';

describe('downloadJson', () => {
  afterEach(() => vi.restoreAllMocks());

  it('télécharge un fichier JSON via un lien temporaire', () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:x');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson({ a: 1 }, 'export.json');

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('nomme le fichier avec la date du jour', () => {
    expect(personalDataFilename()).toMatch(/^donnees-personnelles-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

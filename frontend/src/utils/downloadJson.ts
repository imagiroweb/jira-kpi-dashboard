/** Déclenche le téléchargement d'un objet en fichier JSON (export des données personnelles). */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function personalDataFilename(): string {
  return `donnees-personnelles-${new Date().toISOString().slice(0, 10)}.json`;
}

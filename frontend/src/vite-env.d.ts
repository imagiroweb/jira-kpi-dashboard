/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_JIRA_URL: string;
  /** ID du board Monday « Suivi clients par CP » (prioritaire sur la recherche par nom). */
  readonly VITE_MONDAY_SUIVI_CLIENT_BOARD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}


import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Jira KPI Dashboard API',
      version: '1.0.0',
      description: 'API pour le tableau de bord des KPI Jira - Temps passé par état, métriques de performance, worklogs',
      contact: {
        name: 'API Support'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Serveur de développement'
      }
    ],
    tags: [
      { name: 'Health', description: 'Endpoints de santé' },
      { name: 'Jira', description: 'Endpoints Jira (issues, projets, sync)' },
      { name: 'KPI', description: 'Endpoints KPI (métriques, temps par état)' },
      { name: 'Worklog', description: 'Endpoints WorklogPro (worklogs, timesheets)' },
      { name: 'Excel', description: 'Endpoints Excel (import/export)' },
      { name: 'AI', description: 'Endpoints IA (analyse)' }
    ],
    components: {
      schemas: {
        TimeInStatusMetrics: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'In Progress' },
            averageHours: { type: 'number', example: 24.5 },
            averageDays: { type: 'number', example: 1.02 },
            issueCount: { type: 'integer', example: 45 },
            minHours: { type: 'number', example: 0.5 },
            maxHours: { type: 'number', example: 120.3 },
            totalHours: { type: 'number', example: 1102.5 }
          }
        },
        KPIMetrics: {
          type: 'object',
          properties: {
            velocity: { type: 'number', example: 42 },
            completionRate: { type: 'number', example: 85.5 },
            bugRate: { type: 'number', example: 12.3 },
            leadTime: { type: 'number', example: 5.2 },
            cycleTime: { type: 'number', example: 3.1 },
            totalIssues: { type: 'integer', example: 150 },
            completedIssues: { type: 'integer', example: 128 },
            bugCount: { type: 'integer', example: 18 }
          }
        },
        JiraProject: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'PROJ1' },
            name: { type: 'string', example: 'Mon Projet' },
            isConfigured: { type: 'boolean', example: true }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'An error occurred' },
            error: { type: 'string', example: 'Detailed error message' }
          }
        }
      },
      parameters: {
        projectKey: {
          name: 'project',
          in: 'query',
          description: 'Clé du projet Jira',
          schema: { type: 'string', example: 'PROJ1' }
        },
        fromDate: {
          name: 'from',
          in: 'query',
          description: 'Date de début (format YYYY-MM-DD)',
          schema: { type: 'string', format: 'date', example: '2025-01-01' }
        },
        toDate: {
          name: 'to',
          in: 'query',
          description: 'Date de fin (format YYYY-MM-DD)',
          schema: { type: 'string', format: 'date', example: '2025-12-31' }
        },
        issueType: {
          name: 'issueType',
          in: 'query',
          description: 'Type de ticket (Bug, Story, Task, etc.)',
          schema: { type: 'string', example: 'Bug' }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};

export const swaggerSpec = swaggerJsdoc(options);

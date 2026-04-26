import {
  DEFAULT_REGION,
  EnvironmentConfig,
  PROJECT_NAME,
} from './environment.js';

export const devConfig: EnvironmentConfig = {
  projectName: PROJECT_NAME,
  envName: 'dev',
  region: DEFAULT_REGION,
  // account se toma de CDK_DEFAULT_ACCOUNT en el entrypoint si no se define.
  removalPolicyDestroy: true,
  features: {
    enableCostlyResources: false,
    enableSecurityHardening: false,
    enableEdgeStack: false,
  },
  tags: {
    Project: PROJECT_NAME,
    Environment: 'dev',
    Owner: 'equipo-ucb',
    CostCenter: 'maestria-arq-nube',
    ManagedBy: 'cdk',
  },
};

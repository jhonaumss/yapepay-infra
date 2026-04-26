import {
  DEFAULT_REGION,
  EnvironmentConfig,
  PROJECT_NAME,
} from './environment.js';

export const prodConfig: EnvironmentConfig = {
  projectName: PROJECT_NAME,
  envName: 'prod',
  region: DEFAULT_REGION,
  removalPolicyDestroy: false,
  features: {
    enableCostlyResources: true,
    enableSecurityHardening: true,
    enableEdgeStack: true,
  },
  tags: {
    Project: PROJECT_NAME,
    Environment: 'prod',
    Owner: 'equipo-ucb',
    CostCenter: 'maestria-arq-nube',
    ManagedBy: 'cdk',
  },
};

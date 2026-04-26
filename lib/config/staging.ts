import {
  DEFAULT_REGION,
  EnvironmentConfig,
  PROJECT_NAME,
} from './environment.js';

export const stagingConfig: EnvironmentConfig = {
  projectName: PROJECT_NAME,
  envName: 'staging',
  region: DEFAULT_REGION,
  removalPolicyDestroy: false,
  features: {
    enableCostlyResources: false,
    enableSecurityHardening: true,
    enableEdgeStack: false,
  },
  tags: {
    Project: PROJECT_NAME,
    Environment: 'staging',
    Owner: 'equipo-ucb',
    CostCenter: 'maestria-arq-nube',
    ManagedBy: 'cdk',
  },
};

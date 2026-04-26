import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { EnvironmentConfig } from './config/environment.js';

export interface YapepayInfraStageProps extends cdk.StageProps {
  readonly config: EnvironmentConfig;
}

/**
 * YapepayInfraStage — agrupa todos los stacks de un ambiente.
 *
 * Por ahora es un placeholder. Cuando se implemente la lógica real, este
 * Stage instanciará los stacks reales (StorageStack, MessagingStack, etc.)
 * en orden de dependencias y aplicará los tags globales del config.
 */
export class YapepayInfraStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: YapepayInfraStageProps) {
    super(scope, id, props);
    // TODO: instanciar stacks reales según `props.config` cuando se implementen.
    // Ej.: new StorageStack(this, 'Storage', { ... });
  }
}

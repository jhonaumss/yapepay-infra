import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * PipelineStack — placeholder.
 *
 * Plan §38 (roadmap): pipeline de despliegue (CodePipeline o GitHub Actions
 * con OIDC). Mantener fuera del MVP.
 */
export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar pipeline de despliegue (post-MVP).
  }
}

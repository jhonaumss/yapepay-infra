import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * EdgeStack — placeholder.
 *
 * Plan / yape-parte1 §5.1: CloudFront + WAF en `us-east-1`. Habilitar solo
 * cuando `features.enableEdgeStack === true`.
 */
export class EdgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar CloudFront + WAF.
  }
}

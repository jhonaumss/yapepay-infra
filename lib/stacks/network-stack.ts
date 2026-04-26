import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * NetworkStack — placeholder.
 *
 * Plan / yape-parte1 §5.1: VPC Multi-AZ con subnets pública / privada /
 * aislada. Evitar NAT Gateway en dev mientras no sea estrictamente necesario.
 */
export class NetworkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar VPC Multi-AZ.
  }
}

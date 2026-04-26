import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * DatabaseStack — placeholder.
 *
 * Plan / yape-parte1 §5.1: RDS PostgreSQL 15 Multi-AZ con cifrado KMS y
 * backups automáticos. NO desplegar en dev hasta tener budget configurado.
 */
export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar RDS PostgreSQL 15 (post-MVP).
  }
}

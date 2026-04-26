import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * AuditStack — placeholder.
 *
 * Plan / yape-parte1 §6.4: AuditLog append-only con retención 5 años
 * (requisito SBS). RDS append-only o DynamoDB + S3 Glacier.
 */
export class AuditStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar AuditLog append-only (post-MVP).
  }
}

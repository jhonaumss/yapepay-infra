import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * CacheStack — placeholder.
 *
 * Plan / yape-parte1 §5.1: ElastiCache Redis 7 cluster mode para
 * idempotencia y rate limiting. NO desplegar en dev.
 */
export class CacheStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar ElastiCache Redis (post-MVP).
  }
}

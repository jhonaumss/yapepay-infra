import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * ServicesStack — placeholder.
 *
 * Plan / yape-parte1 §5.1: ECS Fargate + ECR para microservicios NestJS
 * (user, transaction, wallet, qr, notification).
 */
export class ServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar ECS Fargate + ECR (post-MVP).
  }
}

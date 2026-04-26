import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * AuthStack — placeholder.
 *
 * Plan / yape-parte1 §6: Keycloak 22 desplegado sobre ECS Fargate como
 * Authorization Server OIDC.
 */
export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    // TODO: Implementar Keycloak en ECS Fargate (post-MVP).
  }
}

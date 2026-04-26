import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface SecurityStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

/**
 * SecurityStack — base mínima de KMS para fases posteriores.
 */
export class SecurityStack extends cdk.Stack {
  public readonly sharedKey: kms.IKey;

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    const removalPolicy = props.config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    const sharedKey = new kms.Key(this, 'SharedSecurityKey', {
      alias: `alias/${props.config.projectName}/${props.config.envName}`,
      description: `Clave KMS compartida para ${props.config.projectName} ${props.config.envName}.`,
      enableKeyRotation: true,
      pendingWindow: cdk.Duration.days(7),
      removalPolicy,
    });
    this.sharedKey = sharedKey;

    new cdk.CfnOutput(this, 'SharedSecurityKeyArn', {
      description: 'ARN de la clave KMS compartida.',
      value: sharedKey.keyArn,
    });

    new cdk.CfnOutput(this, 'SharedSecurityKeyAliasName', {
      description: 'Alias de la clave KMS compartida.',
      value: `alias/${props.config.projectName}/${props.config.envName}`,
    });
  }
}

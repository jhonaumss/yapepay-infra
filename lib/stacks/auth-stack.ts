import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface AuthStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;
    const prefix = `${config.projectName}-${config.envName}`;

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${prefix}-user-pool`,
      selfSignUpEnabled: false, // registration goes through our API
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 6,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
      },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    new cognito.CfnUserPoolGroup(this, 'RegularUserGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'regular_user',
      description: 'Standard users: access to all endpoints except recargas',
    });

    new cognito.CfnUserPoolGroup(this, 'CashierUserGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'cashier_user',
      description: 'Cashier users: exclusive access to the recargas endpoint',
    });

    this.userPoolClient = this.userPool.addClient('ApiClient', {
      userPoolClientName: `${prefix}-api-client`,
      authFlows: {
        userPassword: true,
        userSrp: true,
        adminUserPassword: true,
      },
      generateSecret: false,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${prefix}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${prefix}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'CognitoIssuerUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'Cognito issuer URL — use as JWKS base and token issuer',
    });
  }
}

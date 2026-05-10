import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface ServerlessStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly notificationsQueue: sqs.IQueue;
  readonly vpc: ec2.IVpc;
  readonly dbSecret: secretsmanager.ISecret;
  readonly dbEndpoint: string;
  readonly dbPort: string;
  readonly userPool: cognito.IUserPool;
  readonly userPoolClientId: string;
}

/**
 * ServerlessStack — Lambdas MVP para QR y notificaciones.
 */
export class ServerlessStack extends cdk.Stack {
  public readonly notificationHandlerFunction: lambda.IFunction;
  public readonly qrHandlerFunction: lambda.IFunction;

  constructor(scope: Construct, id: string, props: ServerlessStackProps) {
    super(scope, id, props);

    const removalPolicy = props.config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    const prefix = `${props.config.projectName}-${props.config.envName}`;

    // Lambda functions placed in the VPC (public subnet) to reach RDS.
    // VPC Interface Endpoints for secretsmanager + cognito-idp provide API
    // access without internet (Lambda ENIs in VPC do not get public IPs).
    const lambdaSg = new ec2.SecurityGroup(this, 'LambdaSg', {
      vpc: props.vpc,
      description: `${prefix} Lambda functions`,
      allowAllOutbound: true,
    });

    const qrHandler = new lambda.Function(this, 'QrHandlerFunction', {
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('lambda/qr-handler', {
        exclude: ['*.d.ts', '*.ts', 'index.mjs', '.gitkeep'],
      }),
      environment: {
        ENV_NAME: props.config.envName,
        PROJECT_NAME: props.config.projectName,
        DB_HOST: props.dbEndpoint,
        DB_PORT: props.dbPort,
        DB_NAME: 'yapepay_qr',
        DB_SSL: 'true',
        DB_SECRET_ARN: props.dbSecret.secretArn,
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_CLIENT_ID: props.userPoolClientId,
        INTERNAL_API_KEY: props.config.internalApiKey,
      },
      functionName: this.buildFunctionName(props.config, 'qr-handler'),
      handler: 'lambda.handler',
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      allowPublicSubnet: true,
      securityGroups: [lambdaSg],
      logGroup: this.createLogGroup(
        'QrHandlerLogGroup',
        this.buildFunctionName(props.config, 'qr-handler'),
        removalPolicy,
      ),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
    });
    this.qrHandlerFunction = qrHandler;
    props.dbSecret.grantRead(qrHandler);

    const notificationHandler = new lambda.Function(this, 'NotificationHandlerFunction', {
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('lambda/notification-handler', {
        exclude: ['*.d.ts', '*.ts', 'index.mjs', '.gitkeep'],
      }),
      environment: {
        ENV_NAME: props.config.envName,
        NOTIFICATIONS_QUEUE_URL: props.notificationsQueue.queueUrl,
        PROJECT_NAME: props.config.projectName,
      },
      functionName: this.buildFunctionName(props.config, 'notification-handler'),
      handler: 'lambda.handler',
      logGroup: this.createLogGroup(
        'NotificationHandlerLogGroup',
        this.buildFunctionName(props.config, 'notification-handler'),
        removalPolicy,
      ),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
    });
    this.notificationHandlerFunction = notificationHandler;

    notificationHandler.addEventSource(
      new eventSources.SqsEventSource(props.notificationsQueue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );

    new cdk.CfnOutput(this, 'QrHandlerFunctionName', {
      description: 'Nombre de la Lambda MVP para generación de QR.',
      value: qrHandler.functionName,
    });

    new cdk.CfnOutput(this, 'QrHandlerFunctionArn', {
      description: 'ARN de la Lambda MVP para generación de QR.',
      value: qrHandler.functionArn,
    });

    new cdk.CfnOutput(this, 'NotificationHandlerFunctionName', {
      description: 'Nombre de la Lambda MVP para procesamiento de notificaciones.',
      value: notificationHandler.functionName,
    });

    new cdk.CfnOutput(this, 'NotificationHandlerFunctionArn', {
      description: 'ARN de la Lambda MVP para procesamiento de notificaciones.',
      value: notificationHandler.functionArn,
    });
  }

  private createLogGroup(
    id: string,
    functionName: string,
    removalPolicy: cdk.RemovalPolicy,
  ): logs.LogGroup {
    return new logs.LogGroup(this, id, {
      logGroupName: `/aws/lambda/${functionName}`,
      removalPolicy,
      retention: logs.RetentionDays.ONE_WEEK,
    });
  }

  private buildFunctionName(config: EnvironmentConfig, suffix: string): string {
    return `${config.projectName}-${config.envName}-${suffix}`;
  }
}

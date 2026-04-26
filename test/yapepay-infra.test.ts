import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { devConfig } from '../lib/config/dev.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { MessagingStack } from '../lib/stacks/messaging-stack.js';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';
import { SecurityStack } from '../lib/stacks/security-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

/**
 * Smoke test: garantiza que la configuración base se carga. Se irán agregando
 * tests reales por stack a medida que cada uno se implemente.
 */
test('devConfig se carga con valores esperados', () => {
  expect(devConfig.projectName).toBe('yapepay');
  expect(devConfig.envName).toBe('dev');
  expect(devConfig.region).toBe('us-east-1');
  expect(devConfig.removalPolicyDestroy).toBe(true);
  expect(devConfig.tags.ManagedBy).toBe('cdk');
});

test('SecurityStack sintetiza una clave KMS compartida con rotación', () => {
  const template = synthSecurityTemplate();

  template.resourceCountIs('AWS::KMS::Key', 1);
  template.resourceCountIs('AWS::KMS::Alias', 1);
  template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  template.hasResourceProperties('AWS::KMS::Key', {
    Description: 'Clave KMS compartida para yapepay dev.',
    EnableKeyRotation: true,
    PendingWindowInDays: 7,
  });
  template.hasResourceProperties('AWS::KMS::Alias', {
    AliasName: 'alias/yapepay/dev',
    TargetKeyId: Match.anyValue(),
  });
});

test('SecurityStack expone outputs de la clave KMS compartida', () => {
  const template = synthSecurityTemplate();

  template.hasOutput('SharedSecurityKeyArn', {
    Value: Match.anyValue(),
  });
  template.hasOutput('SharedSecurityKeyAliasName', {
    Value: 'alias/yapepay/dev',
  });
});

test('StorageStack sintetiza dos buckets S3 seguros', () => {
  const template = synthStorageTemplate();

  template.resourceCountIs('AWS::S3::Bucket', 2);
  template.allResourcesProperties('AWS::S3::Bucket', {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: Match.arrayWith([
        Match.objectLike({
          BucketKeyEnabled: true,
          ServerSideEncryptionByDefault: Match.objectLike({
            KMSMasterKeyID: Match.anyValue(),
            SSEAlgorithm: 'aws:kms',
          }),
        }),
      ]),
    },
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    VersioningConfiguration: {
      Status: 'Enabled',
    },
  });
});

test('StorageStack configura lifecycle rules para controlar costos en dev', () => {
  const template = synthStorageTemplate();

  template.allResourcesProperties('AWS::S3::Bucket', {
    LifecycleConfiguration: {
      Rules: Match.arrayWith([
        Match.objectLike({
          AbortIncompleteMultipartUpload: {
            DaysAfterInitiation: 7,
          },
          Status: 'Enabled',
        }),
        Match.objectLike({
          NoncurrentVersionExpiration: {
            NoncurrentDays: 30,
          },
          Status: 'Enabled',
        }),
        Match.objectLike({
          ExpirationInDays: 90,
          Status: 'Enabled',
        }),
      ]),
    },
  });
});

test('StorageStack fuerza SSL con bucket policies', () => {
  const template = synthStorageTemplate();
  const policies = Object.values(template.findResources('AWS::S3::BucketPolicy'));

  template.resourceCountIs('AWS::S3::BucketPolicy', 2);

  for (const policy of policies) {
    expect(policy.Properties.PolicyDocument.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Action: 's3:*',
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
          Effect: 'Deny',
          Principal: {
            AWS: '*',
          },
        }),
      ]),
    );
  }
});

test('StorageStack expone outputs para nombres y ARNs de buckets', () => {
  const template = synthStorageTemplate();

  template.hasOutput('KycDocumentsBucketName', {
    Value: Match.anyValue(),
  });
  template.hasOutput('KycDocumentsBucketArn', {
    Value: Match.anyValue(),
  });
  template.hasOutput('ReceiptsBucketName', {
    Value: Match.anyValue(),
  });
  template.hasOutput('ReceiptsBucketArn', {
    Value: Match.anyValue(),
  });
});

test('MessagingStack sintetiza colas SQS para transacciones y notificaciones', () => {
  const template = synthMessagingTemplate();

  template.resourceCountIs('AWS::SQS::Queue', 4);
  template.allResourcesProperties('AWS::SQS::Queue', {
    KmsDataKeyReusePeriodSeconds: 300,
    KmsMasterKeyId: Match.anyValue(),
    MessageRetentionPeriod: 1209600,
    VisibilityTimeout: 60,
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    ContentBasedDeduplication: true,
    FifoQueue: true,
    QueueName: 'yapepay-dev-transaction-events.fifo',
    RedrivePolicy: {
      deadLetterTargetArn: Match.anyValue(),
      maxReceiveCount: 5,
    },
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    ContentBasedDeduplication: true,
    FifoQueue: true,
    QueueName: 'yapepay-dev-transaction-events-dlq.fifo',
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    QueueName: 'yapepay-dev-notifications-queue',
    RedrivePolicy: {
      deadLetterTargetArn: Match.anyValue(),
      maxReceiveCount: 5,
    },
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    QueueName: 'yapepay-dev-notifications-dlq',
  });
});

test('MessagingStack fuerza SSL con queue policies', () => {
  const template = synthMessagingTemplate();
  const policies = Object.values(template.findResources('AWS::SQS::QueuePolicy'));

  template.resourceCountIs('AWS::SQS::QueuePolicy', 4);

  for (const policy of policies) {
    expect(policy.Properties.PolicyDocument.Statement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Action: 'sqs:*',
          Condition: {
            Bool: {
              'aws:SecureTransport': 'false',
            },
          },
          Effect: 'Deny',
          Principal: {
            AWS: '*',
          },
        }),
      ]),
    );
  }
});

test('MessagingStack expone outputs para URLs y ARNs principales', () => {
  const template = synthMessagingTemplate();

  template.hasOutput('TransactionEventsQueueUrl', {
    Value: Match.anyValue(),
  });
  template.hasOutput('TransactionEventsQueueArn', {
    Value: Match.anyValue(),
  });
  template.hasOutput('TransactionEventsDlqUrl', {
    Value: Match.anyValue(),
  });
  template.hasOutput('NotificationsQueueUrl', {
    Value: Match.anyValue(),
  });
  template.hasOutput('NotificationsQueueArn', {
    Value: Match.anyValue(),
  });
  template.hasOutput('NotificationsDlqUrl', {
    Value: Match.anyValue(),
  });
});

test('ServerlessStack sintetiza Lambdas MVP con configuración básica', () => {
  const template = synthServerlessTemplate();

  template.resourceCountIs('AWS::Lambda::Function', 2);
  template.allResourcesProperties('AWS::Lambda::Function', {
    Architectures: ['arm64'],
    Handler: 'index.handler',
    MemorySize: 128,
    Runtime: 'nodejs22.x',
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        ENV_NAME: 'dev',
        PROJECT_NAME: 'yapepay',
      }),
    },
    FunctionName: 'yapepay-dev-qr-handler',
    Timeout: 10,
  });
  template.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: Match.objectLike({
        ENV_NAME: 'dev',
        NOTIFICATIONS_QUEUE_URL: Match.anyValue(),
        PROJECT_NAME: 'yapepay',
      }),
    },
    FunctionName: 'yapepay-dev-notification-handler',
    TracingConfig: {
      Mode: 'Active',
    },
    Timeout: 30,
  });
});

test('ServerlessStack crea log groups con retención corta para dev', () => {
  const template = synthServerlessTemplate();

  template.resourceCountIs('AWS::Logs::LogGroup', 2);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/yapepay-dev-qr-handler',
    RetentionInDays: 7,
  });
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/yapepay-dev-notification-handler',
    RetentionInDays: 7,
  });
});

test('ServerlessStack conecta notification-handler a la cola de notificaciones', () => {
  const template = synthServerlessTemplate();

  template.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);
  template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    EventSourceArn: Match.anyValue(),
    FunctionResponseTypes: ['ReportBatchItemFailures'],
  });
});

test('ServerlessStack expone outputs para nombres y ARNs de Lambdas', () => {
  const template = synthServerlessTemplate();

  template.hasOutput('QrHandlerFunctionName', {
    Value: Match.anyValue(),
  });
  template.hasOutput('QrHandlerFunctionArn', {
    Value: Match.anyValue(),
  });
  template.hasOutput('NotificationHandlerFunctionName', {
    Value: Match.anyValue(),
  });
  template.hasOutput('NotificationHandlerFunctionArn', {
    Value: Match.anyValue(),
  });
});

test('ApiStack sintetiza HTTP API con CORS controlado', () => {
  const template = synthApiTemplate();

  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: {
      AllowHeaders: ['authorization', 'content-type', 'x-amzn-trace-id', 'x-requested-with'],
      AllowMethods: ['OPTIONS', 'POST'],
      AllowOrigins: ['http://localhost:3000', 'http://localhost:5173'],
      MaxAge: 3600,
    },
    Name: 'yapepay-dev-http-api',
    ProtocolType: 'HTTP',
  });
});

test('ApiStack configura POST /v1/qr hacia Lambda', () => {
  const template = synthApiTemplate();

  template.resourceCountIs('AWS::ApiGatewayV2::Integration', 1);
  template.resourceCountIs('AWS::ApiGatewayV2::Route', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
    IntegrationType: 'AWS_PROXY',
    PayloadFormatVersion: '2.0',
  });
  template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
    AuthorizationType: 'NONE',
    RouteKey: 'POST /v1/qr',
    Target: Match.anyValue(),
  });
});

test('ApiStack configura stage con throttling y access logs', () => {
  const template = synthApiTemplate();

  template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
  template.resourceCountIs('AWS::Logs::LogGroup', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
    AccessLogSettings: {
      DestinationArn: Match.anyValue(),
      Format: Match.anyValue(),
    },
    AutoDeploy: true,
    DefaultRouteSettings: {
      DetailedMetricsEnabled: true,
      ThrottlingBurstLimit: 10,
      ThrottlingRateLimit: 2,
    },
    StageName: '$default',
  });
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/apigateway/yapepay-dev-http-api',
    RetentionInDays: 7,
  });
});

test('ApiStack expone outputs para URL, ID y ruta QR', () => {
  const template = synthApiTemplate();

  template.hasOutput('HttpApiId', {
    Value: Match.anyValue(),
  });
  template.hasOutput('HttpApiUrl', {
    Value: Match.anyValue(),
  });
  template.hasOutput('QrRoutePath', {
    Value: 'POST /v1/qr',
  });
});

test('ObservabilityStack sintetiza dashboard, topic y alarmas base', () => {
  const template = synthObservabilityTemplate();

  template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  template.resourceCountIs('AWS::SNS::Topic', 1);
  template.resourceCountIs('AWS::CloudWatch::Alarm', 6);
  template.hasResourceProperties('AWS::CloudWatch::Dashboard', {
    DashboardName: 'yapepay-dev-mvp-dashboard',
  });
  template.hasResourceProperties('AWS::SNS::Topic', {
    DisplayName: 'yapepay-dev-observability-alarms',
    TopicName: 'yapepay-dev-observability-alarms',
  });
});

test('ObservabilityStack configura alarmas de API, Lambdas y DLQs', () => {
  const template = synthObservabilityTemplate();

  template.allResourcesProperties('AWS::CloudWatch::Alarm', {
    EvaluationPeriods: 1,
    TreatMissingData: 'notBreaching',
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'yapepay-dev-http-api-5xx-rate',
    ComparisonOperator: 'GreaterThanThreshold',
    Threshold: 1,
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'yapepay-dev-http-api-p95-latency',
    ComparisonOperator: 'GreaterThanThreshold',
    Threshold: 500,
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'yapepay-dev-qr-handler-errors',
    ComparisonOperator: 'GreaterThanThreshold',
    Threshold: 5,
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'yapepay-dev-notifications-dlq-visible-messages',
    ComparisonOperator: 'GreaterThanThreshold',
    Threshold: 0,
  });
});

test('ObservabilityStack expone outputs del dashboard y topic de alarmas', () => {
  const template = synthObservabilityTemplate();

  template.hasOutput('ObservabilityDashboardName', {
    Value: Match.anyValue(),
  });
  template.hasOutput('ObservabilityAlarmTopicArn', {
    Value: Match.anyValue(),
  });
});

test('cdk.App sintetiza los stacks MVP implementados desde pruebas', () => {
  const app = new cdk.App();
  const securityStack = new SecurityStack(app, 'TestSecurityStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  new StorageStack(app, 'TestStorageStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  const messagingStack = new MessagingStack(app, 'TestMessagingStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  const serverlessStack = new ServerlessStack(app, 'TestServerlessStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    notificationsQueue: messagingStack.notificationsQueue,
  });
  const apiStack = new ApiStack(app, 'TestApiStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    qrHandlerFunction: serverlessStack.qrHandlerFunction,
  });
  new ObservabilityStack(app, 'TestObservabilityStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    httpApi: apiStack.httpApi,
    notificationHandlerFunction: serverlessStack.notificationHandlerFunction,
    notificationsDlq: messagingStack.notificationsDlq,
    notificationsQueue: messagingStack.notificationsQueue,
    qrHandlerFunction: serverlessStack.qrHandlerFunction,
    transactionEventsDlq: messagingStack.transactionEventsDlq,
    transactionEventsQueue: messagingStack.transactionEventsQueue,
  });

  const assembly = app.synth();
  expect(assembly.stacks.length).toBe(6);
});

function synthSecurityTemplate(): Template {
  const app = new cdk.App();
  const stack = createTestSecurityStack(app);

  return Template.fromStack(stack);
}

function createTestSecurityStack(app: cdk.App): SecurityStack {
  return new SecurityStack(app, 'TestSecurityStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
}

function synthStorageTemplate(): Template {
  const app = new cdk.App();
  const securityStack = createTestSecurityStack(app);
  const stack = new StorageStack(app, 'TestStorageStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });

  return Template.fromStack(stack);
}

function synthMessagingTemplate(): Template {
  const app = new cdk.App();
  const securityStack = createTestSecurityStack(app);
  const stack = new MessagingStack(app, 'TestMessagingStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });

  return Template.fromStack(stack);
}

function synthServerlessTemplate(): Template {
  const app = new cdk.App();
  const securityStack = createTestSecurityStack(app);
  const messagingStack = new MessagingStack(app, 'TestMessagingStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  const stack = new ServerlessStack(app, 'TestServerlessStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    notificationsQueue: messagingStack.notificationsQueue,
  });

  return Template.fromStack(stack);
}

function synthApiTemplate(): Template {
  const app = new cdk.App();
  const securityStack = createTestSecurityStack(app);
  const messagingStack = new MessagingStack(app, 'TestMessagingStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  const serverlessStack = new ServerlessStack(app, 'TestServerlessStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    notificationsQueue: messagingStack.notificationsQueue,
  });
  const stack = new ApiStack(app, 'TestApiStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    qrHandlerFunction: serverlessStack.qrHandlerFunction,
  });

  return Template.fromStack(stack);
}

function synthObservabilityTemplate(): Template {
  const app = new cdk.App();
  const securityStack = createTestSecurityStack(app);
  const messagingStack = new MessagingStack(app, 'TestMessagingStack', {
    config: devConfig,
    encryptionKey: securityStack.sharedKey,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
  });
  const serverlessStack = new ServerlessStack(app, 'TestServerlessStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    notificationsQueue: messagingStack.notificationsQueue,
  });
  const apiStack = new ApiStack(app, 'TestApiStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    qrHandlerFunction: serverlessStack.qrHandlerFunction,
  });
  const stack = new ObservabilityStack(app, 'TestObservabilityStack', {
    config: devConfig,
    env: {
      account: '123456789012',
      region: devConfig.region,
    },
    httpApi: apiStack.httpApi,
    notificationHandlerFunction: serverlessStack.notificationHandlerFunction,
    notificationsDlq: messagingStack.notificationsDlq,
    notificationsQueue: messagingStack.notificationsQueue,
    qrHandlerFunction: serverlessStack.qrHandlerFunction,
    transactionEventsDlq: messagingStack.transactionEventsDlq,
    transactionEventsQueue: messagingStack.transactionEventsQueue,
  });

  return Template.fromStack(stack);
}

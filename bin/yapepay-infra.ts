#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { devConfig } from '../lib/config/dev.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { AuthStack } from '../lib/stacks/auth-stack.js';
import { DatabaseStack } from '../lib/stacks/database-stack.js';
import { MessagingStack } from '../lib/stacks/messaging-stack.js';
import { NetworkStack } from '../lib/stacks/network-stack.js';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';
import { SecurityStack } from '../lib/stacks/security-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { ServicesStack } from '../lib/stacks/services-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? devConfig.region,
};

for (const [key, value] of Object.entries(devConfig.tags)) {
  cdk.Tags.of(app).add(key, value);
}

// ── Auth (Cognito) ────────────────────────────────────────────────────────────
const authStack = new AuthStack(app, 'YapepayDevAuthStack', {
  config: devConfig,
  env,
});

// ── Networking ───────────────────────────────────────────────────────────────
const networkStack = new NetworkStack(app, 'YapepayDevNetworkStack', {
  config: devConfig,
  env,
});

// ── Security ─────────────────────────────────────────────────────────────────
const securityStack = new SecurityStack(app, 'YapepayDevSecurityStack', {
  config: devConfig,
  env,
});

// ── Storage ───────────────────────────────────────────────────────────────────
new StorageStack(app, 'YapepayDevStorageStack', {
  config: devConfig,
  encryptionKey: securityStack.sharedKey,
  env,
});

// ── Messaging ─────────────────────────────────────────────────────────────────
const messagingStack = new MessagingStack(app, 'YapepayDevMessagingStack', {
  config: devConfig,
  encryptionKey: securityStack.sharedKey,
  env,
});

// ── Serverless (Lambda) ───────────────────────────────────────────────────────
const serverlessStack = new ServerlessStack(app, 'YapepayDevServerlessStack', {
  config: devConfig,
  env,
  notificationsQueue: messagingStack.notificationsQueue,
});

// ── API Gateway ───────────────────────────────────────────────────────────────
const apiStack = new ApiStack(app, 'YapepayDevApiStack', {
  config: devConfig,
  env,
  qrHandlerFunction: serverlessStack.qrHandlerFunction,
});

// ── Observability ─────────────────────────────────────────────────────────────
new ObservabilityStack(app, 'YapepayDevObservabilityStack', {
  config: devConfig,
  env,
  httpApi: apiStack.httpApi,
  notificationHandlerFunction: serverlessStack.notificationHandlerFunction,
  notificationsDlq: messagingStack.notificationsDlq,
  notificationsQueue: messagingStack.notificationsQueue,
  qrHandlerFunction: serverlessStack.qrHandlerFunction,
  transactionEventsDlq: messagingStack.transactionEventsDlq,
  transactionEventsQueue: messagingStack.transactionEventsQueue,
});

// ── Database (RDS PostgreSQL) ─────────────────────────────────────────────────
const databaseStack = new DatabaseStack(app, 'YapepayDevDatabaseStack', {
  config: devConfig,
  env,
  vpc: networkStack.vpc,
});

// ── Container Services (ECS Fargate + Lambda via ALB) ────────────────────────
new ServicesStack(app, 'YapepayDevServicesStack', {
  config: devConfig,
  env,
  vpc: networkStack.vpc,
  qrHandlerFunction: serverlessStack.qrHandlerFunction,
  userPool: authStack.userPool,
  userPoolClientId: authStack.userPoolClient.userPoolClientId,
  dbSecret: databaseStack.dbSecret,
  dbSecurityGroup: databaseStack.dbSecurityGroup,
  dbEndpoint: databaseStack.dbEndpoint,
  dbPort: databaseStack.dbPort,
});

app.synth();

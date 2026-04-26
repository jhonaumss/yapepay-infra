#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { devConfig } from '../lib/config/dev.js';
import { ApiStack } from '../lib/stacks/api-stack.js';
import { MessagingStack } from '../lib/stacks/messaging-stack.js';
import { ObservabilityStack } from '../lib/stacks/observability-stack.js';
import { SecurityStack } from '../lib/stacks/security-stack.js';
import { ServerlessStack } from '../lib/stacks/serverless-stack.js';
import { StorageStack } from '../lib/stacks/storage-stack.js';

/**
 * Entrypoint CDK de yapepay-infra.
 *
 * Esta fase instancia los stacks reales del MVP inicial.
 *
 * A medida que se implementen los siguientes stacks post-MVP, deberán
 * instanciarse a continuación —preferentemente vía `YapepayInfraStage`—
 * usando `devConfig` como fuente de configuración.
 */

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? devConfig.region,
};

// Tags globales — se aplican al árbol completo del App.
for (const [key, value] of Object.entries(devConfig.tags)) {
  cdk.Tags.of(app).add(key, value);
}

const securityStack = new SecurityStack(app, 'YapepayDevSecurityStack', {
  config: devConfig,
  env,
});

new StorageStack(app, 'YapepayDevStorageStack', {
  config: devConfig,
  encryptionKey: securityStack.sharedKey,
  env,
});

const messagingStack = new MessagingStack(app, 'YapepayDevMessagingStack', {
  config: devConfig,
  encryptionKey: securityStack.sharedKey,
  env,
});

const serverlessStack = new ServerlessStack(app, 'YapepayDevServerlessStack', {
  config: devConfig,
  env,
  notificationsQueue: messagingStack.notificationsQueue,
});

const apiStack = new ApiStack(app, 'YapepayDevApiStack', {
  config: devConfig,
  env,
  qrHandlerFunction: serverlessStack.qrHandlerFunction,
});

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

// ---------------------------------------------------------------------------
// Stacks futuros (placeholders) — comentados a propósito.
// Descomentar y reemplazar por la implementación real cuando corresponda.
// ---------------------------------------------------------------------------
//
// ...

app.synth();

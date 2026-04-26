import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface MessagingStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly encryptionKey: kms.IKey;
}

/**
 * MessagingStack — SQS base del MVP para eventos transaccionales y
 * notificaciones desacopladas.
 */
export class MessagingStack extends cdk.Stack {
  public readonly notificationsDlq: sqs.IQueue;
  public readonly notificationsQueue: sqs.IQueue;
  public readonly transactionEventsDlq: sqs.IQueue;
  public readonly transactionEventsQueue: sqs.IQueue;

  constructor(scope: Construct, id: string, props: MessagingStackProps) {
    super(scope, id, props);

    const removalPolicy = props.config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    const commonQueueProps: Omit<sqs.QueueProps, 'deadLetterQueue' | 'fifo' | 'queueName'> = {
      dataKeyReuse: cdk.Duration.minutes(5),
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: props.encryptionKey,
      enforceSSL: true,
      removalPolicy,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.seconds(60),
    };

    const transactionEventsDlq = new sqs.Queue(this, 'TransactionEventsDlq', {
      ...commonQueueProps,
      contentBasedDeduplication: true,
      fifo: true,
      queueName: this.buildQueueName(props.config, 'transaction-events-dlq.fifo'),
    });
    this.transactionEventsDlq = transactionEventsDlq;

    const transactionEventsQueue = new sqs.Queue(this, 'TransactionEventsQueue', {
      ...commonQueueProps,
      contentBasedDeduplication: true,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: transactionEventsDlq,
      },
      fifo: true,
      queueName: this.buildQueueName(props.config, 'transaction-events.fifo'),
    });
    this.transactionEventsQueue = transactionEventsQueue;

    const notificationsDlq = new sqs.Queue(this, 'NotificationsDlq', {
      ...commonQueueProps,
      queueName: this.buildQueueName(props.config, 'notifications-dlq'),
    });
    this.notificationsDlq = notificationsDlq;

    const notificationsQueue = new sqs.Queue(this, 'NotificationsQueue', {
      ...commonQueueProps,
      deadLetterQueue: {
        maxReceiveCount: 5,
        queue: notificationsDlq,
      },
      queueName: this.buildQueueName(props.config, 'notifications-queue'),
    });
    this.notificationsQueue = notificationsQueue;

    new cdk.CfnOutput(this, 'TransactionEventsQueueUrl', {
      description: 'URL de la cola FIFO de eventos de transacción.',
      value: transactionEventsQueue.queueUrl,
    });

    new cdk.CfnOutput(this, 'TransactionEventsQueueArn', {
      description: 'ARN de la cola FIFO de eventos de transacción.',
      value: transactionEventsQueue.queueArn,
    });

    new cdk.CfnOutput(this, 'TransactionEventsDlqUrl', {
      description: 'URL de la DLQ FIFO de eventos de transacción.',
      value: transactionEventsDlq.queueUrl,
    });

    new cdk.CfnOutput(this, 'NotificationsQueueUrl', {
      description: 'URL de la cola Standard para notificaciones.',
      value: notificationsQueue.queueUrl,
    });

    new cdk.CfnOutput(this, 'NotificationsQueueArn', {
      description: 'ARN de la cola Standard para notificaciones.',
      value: notificationsQueue.queueArn,
    });

    new cdk.CfnOutput(this, 'NotificationsDlqUrl', {
      description: 'URL de la DLQ Standard para notificaciones.',
      value: notificationsDlq.queueUrl,
    });
  }

  private buildQueueName(config: EnvironmentConfig, suffix: string): string {
    return `${config.projectName}-${config.envName}-${suffix}`;
  }
}

import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly httpApi: apigwv2.IHttpApi;
  readonly notificationHandlerFunction: lambda.IFunction;
  readonly notificationsDlq: sqs.IQueue;
  readonly notificationsQueue: sqs.IQueue;
  readonly qrHandlerFunction: lambda.IFunction;
  readonly transactionEventsDlq: sqs.IQueue;
  readonly transactionEventsQueue: sqs.IQueue;
}

/**
 * ObservabilityStack — CloudWatch básico del MVP.
 */
export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const alarmTopic = new sns.Topic(this, 'ObservabilityAlarmTopic', {
      displayName: `${props.config.projectName}-${props.config.envName}-observability-alarms`,
      topicName: `${props.config.projectName}-${props.config.envName}-observability-alarms`,
    });
    const alarmAction = new actions.SnsAction(alarmTopic);

    const apiRequestCount = props.httpApi.metric('Count', {
      label: 'HTTP API requests',
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });
    const api5xxCount = props.httpApi.metric('5xx', {
      label: 'HTTP API 5xx',
      period: cdk.Duration.minutes(5),
      statistic: 'Sum',
    });
    const api5xxRate = new cloudwatch.MathExpression({
      expression: 'IF(requests > 0, 100 * errors / requests, 0)',
      label: 'HTTP API 5xx rate (%)',
      period: cdk.Duration.minutes(5),
      usingMetrics: {
        errors: api5xxCount,
        requests: apiRequestCount,
      },
    });
    const apiP95Latency = props.httpApi.metric('Latency', {
      label: 'HTTP API latency p95',
      period: cdk.Duration.minutes(5),
      statistic: 'p95',
    });

    const api5xxRateAlarm = new cloudwatch.Alarm(this, 'HttpApi5xxRateAlarm', {
      alarmDescription: 'HTTP API 5xx mayor a 1% durante 5 minutos.',
      alarmName: this.buildAlarmName(props.config, 'http-api-5xx-rate'),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      metric: api5xxRate,
      threshold: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const apiP95LatencyAlarm = new cloudwatch.Alarm(this, 'HttpApiP95LatencyAlarm', {
      alarmDescription: 'HTTP API p95 latency mayor a 500 ms durante 5 minutos.',
      alarmName: this.buildAlarmName(props.config, 'http-api-p95-latency'),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      metric: apiP95Latency,
      threshold: 500,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    const qrHandlerErrorsAlarm = this.createLambdaErrorsAlarm(
      'QrHandlerErrorsAlarm',
      props.config,
      props.qrHandlerFunction,
      'qr-handler-errors',
      alarmAction,
    );
    const notificationHandlerErrorsAlarm = this.createLambdaErrorsAlarm(
      'NotificationHandlerErrorsAlarm',
      props.config,
      props.notificationHandlerFunction,
      'notification-handler-errors',
      alarmAction,
    );
    const transactionEventsDlqAlarm = this.createDlqVisibleMessagesAlarm(
      'TransactionEventsDlqVisibleMessagesAlarm',
      props.config,
      props.transactionEventsDlq,
      'transaction-events-dlq-visible-messages',
      alarmAction,
    );
    const notificationsDlqAlarm = this.createDlqVisibleMessagesAlarm(
      'NotificationsDlqVisibleMessagesAlarm',
      props.config,
      props.notificationsDlq,
      'notifications-dlq-visible-messages',
      alarmAction,
    );

    api5xxRateAlarm.addAlarmAction(alarmAction);
    apiP95LatencyAlarm.addAlarmAction(alarmAction);

    const dashboard = new cloudwatch.Dashboard(this, 'MvpDashboard', {
      dashboardName: `${props.config.projectName}-${props.config.envName}-mvp-dashboard`,
    });

    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# ${props.config.projectName} ${props.config.envName} MVP\nCloudWatch básico para API, Lambdas y SQS.`,
        width: 24,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        left: [apiRequestCount, api5xxCount],
        title: 'HTTP API requests and 5xx',
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        left: [apiP95Latency],
        title: 'HTTP API latency p95',
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        left: [
          props.qrHandlerFunction.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.notificationHandlerFunction.metricInvocations({
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        title: 'Lambda invocations',
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        left: [
          props.qrHandlerFunction.metric('Errors', {
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
          props.notificationHandlerFunction.metric('Errors', {
            period: cdk.Duration.minutes(5),
            statistic: 'Sum',
          }),
        ],
        title: 'Lambda errors',
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        left: [
          this.visibleMessagesMetric(props.transactionEventsQueue, 'Transaction queue'),
          this.visibleMessagesMetric(props.notificationsQueue, 'Notifications queue'),
          this.visibleMessagesMetric(props.transactionEventsDlq, 'Transaction DLQ'),
          this.visibleMessagesMetric(props.notificationsDlq, 'Notifications DLQ'),
        ],
        title: 'SQS visible messages',
        width: 24,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.AlarmWidget({
        alarm: api5xxRateAlarm,
        title: 'HTTP API 5xx rate',
        width: 8,
      }),
      new cloudwatch.AlarmWidget({
        alarm: apiP95LatencyAlarm,
        title: 'HTTP API p95 latency',
        width: 8,
      }),
      new cloudwatch.AlarmWidget({
        alarm: qrHandlerErrorsAlarm,
        title: 'QR Lambda errors',
        width: 8,
      }),
    );

    new cdk.CfnOutput(this, 'ObservabilityDashboardName', {
      description: 'Nombre del dashboard CloudWatch del MVP.',
      value: dashboard.dashboardName,
    });

    new cdk.CfnOutput(this, 'ObservabilityAlarmTopicArn', {
      description: 'ARN del SNS topic para alarmas de observabilidad.',
      value: alarmTopic.topicArn,
    });
  }

  private createDlqVisibleMessagesAlarm(
    id: string,
    config: EnvironmentConfig,
    queue: sqs.IQueue,
    alarmSuffix: string,
    alarmAction: actions.SnsAction,
  ): cloudwatch.Alarm {
    const alarm = new cloudwatch.Alarm(this, id, {
      alarmDescription: `DLQ ${queue.queueName} tiene mensajes visibles.`,
      alarmName: this.buildAlarmName(config, alarmSuffix),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      metric: this.visibleMessagesMetric(queue, queue.queueName),
      threshold: 0,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(alarmAction);

    return alarm;
  }

  private createLambdaErrorsAlarm(
    id: string,
    config: EnvironmentConfig,
    lambdaFunction: lambda.IFunction,
    alarmSuffix: string,
    alarmAction: actions.SnsAction,
  ): cloudwatch.Alarm {
    const alarm = new cloudwatch.Alarm(this, id, {
      alarmDescription: `Lambda ${lambdaFunction.functionName} superó 5 errores en 5 minutos.`,
      alarmName: this.buildAlarmName(config, alarmSuffix),
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      metric: lambdaFunction.metric('Errors', {
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(alarmAction);

    return alarm;
  }

  private visibleMessagesMetric(queue: sqs.IQueue, label: string): cloudwatch.Metric {
    return new cloudwatch.Metric({
      dimensionsMap: {
        QueueName: queue.queueName,
      },
      label,
      metricName: 'ApproximateNumberOfMessagesVisible',
      namespace: 'AWS/SQS',
      period: cdk.Duration.minutes(5),
      statistic: 'Maximum',
    });
  }

  private buildAlarmName(config: EnvironmentConfig, suffix: string): string {
    return `${config.projectName}-${config.envName}-${suffix}`;
  }
}

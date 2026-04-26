import * as cdk from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface ApiStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly qrHandlerFunction: lambda.IFunction;
}

/**
 * ApiStack — HTTP API v2 inicial del MVP.
 */
export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.IHttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const removalPolicy = props.config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    const accessLogGroup = new logs.LogGroup(this, 'HttpApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/${props.config.projectName}-${props.config.envName}-http-api`,
      removalPolicy,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${props.config.projectName}-${props.config.envName}-http-api`,
      corsPreflight: {
        allowHeaders: [
          'authorization',
          'content-type',
          'x-amzn-trace-id',
          'x-requested-with',
        ],
        allowMethods: [apigwv2.CorsHttpMethod.OPTIONS, apigwv2.CorsHttpMethod.POST],
        allowOrigins: ['http://localhost:3000', 'http://localhost:5173'],
        maxAge: cdk.Duration.hours(1),
      },
      createDefaultStage: false,
      description: 'HTTP API MVP de YapePay.',
    });
    this.httpApi = httpApi;

    new apigwv2.HttpStage(this, 'DefaultStage', {
      accessLogSettings: {
        destination: new apigwv2.LogGroupLogDestination(accessLogGroup),
        format: apigw.AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: false,
        }),
      },
      autoDeploy: true,
      detailedMetricsEnabled: true,
      httpApi,
      throttle: {
        burstLimit: 10,
        rateLimit: 2,
      },
    });

    const qrIntegration = new HttpLambdaIntegration(
      'QrHandlerIntegration',
      props.qrHandlerFunction,
    );

    httpApi.addRoutes({
      integration: qrIntegration,
      methods: [apigwv2.HttpMethod.POST],
      path: '/v1/qr',
    });

    new cdk.CfnOutput(this, 'HttpApiId', {
      description: 'ID del HTTP API MVP de YapePay.',
      value: httpApi.apiId,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      description: 'URL base del HTTP API MVP de YapePay.',
      value: httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'QrRoutePath', {
      description: 'Ruta MVP para generación de QR.',
      value: 'POST /v1/qr',
    });
  }
}

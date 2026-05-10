import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

// Microservices deployed as ECS Fargate containers.
// qr-service runs as a Lambda behind the same ALB.
// notification-service is a pure SQS consumer — no HTTP interface.
const FARGATE_SERVICES = ['user', 'wallet', 'transaction'] as const;
export type FargateServiceName = (typeof FARGATE_SERVICES)[number];

const CONTAINER_PORT = 3000;

// Path-based routing rules on the shared ALB listener.
// wallet handles two distinct prefixes; priority must be unique per listener.
const SERVICE_ROUTES: Record<FargateServiceName, { paths: string[]; priority: number }> = {
  user:        { paths: ['/v1/usuarios*'],                    priority: 10 },
  wallet:      { paths: ['/v1/billeteras*', '/v1/recargas*'], priority: 20 },
  transaction: { paths: ['/v1/transacciones*'],               priority: 30 },
};

// Each service connects to its own logical database on the shared RDS instance
const SERVICE_DB_NAMES: Record<FargateServiceName, string> = {
  user:        'yapepay_users',
  wallet:      'yapepay_wallets',
  transaction: 'yapepay_transactions',
};

interface ServicesStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
  qrHandlerFunction: lambda.IFunction;
  userPool: cognito.IUserPool;
  userPoolClientId: string;
  dbSecret: secretsmanager.ISecret;
  dbEndpoint: string;
  dbPort: string;
  notificationsQueue: sqs.IQueue;
}

export class ServicesStack extends cdk.Stack {
  readonly cluster: ecs.Cluster;
  readonly repositories: Record<FargateServiceName, ecr.Repository>;
  readonly taskExecutionRole: iam.Role;
  readonly fargateServices: Record<FargateServiceName, ecs.FargateService>;
  readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ServicesStackProps) {
    super(scope, id, props);
    const { config } = props;
    const prefix = `${config.projectName}-${config.envName}`;

    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: `${prefix}-cluster`,
      vpc: props.vpc,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    this.taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${prefix}-ecs-task-exec-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    // Task role: used by application code to call AWS APIs (Cognito Admin)
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: `${prefix}-ecs-task-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminSetUserPassword',
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: [props.userPool.userPoolArn],
    }));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'ssmmessages:CreateControlChannel',
        'ssmmessages:CreateDataChannel',
        'ssmmessages:OpenControlChannel',
        'ssmmessages:OpenDataChannel',
      ],
      resources: ['*'],
    }));
    props.notificationsQueue.grantSendMessages(taskRole);

    // ALB: accepts public HTTP traffic
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc: props.vpc,
      description: `${prefix} ALB`,
      allowAllOutbound: true,
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    // Tasks: only accept traffic from the ALB, not directly from the internet
    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc: props.vpc,
      description: `${prefix} Fargate tasks`,
      allowAllOutbound: true,
    });
    taskSg.addIngressRule(albSg, ec2.Port.tcp(CONTAINER_PORT));

    // Execution role must be able to pull the DB secret at task startup
    props.dbSecret.grantRead(this.taskExecutionRole);

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: `${prefix}-alb`,
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: albSg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // Single HTTP listener; default action returns 404 for unmatched paths
    const listener = this.alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: '{"error":"route not found"}',
      }),
    });

    // qr-service: Lambda target — CDK grants ALB permission to invoke it
    listener.addTargets('QrTargets', {
      targets: [new elbv2targets.LambdaTarget(props.qrHandlerFunction)],
      priority: 40,
      conditions: [elbv2.ListenerCondition.pathPatterns(['/v1/qr*'])],
      healthCheck: {
        enabled: true,
        healthyHttpCodes: '200-499',
      },
    });

    // ECR repositories
    const repoEntries = FARGATE_SERVICES.map(svc => {
      const repo = new ecr.Repository(this, `${svc}-repo`, {
        repositoryName: `${prefix}-${svc}-service`,
        removalPolicy: config.removalPolicyDestroy
          ? cdk.RemovalPolicy.DESTROY
          : cdk.RemovalPolicy.RETAIN,
        emptyOnDelete: config.removalPolicyDestroy,
        lifecycleRules: [{ maxImageCount: 5, description: 'Keep last 5 images' }],
        imageScanOnPush: true,
      });

      new cdk.CfnOutput(this, `${svc}RepoUri`, {
        value: repo.repositoryUri,
        exportName: `${prefix}-${svc}-repo-uri`,
      });

      return [svc, repo] as const;
    });

    this.repositories = Object.fromEntries(repoEntries) as Record<
      FargateServiceName,
      ecr.Repository
    >;

    // Fargate task definitions, services, and ALB target groups
    const serviceEntries = FARGATE_SERVICES.map(svc => {
      const repo = this.repositories[svc];
      const { paths, priority } = SERVICE_ROUTES[svc];

      const taskDef = new ecs.FargateTaskDefinition(this, `${svc}-task`, {
        family: `${prefix}-${svc}`,
        cpu: 256,
        memoryLimitMiB: 512,
        executionRole: this.taskExecutionRole,
        taskRole,
      });

      taskDef.addContainer(`${svc}-container`, {
        // :latest tag — CD pipeline pushes here then calls update-service
        // --force-new-deployment to pick up the new image automatically.
        image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
        portMappings: [{ containerPort: CONTAINER_PORT }],
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: svc,
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          PORT: String(CONTAINER_PORT),
          NODE_ENV: config.envName,
          COGNITO_USER_POOL_ID: props.userPool.userPoolId,
          COGNITO_CLIENT_ID: props.userPoolClientId,
          DB_HOST: props.dbEndpoint,
          DB_PORT: props.dbPort,
          DB_NAME: SERVICE_DB_NAMES[svc],
          DB_SSL: 'true',
          INTERNAL_API_KEY: config.internalApiKey,
          // user-service calls wallet-service through the ALB after registration
          ...(svc === 'user' && {
            WALLET_SERVICE_URL: `http://${this.alb.loadBalancerDnsName}`,
          }),
          // wallet-service resolves phone → userId via user-service for recargas
          ...(svc === 'wallet' && {
            USER_SERVICE_URL: `http://${this.alb.loadBalancerDnsName}`,
          }),
          ...(svc === 'transaction' && {
            USER_SERVICE_URL:   `http://${this.alb.loadBalancerDnsName}`,
            WALLET_SERVICE_URL: `http://${this.alb.loadBalancerDnsName}`,
            QR_SERVICE_URL:     `http://${this.alb.loadBalancerDnsName}`,
            SQS_QUEUE_URL:      props.notificationsQueue.queueUrl,
          }),
        },
        secrets: {
          // DB credentials pulled from Secrets Manager at task startup
          DB_USER:     ecs.Secret.fromSecretsManager(props.dbSecret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, 'password'),
        },
      });

      // desiredCount: 0 so the initial CDK deploy succeeds before any image
      // exists in ECR. The CD pipeline sets --desired-count 1 on first push.
      const service = new ecs.FargateService(this, `${svc}-svc`, {
        cluster: this.cluster,
        taskDefinition: taskDef,
        serviceName: `${prefix}-${svc}-service`,
        desiredCount: 0,
        assignPublicIp: true,
        securityGroups: [taskSg],
        vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
        deploymentController: { type: ecs.DeploymentControllerType.ECS },
        circuitBreaker: { enable: true, rollback: false },
        enableExecuteCommand: true,
      });

      // Wire the service into the ALB listener with path-based routing
      listener.addTargets(`${svc}Targets`, {
        port: CONTAINER_PORT,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [
          service.loadBalancerTarget({
            containerName: `${svc}-container`,
            containerPort: CONTAINER_PORT,
          }),
        ],
        priority,
        conditions: [elbv2.ListenerCondition.pathPatterns(paths)],
        healthCheck: {
          path: '/',
          healthyHttpCodes: '200-499',
          interval: cdk.Duration.seconds(30),
          timeout: cdk.Duration.seconds(10),
          healthyThresholdCount: 2,
          unhealthyThresholdCount: 3,
        },
      });

      return [svc, service] as const;
    });

    this.fargateServices = Object.fromEntries(serviceEntries) as Record<
      FargateServiceName,
      ecs.FargateService
    >;

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: `${prefix}-cluster-name`,
    });

    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: this.taskExecutionRole.roleArn,
      exportName: `${prefix}-task-exec-role-arn`,
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.alb.loadBalancerDnsName,
      exportName: `${prefix}-alb-dns`,
      description: 'Base URL for all services (Fargate + Lambda via ALB)',
    });
  }
}

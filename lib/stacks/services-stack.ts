import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

// Microservices deployed as ECS Fargate containers.
// qr-service and notification-service run as Lambdas (see ServerlessStack).
const FARGATE_SERVICES = ['user', 'wallet', 'transaction'] as const;
export type FargateServiceName = (typeof FARGATE_SERVICES)[number];

const CONTAINER_PORT = 3000;

interface ServicesStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
}

export class ServicesStack extends cdk.Stack {
  readonly cluster: ecs.Cluster;
  readonly repositories: Record<FargateServiceName, ecr.Repository>;
  readonly taskExecutionRole: iam.Role;
  readonly fargateServices: Record<FargateServiceName, ecs.FargateService>;

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

    // Shared security group for all Fargate tasks.
    // Dev uses public subnets (no NAT Gateway), so tasks need a public IP.
    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc: props.vpc,
      description: `${prefix} Fargate tasks`,
      allowAllOutbound: true,
    });
    taskSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(CONTAINER_PORT));

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

    const serviceEntries = FARGATE_SERVICES.map(svc => {
      const repo = this.repositories[svc];

      const taskDef = new ecs.FargateTaskDefinition(this, `${svc}-task`, {
        family: `${prefix}-${svc}`,
        cpu: 256,
        memoryLimitMiB: 512,
        executionRole: this.taskExecutionRole,
      });

      taskDef.addContainer(`${svc}-container`, {
        // Points to :latest so CD pipeline's --force-new-deployment picks up
        // each newly pushed image without needing a task definition update.
        image: ecs.ContainerImage.fromEcrRepository(repo, 'latest'),
        portMappings: [{ containerPort: CONTAINER_PORT }],
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: svc,
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          PORT: String(CONTAINER_PORT),
          NODE_ENV: config.envName,
        },
      });

      // desiredCount: 0 on initial CDK deploy so CloudFormation succeeds
      // even before the first image is pushed to ECR.
      // The CD pipeline sets --desired-count 1 on every deploy.
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
  }
}

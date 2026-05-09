import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

// Microservices deployed as ECS Fargate containers.
// qr-service and notification-service run as Lambdas (see ServerlessStack).
const FARGATE_SERVICES = ['user', 'wallet', 'transaction'] as const;
export type FargateServiceName = (typeof FARGATE_SERVICES)[number];

interface ServicesStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
  vpc: ec2.IVpc;
}

export class ServicesStack extends cdk.Stack {
  readonly cluster: ecs.Cluster;
  readonly repositories: Record<FargateServiceName, ecr.Repository>;
  readonly taskExecutionRole: iam.Role;

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

    const entries = FARGATE_SERVICES.map(svc => {
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

    this.repositories = Object.fromEntries(entries) as Record<
      FargateServiceName,
      ecr.Repository
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

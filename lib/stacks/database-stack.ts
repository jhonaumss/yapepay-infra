import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface DatabaseStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  /** Secret with keys: username, password, host, port, dbname */
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly dbEndpoint: string;
  public readonly dbPort: string;
  /** Expose so ServicesStack can add its task SG as an ingress source */
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
    const { config } = props;
    const prefix = `${config.projectName}-${config.envName}`;

    // Security group with no inbound rules — ServicesStack adds the task SG rule
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc: props.vpc,
      description: `${prefix} RDS PostgreSQL`,
      allowAllOutbound: false,
    });

    const instance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      // db.t3.micro is covered by the AWS Free Tier (750 h/month for 12 months)
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      // Public subnet with publiclyAccessible: false — the SG controls access.
      // Dev has no private subnets to avoid NAT Gateway cost.
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [this.dbSecurityGroup],
      // Single "postgres" DB; each service creates its own DB in migrations
      databaseName: 'postgres',
      credentials: rds.Credentials.fromGeneratedSecret('yapepay', {
        secretName: `${prefix}/db/credentials`,
      }),
      multiAz: false,
      allocatedStorage: 20,
      storageEncrypted: true,
      publiclyAccessible: false,
      removalPolicy: config.removalPolicyDestroy
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      deleteAutomatedBackups: config.removalPolicyDestroy,
    });

    this.dbSecret = instance.secret!;
    this.dbEndpoint = instance.dbInstanceEndpointAddress;
    this.dbPort = instance.dbInstanceEndpointPort;

    new cdk.CfnOutput(this, 'DbEndpoint', {
      value: instance.dbInstanceEndpointAddress,
      exportName: `${prefix}-db-endpoint`,
    });

    new cdk.CfnOutput(this, 'DbPort', {
      value: instance.dbInstanceEndpointPort,
      exportName: `${prefix}-db-port`,
    });

    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: instance.secret!.secretArn,
      exportName: `${prefix}-db-secret-arn`,
      description: 'Secrets Manager ARN — JSON with username/password/host/port/dbname',
    });
  }
}

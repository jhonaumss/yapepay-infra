import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

interface NetworkStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class NetworkStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
    const { config } = props;
    const prefix = `${config.projectName}-${config.envName}`;

    // Dev: public subnets only (no NAT Gateway cost).
    // When enableCostlyResources is true, adds private subnets + 1 NAT Gateway.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `${prefix}-vpc`,
      // Explicit AZs avoid a context lookup (API call) during cdk synth.
      availabilityZones: [`${this.region}a`, `${this.region}b`],
      natGateways: config.features.enableCostlyResources ? 1 : 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        ...(config.features.enableCostlyResources
          ? [
              {
                name: 'private',
                subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                cidrMask: 24,
              },
            ]
          : []),
      ],
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `${prefix}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map((s: ec2.ISubnet) => s.subnetId).join(','),
      exportName: `${prefix}-public-subnet-ids`,
    });
  }
}

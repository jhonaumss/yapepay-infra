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

    // Interface VPC Endpoints — allow Lambda in public subnets to call AWS APIs
    // without internet access (Lambda ENIs in VPC do not receive public IPs).
    new ec2.InterfaceVpcEndpoint(this, 'SecretsManagerEndpoint', {
      vpc: this.vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    new ec2.InterfaceVpcEndpoint(this, 'CognitoUserPoolsEndpoint', {
      vpc: this.vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${this.region}.cognito-idp`),
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
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

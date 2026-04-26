import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { EnvironmentConfig } from '../config/environment.js';

export interface StorageStackProps extends cdk.StackProps {
  readonly config: EnvironmentConfig;
  readonly encryptionKey: kms.IKey;
}

/**
 * StorageStack — S3 buckets base del MVP para documentos KYC y comprobantes.
 */
export class StorageStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const removalPolicy = props.config.removalPolicyDestroy
      ? cdk.RemovalPolicy.DESTROY
      : cdk.RemovalPolicy.RETAIN;

    const commonBucketProps: Omit<s3.BucketProps, 'bucketName'> = {
      autoDeleteObjects: props.config.removalPolicyDestroy,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketKeyEnabled: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.encryptionKey,
      enforceSSL: true,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
          enabled: true,
          id: 'AbortIncompleteMultipartUploads',
        },
        {
          enabled: true,
          id: 'ExpireNoncurrentVersionsAfter30Days',
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
        {
          enabled: props.config.removalPolicyDestroy,
          expiration: cdk.Duration.days(90),
          id: 'ExpireObjectsAfter90DaysInEphemeralEnvironments',
        },
      ],
      removalPolicy,
      versioned: true,
    };

    const kycDocumentsBucket = new s3.Bucket(this, 'KycDocumentsBucket', {
      ...commonBucketProps,
      bucketName: this.buildBucketName(props.config, 'kyc-documents'),
    });

    const receiptsBucket = new s3.Bucket(this, 'ReceiptsBucket', {
      ...commonBucketProps,
      bucketName: this.buildBucketName(props.config, 'receipts'),
    });

    new cdk.CfnOutput(this, 'KycDocumentsBucketName', {
      description: 'Nombre del bucket S3 para documentos KYC.',
      value: kycDocumentsBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'KycDocumentsBucketArn', {
      description: 'ARN del bucket S3 para documentos KYC.',
      value: kycDocumentsBucket.bucketArn,
    });

    new cdk.CfnOutput(this, 'ReceiptsBucketName', {
      description: 'Nombre del bucket S3 para comprobantes PDF.',
      value: receiptsBucket.bucketName,
    });

    new cdk.CfnOutput(this, 'ReceiptsBucketArn', {
      description: 'ARN del bucket S3 para comprobantes PDF.',
      value: receiptsBucket.bucketArn,
    });
  }

  private buildBucketName(config: EnvironmentConfig, suffix: string): string {
    return [
      config.projectName,
      config.envName,
      suffix,
      cdk.Aws.ACCOUNT_ID,
      cdk.Aws.REGION,
    ].join('-');
  }
}

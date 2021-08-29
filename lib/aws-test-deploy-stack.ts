import * as cdk from '@aws-cdk/core';
import { VPC, IGW, PublicSubnet, PrivateSubnet, VPCFlowLog, LinuxBastion } from './util';
import { NetworkBuilder } from '@aws-cdk/aws-ec2/lib/network-util';

export class AwsTestDeployStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new TestVPC(this, "Test", {
      vpcCidrBlock: "10.128.0.0/16",
      availabilityZone: "ap-northeast-1c",
      keyPairName: "",
    });
  }
}

interface TestVPCProps {
  vpcCidrBlock: string;
  availabilityZone: string;
  keyPairName: string;
}

class TestVPC extends cdk.Construct {

  constructor(scope: cdk.Construct, id: string, props: TestVPCProps) {
    super(scope, id);

    var vpcName = id;
    var subnetCidrs = new NetworkBuilder(props.vpcCidrBlock).addSubnets(24, 2);

    // VPC
    var vpc = new VPC(
      this, `${vpcName}_VPC`, {
      vpcName: vpcName,
      cidrBlock: props.vpcCidrBlock,
    }
    );

    // IGW
    var igw = new IGW(
      this, `${vpcName}_IGW`, {
      vpc: vpc.vpc,
      vpcName: vpcName,
    }
    );

    // Public Subnet
    var publicSubnet = new PublicSubnet(
      this, `${vpcName}_PublicSubnet`, {
      index: 1,
      vpc: vpc.vpc,
      vpcName: vpcName,
      cidrBlock: subnetCidrs[0],
      naclCidrBlock: props.vpcCidrBlock,
      availabilityZone: props.availabilityZone,
      igw: igw.igw,
      igwAttachment: igw.igwAttachment,
      allowPorts: [80, 443, 123], // HTTP, HTTPS, NTP
    }
    );

    // Private Subnet
    var privateSubnet = new PrivateSubnet(
      this, `${vpcName}_PrivateSubnet`, {
      index: 1,
      vpc: vpc.vpc,
      vpcName: vpcName,
      cidrBlock: subnetCidrs[1],
      availabilityZone: props.availabilityZone,
      publicSubnet: publicSubnet.subnet,
    }
    );

    // VPCFlowLog
    new VPCFlowLog(scope, `${id}_VPCFlowLog`, {
      vpc: vpc.vpc,
    });

    // Linux Bastion
    new LinuxBastion(
      this, `${vpcName}_LinuxBastion`, {
      vpcName: vpcName,
      subnet: privateSubnet.subnet,
      instanceType: "t2.medium",
      keyPairName: props.keyPairName,
      policies: [],
    });
  }
}


import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as logs from '@aws-cdk/aws-logs';

//
// VPC
//

interface VPCProps {
  vpcName: string;
  cidrBlock: string;
}

export class VPC extends cdk.Construct {
  vpc: ec2.CfnVPC;

  constructor(scope: cdk.Construct, id: string, props: VPCProps) {
    super(scope, id);

    // VPC
    this.vpc = new ec2.CfnVPC(this, "VPC", {
      cidrBlock: props.cidrBlock,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        new cdk.Tag("Name", props.vpcName),
      ]
    });
  }
}

//
// インターネットゲートウェイ
//

interface IGWProps {
  vpcName: string;
  vpc: ec2.CfnVPC;
}

export class IGW extends cdk.Construct {
  igw: ec2.CfnInternetGateway;
  igwAttachment: ec2.CfnVPCGatewayAttachment;

  constructor(scope: cdk.Construct, id: string, props: IGWProps) {
    super(scope, id);

    // IGW
    this.igw = new ec2.CfnInternetGateway(this, `${id}_IGW`, {
      tags: [
        new cdk.Tag("Name", props.vpcName),
      ]
    });

    this.igwAttachment = new ec2.CfnVPCGatewayAttachment(this, `${id}_Attachment`, {
      vpcId: props.vpc.ref,
      internetGatewayId: this.igw.ref,
    });
  }
}

//
// Publicサブネット
//

interface PublicSubnetProps {
  index: number;
  vpc: ec2.CfnVPC;
  vpcName: string;
  cidrBlock: string;
  naclCidrBlock: string; // 通信相手となる全てのVPCを包含するネットワーク
  availabilityZone: string;
  igw: ec2.CfnInternetGateway;
  igwAttachment: ec2.CfnVPCGatewayAttachment;
  allowPorts?: number[];
}

export class PublicSubnet extends cdk.Construct {
  subnet: ec2.CfnSubnet;
  routeTable: ec2.CfnRouteTable;

  constructor(scope: cdk.Construct, id: string, props: PublicSubnetProps) {
    super(scope, id);

    // Public Subnet

    var subnet = new ec2.CfnSubnet(scope, `${id}_Subnet`, {
      vpcId: props.vpc.ref,
      cidrBlock: props.cidrBlock,
      availabilityZone: props.availabilityZone,
      tags: [
        new cdk.Tag("Name", id),
      ]
    });

    var routeTable = new ec2.CfnRouteTable(scope, `${id}_RouteTable`, {
      vpcId: props.vpc.ref,
      tags: [
        new cdk.Tag("Name", id),
      ]
    });

    new ec2.CfnSubnetRouteTableAssociation(scope, `${id}_SubnetRouteTableAssociation`, {
      routeTableId: routeTable.ref,
      subnetId: subnet.ref,
    });

    var route = new ec2.CfnRoute(scope, `${id}_Route`, {
      routeTableId: routeTable.ref,
      destinationCidrBlock: "0.0.0.0/0",
      gatewayId: props.igw.ref, // VPCGatewayAttachment の生成を待つ必要がある
    });
    route.addDependsOn(props.igwAttachment);

    this.subnet = subnet;
    this.routeTable = routeTable;

    if (props.allowPorts == null) return;

    var networkAcl = new ec2.CfnNetworkAcl(scope, `${id}_NetworkAcl`, {
      vpcId: props.vpc.ref,
      tags: [
        new cdk.Tag("Name", id),
      ]
    });

    var index;

    // Ingress (許可するインバウンド通信のみ設定)

    for (index = 0; index < props.allowPorts.length; index++) {
      new ec2.CfnNetworkAclEntry(scope, `${id}_NetworkAclEntryIngress_${props.allowPorts[index]}`, {
        networkAclId: networkAcl.ref,
        ruleNumber: index + 1,
        protocol: 6, // TCP
        ruleAction: "allow",
        egress: false,
        cidrBlock: props.naclCidrBlock,
        portRange: { from: props.allowPorts[index], to: props.allowPorts[index] },
      });
    }

    new ec2.CfnNetworkAclEntry(scope, `${id}_NetworkAclEntryIngress_Response`, {
      networkAclId: networkAcl.ref,
      ruleNumber: (index++) + 1,
      protocol: 6, // TCP
      ruleAction: "allow",
      egress: false,
      cidrBlock: "0.0.0.0/0",
      portRange: { from: 1024, to: 65535 }, // エフェメラルポート
    });

    // Egress (許可するアウトバウンド通信のみ設定)

    for (index = 0; index < props.allowPorts.length; index++) {
      new ec2.CfnNetworkAclEntry(scope, `${id}_NetworkAclEntryEgress_${props.allowPorts[index]}`, {
        networkAclId: networkAcl.ref,
        ruleNumber: index + 1,
        protocol: 6, // TCP
        ruleAction: "allow",
        egress: true,
        cidrBlock: "0.0.0.0/0",
        portRange: { from: props.allowPorts[index], to: props.allowPorts[index] },
      });
    }

    new ec2.CfnNetworkAclEntry(scope, `${id}_NetworkAclEntryEgress_Response`, {
      networkAclId: networkAcl.ref,
      ruleNumber: (index++) + 1,
      protocol: 6, // TCP
      ruleAction: "allow",
      egress: true,
      cidrBlock: props.naclCidrBlock,
      portRange: { from: 1024, to: 65535 }, // エフェメラルポート
    });

    new ec2.CfnSubnetNetworkAclAssociation(scope, `${id}_NetworkAclAssociation`, {
      networkAclId: networkAcl.ref,
      subnetId: subnet.ref,
    })
  }
}

//
// Privateサブネット
//

interface PrivateSubnetProps {
  index: number;
  vpc: ec2.CfnVPC;
  vpcName: string;
  cidrBlock: string;
  availabilityZone: string;
  publicSubnet: ec2.CfnSubnet;
}

export class PrivateSubnet extends cdk.Construct {
  subnet: ec2.CfnSubnet;

  constructor(scope: cdk.Construct, id: string, props: PrivateSubnetProps) {
    super(scope, id);

    // NAT Gateway (Public Subnetに作成)

    var natGatewayEIP = new ec2.CfnEIP(scope, `${id}_NatGatewayEIP`, {
      tags: [
        new cdk.Tag("Name", `${props.vpcName} NatGateway EIP ${props.index}`)
      ]
    });

    var natGateway = new ec2.CfnNatGateway(scope, `${id}_NatGateway`, {
      allocationId: natGatewayEIP.attrAllocationId,
      subnetId: props.publicSubnet.ref,
      tags: [
        new cdk.Tag("Name", `${props.vpcName} NatGateway ${props.index}`)
      ]
    });

    // Private Subnet

    var privateSubnet = new ec2.CfnSubnet(scope, `${id}_Subnet`, {
      vpcId: props.vpc.ref,
      cidrBlock: props.cidrBlock,
      availabilityZone: props.availabilityZone,
      tags: [
        new cdk.Tag("Name", `${props.vpcName} Private Subnet ${props.index}`)
      ]
    })

    var privateRouteTable = new ec2.CfnRouteTable(scope, `${id}_RouteTable`, {
      vpcId: props.vpc.ref,
      tags: [
        new cdk.Tag("Name", `${props.vpcName} Private Subnet ${props.index}`)
      ]
    });

    var privateRoute = new ec2.CfnRoute(scope, `${id}_PrivateRoute`, {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: natGateway.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(scope, `${id}_SubnetRouteTableAssociation`, {
      routeTableId: privateRouteTable.ref,
      subnetId: privateSubnet.ref,
    });

    privateRoute.addDependsOn(natGateway);

    this.subnet = privateSubnet;
  }
}

//
// VPC フローログ(保存期間は90日)
//

interface VPCFlowLogProps {
  vpc: ec2.CfnVPC;
}

export class VPCFlowLog extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: VPCFlowLogProps) {
    super(scope, id);

    var role = new iam.CfnRole(scope, `${id}_Role`, {
      roleName: `${id}Role`,
      assumeRolePolicyDocument: {
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "vpc-flow-logs.amazonaws.com"
            },
            "Action": "sts:AssumeRole",
          }
        ],
      },
      policies: [
        {
          policyName: `${id}Policy`,
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: [
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "logs:DescribeLogGroups",
                  "logs:DescribeLogStreams"
                ],
                Resource: "*"
              }
            ]
          }
        }
      ]
    });

    var group = new logs.CfnLogGroup(scope, `${id}_LogGroup`, {
      logGroupName: `${id}/DefaultGroup`,
      retentionInDays: 90, // 90日
    });

    new ec2.CfnFlowLog(scope, `${id}_FlowLog`, {
      maxAggregationInterval: 60, // 1分
      deliverLogsPermissionArn: role.attrArn,
      logGroupName: group.ref,
      resourceId: props.vpc.ref,
      resourceType: "VPC",
      trafficType: "ALL",
      tags: [
      ]
    });
  }
}

//
// Amazon Linux 踏み台サーバ
//

interface LinuxBastionProps {
  vpcName: string;
  subnet: ec2.CfnSubnet;
  instanceType: string;
  keyPairName: string;
  policies: iam.CfnManagedPolicy[];
}

export class LinuxBastion extends cdk.Construct {
  static SSH_PORT = 22;
  role: iam.CfnRole;

  constructor(scope: cdk.Construct, id: string, props: LinuxBastionProps) {
    super(scope, id);

    // Systems Manager サービス利用許可を与えるRole、InstanceProfile

    this.role = new iam.CfnRole(
      this, `${id}_Role`,
      {
        assumeRolePolicyDocument: {
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Principal": {
                "Service": "ec2.amazonaws.com"
              },
              "Action": "sts:AssumeRole",
            }
          ],
        },
        managedPolicyArns: [
          "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
          ...props.policies.map((policy) => policy.ref),
        ]
      });

    var bastionProfile = new iam.CfnInstanceProfile(
      this, `${id}_InstanceProfile`,
      {
        path: '/',
        roles: [
          this.role.ref,
        ]
      });

    // 踏み台サーバ
    new ec2.CfnInstance(
      this, `${id}_Instance`,
      {
        imageId: new ec2.AmazonLinuxImage({
          generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
          virtualization: ec2.AmazonLinuxVirt.HVM,
        }).getImage(scope).imageId,
        instanceType: props.instanceType,
        subnetId: props.subnet.ref,
        keyName: props.keyPairName,
        iamInstanceProfile: bastionProfile.ref,
        tags: [
          new cdk.Tag("Name", `${props.vpcName} Linux Bastion`),
        ],
      }
    );
  }
}

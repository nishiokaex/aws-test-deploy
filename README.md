# AWS検証環境構築テンプレート

下記の検証環境を作成するCDK(Typescript版)スクリプトです。

- パブリックサブネットとプライベートサブネットを１つづつ持つVPC。
- AWS Systems Managerのみでアクセス可能なEC2インスタンス(t2.medium)。
- VPCの外からのインバウンド通信は不可。
- VPCの中からのアウトバウント通信はHTTP、HTTPS、NTPのみ許可。
- VPCフローログ設定済み。

## 使い方

1. CDKで必要な環境変数を設定する。

```
$ export AWS_ACCESS_KEY_ID=XXXXXXXXXX
$ export AWS_SECRET_ACCESS_KEY=xxxxxxxxx
$ export AWS_DEFAULT_REGION=ap-northeast
```

2. `aws-test-deploy-stack.ts` のAwsTestDeployStackクラスに記述されている下記のパラメータを適切に書き換える。

|  パラメータ  |  説明  |
| ---- | ---- |
|  vpcCidrBlock  |  作成するVPCのCIDR  |
|  availabilityZone  |  作成するVPCのAZ  |
|  keyPairName  |  作成するEC2インスタンスに設定するキーペア名  |

3. 2通りの方法でデプロイ(AWS環境を構築)できる。

CloudFormationの生成を生成して、それをマネージメントコンソール経由でデプロイする。または、CDKから直接デプロイする。

  - CloudFormationの生成

`cdk synth` をコンソール上で実行し、標準出力にCloudFormationを出力する。

  - CDKから直接デプロイ

事前に `aws configure` をコンソール上でAWSアカウントとリージョン設定を行っておき、`cdk deploy` を実行すると直接AWS環境の構築ができる。

# AWS検証環境構築テンプレート

下記の検証環境を作成するCDK(Typescript版)スクリプトである。

- パブリックサブネットとプライベートサブネットを１つづつ持つVPC。
- AWS Systems Managerのみでアクセス可能なEC2インスタンス(t2.medium)。
- VPCの外からのインバウンド通信は不可。
- VPCの中からのアウトバウント通信はHTTP、HTTPS、NTPのみ許可。
- VPCフローログ設定済み。

## 使い方

2通りの使い方がある。

1. CloudFormationの生成を生成して、それをマネージメントコンソール経由でデプロイする。
2. CDKから直接デプロイ。

### CloudFormationの生成

`cdk synth` をコンソール上で実行し、標準出力にCloudFormationを出力する。

### CDKから直接デプロイ

事前に `aws configure` をコンソール上でAWSアカウントとリージョン設定を行っておき、
`cdk deploy` を実行すると直接AWS環境の構築ができる。

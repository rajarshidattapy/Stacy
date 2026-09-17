# agent-ts — AWS Deployment Runbook

Full reproducible deploy of `agent-ts` on **AWS Bedrock AgentCore Runtime** with **forgevm** running on **EC2**, secrets in **Secrets Manager**.

```
Region:      ap-south-1
Account:     054041090957
Agent ARN:   arn:aws:bedrock-agentcore:ap-south-1:054041090957:runtime/agent_ts-MLrDiMEHRJ
EC2:         i-06c8a3603006f4331  (13.203.24.124)
Secret ARN:  arn:aws:secretsmanager:ap-south-1:054041090957:secret:agent-ts/anthropic-key-piU8gI
```

---

## 0. Environment

```bash
export AWS_REGION=ap-south-1
export ACCOUNT_ID=054041090957

# AgentCore
export AGENT_REPO=agent-ts
export AGENT_IMAGE=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$AGENT_REPO:latest
export AGENT_ROLE=AgentCoreAgentTsRole
export AGENT_ROLE_ARN=arn:aws:iam::$ACCOUNT_ID:role/$AGENT_ROLE
export RUNTIME_NAME=agent_ts
export RUNTIME_ID=agent_ts-MLrDiMEHRJ
export RUNTIME_ARN=arn:aws:bedrock-agentcore:$AWS_REGION:$ACCOUNT_ID:runtime/$RUNTIME_ID

# Forgevm on EC2
export FORGEVM_REPO=forgevm
export FORGEVM_IMAGE=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$FORGEVM_REPO:latest
export EC2_KEY=forgevm-key
export EC2_SG=forgevm-sg
export EC2_PROFILE=ForgevmEC2Profile
export EC2_ROLE=ForgevmEC2Role
export EC2_INSTANCE_ID=i-06c8a3603006f4331
export EC2_PUBLIC_IP=13.203.24.124
export FORGEVM_URL_EC2=http://$EC2_PUBLIC_IP:7423

# Secrets
export ANTHROPIC_SECRET_NAME=agent-ts/anthropic-key
export ANTHROPIC_SECRET_ARN=arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT_ID:secret:$ANTHROPIC_SECRET_NAME-piU8gI

# Sandbox image (lives on EC2 host docker)
export SANDBOX_IMAGE=stacyvm-evm:latest

# Repo root — directory containing both agent-ts/ and orchestrator/
export REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
```

Verify creds:

```bash
aws sts get-caller-identity
```

---

## 1. Build prereqs (one-time)

ARM64 needed for AgentCore container (Bedrock requirement). Forgevm runs amd64 on EC2.

```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker buildx create --name agentcore-builder --driver docker-container --use
docker buildx inspect agentcore-builder --bootstrap
docker buildx inspect agentcore-builder | grep Platforms   # must list linux/arm64 + linux/amd64
```

Build forgevm SDK (sibling dependency of agent-ts):

```bash
cd "$REPO_ROOT/orchestrator/sdk/js"
npm install && npm run build
ls dist     # client.js, index.js, ...
```

---

## 2. Create ECR repos + login

```bash
aws ecr create-repository --region $AWS_REGION --repository-name $AGENT_REPO
aws ecr create-repository --region $AWS_REGION --repository-name $FORGEVM_REPO

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

---

## 3. Build + push images

### 3a. Agent image (linux/arm64)

Build context = repo root so Dockerfile can pull sibling `orchestrator/sdk/js`.

```bash
cd "$REPO_ROOT"
docker buildx build \
  --builder agentcore-builder \
  --platform linux/arm64 \
  -f agent-ts/Dockerfile \
  -t $AGENT_IMAGE \
  --push .
```

### 3b. Forgevm image (linux/amd64)

```bash
cd "$REPO_ROOT/orchestrator"
docker buildx build \
  --builder agentcore-builder \
  --platform linux/amd64 \
  -t $FORGEVM_IMAGE \
  --push .
```

Verify:

```bash
aws ecr describe-images --region $AWS_REGION --repository-name $AGENT_REPO   --query 'imageDetails[0].{tags:imageTags,size:imageSizeInBytes}'
aws ecr describe-images --region $AWS_REGION --repository-name $FORGEVM_REPO --query 'imageDetails[0].{tags:imageTags,size:imageSizeInBytes}'
```

---

## 4. Secrets Manager — Anthropic key

**Never** put key in CLI args (process listing leaks). Write to file, pass `file://`, scrub.

```bash
echo -n 'sk-ant-api03-...' > /tmp/anthropic_key.txt   # paste actual key
aws secretsmanager create-secret \
  --region $AWS_REGION \
  --name $ANTHROPIC_SECRET_NAME \
  --secret-string file:///tmp/anthropic_key.txt
rm -f /tmp/anthropic_key.txt
```

Capture full ARN (suffix is random):

```bash
export ANTHROPIC_SECRET_ARN=$(aws secretsmanager describe-secret --region $AWS_REGION \
  --secret-id $ANTHROPIC_SECRET_NAME --query ARN --output text)
echo $ANTHROPIC_SECRET_ARN
```

Rotate later:

```bash
echo -n 'sk-ant-api03-NEW' > /tmp/anthropic_key.txt
aws secretsmanager put-secret-value --region $AWS_REGION \
  --secret-id $ANTHROPIC_SECRET_NAME --secret-string file:///tmp/anthropic_key.txt
rm -f /tmp/anthropic_key.txt
```

---

## 5. EC2 forgevm — provision

### 5a. SSH key pair

```bash
aws ec2 create-key-pair --region $AWS_REGION --key-name $EC2_KEY \
  --query KeyMaterial --output text > forgevm-key.pem
chmod 400 forgevm-key.pem
```

### 5b. Default VPC + subnet

```bash
export VPC=$(aws ec2 describe-vpcs --region $AWS_REGION \
  --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
export SUBNET=$(aws ec2 describe-subnets --region $AWS_REGION \
  --filters Name=vpc-id,Values=$VPC Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' --output text)
echo "VPC=$VPC SUBNET=$SUBNET"
```

### 5c. Security group (TCP 7423 + SSH 22)

```bash
export SG_ID=$(aws ec2 create-security-group --region $AWS_REGION \
  --group-name $EC2_SG --description "forgevm port 7423 + ssh" \
  --vpc-id $VPC --query GroupId --output text)
aws ec2 authorize-security-group-ingress --region $AWS_REGION \
  --group-id $SG_ID --protocol tcp --port 7423 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --region $AWS_REGION \
  --group-id $SG_ID --protocol tcp --port 22   --cidr 0.0.0.0/0
echo "SG=$SG_ID"
```

(Tighten 22 to your IP for prod.)

### 5d. Instance profile (ECR pull)

```bash
cat > /tmp/ec2-trust.json <<'EOF'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}
EOF

aws iam create-role --role-name $EC2_ROLE --assume-role-policy-document file:///tmp/ec2-trust.json
aws iam attach-role-policy --role-name $EC2_ROLE \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam create-instance-profile --instance-profile-name $EC2_PROFILE
aws iam add-role-to-instance-profile --instance-profile-name $EC2_PROFILE --role-name $EC2_ROLE
```

### 5e. User-data (boot script)

```bash
cat > /tmp/forgevm-userdata.sh <<EOF
#!/bin/bash
set -eux
exec > /var/log/forgevm-userdata.log 2>&1

dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
docker pull $FORGEVM_IMAGE

docker network create forgevm-network || true

docker run -d --name forgevm --restart=always \\
  -p 7423:7423 \\
  -v /var/run/docker.sock:/var/run/docker.sock \\
  -v forgevm-data:/data \\
  --network forgevm-network \\
  -e FORGEVM_DATABASE_PATH=/data/forgevm.db \\
  -e FORGEVM_LOGGING_LEVEL=info \\
  -e FORGEVM_PROVIDERS_DOCKER_NETWORK_MODE=forgevm-network \\
  $FORGEVM_IMAGE
EOF
```

### 5f. Launch instance

Latest al2023 amd64:

```bash
export AMI=$(aws ec2 describe-images --region $AWS_REGION --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023.*-x86_64" "Name=state,Values=available" \
  --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)

export EC2_INSTANCE_ID=$(aws ec2 run-instances --region $AWS_REGION \
  --image-id $AMI \
  --instance-type t3.small \
  --key-name $EC2_KEY \
  --security-group-ids $SG_ID \
  --subnet-id $SUBNET \
  --associate-public-ip-address \
  --iam-instance-profile Name=$EC2_PROFILE \
  --user-data file:///tmp/forgevm-userdata.sh \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=16,VolumeType=gp3}' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=forgevm}]' \
  --query 'Instances[0].InstanceId' --output text)
echo "INSTANCE=$EC2_INSTANCE_ID"

aws ec2 wait instance-running --region $AWS_REGION --instance-ids $EC2_INSTANCE_ID
export EC2_PUBLIC_IP=$(aws ec2 describe-instances --region $AWS_REGION \
  --instance-ids $EC2_INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
export FORGEVM_URL_EC2=http://$EC2_PUBLIC_IP:7423
echo "FORGEVM_URL=$FORGEVM_URL_EC2"
```

### 5g. Wait for forgevm health

```bash
for i in $(seq 1 30); do
  code=$(curl -m 5 -s -o /tmp/h -w "%{http_code}" $FORGEVM_URL_EC2/api/v1/health || echo 000)
  echo "try=$i code=$code"
  [ "$code" = "200" ] && cat /tmp/h && echo && break
  sleep 10
done
```

(Path is `/api/v1/health` — bare `/health` returns 404.)

### 5h. Build sandbox image on EC2 host

forgevm checks local docker cache first; sandbox image must exist on EC2 daemon.

```bash
cd "$REPO_ROOT"
tar czf /tmp/nextjs-sandbox.tgz -C orchestrator/images nextjs-sandbox

scp -o StrictHostKeyChecking=no -i forgevm-key.pem \
  /tmp/nextjs-sandbox.tgz ec2-user@$EC2_PUBLIC_IP:/tmp/

ssh -o StrictHostKeyChecking=no -i forgevm-key.pem ec2-user@$EC2_PUBLIC_IP \
  'cd /tmp && tar xzf nextjs-sandbox.tgz && cd nextjs-sandbox \
   && sudo docker build -t stacyvm-evm:latest . \
   && sudo docker images forge-nextjs-sandbox'
```

---

## 6. AgentCore execution role

```bash
cat > /tmp/agentcore-trust.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"aws:SourceAccount": "$ACCOUNT_ID"},
      "ArnLike": {"aws:SourceArn": "arn:aws:bedrock-agentcore:$AWS_REGION:$ACCOUNT_ID:*"}
    }
  }]
}
EOF

cat > /tmp/agentcore-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {"Effect":"Allow","Action":["ecr:BatchGetImage","ecr:GetDownloadUrlForLayer","ecr:GetAuthorizationToken"],"Resource":"*"},
    {"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogStreams","logs:DescribeLogGroups"],"Resource":"arn:aws:logs:$AWS_REGION:$ACCOUNT_ID:log-group:/aws/bedrock-agentcore/*"},
    {"Effect":"Allow","Action":["xray:PutTraceSegments","xray:PutTelemetryRecords","xray:GetSamplingRules","xray:GetSamplingTargets"],"Resource":"*"},
    {"Effect":"Allow","Action":"cloudwatch:PutMetricData","Resource":"*","Condition":{"StringEquals":{"cloudwatch:namespace":"bedrock-agentcore"}}},
    {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":"*"},
    {"Effect":"Allow","Action":["bedrock-agentcore:GetWorkloadAccessToken","bedrock-agentcore:GetWorkloadAccessTokenForJWT","bedrock-agentcore:GetWorkloadAccessTokenForUserId"],"Resource":["arn:aws:bedrock-agentcore:$AWS_REGION:$ACCOUNT_ID:workload-identity-directory/default","arn:aws:bedrock-agentcore:$AWS_REGION:$ACCOUNT_ID:workload-identity-directory/default/workload-identity/*"]},
    {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":"arn:aws:secretsmanager:$AWS_REGION:$ACCOUNT_ID:secret:$ANTHROPIC_SECRET_NAME-*"}
  ]
}
EOF

aws iam create-role --role-name $AGENT_ROLE \
  --assume-role-policy-document file:///tmp/agentcore-trust.json
aws iam put-role-policy --role-name $AGENT_ROLE \
  --policy-name AgentCoreAgentTsInline \
  --policy-document file:///tmp/agentcore-policy.json
```

---

## 7. Create AgentCore runtime

```bash
aws bedrock-agentcore-control create-agent-runtime \
  --region $AWS_REGION \
  --agent-runtime-name $RUNTIME_NAME \
  --description "agent-ts deepagent service" \
  --role-arn $AGENT_ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --agent-runtime-artifact "containerConfiguration={containerUri=$AGENT_IMAGE}" \
  --environment-variables "SERVICE_PORT=8080,SERVICE_NO_LLM=0,FORGEVM_URL=$FORGEVM_URL_EC2,SANDBOX_IMAGE=$SANDBOX_IMAGE,ANTHROPIC_KEY_SECRET_ARN=$ANTHROPIC_SECRET_ARN,AWS_REGION=$AWS_REGION"
```

Capture ARN + wait READY:

```bash
export RUNTIME_ARN=$(aws bedrock-agentcore-control list-agent-runtimes --region $AWS_REGION \
  --query "agentRuntimes[?agentRuntimeName=='$RUNTIME_NAME'].agentRuntimeArn" --output text)
export RUNTIME_ID=$(echo $RUNTIME_ARN | awk -F/ '{print $NF}')

until [ "$(aws bedrock-agentcore-control get-agent-runtime --region $AWS_REGION \
  --agent-runtime-id $RUNTIME_ID --query status --output text)" = "READY" ]; do
  sleep 10
done
echo READY
```

---

## 8. Invoke

`runtime-session-id` must be ≥33 chars and the same string sticks to one microVM (8h max).

```bash
SID="t$(date +%s)$(uuidgen | tr -d -)"; SID=${SID:0:50}
echo '{"user_id":"u1","message":"hello"}' > /tmp/payload.json

aws --cli-read-timeout 600 --cli-connect-timeout 60 \
  bedrock-agentcore invoke-agent-runtime \
  --region $AWS_REGION \
  --agent-runtime-arn $RUNTIME_ARN \
  --runtime-session-id "$SID" \
  --payload fileb:///tmp/payload.json /tmp/out.json

cat /tmp/out.json
```

---

## 9. Update agent (rebuild + redeploy)

After code changes:

```bash
cd "$REPO_ROOT"
docker buildx build --builder agentcore-builder --platform linux/arm64 \
  -f agent-ts/Dockerfile -t $AGENT_IMAGE --push .

aws bedrock-agentcore-control update-agent-runtime \
  --region $AWS_REGION \
  --agent-runtime-id $RUNTIME_ID \
  --role-arn $AGENT_ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --agent-runtime-artifact "containerConfiguration={containerUri=$AGENT_IMAGE}" \
  --environment-variables "SERVICE_PORT=8080,SERVICE_NO_LLM=0,FORGEVM_URL=$FORGEVM_URL_EC2,SANDBOX_IMAGE=$SANDBOX_IMAGE,ANTHROPIC_KEY_SECRET_ARN=$ANTHROPIC_SECRET_ARN,AWS_REGION=$AWS_REGION"

until [ "$(aws bedrock-agentcore-control get-agent-runtime --region $AWS_REGION \
  --agent-runtime-id $RUNTIME_ID --query status --output text)" = "READY" ]; do sleep 10; done
echo READY
```

To switch FORGEVM_URL only (e.g. ngrok tunnel during dev):

```bash
export FORGEVM_URL_TMP=https://your-ngrok.ngrok-free.dev
aws bedrock-agentcore-control update-agent-runtime \
  --region $AWS_REGION \
  --agent-runtime-id $RUNTIME_ID \
  --role-arn $AGENT_ROLE_ARN \
  --network-configuration networkMode=PUBLIC \
  --agent-runtime-artifact "containerConfiguration={containerUri=$AGENT_IMAGE}" \
  --environment-variables "SERVICE_PORT=8080,SERVICE_NO_LLM=0,FORGEVM_URL=$FORGEVM_URL_TMP,SANDBOX_IMAGE=$SANDBOX_IMAGE,ANTHROPIC_KEY_SECRET_ARN=$ANTHROPIC_SECRET_ARN,AWS_REGION=$AWS_REGION"
```

---

## 10. Logs

```bash
aws logs describe-log-groups --region $AWS_REGION \
  --log-group-name-prefix /aws/bedrock-agentcore --query 'logGroups[].logGroupName'

aws logs tail /aws/bedrock-agentcore/runtimes/${RUNTIME_ID}-DEFAULT \
  --region $AWS_REGION --since 30m --follow
```

EC2 forgevm container logs:

```bash
ssh -i forgevm-key.pem ec2-user@$EC2_PUBLIC_IP 'sudo docker logs -f forgevm'
```

---

## 11. Operational checks

```bash
# Runtime status + env (env values shown in plain text — do NOT put secrets here)
aws bedrock-agentcore-control get-agent-runtime --region $AWS_REGION \
  --agent-runtime-id $RUNTIME_ID \
  --query '{status:status,version:agentRuntimeVersion,env:environmentVariables}'

# Forgevm reachability
curl $FORGEVM_URL_EC2/api/v1/health

# List forgevm sandboxes
curl $FORGEVM_URL_EC2/api/v1/sandboxes

# EC2 instance status
aws ec2 describe-instances --region $AWS_REGION --instance-ids $EC2_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].{state:State.Name,ip:PublicIpAddress}'
```

---

## 12. Teardown

```bash
# AgentCore + IAM + ECR (agent)
aws bedrock-agentcore-control delete-agent-runtime --region $AWS_REGION --agent-runtime-id $RUNTIME_ID
aws iam delete-role-policy --role-name $AGENT_ROLE --policy-name AgentCoreAgentTsInline
aws iam delete-role        --role-name $AGENT_ROLE
aws ecr delete-repository  --repository-name $AGENT_REPO --region $AWS_REGION --force

# EC2 + SG + key + IAM (forgevm)
aws ec2 terminate-instances     --region $AWS_REGION --instance-ids $EC2_INSTANCE_ID
aws ec2 wait instance-terminated --region $AWS_REGION --instance-ids $EC2_INSTANCE_ID
aws ec2 delete-security-group   --region $AWS_REGION --group-id $SG_ID
aws ec2 delete-key-pair         --region $AWS_REGION --key-name $EC2_KEY
rm -f forgevm-key.pem

aws iam remove-role-from-instance-profile --instance-profile-name $EC2_PROFILE --role-name $EC2_ROLE
aws iam delete-instance-profile           --instance-profile-name $EC2_PROFILE
aws iam detach-role-policy --role-name $EC2_ROLE \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam delete-role        --role-name $EC2_ROLE
aws ecr delete-repository  --repository-name $FORGEVM_REPO --region $AWS_REGION --force

# Secret (7-day recovery window unless --force-delete-without-recovery)
aws secretsmanager delete-secret --region $AWS_REGION \
  --secret-id $ANTHROPIC_SECRET_NAME --recovery-window-in-days 7
```

---

## 13. Currently deployed (snapshot 2026-05-03)

```
RUNTIME_ARN  = arn:aws:bedrock-agentcore:ap-south-1:054041090957:runtime/agent_ts-MLrDiMEHRJ
RUNTIME_ID   = agent_ts-MLrDiMEHRJ          (version 5, READY)
AGENT_IMAGE  = 054041090957.dkr.ecr.ap-south-1.amazonaws.com/agent-ts:latest        (linux/arm64)
AGENT_ROLE   = arn:aws:iam::054041090957:role/AgentCoreAgentTsRole
LOG_GROUP    = /aws/bedrock-agentcore/runtimes/agent_ts-MLrDiMEHRJ-DEFAULT

EC2_INSTANCE = i-06c8a3603006f4331  (al2023 amd64, t3.small, 16 GB gp3)
EC2_PUBLIC_IP= 13.203.24.124
FORGEVM_URL  = http://13.203.24.124:7423
FORGEVM_IMAGE= 054041090957.dkr.ecr.ap-south-1.amazonaws.com/forgevm:latest         (linux/amd64)
SG           = sg-09cc80edfa9cbbfd5  (TCP 22 + 7423 from 0.0.0.0/0)
KEY          = forgevm-key  (forgevm-key.pem in agent-ts/)
INSTANCE_PROF= ForgevmEC2Profile -> ForgevmEC2Role (AmazonEC2ContainerRegistryReadOnly)
SANDBOX_IMAGE= stacyvm-evm:latest  (built on EC2 host docker)

SECRET_ARN   = arn:aws:secretsmanager:ap-south-1:054041090957:secret:agent-ts/anthropic-key-piU8gI

Mode: SERVICE_NO_LLM=0  (live LLM via ANTHROPIC_KEY_SECRET_ARN)
```

---

## 14. Security notes

- Anthropic key lives only in Secrets Manager. Container fetches at boot via `src/index.ts:resolveSecrets()` using instance role (scoped `secretsmanager:GetSecretValue` on that ARN).
- Never put key in `--environment-variables`, CLI args, or any committed file.
- `forgevm-key.pem` is in `agent-ts/` — add to `.gitignore` if not already.
- SG opens 22 + 7423 to `0.0.0.0/0`. For production: restrict 22 to your IP, restrict 7423 to AgentCore egress (currently use bearer token on forgevm or VPC peering).
- AWS creds in use are root account. Switch to least-privilege IAM user/role for production deploys.

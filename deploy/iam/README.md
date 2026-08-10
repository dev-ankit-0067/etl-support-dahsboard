# Pre-creating the ECS IAM roles

The deploy identity (`AWSReservedSSO_UST_...CloudAdmin`) is **denied `iam:CreateRole`**, so the
CloudFormation stack can't create the two roles Fargate needs. Have someone with IAM permissions
create them once, then pass their ARNs to `deploy.sh` (which sets the `ExecutionRoleArn` /
`TaskRoleArn` stack parameters so the stack skips role creation).

Run these with an IAM-capable identity in account **971996090633**:

```bash
REGION=us-east-1

# 1) Execution role — lets ECS pull the image, write logs, and read the app secret.
aws iam create-role --role-name opsguardian-exec-role \
  --assume-role-policy-document file://deploy/iam/trust-policy.json
aws iam attach-role-policy --role-name opsguardian-exec-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name opsguardian-exec-role \
  --policy-name read-app-secret \
  --policy-document file://deploy/iam/execution-role-inline.json

# 2) Task role — the app's runtime AWS read access (Glue/Lambda/CloudWatch/Cost Explorer).
aws iam create-role --role-name opsguardian-task-role \
  --assume-role-policy-document file://deploy/iam/trust-policy.json
aws iam put-role-policy --role-name opsguardian-task-role \
  --policy-name opsguardian-runtime \
  --policy-document file://deploy/iam/task-role-policy.json
```

Then deploy from the `ust` profile, pointing at the ARNs:

```bash
EXEC_ROLE_ARN=arn:aws:iam::971996090633:role/opsguardian-exec-role \
TASK_ROLE_ARN=arn:aws:iam::971996090633:role/opsguardian-task-role \
./deploy/deploy.sh
```

## Also required: `iam:PassRole`

To register the task definition, the **deploy identity** (the `ust`/CloudAdmin principal) needs
`iam:PassRole` on those two role ARNs:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "iam:PassRole",
    "Resource": [
      "arn:aws:iam::971996090633:role/opsguardian-exec-role",
      "arn:aws:iam::971996090633:role/opsguardian-task-role"
    ]
  }]
}
```

If PassRole is also denied to the CloudAdmin role, the deploy must be run by an identity that has it.

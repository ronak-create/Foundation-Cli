import type { PluginDefinition } from "@foundation-cli/plugin-sdk";

const GITHUB_ACTIONS_DEPLOY = `name: Deploy to AWS ECS

on:
  push:
    branches: [main]

env:
  AWS_REGION:      us-east-1
  ECR_REPOSITORY:  <%= projectName %>
  ECS_SERVICE:     <%= projectName %>-service
  ECS_CLUSTER:     <%= projectName %>-cluster
  CONTAINER_NAME:  <%= projectName %>

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: \${{ secrets.AWS_ROLE_ARN }}
          aws-region: \${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: \${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG:    \${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Deploy Amazon ECS task definition
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: .aws/task-definition.json
          service: \${{ env.ECS_SERVICE }}
          cluster: \${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true
`;

const TASK_DEFINITION = JSON.stringify({
  family: "<%= projectName %>",
  networkMode: "awsvpc",
  requiresCompatibilities: ["FARGATE"],
  cpu: "256",
  memory: "512",
  executionRoleArn: "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  containerDefinitions: [
    {
      name: "<%= projectName %>",
      image: "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/<%= projectName %>:latest",
      portMappings: [{ containerPort: 3001, protocol: "tcp" }],
      environment: [
        { name: "NODE_ENV", value: "production" },
        { name: "PORT",     value: "3001" },
      ],
      secrets: [
        { name: "DATABASE_URL", valueFrom: "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/DATABASE_URL" },
        { name: "JWT_SECRET",   valueFrom: "arn:aws:ssm:us-east-1:ACCOUNT_ID:parameter/JWT_SECRET" },
      ],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group":         "/ecs/<%= projectName %>",
          "awslogs-region":        "us-east-1",
          "awslogs-stream-prefix": "ecs",
        },
      },
    },
  ],
}, null, 2);

export const awsModule: PluginDefinition = {
  manifest: {
    id: "deployment-aws",
    name: "AWS",
    version: "1.0.0",
    description: "AWS ECS Fargate deployment with ECR, GitHub Actions CI/CD, and SSM secrets",
    category: "deployment",
    dependencies: [],
    files: [
      { relativePath: ".github/workflows/deploy.yml", content: GITHUB_ACTIONS_DEPLOY },
      { relativePath: ".aws/task-definition.json", content: TASK_DEFINITION },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            "aws:ecr:login": "aws ecr get-login-password | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com",
            "aws:deploy": "aws ecs update-service --cluster $ECS_CLUSTER --service $ECS_SERVICE --force-new-deployment",
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["deployment-vercel", "deployment-render"],
    },
  },
};
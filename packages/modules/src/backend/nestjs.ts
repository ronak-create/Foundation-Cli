import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

const APP_MODULE_TS = `import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`;

const APP_CONTROLLER_TS = `import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service.js";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get("health")
  health(): { status: string; timestamp: string } {
    return this.appService.health();
  }
}
`;

const APP_SERVICE_TS = `import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  health(): { status: string; timestamp: string } {
    return { status: "ok", timestamp: new Date().toISOString() };
  }
}
`;

const MAIN_TS = `import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();

  const port = process.env["PORT"] ?? 3001;
  await app.listen(port);
  console.log(\`NestJS server running on http://localhost:\${port}\`);
}

bootstrap();
`;

const ENV_EXAMPLE = `# NestJS Server
PORT=3001
NODE_ENV=development
`;

export const nestjsModule: PluginDefinition = {
  manifest: {
    id: "backend-nestjs",
    name: "NestJS",
    version: "1.0.0",
    description: "NestJS framework with TypeScript, validation, and modular architecture",
    category: "backend",
    dependencies: [
      { name: "@nestjs/core", version: "^10.3.8", scope: "dependencies" },
      { name: "@nestjs/common", version: "^10.3.8", scope: "dependencies" },
      { name: "@nestjs/platform-express", version: "^10.3.8", scope: "dependencies" },
      { name: "@nestjs/config", version: "^3.2.2", scope: "dependencies" },
      { name: "class-validator", version: "^0.14.1", scope: "dependencies" },
      { name: "class-transformer", version: "^0.5.1", scope: "dependencies" },
      { name: "reflect-metadata", version: "^0.2.2", scope: "dependencies" },
      { name: "rxjs", version: "^7.8.1", scope: "dependencies" },
      { name: "@nestjs/cli", version: "^10.3.2", scope: "devDependencies" },
      { name: "@nestjs/testing", version: "^10.3.8", scope: "devDependencies" },
      { name: "typescript", version: "^5.4.5", scope: "devDependencies" },
      { name: "ts-node", version: "^10.9.2", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/main.ts", content: MAIN_TS },
      { relativePath: "src/app.module.ts", content: APP_MODULE_TS },
      { relativePath: "src/app.controller.ts", content: APP_CONTROLLER_TS },
      { relativePath: "src/app.service.ts", content: APP_SERVICE_TS },
      { relativePath: ".env.example", content: ENV_EXAMPLE },
    ],
    configPatches: [
      {
        targetFile: "package.json",
        merge: {
          scripts: {
            dev: "ts-node -r tsconfig-paths/register src/main.ts",
            build: "nest build",
            start: "node dist/main.js",
            "start:dev": "nest start --watch",
          },
        },
      },
      {
        targetFile: "tsconfig.json",
        merge: {
          compilerOptions: {
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            paths: { "@/*": ["./src/*"] },
          },
        },
      },
    ],
    compatibility: {
      conflicts: ["backend-express", "backend-fastapi", "backend-django"],
    },
  },
};

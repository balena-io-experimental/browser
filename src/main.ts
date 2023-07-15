import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as compression from 'compression';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const apiPort = parseInt(process.env.API_PORT, 10) || 5011;
  const app = await NestFactory.create(AppModule);
  const config = new DocumentBuilder()
    .setTitle('Balena Browser Controls')
    .setDescription('OpenAPI specification for Balena Browser')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  app.use(compression());
  const corsOptions: CorsOptions = {
    origin: '*',
  };
  app.enableCors(corsOptions);
  await app.listen(apiPort);
}
bootstrap();

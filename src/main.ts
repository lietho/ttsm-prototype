import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedocModule, RedocOptions } from 'nestjs-redoc';

import { AppModule } from './app.module';
import { LoggingInterceptor } from './core';
import { environment } from './environment';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new LoggingInterceptor());

  const options = new DocumentBuilder()
    .setTitle('TTSM Prototype')
    .setDescription('A prototypical implementation of a time-travelling state machine for business process and workflow management')
    .build();
  const document = SwaggerModule.createDocument(app, options);

  const redocOptions: RedocOptions = {
    logo: {
      url: 'https://redocly.github.io/redoc/petstore-logo.png',
      backgroundColor: '#F0F0F0',
      altText: 'PetStore logo'
    }
  };
  await RedocModule.setup('/docs', app, document, redocOptions);

  await app.listen(environment.servicePort);
}

bootstrap();

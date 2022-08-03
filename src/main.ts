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
    .setTitle('Look, i have a title')
    .setDescription('A very nice description')
    .build();
  const document = SwaggerModule.createDocument(app, options);

  const redocOptions: RedocOptions = {
    title: 'Hello Nest',
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

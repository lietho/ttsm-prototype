import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RedocModule, RedocOptions } from '@nicholas.braun/nestjs-redoc';

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
      url: 'https://www.know-center.tugraz.at/wp-content/uploads/2019/07/Logo-TUWien_G.png',
      href: 'https://tuwien.ac.at/',
      altText: 'Technische Universität Wien'
    },
    favicon: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Swagger-logo.png'
  };
  await RedocModule.setup('/docs', app, document, redocOptions);

  await app.listen(environment.servicePort);
}

bootstrap();

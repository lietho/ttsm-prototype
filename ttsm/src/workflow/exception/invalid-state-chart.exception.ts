import { HttpException, HttpStatus } from "@nestjs/common";

export class InvalidStateChartException extends HttpException {
  constructor(message: string, cause?: Error) {
    super(message, HttpStatus.BAD_REQUEST, { cause });
  }

}
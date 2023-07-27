import { Module } from "@nestjs/common";
import { RulesControllerApi } from "./api";
import { environment } from "src/environment";


@Module({
  providers: [
    {
      provide: RulesControllerApi,
      useValue: new RulesControllerApi({}, environment.rules.ruleEvaluatorBaseUrl)
    }
  ],
  exports: [
    RulesControllerApi
  ]
})
export class RulesEvaluatorClientModule {
}

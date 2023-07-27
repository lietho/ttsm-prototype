FROM maven:3.9.2-eclipse-temurin-17-alpine AS build
COPY /src /feel-rule-evaluator/src
COPY pom.xml /feel-rule-evaluator
RUN mvn -DskipTests -f /feel-rule-evaluator/pom.xml clean package


FROM eclipse-temurin:17-alpine

COPY --from=build /feel-rule-evaluator/target/feel-rule-evaluator-0.0.1-SNAPSHOT.jar /feel-rule-evaluator.jar
ENTRYPOINT ["java", "-jar", "/feel-rule-evaluator.jar"]
EXPOSE 8080
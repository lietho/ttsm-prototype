package at.ac.tuwien.asg.feelruleevaluator;

import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Map;

import javax.inject.Inject;

import org.camunda.feel.FeelEngine;
import org.camunda.feel.FeelEngineClock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import at.ac.tuwien.asg.feelruleevaluator.models.EvaluationError;
import scala.util.Either;

@Component
public class FeelRuleEvaluator implements RuleEvaluator {

    @Inject
    private FunctionProvider functionProvider;

    private Logger logger = LoggerFactory.getLogger(FeelRuleEvaluator.class);
    
    public FeelRuleEvaluator() {
    }

    public void evaluate(String[] rules, Map<String, Object> context, ZonedDateTime currentTime) throws EvaluationFailedException
    {
        FeelEngine engine = new FeelEngine.Builder()
            .functionProvider(functionProvider)
            .clock(new FeelEngineClock() {

                @Override
                public ZonedDateTime getCurrentTime() {
                    return currentTime;
                }
                
            })
            .build();

        ArrayList<EvaluationError> errors = new ArrayList<>();
        for (int i = 0; i < rules.length; i++) {
            Either<FeelEngine.Failure, Object> result = engine.evalExpression(rules[i], context);

            if (result.isRight()) {
                final Object value = result.right().get();
                if (value instanceof Boolean) {
                    Boolean success = (Boolean)value;

                    if (!success) {
                        errors.add(new EvaluationError(i, "Rule evaluated to 'false'"));
                    }
                }
                else {
                    errors.add(new EvaluationError(i, "Result type of rule was " + value.getClass().toString() + ", but must be Boolean."));
                }
            } else {
                final FeelEngine.Failure failure = result.left().get();
                errors.add(new EvaluationError(i, failure.message()));
            }
        }

        if (errors.size() > 0)
            throw new EvaluationFailedException(errors);
    }
}

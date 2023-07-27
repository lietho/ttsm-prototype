package at.ac.tuwien.asg.feelruleevaluator;

import java.time.ZonedDateTime;
import java.util.Map;

public interface RuleEvaluator {
    void evaluate(String[] rules, Map<String, Object> context, ZonedDateTime curreTime) throws EvaluationFailedException;
}

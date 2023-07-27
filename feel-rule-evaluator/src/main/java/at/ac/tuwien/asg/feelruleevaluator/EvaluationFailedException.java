package at.ac.tuwien.asg.feelruleevaluator;

import java.util.Collection;

import at.ac.tuwien.asg.feelruleevaluator.models.EvaluationError;

public class EvaluationFailedException extends Exception {
    private final Collection<EvaluationError> evaluationErrors;

    public EvaluationFailedException(Collection<EvaluationError> evaluationErrors) {
        super("Evaluation failed; see the evaluation errors for details.");
        this.evaluationErrors = evaluationErrors;
    }

    public Collection<EvaluationError> getEvaluationErrors() {
        return evaluationErrors;
    }
}

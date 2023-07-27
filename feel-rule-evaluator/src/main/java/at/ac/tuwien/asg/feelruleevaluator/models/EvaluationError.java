package at.ac.tuwien.asg.feelruleevaluator.models;

public class EvaluationError {
    private final int index;
    private final String message;

    public EvaluationError(int index, String message) {
        this.index = index;
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

    public int getIndex() {
        return index;
    }
}

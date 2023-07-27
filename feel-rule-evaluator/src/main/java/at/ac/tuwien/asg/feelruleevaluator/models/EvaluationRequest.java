package at.ac.tuwien.asg.feelruleevaluator.models;

import java.time.ZonedDateTime;
import java.util.Map;

public class EvaluationRequest {

    private String[] rules;
    private Map<String, Object> newProcessState;
    private Map<String, Object> environmentState;
    private StateTransitionMessage delta;
    private ZonedDateTime currentTime;

    public EvaluationRequest() {
    }

    public ZonedDateTime getCurrentTime() {
        return currentTime;
    }

    public void setCurrentTime(ZonedDateTime curreTime) {
        this.currentTime = curreTime;
    }

    public void setRules(String[] rules) {
        this.rules = rules;
    }

    public String[] getRules() {
        return rules;
    }

    public Map<String, Object> getNewProcessState() {
        return newProcessState;
    }

    public void setNewProcessState(Map<String, Object> state) {
        this.newProcessState = state;
    }

    public Map<String, Object> getEnvironmentState() {
        return environmentState;
    }

    public void setEnvironmentState(Map<String, Object> environmentState) {
        this.environmentState = environmentState;
    }

    public StateTransitionMessage getDelta() {
        return delta;
    }

    public void setDelta(StateTransitionMessage stateTransitionMessage) {
        this.delta = stateTransitionMessage;
    }
}

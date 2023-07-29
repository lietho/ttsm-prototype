package at.ac.tuwien.asg.feelruleevaluator.models;

import java.time.ZonedDateTime;
import java.util.Map;

public class EvaluationRequest {

    private String[] rules;
    private Map<String, Object> context;
    private Map<String, Object> environment;
    private StateTransitionMessage event;
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

    public Map<String, Object> getContext() {
        return context;
    }

    public void setContext(Map<String, Object> state) {
        this.context = state;
    }

    public Map<String, Object> getEnvironment() {
        return environment;
    }

    public void setEnvironment(Map<String, Object> environmentState) {
        this.environment = environmentState;
    }

    public StateTransitionMessage getEvent() {
        return event;
    }

    public void setEvent(StateTransitionMessage stateTransitionMessage) {
        this.event = stateTransitionMessage;
    }
}

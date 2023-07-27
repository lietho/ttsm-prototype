package at.ac.tuwien.asg.feelruleevaluator.models;

import java.util.List;
import java.util.Map;

public class StateTransitionMessage {
    private String sender;
    private List<String> signers;
    private Map<String, Object> content;

    public Map<String, Object> getContent() {
        return content;
    }

    public void setContent(Map<String, Object> content) {
        this.content = content;
    }

    public StateTransitionMessage() {
    }

    public String getSender() {
        return sender;
    }

    public void setSender(String sender) {
        this.sender = sender;
    }

    public List<String> getSigners() {
        return signers;
    }

    public void setSigners(List<String> signers) {
        this.signers = signers;
    }
}
package at.ac.tuwien.asg.feelruleevaluator.controllers;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

import javax.inject.Inject;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import at.ac.tuwien.asg.feelruleevaluator.EvaluationFailedException;
import at.ac.tuwien.asg.feelruleevaluator.RuleEvaluator;
import at.ac.tuwien.asg.feelruleevaluator.models.EvaluationRequest;

@RestController
@RequestMapping(path = "/rules")
public class RulesController {

    @Inject
    private RuleEvaluator ruleEvaluator;

    @PostMapping(path = "/evaluate", consumes = "application/json", produces = "text/plain")
    @ResponseStatus(HttpStatus.OK)
    public ResponseEntity<String> evaluate(@RequestBody EvaluationRequest request) throws EvaluationFailedException {
        this.ruleEvaluator.evaluate(request.getRules(), this.buildContext(request), request.getCurrentTime());
        return new ResponseEntity<>("OK", HttpStatus.OK);
    }

    private Map<String, Object> buildContext(EvaluationRequest request) {
        Map<String, Object> context = new HashMap<>();

        context.put("context", request.getContext());
        context.put("environment", request.getEnvironment());

        Map<String, Object> event = new HashMap<>();

        event.put("payload", request.getEvent().getPayload());
        event.put("sender", request.getEvent().getSender());
        event.put("signers", request.getEvent().getSigners());
        
        context.put("event", event);

        return context;
    }
}

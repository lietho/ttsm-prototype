package at.ac.tuwien.asg.feelruleevaluator.controllers;

import java.util.Collection;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import at.ac.tuwien.asg.feelruleevaluator.EvaluationFailedException;
import at.ac.tuwien.asg.feelruleevaluator.models.EvaluationError;

@RestControllerAdvice
public class RulesControllerExceptionHandler {
    @ExceptionHandler(EvaluationFailedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ResponseEntity<Collection<EvaluationError>> handleConnversion(EvaluationFailedException ex) {
        return new ResponseEntity<>(ex.getEvaluationErrors(), HttpStatus.BAD_REQUEST);
    }
}

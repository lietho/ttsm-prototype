package at.ac.tuwien.asg.feelruleevaluator;

import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.camunda.feel.context.JavaFunction;
import org.camunda.feel.context.JavaFunctionProvider;
import org.camunda.feel.context.VariableProvider;
import org.camunda.feel.syntaxtree.Val;
import org.camunda.feel.syntaxtree.ValBoolean;
import org.camunda.feel.syntaxtree.ValContext;
import org.camunda.feel.syntaxtree.ValList;
import org.camunda.feel.syntaxtree.ValString;
import org.springframework.stereotype.Component;

import scala.jdk.javaapi.CollectionConverters;

@Component
public class FunctionProvider extends JavaFunctionProvider {

    private static final Map<String, JavaFunction> functions = new HashMap<>();

    static {
    
        final JavaFunction hasAllowedChanges = new JavaFunction(Arrays.asList("context", "allowedKeys"), args -> {
            final ValContext context = (ValContext) args.get(0);
            final ValList allowedKeys = (ValList) args.get(1);

            List<Val> allowdKeyItems = CollectionConverters.asJava(allowedKeys.items());
            Set<String> variables = new HashSet<String>(CollectionConverters.asJava(context.context().variableProvider().getVariables()).keySet());
            
            variables.remove("id");
            for (Val val : allowdKeyItems) {
                variables.remove(((ValString) val).value());
            }

            return new ValBoolean(variables.size() == 0);
        });

        functions.put("has allowed changes", hasAllowedChanges);

        final JavaFunction verifyProof = new JavaFunction(Arrays.asList("proof"), args -> {
            final ValContext context = (ValContext) args.get(0);

            VariableProvider variableProvider = context.context().variableProvider();
            
            Map<String, Object> variables = CollectionConverters.asJava(variableProvider.getVariables());

            if (variables.containsKey("type") && variables.containsKey("value"))
            {
                ValString type = (ValString)variables.get("type");
                ValString value = (ValString)variables.get("value");

                return new ValBoolean(type.value().equals("test") && value.value().equals("validProofForTesting"));
            }

            if (variables.containsKey("scheme") && variables.containsKey("curve") && variables.containsKey("proof"))
            {
                // TODO: call zokrates
                Map<String, Object> proofVariables = CollectionConverters.asJava(((ValContext)variables.get("proof")).context().variableProvider().getVariables());
                List<Val> aValues = CollectionConverters.asJava(((ValList)proofVariables.get("a")).items());

                return new ValBoolean(aValues.size() == 2 
                    && ((ValString)aValues.get(0)).value().equals("0x274b3599e54e0e5fb9d76ccaca94d428030910961c7c5085b00041ac231ba64a") 
                    && ((ValString)aValues.get(1)).value().equals("0x2dafc3fb00b51507b84d3cfbe4a318a9d6f44435b2625d26eb1f68af4696f646"));
            }

            return new ValBoolean(false);
        });

        functions.put("is proof valid", verifyProof);

        final JavaFunction isReportValid = new JavaFunction(Arrays.asList("report"), args -> {
            final ValContext context = (ValContext) args.get(0);

            VariableProvider variableProvider = context.context().variableProvider();
            
            Map<String, Object> variables = CollectionConverters.asJava(variableProvider.getVariables());

            if (variables.containsKey("id") && 
                variables.containsKey("legalBasis") &&
                variables.containsKey("inspectionDate") &&
                variables.containsKey("inspectionBody") &&
                variables.containsKey("inspectionResult") &&
                variables.containsKey("pdf")
                )
            {
                return new ValBoolean(true);
            }

            return new ValBoolean(false);
        });

        functions.put("is report valid", isReportValid);

        final JavaFunction isVPvalid = new JavaFunction(Arrays.asList("vp"), args -> {
            final ValContext context = (ValContext) args.get(0);
            Map<String, Object> variables = CollectionConverters.asJava(context.context().variableProvider().getVariables());

            // NOTE: Just a demo. No proper VP verification
            if (variables.containsKey("proof")){
                ValContext proofContext = (ValContext)variables.get("proof");
                Map<String, Object> proofVariables = CollectionConverters.asJava(proofContext.context().variableProvider().getVariables());

                ValString proofValue = (ValString)proofVariables.get("proofValue");
                return new ValBoolean(proofValue.value().equals("zqpLMweBrSxMY2xHX5XTYV8nQAJeV6doDwLWxQeVbY4oey5q2pmEcqaqA3Q1gVHMrXFkXM3XKaxup3tmzN4DRFTLV"));
            }

            return new ValBoolean(true);
        });

        functions.put("is vp valid", isVPvalid);
    }

    @Override
    public Collection<String> getFunctionNames() {
        return functions.keySet();
    }

    @Override
    public Optional<JavaFunction> resolveFunction(String functionName) {
        return Optional.ofNullable(functions.get(functionName));
    }
    
}

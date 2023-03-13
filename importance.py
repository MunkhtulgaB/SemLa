from lib2to3.pgen2 import token
import torch
import math

MAX_LENGTH = 30


def attention_importance(tokenizer, model, text, device="cuda"):
    with torch.no_grad():
        tokenized_input = tokenizer(text,
                                    max_length=MAX_LENGTH, 
                                    truncation=True, 
                                    return_tensors="pt")
        tokenized_input.to(device)
        model.to(device)
        outputs = model(**tokenized_input, output_attentions=True)
        attentions = torch.stack(outputs.attentions)
        attentions_aggregated = attentions.squeeze().sum(0).sum(0).detach().cpu()
        attentions_importance = attentions_aggregated.sum(0) / 144
        tokens = tokenizer.convert_ids_to_tokens(tokenized_input["input_ids"][0])
        tokens = tokens[1:-1]

        importance = attentions_importance.tolist()[1:-1]
    return importance, tokens


def lime_importance(tokenizer, model, text, support_set, device=None):

    def one_sentence_tokenize(text):
        tokens = tokenizer.tokenize(text)
        return [token.replace("#", "") for token in tokens]

    def encode(texts):
        with torch.no_grad():
            tokenized_xs = tokenizer.batch_encode_plus(texts, max_length=50, 
                                                    truncation=True, padding=True, return_tensors="pt")
            outputs = []
            num_batches = math.ceil(len(texts) / BATCH_LIMIT)
            
            for batch_idx in range(num_batches):
                tokenized_xs_batched = dict(
                    input_ids=tokenized_xs["input_ids"][batch_idx*BATCH_LIMIT: (batch_idx + 1) * BATCH_LIMIT].to(device),
                    token_type_ids=tokenized_xs["token_type_ids"][batch_idx*BATCH_LIMIT: (batch_idx + 1) * BATCH_LIMIT].to(device),
                    attention_mask=tokenized_xs["attention_mask"][batch_idx*BATCH_LIMIT: (batch_idx + 1) * BATCH_LIMIT].to(device),
                )
                outputs_batched = model(**tokenized_xs_batched)
                outputs.append( outputs_batched.last_hidden_state[:,0,:] )
        
            outputs = torch.cat(outputs)
            return outputs

    def classify(texts):
        import torch
        text_encoding = encode(texts)
        similarities = torch.inner(text_encoding, support_encodings)
        probs = torch.softmax(similarities/TAU, dim=-1)
        return probs.detach().cpu().numpy()

    from lime.lime_text import LimeTextExplainer

    if device is None:
        device = "cuda" if len(text.split(" ")) < 10 else "cpu"

    model.to(device)
    BATCH_LIMIT = 1
    TAU = 15

    support_encodings = encode(support_set["text"])
    probs = classify([text])
    label = probs[0].argmax()

    LIME_explainer_1sent = LimeTextExplainer(
                        class_names=support_set["category"], 
                        bow=False, 
                        split_expression=one_sentence_tokenize, 
                        mask_string=tokenizer.mask_token)
    exp = LIME_explainer_1sent.explain_instance(text,
                        classify, top_labels=5, num_samples=100
                        , num_features=MAX_LENGTH)
    
    tokens = one_sentence_tokenize(text)
    importance = sorted(exp.as_map()[label], key=lambda x: x[0])
    importance = [weight for pos, weight in importance]
    return importance, tokens


def integrad_importance(tokenizer, model, text, txt2=None, device="cuda"):
    from captum.attr import LayerIntegratedGradients

    model.to(device)
    model.setMode("integrad_from_similarity")
    with torch.no_grad():
        tokenized_inputs2 = tokenizer(txt2, 
                                max_length=MAX_LENGTH,
                                truncation=True,
                                return_tensors="pt")
        tokenized_inputs2.to(device)
        encoding2 = model(tokenized_inputs2["input_ids"])

    lig = LayerIntegratedGradients(model, model.embeddings)
    tokenized_inputs = tokenizer(text, 
                                max_length=MAX_LENGTH, 
                                truncation=True, 
                                return_tensors="pt")
    tokenized_inputs.to(device)
    input = tokenized_inputs["input_ids"]
    
    attributions_ig, delta = lig.attribute(
        (input, encoding2), 
        return_convergence_delta=True,
        attribute_to_layer_input=False
    )
    tokens = tokenizer.tokenize(text)
    importance = attributions_ig.sum(-1).squeeze().tolist()[1:-1]
    model.setMode(None)

    return importance, tokens


def gradient_importance(tokenizer, model, text, txt2=None, device="cuda"):
    def encode(text, tokenizer, model, device="cuda", output_last_hiddens=False):
        tokenized_inputs = tokenizer(text, 
                                    max_length=MAX_LENGTH, 
                                    truncation=True, 
                                    return_tensors="pt")
        tokenized_inputs.to(device)
        model.to(device)
        
        outputs, embeddings = model(**tokenized_inputs,
                            output_hidden_states=True)
        encoding = outputs.last_hidden_state[:,0,:]

        if output_last_hiddens:
            return encoding, embeddings, outputs.last_hidden_state.squeeze()[1:-1,:]
        return encoding, embeddings

    model.to(device)
    model.setMode(None)
    with torch.no_grad():
        tokenized_inputs2 = tokenizer(txt2, 
                                max_length=MAX_LENGTH,
                                truncation=True,
                                return_tensors="pt")
        tokenized_inputs2.to(device)
        encoding2 = model(tokenized_inputs2["input_ids"]).last_hidden_state[:,0]

    model.setMode("vanilla_grad")
    
    encoding, embeddings = encode(text, tokenizer, model, device)
    similarity = torch.inner(encoding, encoding2)
    similarity = similarity.sum(dim=-1).backward()
    
    importance = embeddings.grad.abs().sum(-1).squeeze().tolist()[1:-1]
    tokens = tokenizer.tokenize(text)
    model.setMode(None)
    return importance, tokens
    

def token_encoding_relation(tokenizer, model, txt1, txt2, device="cuda"):
    def encode(text, tokenizer, model, device="cuda"):
        tokenized_inputs = tokenizer(text, 
                                    max_length=MAX_LENGTH, 
                                    truncation=True, 
                                    return_tensors="pt")
        tokenized_inputs.to(device)
        model.to(device)
        
        outputs = model(**tokenized_inputs,
                            output_hidden_states=True)
        return outputs.last_hidden_state.squeeze()[1:-1,:]
    
    encodings1 = encode(txt1, tokenizer, model, device)
    encodings2 = encode(txt2, tokenizer, model, device)

    with torch.no_grad():
        token_similarities = torch.inner(encodings1, encodings2)
    
    return {"links": token_similarities.tolist(),
            "tokens1": tokenizer.tokenize(txt1),
            "tokens2": tokenizer.tokenize(txt2)}


def integrad_relation(tokenizer, model, txt1, txt2, device="cuda"):
    from captum.attr import LayerIntegratedGradients

    model.setMode("integrad_from_similarity")
    model.to(device)
    with torch.no_grad():
        tokenized_inputs2 = tokenizer(txt2, 
                                max_length=MAX_LENGTH,
                                truncation=True,
                                return_tensors="pt")
        tokenized_inputs2.to(device)
        encoding2 = model(tokenized_inputs2["input_ids"])

    lig = LayerIntegratedGradients(model, model.embeddings)
    tokenized_inputs = tokenizer(txt1, 
                                    max_length=MAX_LENGTH,
                                    truncation=True,
                                    return_tensors="pt")
    tokenized_inputs.to(device)
    input = tokenized_inputs["input_ids"]

    attributions_ig, delta = lig.attribute(
        (input, encoding2), 
        return_convergence_delta=True,
        attribute_to_layer_input=False
    )
    tokens = tokenizer.tokenize(txt1)
    importance = attributions_ig.sum(-1).squeeze().tolist()[1:-1]
    model.setMode(None)

    return tokens, importance
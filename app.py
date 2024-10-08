from curses import raw
from lib2to3.pgen2 import token
from flask import Flask, send_from_directory, request
from numba import jit
import numpy as np
from scipy.special import softmax
from importance import attention_importance, token_encoding_relation, gradient_importance, lime_importance, integrad_importance, integrad_relation
from transformers import BertModel
from transformers.models.bert.modeling_bert import BaseModelOutputWithPoolingAndCrossAttentions



DEVICE = "cpu"
DATASET = "banking"
if DATASET == "banking":
    num_labels = 77
elif DATASET == "hwu":
    num_labels = 64
elif DATASET == "clinc":
    num_labels = 150

@jit
def inner_product_distance(a,b, tau=15):
    return np.exp(-np.sum(a * b) / tau)**2


class BertForImportanceAttribution(BertModel):

    def setMode(self, mode):
        self.mode = mode

    def forward(self, 
                input_ids, 
                precomputed_encoding=None,
                attention_mask=None,
                token_type_ids=None,
                output_hidden_states=False,
                output_attentions=False):

        if self.mode == "integrad_from_similarity":
            encoding = super().forward(input_ids).last_hidden_state[:,0]
            
            if precomputed_encoding is not None:
                import torch

                similarity = torch.inner(encoding, precomputed_encoding)
                similarity = similarity.sum(dim=-1)
                return similarity
            else:
                return encoding

        elif self.mode == "integrad":
            encoding = super().forward(input_ids).last_hidden_state[:,0]
            output = encoding.sum(dim=-1)
            return output
        
        elif self.mode == "vanilla_grad":
            extended_attention_mask: torch.Tensor = self.get_extended_attention_mask(attention_mask, input_ids.size(), device=DEVICE)
            embedding_output = self.embeddings(
                input_ids=input_ids,
                position_ids=None,
                token_type_ids=token_type_ids,
                inputs_embeds=None,
                past_key_values_length=0,
            )

        
            embedding_output.retain_grad()

            encoder_outputs = self.encoder(
                embedding_output,
                attention_mask=extended_attention_mask,
                head_mask=None,
                encoder_hidden_states=None,
                encoder_attention_mask=None,
                past_key_values=None,
                use_cache=False,
                output_attentions=False,
                output_hidden_states=output_hidden_states
            )
            sequence_output = encoder_outputs[0]
            pooled_output = self.pooler(sequence_output) if self.pooler is not None else None

            return BaseModelOutputWithPoolingAndCrossAttentions(
                last_hidden_state=sequence_output,
                pooler_output=pooled_output,
            ), embedding_output
        elif self.mode is None:
            return super().forward(input_ids, 
                    attention_mask=attention_mask,
                    token_type_ids=token_type_ids,
                    output_hidden_states=output_hidden_states,
                    output_attentions=output_attentions
                )


class TextProcessor:
    def __init__(self, dataset, num_labels):
        self.tau = 15

        # Load dataset for its metadata
        from datasets import Dataset, DatasetDict
        from sklearn import preprocessing

        self.datasets = dict()
        self.prediction_data = dict()

        for dataset in ["banking", "hwu", "clinc"]:
            data = {
                "train": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + dataset + "/train.csv",
                "val": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + dataset + "/val.csv",
                "test": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + dataset + "/test.csv",
            }
            raw_datasets = DatasetDict.from_csv({key: path for key, path in data.items()})
            le = preprocessing.LabelEncoder()
            le.fit(raw_datasets["train"]["category"] + raw_datasets["test"]["category"])
            self.datasets[dataset] = raw_datasets

            import json
            prediction_data_file = "static/data/" + dataset + "-viz_data-8-clusters-label_cluster_chosen_by_majority_in-predicted-label.json"
            with open(prediction_data_file, "r") as f:
                self.prediction_data[dataset] = json.load(f)

        # Load model
        from transformers import AutoModel, AutoTokenizer
        checkpoint = "./models/" + dataset

        self.tokenizer = AutoTokenizer.from_pretrained(checkpoint)
        self.model = BertForImportanceAttribution.from_pretrained(checkpoint)
        self.model.setMode(None)
        self.model.to(DEVICE)

    def process(self, text):
        encoding = self.encode(text)
        return {"encoding": encoding.tolist()}

    def encode(self, text):
        tokenized = self.tokenizer(text, return_tensors="pt")
        tokenized.to(DEVICE)
        outputs = self.model(**tokenized)
        return outputs.last_hidden_state.squeeze()[0].detach().cpu().numpy()
    
    def importance(self, dataset, index, method):
        text = self.datasets[dataset]["test"]["text"][index]

        pred_data = self.prediction_data[dataset][index]
        support_set_idxs = pred_data["support_set"]
        support_set = self.datasets[dataset]["test"][support_set_idxs]
        distances = np.array(pred_data["distances"]).squeeze()
        closest_dp_idx = distances.argmax()
        closest_text = support_set["text"][closest_dp_idx]

        if method == "attention":
            importance, tokens = attention_importance(self.tokenizer, self.model, text)
            return importance, tokens
        elif method == "lime":
            importance = lime_importance(self.tokenizer, self.model, text, support_set)
            return importance
        elif method == "integrad":
            importance = integrad_importance(self.tokenizer, self.model, text, txt2=closest_text)
            return importance
        elif method == "gradient":
            importance = gradient_importance(self.tokenizer, self.model, text, txt2=closest_text)
            return importance

    def importances_all(self, dataset, index):
        attn_importance, tokens = self.importance(dataset, index, "attention")
        lime_importance, tokens = self.importance(dataset, index, "lime")
        integrad_importance, tokens = self.importance(dataset, index, "integrad")
        grad_importance, tokens = self.importance(dataset, index, "gradient")

        return {"tokens": tokens, 
                "attn_importance": attn_importance,
                "lime_importance": lime_importance,
                "grad_importance": grad_importance, 
                "integrad_importance": integrad_importance}
    
    def relation(self, dataset, index1, index2, reltype):
        txt1 = self.datasets[dataset]["test"]["text"][index1]
        txt2 = self.datasets[dataset]["test"]["text"][index2]

        if reltype == "token2token":
            return token_encoding_relation(
                self.tokenizer,
                self.model,
                txt1,
                txt2,
            )
        else:
            tokens1, importance1 = integrad_relation(
                self.tokenizer,
                self.model,
                txt1,
                txt2
            )
            tokens2, importance2 = integrad_relation(
                self.tokenizer,
                self.model,
                txt2,
                txt1
            )
            return {"tokens1": tokens1,
                    "tokens2": tokens2,
                    "importance1": importance1,
                    "importance2": importance2,}


def create_app(test_config=None):
    # create and configure the app
    app = Flask(__name__, static_url_path="/static/")

    text_processor = TextProcessor(DATASET, num_labels)

    @app.route("/")
    def main():
        return send_from_directory("./", "index.html")

    @app.route("/process_text")
    def process_text():
        text = request.args.get("text")
        result = text_processor.process(text)
        return result

    @app.route("/importance")
    def importance():
        index = int(request.args.get("index"))
        method = request.args.get("method")
        importance, tokens = text_processor.importance(index, method)
        return {"importance": importance, "tokens": tokens}
    
    @app.route("/importances")
    def importance_all():
        index = int(request.args.get("index"))
        dataset = request.args.get("dataset")

        result = text_processor.importances_all(dataset, index)
        return result

    @app.route("/relation")
    def relation():
        index1 = int(request.args.get("index1"))
        index2 = int(request.args.get("index2"))
        reltype = request.args.get("reltype")
        dataset = request.args.get("dataset")

        result = text_processor.relation(dataset, index1, index2, reltype)
        return result


    return app
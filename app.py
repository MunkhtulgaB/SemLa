from curses import raw
from flask import Flask, send_from_directory, request
from numba import jit
import numpy as np
from scipy.special import softmax
from importance import attention_importance, lime_importance, gradient_importance


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


class TextProcessor:
    def __init__(self, dataset, num_labels):
        self.tau = 15

        # Load dataset for its metadata
        from datasets import Dataset, DatasetDict
        from sklearn import preprocessing

        data = {
            "train": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + DATASET + "/train.csv",
            "val": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + DATASET + "/val.csv",
            "test": "/home/mojo/projects/phd/stage1/dialogue_tasks/DialoGLUE/data_utils/dialoglue/" + DATASET + "/test.csv",
        }
        raw_datasets = DatasetDict.from_csv({key: path for key, path in data.items()})
        le = preprocessing.LabelEncoder()
        le.fit(raw_datasets["train"]["category"] + raw_datasets["test"]["category"])
        self.class_names = le.classes_
        self.raw_datasets = raw_datasets

        import json
        prediction_data_file = "static/data/" + dataset + "-viz_data-8-clusters-intent_cluster_chosen_by_majority_in-predicted-intent.json"
        with open(prediction_data_file, "r") as f:
            self.prediction_data = json.load(f)

        # Load model
        from transformers import AutoModel, AutoTokenizer
        checkpoint = "./models/" + dataset

        self.tokenizer = AutoTokenizer.from_pretrained(checkpoint)
        self.model = AutoModel.from_pretrained(checkpoint, num_labels=num_labels)
        self.model.to(DEVICE)

        # A version of the same model for integrated gradients
        from transformers import BertModel
        class BertForEncoding(BertModel):
            def forward(self, *args, **kwargs):
                encoding = super().forward(*args, **kwargs).last_hidden_state[:,0]
                output = encoding.sum(dim=-1)
                return output
            
        self.model_for_ig = BertForEncoding.from_pretrained(checkpoint)

    
    def process(self, text):
        encoding = self.encode(text)
        return {"encoding": encoding.tolist()}

    def encode(self, text):
        tokenized = self.tokenizer(text, return_tensors="pt")
        tokenized.to(DEVICE)
        outputs = self.model(**tokenized)
        return outputs.last_hidden_state.squeeze()[0].detach().cpu().numpy()
    
    def importance(self, index, method):
        text = self.raw_datasets["test"]["text"][index]

        if method == "attention":
            importance, tokens = attention_importance(self.tokenizer, self.model, text)
            return importance, tokens
        elif method == "lime":
            pred_data = self.prediction_data[index]
            support_set_idxs = pred_data["support_set"]
            support_set = self.raw_datasets["test"][support_set_idxs]
            importance = lime_importance(self.tokenizer, self.model, text, support_set)
            return importance
        elif method == "gradient":
            importance = gradient_importance(self.tokenizer, self.model_for_ig, text)
            return importance

    def importances_all(self, index):
        attn_importance, tokens = self.importance(index, "attention")
        lime_importance, tokens = self.importance(index, "lime")
        grad_importance, tokens = self.importance(index, "gradient")

        return {"tokens": tokens, 
                "attn_importance": attn_importance,
                "lime_importance": lime_importance,
                "grad_importance": grad_importance}

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
        result = text_processor.importances_all(index)
        return result

    return app
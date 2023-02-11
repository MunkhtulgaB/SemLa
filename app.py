from flask import Flask, send_from_directory

DEVICE = "cuda"
DATASET = "banking"


def load_model():
    from transformers import AutoModel, TrainingArguments, Trainer

    if DATASET == "banking":
        num_labels = 77
    elif DATASET == "hwu":
        num_labels = 64
    elif DATASET == "clinc":
        num_labels = 150

    checkpoint = "./models/" + DATASET

    model = AutoModel.from_pretrained(checkpoint, num_labels=num_labels)
    model.to(DEVICE)

    return model


def create_app(test_config=None):
    # create and configure the app
    app = Flask(__name__, static_url_path="/static/")

    model = load_model()

    @app.route("/")
    def main():
        return send_from_directory("./", "index.html")

    return app